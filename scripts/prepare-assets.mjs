// Copia e otimiza as mídias originais (pasta FdG) para public/assets.
// Os originais NUNCA são movidos nem alterados.
//
// Uso:  npm run assets            (origem padrão)
//       node scripts/prepare-assets.mjs "D:\outra\pasta\FdG"
//       FDG_DIR="..." npm run assets
//
// - Retratos e wallpaper: PNG → WebP (qualidade 85).
// - Logos: continuam PNG (transparência), recomprimidos sem perda e limitados em largura.
// - Vídeo: se passar de 50 MB, recodifica em H.264 (CRF 23, veryfast, AAC 128k, faststart)
//   usando o ffmpeg do sistema ou o do pacote ffmpeg-static.
// - Nenhum arquivo de saída pode passar de 100 MB (limite do GitHub).

import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || process.env.FDG_DIR || 'C:\\Users\\AdamPauloCarrijoNeve\\Documents\\FdG';
const OUT = path.join(ROOT, 'public', 'assets');
const MB = 1024 * 1024;

const RACAS = { 'araké': 'arake', 'arake': 'arake', 'azakar': 'azakar', 'nyashi': 'nyashi', 'ayoran': 'ayoran' };
const RACAS_SAIDA = ['arake', 'azakar', 'nyashi', 'ayoran'];
const GENEROS = { male: 'm', female: 'f' };
const CLASSES = {
  comun: 'comum', comum: 'comum',
  guerreiro: 'guerreiro', guerreira: 'guerreiro',
  paladino: 'paladino', paladina: 'paladino',
  ladino: 'ladino', ladina: 'ladino',
  arcanista: 'arcanista',
  monge: 'monge', monja: 'monge',
};

const nfc = (s) => s.normalize('NFC');
const fmt = (b) => `${(b / MB).toFixed(2)} MB`;
const sizeOf = async (p) => (await stat(p)).size;

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

/** Acha um arquivo numa pasta comparando nomes normalizados (acentos/espaços/caixa). */
async function findIn(dir, predicate) {
  const names = await readdir(dir);
  return names.find((n) => predicate(nfc(n).toLowerCase()));
}

/**
 * Bustos dos heróis (falas, pausa, cards de save). Olham para a esquerda. O do Nyashi masculino veio
 * sem o sufixo "-busto" no nome; o Azakar usa o mesmo busto nas variantes Luz e Sombra.
 */
async function bustosHerois() {
  const dir = path.join(SRC, 'img', 'herois', 'portraits');
  const outDir = path.join(OUT, 'img', 'retratos');
  await ensureDir(outDir);
  const vistos = new Set();
  for (const f of (await readdir(dir)).filter((n) => /\.png$/i.test(n))) {
    const m = chave(path.parse(f).name).match(/^([a-z]+)-(male|female)-comun(-busto)?$/);
    const r = m && RACAS[m[1]];
    if (!r) { console.warn(`  busto não reconhecido: ${f}`); continue; }
    const nome = `heroi-${r}-${GENEROS[m[2]]}`;
    const dest = path.join(outDir, `${nome}.webp`);
    await sharp(path.join(dir, f)).resize({ width: 768, withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 90 }).toFile(dest);
    vistos.add(nome);
    console.log(`  busto ${f} → ${nome}.webp (${fmt(await sizeOf(dest))})`);
  }
  const faltando = RACAS_SAIDA.flatMap((r) => ['m', 'f'].map((g) => `heroi-${r}-${g}`)).filter((n) => !vistos.has(n));
  if (faltando.length) { console.error(`  BUSTOS FALTANDO: ${faltando.join(', ')}`); process.exitCode = 1; }
}

