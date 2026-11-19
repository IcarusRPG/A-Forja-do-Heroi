/**
 * Simula deploys seguidos (node --test): o deploy novo mantém os assets do anterior, descarta os que
 * saíram de uso há mais de 7 dias e, sem manifesto, descobre os arquivos pelo index.html (site real
 * servido por um servidor HTTP local).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { manterAssets, referencias } from './manter-assets.mjs';

const pastas = [];
after(() => pastas.forEach((p) => rmSync(p, { recursive: true, force: true })));

/** Um "build" do Vite: index.html + pedaços com hash (o index importa os outros). */
function build(arquivos) {
  const dist = mkdtempSync(join(tmpdir(), 'fdg-deploy-'));
  pastas.push(dist);
  mkdirSync(join(dist, 'assets', 'img'), { recursive: true });
  writeFileSync(join(dist, 'assets', 'img', 'mapa.webp'), 'imagem');
  for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(dist, nome), conteudo);
  return dist;
}
const silencio = () => {};

const deployA = () => build({
  'index.html': '<script type="module" src="/aforjadoheroi/assets/index-AAAA1111.js"></script><link rel="stylesheet" href="/aforjadoheroi/assets/index-CSSA1111.css">',
  'assets/index-AAAA1111.js': 'const m = () => import("./exploracao-EXPA1111.js"); import("./batalha-BATA1111.js");',
  'assets/exploracao-EXPA1111.js': 'export const motor = 1;',
  'assets/batalha-BATA1111.js': 'export const b = 1;',
  'assets/index-CSSA1111.css': '@font-face{src:url(/aforjadoheroi/assets/cinzel-400-FONT1111.woff2)}',
  'assets/cinzel-400-FONT1111.woff2': 'fonte',
});

const deployB = () => build({
  'index.html': '<script type="module" src="/aforjadoheroi/assets/index-BBBB2222.js"></script>',
  'assets/index-BBBB2222.js': 'import("./exploracao-EXPB2222.js")',
  'assets/exploracao-EXPB2222.js': 'export const motor = 2;',
  'assets/cinzel-400-FONT1111.woff2': 'fonte',
});

test('referências: index.html, importações entre pedaços e fontes do CSS', () => {
  assert.deepEqual(referencias('import("./exploracao-EXPA1111.js"); from "./index-AAAA1111.js"').sort(), ['exploracao-EXPA1111.js', 'index-AAAA1111.js']);
  assert.deepEqual(referencias('url(/aforjadoheroi/assets/cinzel-400-FONT1111.woff2)'), ['cinzel-400-FONT1111.woff2']);
  assert.deepEqual(referencias('assets/img/mapa.webp'), []);
});

test('dois deploys: o novo mantém os pedaços do anterior e grava o manifesto', async () => {
  const a = deployA();
  const r1 = await manterAssets({ dist: a, anterior: build({}), agora: '2026-11-10T12:00:00Z', log: silencio });
  assert.equal(r1.copiados.length, 0);
  assert.ok(existsSync(join(a, 'assets-manifest.json')));

  const b = deployB();
  const r2 = await manterAssets({ dist: b, anterior: a, agora: '2026-11-12T12:00:00Z', log: silencio });
  const nomes = readdirSync(join(b, 'assets'));
  // O index antigo e o pedaço que ele importa continuam acessíveis no deploy novo.
  for (const n of ['index-AAAA1111.js', 'exploracao-EXPA1111.js', 'batalha-BATA1111.js', 'index-CSSA1111.css']) assert.ok(nomes.includes(n), n);
  assert.equal(readFileSync(join(b, 'assets', 'exploracao-EXPA1111.js'), 'utf8'), 'export const motor = 1;');
  // Os do build novo não são sobrescritos e a pasta de mídia não entra no manifesto.
  assert.equal(readFileSync(join(b, 'assets', 'exploracao-EXPB2222.js'), 'utf8'), 'export const motor = 2;');
  assert.ok(!('img' in r2.manifesto));
  // O manifesto guarda a última vez que cada arquivo esteve num build.
  assert.equal(r2.manifesto['exploracao-EXPA1111.js'], '2026-11-10T12:00:00.000Z');
  assert.equal(r2.manifesto['exploracao-EXPB2222.js'], '2026-11-12T12:00:00.000Z');
  assert.equal(r2.manifesto['cinzel-400-FONT1111.woff2'], '2026-11-12T12:00:00.000Z');
});

test('o que saiu de uso há mais de 7 dias é descartado', async () => {
  const a = deployA();
  await manterAssets({ dist: a, anterior: build({}), agora: '2026-11-01T12:00:00Z', log: silencio });
  const b = deployB();
  await manterAssets({ dist: b, anterior: a, agora: '2026-11-03T12:00:00Z', log: silencio });
  // Último build com o index antigo: 01/11 12:00. Em 08/11 11:00 ainda fica…
  const c = deployB();
  const r1 = await manterAssets({ dist: c, anterior: b, agora: '2026-11-08T11:00:00Z', log: silencio });
  assert.ok(r1.copiados.includes('index-AAAA1111.js'));
  // …e depois de 08/11 12:00 sai.
  const d = deployB();
  const r2 = await manterAssets({ dist: d, anterior: c, agora: '2026-11-08T12:00:01Z', log: silencio });
  assert.ok(r2.descartados.includes('index-AAAA1111.js'));
  assert.ok(!existsSync(join(d, 'assets', 'index-AAAA1111.js')));
  assert.ok(!('index-AAAA1111.js' in r2.manifesto));
  // O que está no build atual nunca é descartado, por mais antigo que seja.
  assert.ok(existsSync(join(d, 'assets', 'cinzel-400-FONT1111.woff2')));
});

test('sem manifesto (primeiro deploy com o script): descobre os assets pelo site publicado', async () => {
  const a = deployA();
  const servidor = createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/aforjadoheroi\//, ''));
    const arquivo = join(a, caminho || 'index.html');
    if (!caminho.includes('..') && existsSync(arquivo) && !arquivo.endsWith('assets-manifest.json')) { res.writeHead(200); res.end(readFileSync(arquivo)); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => servidor.listen(0, ok));
  const porta = servidor.address().port;
  try {
    const b = deployB();
    const r = await manterAssets({ dist: b, site: `http://127.0.0.1:${porta}/aforjadoheroi/`, agora: '2026-11-12T12:00:00Z', log: silencio });
    assert.deepEqual(r.copiados.sort(), ['batalha-BATA1111.js', 'exploracao-EXPA1111.js', 'index-AAAA1111.js', 'index-CSSA1111.css']);
    assert.equal(r.faltando.length, 0);
  } finally {
    servidor.close();
  }
});
