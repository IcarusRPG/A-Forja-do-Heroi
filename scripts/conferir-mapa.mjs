// Confere o mapa do sonho: tudo alcançável a pé a partir do início, caminho até o altar de cada estátua,
// e a largura mínima das passagens (em px do mapa). Uso: node scripts/conferir-mapa.mjs [mapa.png]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encontrarCaminho, pesLivres, pontoAndavel } from '../src/exploracao/geometria.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapa = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'mapas', 'sonho.json'), 'utf8'));
const { largura: W, altura: H, colisoes } = mapa;
const P = 4;
const cols = Math.ceil(W / P), lins = Math.ceil(H / P);
const alc = new Uint8Array(cols * lins);
const fila = [];
const c0 = Math.floor(mapa.inicio.x / P), l0 = Math.floor(mapa.inicio.y / P);
alc[l0 * cols + c0] = 1; fila.push(l0 * cols + c0);
while (fila.length) {
  const i = fila.pop();
  const c = i % cols, l = (i - c) / cols;
  for (const [dc, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cc = c + dc, ll = l + dl;
    if (cc < 0 || ll < 0 || cc >= cols || ll >= lins) continue;
    const j = ll * cols + cc;
    if (alc[j] || !pesLivres(colisoes, cc * P, ll * P)) continue;
    alc[j] = 1; fila.push(j);
  }
}
const alcanca = (x, y) => alc[Math.floor(y / P) * cols + Math.floor(x / P)] === 1;
let falhas = 0;
for (const i of mapa.interacoes) {
  const ok = alcanca(i.x, i.y);
  if (!ok) falhas++;
  console.log(`${ok ? 'ok ' : 'NÃO'} interação ${i.id} (${i.x}, ${i.y})`);
}
const altar = mapa.pontos.altar;
console.log(`${alcanca(altar.x, altar.y) ? 'ok ' : 'NÃO'} altar`);
for (const i of mapa.interacoes) {
  const t = performance.now();
  const c = encontrarCaminho(colisoes, W, H, i, altar);
  if (!c) falhas++;
  console.log(`caminho ${i.id} → altar: ${c ? c.length + ' trechos, ' + c.map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' ') : 'NENHUM'} [${Math.round(performance.now() - t)} ms]`);
}
// Largura das passagens: distância livre perpendicular nos pontos de controle.
const largura = (x, y, dx, dy) => {
  let a = 0, b = 0;
  while (pontoAndavel(colisoes, x + dx * (a + 1), y + dy * (a + 1)) && a < 400) a++;
  while (pontoAndavel(colisoes, x - dx * (b + 1), y - dy * (b + 1)) && b < 400) b++;
  return a + b + 1;
};
const PASSAGENS = [
  ['ponte norte', 627, 390, 1, 0], ['ponte sul', 627, 690, 1, 0], ['ponte oeste', 420, 540, 0, 1], ['ponte leste', 834, 540, 0, 1],
  ['escada', 627, 1150, 1, 0], ['entre pilares', 627, 1040, 1, 0],
  ['mentis ↔ espelho', 315, 568, 1, 0], ['ardor ↔ espelho', 939, 569, 1, 0],
  ['atrás de sólem', 626, 160, 0, 1], ['atrás de justar', 934, 240, 0.6, -0.8], ['atrás de irae', 318, 230, -0.6, -0.8],
  ['frente de eternus', 321, 950, 0, 1], ['frente de expiria', 933, 950, 0, 1],
];
for (const [nome, x, y, dx, dy] of PASSAGENS) console.log(`passagem ${nome}: ${largura(x, y, dx, dy)} px (herói ≈ 24 px de largura)`);
if (process.argv[2]) {
  const img = path.join(ROOT, 'public', 'assets', mapa.imagem);
  const { data } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!alcanca(x, y)) continue;
    const i = (y * W + x) * 4;
    data[i] = data[i] * 0.55; data[i + 1] = Math.min(255, data[i + 1] * 0.55 + 110); data[i + 2] = data[i + 2] * 0.55;
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(process.argv[2]);
}
process.exitCode = falhas ? 1 : 0;
