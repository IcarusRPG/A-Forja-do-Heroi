/**
 * Mantém os assets do deploy anterior no deploy novo (GitHub Pages).
 *
 * O problema: o Pages serve tudo com `Cache-Control: max-age=600`. Depois de um deploy, quem ainda
 * está com o index.html antigo (da CDN, do navegador ou de uma aba aberta há horas) pede pedaços com
 * o hash antigo, que o deploy novo apagou: "Failed to fetch dynamically imported module".
 *
 * A solução: antes de publicar, baixa os arquivos de `assets/` (só os do Vite, com hash, na raiz de
 * `assets/`) do site publicado e junta com os novos, sem sobrescrever nada. Um manifesto
 * (`assets-manifest.json`, publicado junto) guarda a última vez que cada arquivo fez parte de um
 * build; o que saiu de uso há mais de 7 dias é descartado, para a pasta não crescer sem fim.
 *
 * Sem manifesto no site (o primeiro deploy com este script), descobre os arquivos lendo o index.html
 * e os próprios JS/CSS (as importações entre pedaços e as fontes).
 *
 * Uso:
 *   node scripts/manter-assets.mjs --dist dist --site https://game.icarusrpg.com.br/aforjadoheroi/
 *   node scripts/manter-assets.mjs --dist dist --anterior pasta-do-deploy-anterior   (simulação local)
 * Opções: --dias 7, --agora 2026-11-19T12:00:00Z (para testes).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MANIFESTO = 'assets-manifest.json';
const DIA = 86_400_000;
/** Só arquivos gerados pelo Vite (nome-HASH.ext), nunca as pastas de mídia (img/, music/...). */
const EH_ASSET = /^[\w.-]+-[\w-]{6,}\.(?:js|mjs|css|woff2?|ttf|svg|png|webp|json|wasm)$/;

const lerJson = (texto) => { try { return JSON.parse(texto); } catch { return null; } };

/** Arquivos do Vite na raiz de <dist>/assets. */
export function assetsDoBuild(dist) {
  const pasta = join(dist, 'assets');
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((n) => EH_ASSET.test(n) && statSync(join(pasta, n)).isFile());
}

/** Nomes de assets citados num texto (index.html, JS, CSS). */
export function referencias(texto) {
  const nomes = new Set();
  for (const m of texto.matchAll(/assets\/([\w.-]+\.(?:js|mjs|css|woff2?|ttf))/g)) nomes.add(m[1]);
  // Importações entre pedaços: import("./motor-abc.js"), from "./index-abc.js"
  for (const m of texto.matchAll(/["'`]\.\/([\w.-]+\.(?:js|mjs|css))["'`]/g)) nomes.add(m[1]);
  return [...nomes].filter((n) => EH_ASSET.test(n));
}

/** Origem do deploy anterior: uma pasta local (simulação) ou o site publicado. */
function origem({ anterior, site }) {
  if (anterior) {
    return {
      async texto(caminho) { const f = join(anterior, caminho); return existsSync(f) ? readFileSync(f, 'utf8') : null; },
      async binario(caminho) { const f = join(anterior, caminho); return existsSync(f) ? readFileSync(f) : null; },
    };
  }
  const base = site.endsWith('/') ? site : `${site}/`;
  const pedir = async (caminho) => {
    try {
      const r = await fetch(new URL(caminho, base), { cache: 'no-store' });
      return r.ok ? r : null;
    } catch { return null; }
  };
  return {
    async texto(caminho) { const r = await pedir(caminho); return r ? r.text() : null; },
    async binario(caminho) { const r = await pedir(caminho); return r ? Buffer.from(await r.arrayBuffer()) : null; },
  };
}

/** Lista do deploy anterior: pelo manifesto, ou rastreando index.html → JS/CSS → importações. */
async function listaAnterior(fonte, log) {
  const manifesto = lerJson((await fonte.texto(MANIFESTO)) ?? '');
  if (manifesto?.arquivos && typeof manifesto.arquivos === 'object') return { arquivos: manifesto.arquivos, rastreado: false };
  log('Sem manifesto no deploy anterior: descobrindo os assets pelo index.html.');
  const arquivos = {};
  const html = await fonte.texto('index.html');
  if (!html) return { arquivos, rastreado: true };
  const fila = referencias(html);
  const vistos = new Set();
  while (fila.length) {
    const n = fila.shift();
    if (vistos.has(n)) continue;
    vistos.add(n);
    arquivos[n] = null; // data desconhecida: conta como "agora"
    if (/\.(?:m?js|css)$/.test(n)) {
      const t = await fonte.texto(`assets/${n}`);
      if (t) fila.push(...referencias(t).filter((x) => !vistos.has(x)));
    }
  }
  return { arquivos, rastreado: true };
}

/**
 * Junta os assets do deploy anterior em <dist>/assets e grava <dist>/assets-manifest.json.
 * Devolve o que fez (para o log e os testes).
 */
export async function manterAssets({ dist, site, anterior, dias = 7, agora = new Date(), log = console.log }) {
  if (!site && !anterior) throw new Error('Informe --site ou --anterior.');
  const agoraIso = new Date(agora).toISOString();
  const limite = new Date(agora).getTime() - dias * DIA;
  const atuais = new Set(assetsDoBuild(dist));
  const fonte = origem({ site, anterior });
  const { arquivos: antes } = await listaAnterior(fonte, log);

  const manifesto = {};
  for (const n of atuais) manifesto[n] = agoraIso;
  const copiados = [], descartados = [], faltando = [];
  mkdirSync(join(dist, 'assets'), { recursive: true });
  for (const [n, visto] of Object.entries(antes)) {
    if (atuais.has(n) || !EH_ASSET.test(n)) continue;
    const quando = visto ? Date.parse(visto) : NaN;
    if (!Number.isNaN(quando) && quando < limite) { descartados.push(n); continue; }
    const dados = await fonte.binario(`assets/${n}`);
    if (!dados) { faltando.push(n); continue; }
    writeFileSync(join(dist, 'assets', n), dados);
    manifesto[n] = Number.isNaN(quando) ? agoraIso : visto;
    copiados.push(n);
  }
  const ordenado = Object.fromEntries(Object.entries(manifesto).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(dist, MANIFESTO), `${JSON.stringify({ geradoEm: agoraIso, dias, arquivos: ordenado }, null, 1)}\n`);
  log(`Assets do build: ${atuais.size} · mantidos do deploy anterior: ${copiados.length} · descartados (mais de ${dias} dias): ${descartados.length}${faltando.length ? ` · não encontrados: ${faltando.length}` : ''}`);
  return { copiados, descartados, faltando, manifesto: ordenado };
}

/* ------------------------------ linha de comando ------------------------------ */

function argumentos(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = argumentos(process.argv.slice(2));
  manterAssets({
    dist: a.dist ?? 'dist',
    site: typeof a.site === 'string' ? a.site : undefined,
    anterior: typeof a.anterior === 'string' ? a.anterior : undefined,
    dias: a.dias ? Number(a.dias) : 7,
    agora: a.agora ? new Date(a.agora) : new Date(),
  }).catch((e) => {
    // Nunca derruba o deploy: na pior das hipóteses, publica só o build novo (como antes).
    console.warn('Não foi possível manter os assets anteriores:', e);
  });
}