async function retratos() {
  const dir = path.join(SRC, 'img', 'herois', 'imagens');
  const outDir = path.join(OUT, 'img', 'herois');
  await ensureDir(outDir);
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.png'));
  const vistos = new Set();
  const problemas = [];
  for (const f of files) {
    const [raca, genero, classe] = nfc(path.parse(f).name).toLowerCase().split('-');
    const r = RACAS[raca], g = GENEROS[genero], c = CLASSES[classe];
    if (!r || !g || !c) { problemas.push(`não reconhecido: ${f}`); continue; }
    const nome = `${r}-${g}-${c}`;
    if (vistos.has(nome)) { problemas.push(`duplicado: ${f} → ${nome}`); continue; }
    vistos.add(nome);
    const dest = path.join(outDir, `${nome}.webp`);
    await sharp(path.join(dir, f)).webp({ quality: 85 }).toFile(dest);
    console.log(`  retrato ${f} → ${nome}.webp (${fmt(await sizeOf(dest))})`);
  }
  const esperados = [];
  for (const r of RACAS_SAIDA) for (const g of ['m', 'f'])
    for (const c of ['comum', 'guerreiro', 'paladino', 'ladino', 'arcanista', 'monge']) esperados.push(`${r}-${g}-${c}`);
  for (const e of esperados) if (!vistos.has(e)) problemas.push(`faltando: ${e}`);
  console.log(`  ${vistos.size}/${esperados.length} retratos.`);
  if (problemas.length) {
    console.error('  PROBLEMAS NOS RETRATOS:\n   - ' + problemas.join('\n   - '));
    process.exitCode = 1;
  }
}

