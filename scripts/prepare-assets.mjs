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

const RACAS = { 'araké': 'arake', 'arake': 'arake', 'azakar': 'azakar' };
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
  for (const r of ['arake', 'azakar']) for (const g of ['m', 'f'])
    for (const c of ['comum', 'guerreiro', 'paladino', 'ladino', 'arcanista', 'monge']) esperados.push(`${r}-${g}-${c}`);
  for (const e of esperados) if (!vistos.has(e)) problemas.push(`faltando: ${e}`);
  console.log(`  ${vistos.size}/24 retratos.`);
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

async function musica() {
  const dir = path.join(SRC, (await readdir(SRC)).find((n) => nfc(n).toLowerCase().startsWith('m') && nfc(n).toLowerCase().includes('sica')));
  const audios = (await readdir(dir)).filter((n) => /\.(mp3|ogg|wav|m4a|flac)$/i.test(n));
  if (audios.length !== 1) console.warn(`  atenção: ${audios.length} arquivos de áudio em ${dir}; usando o primeiro.`);
  const orig = audios[0];
  const outDir = path.join(OUT, 'music');
  await ensureDir(outDir);
  const out = path.join(outDir, `the-first-choice${path.extname(orig).toLowerCase()}`);
  await copyFile(path.join(dir, orig), out);
  console.log(`  música "${orig}" → ${path.basename(out)} (${fmt(await sizeOf(out))})`);
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
console.log('Logos…'); await logos();
console.log('Favicon…'); await favicon();
console.log('Wallpaper…'); await wallpaper();
console.log('Música…'); await musica();
console.log('Vídeo…'); await video();
await conferirLimite();
console.log(process.exitCode ? 'Terminou com problemas.' : 'Pronto.');
