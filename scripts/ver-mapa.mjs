// Ferramenta de ajuste: desenha colisões, interações e recortes (oclusores) sobre a imagem do mapa.
// Uso: node scripts/ver-mapa.mjs [saida.png] [oclusores|colisoes|tudo]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { caixaDoContorno, mascaraRecorte } from '../src/exploracao/recorte.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = process.argv[2] || path.join(ROOT, 'tests', 'screenshots', 'mapa-sonho-ajuste.png');
const modo = process.argv[3] || 'tudo';
const mapa = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'mapas', 'sonho.json'), 'utf8'));
const img = path.join(ROOT, 'public', 'assets', mapa.imagem);
const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const out = Buffer.from(data);

if (modo !== 'colisoes') for (const oc of mapa.oclusores ?? []) {
  const c = caixaDoContorno(oc.contorno, W, H);
  const rgba = new Uint8ClampedArray(c.largura * c.altura * 4);
  for (let y = 0; y < c.altura; y++) data.copy(Buffer.from(rgba.buffer), y * c.largura * 4, ((c.y0 + y) * W + c.x0) * 4, ((c.y0 + y) * W + c.x0 + c.largura) * 4);
  const m = mascaraRecorte({ rgba, ...c, contorno: oc.contorno, sementes: oc.sementes, fixo: oc.fixo, limiar: oc.limiar });
  for (let y = 0; y < c.altura; y++) for (let x = 0; x < c.largura; x++) {
    if (!m[y * c.largura + x]) continue;
    const i = ((c.y0 + y) * W + c.x0 + x) * 4;
    out[i] = Math.min(255, out[i] * 0.5 + 128); out[i + 1] = out[i + 1] * 0.5; out[i + 2] = out[i + 2] * 0.5 + 60;
  }
}
const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
if (modo !== 'oclusores') {
  for (const c of mapa.colisoes) {
    const cor = c.tipo === 'andavel' ? '#00e05a' : '#ff2030';
    svg += `<polygon points="${pts(c.pontos)}" fill="${cor}" fill-opacity="0.18" stroke="${cor}" stroke-width="2"/>`;
  }
  for (const g of mapa.gatilhos) svg += `<polygon points="${pts(g.pontos)}" fill="#ffe000" fill-opacity="0.3" stroke="#ffe000" stroke-width="2"/>`;
  for (const i of mapa.interacoes) svg += `<circle cx="${i.x}" cy="${i.y}" r="${i.raio}" fill="#00d0ff" fill-opacity="0.2" stroke="#00d0ff" stroke-width="2"/><text x="${i.x}" y="${i.y + 4}" font-size="14" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="0.6">${i.id}</text>`;
}
if (modo !== 'colisoes') for (const oc of mapa.oclusores ?? []) svg += `<polygon points="${pts(oc.contorno)}" fill="none" stroke="#ff40ff" stroke-width="1.5" stroke-dasharray="6 4"/>`;
svg += '</svg>';
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(saida);
console.log('ok:', saida);
