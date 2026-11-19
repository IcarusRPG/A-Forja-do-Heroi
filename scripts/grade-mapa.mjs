// Recorte ampliado de um mapa com grade de coordenadas (para ajustar colisões e recortes à mão).
// Uso: node scripts/grade-mapa.mjs <mapa> <x> <y> <largura> <altura> <zoom> <saida.png>
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, l, t, w, h, k, saida] = process.argv.slice(2);
const [L, T, W, H, K] = [l, t, w, h, k].map(Number);
const fonte = path.join(ROOT, 'assets-fonte', 'mapas', `${id}.png`);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * K}" height="${H * K}">`;
for (let x = Math.ceil(L / 20) * 20; x < L + W; x += 20) {
  const X = (x - L) * K, forte = x % 100 === 0;
  svg += `<line x1="${X}" y1="0" x2="${X}" y2="${H * K}" stroke="${forte ? '#ff0' : '#fff'}" stroke-opacity="${forte ? 0.75 : 0.25}"/>`;
  if (forte) svg += `<text x="${X + 3}" y="14" font-size="14" font-family="Arial" fill="#ff0" stroke="#000" stroke-width="0.6">${x}</text>`;
}
for (let y = Math.ceil(T / 20) * 20; y < T + H; y += 20) {
  const Y = (y - T) * K, forte = y % 100 === 0;
  svg += `<line x1="0" y1="${Y}" x2="${W * K}" y2="${Y}" stroke="${forte ? '#ff0' : '#fff'}" stroke-opacity="${forte ? 0.75 : 0.25}"/>`;
  if (forte) svg += `<text x="3" y="${Y - 3}" font-size="14" font-family="Arial" fill="#ff0" stroke="#000" stroke-width="0.6">${y}</text>`;
}
svg += '</svg>';
await sharp(fonte).extract({ left: L, top: T, width: W, height: H }).resize({ width: W * K, kernel: 'nearest' })
  .composite([{ input: Buffer.from(svg) }]).png().toFile(saida);
console.log('ok:', saida);