async function logos() {
  const dir = path.join(SRC, 'img', 'logos');
  const outDir = path.join(OUT, 'img', 'logos');
  await ensureDir(outDir);
  const pares = [
    [await findIn(dir, (n) => n.startsWith('final logo')), 'icarus.png'],
    [await findIn(dir, (n) => n.startsWith('a forja do her')), 'a-forja-do-heroi.png'],
  ];
  for (const [orig, dest] of pares) {
    if (!orig) { console.error(`  logo não encontrado para ${dest}`); process.exitCode = 1; continue; }
    const out = path.join(outDir, dest);
    // Sem perda de qualidade visual: PNG com compressão máxima; largura limitada a 1600 px
    // (o logo nunca aparece maior que isso na tela).
    await sharp(path.join(dir, orig))
      .trim({ threshold: 1 })
      .resize({ width: 1600, withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toFile(out);
    console.log(`  logo "${orig}" → ${dest} (${fmt(await sizeOf(out))})`);
  }
}

/** Favicon: o escudo central do logo de Icarus. */
async function favicon() {
  const logo = path.join(OUT, 'img', 'logos', 'icarus.png');
  const out = path.join(ROOT, 'public', 'favicon.png');
  const { width, height } = await sharp(logo).metadata();
  const w = Math.round(width * 0.3);
  await sharp(logo)
    .extract({ left: Math.round((width - w) / 2), top: 0, width: w, height })
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);
  console.log('  favicon.png gerado.');
}

async function wallpaper() {
  const dir = path.join(SRC, 'img', 'wallpapers');
  const orig = await findIn(dir, (n) => n.startsWith('wallpaper-inicio'));
  const outDir = path.join(OUT, 'img', 'wallpapers');
  await ensureDir(outDir);
  const out = path.join(outDir, 'menu.webp');
  await sharp(path.join(dir, orig)).webp({ quality: 85 }).toFile(out);
  console.log(`  wallpaper "${orig}" → menu.webp (${fmt(await sizeOf(out))})`);
}

/** Nome comparável: minúsculas, sem acento, sem espaços extras. */
const chave = (n) => nfc(n).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Músicas: cada arquivo da pasta de músicas tem um destino fixo em public/assets/music. */
const MUSICAS = [
  ['menu e tela de personagem', 'the-first-choice'],
  ['sonho', 'sonho'],
  ['fullmun 01', 'fullmun-01'],
  ['fullmun 02', 'fullmun-02'],
  ['porco azul de fullmun', 'tensao-porco'],
  ['vitoria', 'vitoria'],
  ['gameover', 'game-over'],
  ['templo', 'templo'],
  ['treino', 'treino'],
  ['ratazana', 'batalha-ratazanas'],
  // Opcional: a cena da tragédia usa silêncio se a faixa não existir.
  ['tragedia', 'tragedia'],
];

async function musica() {
  const dir = path.join(SRC, (await readdir(SRC)).find((n) => chave(n) === 'musicas'));
  const todos = (await readdir(dir)).filter((n) => /\.(mp3|ogg|wav|m4a|flac)$/i.test(n));
  const outDir = path.join(OUT, 'music');
  await ensureDir(outDir);
  for (const [nome, destino] of MUSICAS) {
    const orig = todos.find((n) => chave(path.parse(n).name) === nome);
    if (!orig) { console.warn(`  música não encontrada (opcional?): "${nome}"`); continue; }
    const out = path.join(outDir, `${destino}${path.extname(orig).toLowerCase()}`);
    await copyFile(path.join(dir, orig), out);
    console.log(`  música "${orig}" → ${path.basename(out)} (${fmt(await sizeOf(out))})`);
  }
  for (const n of todos) if (!MUSICAS.some(([nome]) => chave(path.parse(n).name) === nome)) console.warn(`  música sem destino (ignorada): ${n}`);
}

/** Capítulo 01: cenas, retratos de NPC, ameaças, fundo de batalha e tela de game over. */
async function capitulo01() {
  const IMG = path.join(SRC, 'img');
  const pasta = async (nome) => path.join(IMG, (await readdir(IMG)).find((n) => chave(n) === nome));
  const converter = async (orig, out, { largura, qualidade = 85, png = false } = {}) => {
    await ensureDir(path.dirname(out));
    let s = sharp(orig);
    if (largura) s = s.resize({ width: largura, withoutEnlargement: true });
    // Pixel art: PNG sem perda e sem reamostragem.
    await (png ? s.png({ compressionLevel: 9, palette: false }) : s.webp({ quality: qualidade, alphaQuality: 90 })).toFile(out);
    console.log(`  ${path.basename(orig)} → ${path.relative(OUT, out).split(path.sep).join('/')} (${fmt(await sizeOf(out))})`);
  };
  // Cenas 16:9
  const cenas = await pasta('cenas');
  for (const f of (await readdir(cenas)).filter((n) => /\.png$/i.test(n)))
    await converter(path.join(cenas, f), path.join(OUT, 'img', 'cenas', `${chave(path.parse(f).name).replace(/\s+/g, '-')}.webp`), { qualidade: 82 });
  // Bustos de NPC (fundo transparente)
  const RETRATOS = {
    'artho-portrait': 'artho', aylin: 'aylin', gerulf: 'gerulf', kobanu: 'kobanu', 'nyme-portrait': 'nyme', 'osric balanca': 'osric', 'vo hulda': 'vo-hulda',
    tobias: 'tobias', selene: 'selene', dagna: 'dagna',
    // Expressões: npc-<id>-<expressao>.webp
    'aylin-chorando': 'aylin-chorando',
  };
  const retratos = await pasta('portraits');
  for (const f of (await readdir(retratos)).filter((n) => /\.png$/i.test(n))) {
    const id = RETRATOS[chave(path.parse(f).name)];
    if (!id) { console.warn(`  retrato sem id: ${f}`); continue; }
    await converter(path.join(retratos, f), path.join(OUT, 'img', 'retratos', `npc-${id}.webp`), { largura: 768 });
  }
  // Ameaças (bestiário)
  const ameacas = await pasta('ameacas');
  for (const f of (await readdir(ameacas)).filter((n) => /\.png$/i.test(n)))
    await converter(path.join(ameacas, f), path.join(OUT, 'img', 'ameacas', `${chave(path.parse(f).name)}.webp`), { largura: 900 });
  // Fundo de batalha (pixel art: PNG sem perda)
  const batalha = await pasta('batalha');
  for (const f of (await readdir(batalha)).filter((n) => /^fundo-.*\.png$/i.test(n)))
    await converter(path.join(batalha, f), path.join(OUT, 'img', 'batalha', 'fundos', `${chave(f).replace(/^fundo-/, '')}`), { png: true });
  // Game over
  const wall = await pasta('wallpapers');
  const go = (await readdir(wall)).find((n) => chave(n).startsWith('game-over'));
  if (go) await converter(path.join(wall, go), path.join(OUT, 'img', 'telas', 'game-over.webp'));
}

/** Mapas navegáveis na resolução original. Aceita nomes com extensão dupla (.png.png). */
async function mapas() {
  const dir = path.join(SRC, 'img', 'mapas navegaveis');
  if (!existsSync(dir)) { console.warn('  pasta de mapas não encontrada.'); return; }
  const outDir = path.join(OUT, 'img', 'mapas');
  await ensureDir(outDir);
  for (const f of (await readdir(dir)).filter((n) => /\.png$/i.test(n))) {
    const nome = nfc(f).toLowerCase().replace(/(\.png)+$/, '').replace(/^mapa-/, '');
    // O sonho é pintado (WebP); os mapas de pixel art da Fase 4 ficam em PNG sem perda.
    const png = nome !== 'sonho-templo-branco';
    const out = path.join(outDir, `${nome}.${png ? 'png' : 'webp'}`);
    const s = sharp(path.join(dir, f));
    await (png ? s.png({ compressionLevel: 9, palette: false }) : s.webp({ quality: 88 })).toFile(out);
    const { width, height } = await sharp(out).metadata();
    console.log(`  mapa "${f}" → ${path.basename(out)} (${width}×${height}, ${fmt(await sizeOf(out))})`);
  }
}

function acharFfmpeg() {
  const sys = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (sys.status === 0) return 'ffmpeg';
  return import('ffmpeg-static').then((m) => (m.default && existsSync(m.default) ? m.default : null)).catch(() => null);
}

async function video() {
  const orig = path.join(SRC, 'video', 'Intro-Game.mp4');
  const outDir = path.join(OUT, 'video');
  await ensureDir(outDir);
  const out = path.join(outDir, 'intro-icarus.mp4');
  const tamanho = await sizeOf(orig);
  if (existsSync(out) && (await stat(out)).mtimeMs >= (await stat(orig)).mtimeMs && !process.env.FORCAR_VIDEO) {
    console.log(`  vídeo já otimizado (${fmt(await sizeOf(out))}); use FORCAR_VIDEO=1 para refazer.`);
    return;
  }
  console.log(`  vídeo original: ${fmt(tamanho)}`);
  if (tamanho <= 50 * MB) {
    await copyFile(orig, out);
    console.log('  vídeo copiado sem recodificar.');
    return;
  }
  const ffmpeg = await acharFfmpeg();
  if (!ffmpeg) {
    console.warn(`  AVISO: vídeo com ${fmt(tamanho)} e nenhum ffmpeg disponível; copiado sem recodificar.`);
    await copyFile(orig, out);
    return;
  }
  console.log('  recodificando em H.264 (pode levar alguns minutos)…');
  const r = spawnSync(ffmpeg, [
    '-y', '-i', orig,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    out,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) {
    console.warn('  ffmpeg falhou; copiando o original.');
    await copyFile(orig, out);
  }
  console.log(`  vídeo final: ${fmt(await sizeOf(out))}`);
}

async function conferirLimite(dir = OUT) {
  for (const n of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name);
    if (n.isDirectory()) await conferirLimite(p);
    else if ((await sizeOf(p)) > 100 * MB) {
      console.error(`  ERRO: ${p} passa de 100 MB.`);
      process.exitCode = 1;
    }
  }
}

console.log(`Origem: ${SRC}`);
if (!existsSync(SRC)) { console.error('Pasta de origem não encontrada.'); process.exit(1); }
console.log('Retratos…'); await retratos();
console.log('Bustos dos heróis…'); await bustosHerois();
console.log('Logos…'); await logos();
console.log('Favicon…'); await favicon();
console.log('Wallpaper…'); await wallpaper();
console.log('Mapas…'); await mapas();
console.log('Música…'); await musica();
console.log('Capítulo 01…'); await capitulo01();
console.log('Vídeo…'); await video();
await conferirLimite();
console.log(process.exitCode ? 'Terminou com problemas.' : 'Pronto.');
