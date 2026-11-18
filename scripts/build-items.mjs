// Recorta os itens de missão da folha assets-src/objetos/itens-missoes.png (itens soltos sobre fundo
// transparente ou branco, em linhas de tamanhos diferentes).
//
// 1. remove o fundo (como no build-sprites);
// 2. acha cada item por componentes conectados do alfa e junta os pedaços próximos (a poeira e a lama
//    são vários respingos soltos), ignorando ruídos pequenos;
// 3. ordena de cima para baixo e da esquerda para a direita;
// 4. exporta cada um em public/assets/img/itens/<id>.png (maior lado com 96 px, sem perder o alfa).
// Conferência: tests/screenshots/itens-recortados.png (cada recorte com o id embaixo).
//
// Uso: npm run sprites (roda junto) ou node scripts/build-items.mjs

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ler, limparFundo } from './sprites-comum.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = path.join(ROOT, 'assets-src', 'objetos', 'itens-missoes.png');
const SAIDA = path.join(ROOT, 'public', 'assets', 'img', 'itens');
const CONFERENCIA = path.join(ROOT, 'tests', 'screenshots', 'itens-recortados.png');

const IDS = ['lencol', 'lenco', 'camisa', 'repolho', 'caixote', 'cesto-paes', 'pao', 'bandagem', 'unguento', 'abobora', 'poeira', 'mancha', 'livro'];
const TAMANHO = 96;
/** Pedaços a até essa distância (px) fazem parte do mesmo item. */
const JUNTAR = 40;
/** A partir deste tamanho (px), um componente é um item (ou o corpo principal de um). */
const GRANDE = 2500;
const RUIDO_MANCHA = 40;
const RUIDO_ITEM = 600;

const img = await ler(ENTRADA);
limparFundo(img, 64);
const { w, h, d } = img;

// Componentes conectados (8 vizinhos) do alfa.
const rotulo = new Int32Array(w * h).fill(-1);
const comps = [];
const fila = new Int32Array(w * h);
for (let p0 = 0; p0 < w * h; p0++) {
  if (rotulo[p0] !== -1 || d[p0 * 4 + 3] === 0) continue;
  const id = comps.length;
  let ini = 0, fim = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  fila[fim++] = p0; rotulo[p0] = id;
  while (ini < fim) {
    const p = fila[ini++];
    const x = p % w, y = (p - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (rotulo[q] === -1 && d[q * 4 + 3] !== 0) { rotulo[q] = id; fila[fim++] = q; }
    }
  }
  comps.push({ n: fim, caixa: [x0, y0, x1, y1] });
}

// Componentes grandes são itens (e nunca se juntam entre si); os pedaços pequenos (respingos de lama,
// grãos de poeira, um laço solto) vão para o item grande mais próximo, se estiverem perto.
const distCaixas = (A, B) => Math.hypot(
  Math.max(0, A[0] - B[2], B[0] - A[2]),
  Math.max(0, A[1] - B[3], B[1] - A[3]),
);
const grupos = new Map();
const grandes = comps.map((c, i) => [c, i]).filter(([c]) => c.n >= GRANDE);
for (const [c, i] of grandes) grupos.set(i, { n: c.n, caixa: [...c.caixa], membros: [i] });
for (const [c, i] of comps.map((c, i) => [c, i]).filter(([c]) => c.n >= RUIDO_MANCHA && c.n < GRANDE)) {
  let melhor = null, menor = Infinity;
  for (const [g, j] of grandes) {
    const dd = distCaixas(c.caixa, g.caixa);
    if (dd < menor) { menor = dd; melhor = j; }
  }
  if (melhor === null || menor > JUNTAR) continue;
  const g = grupos.get(melhor);
  g.n += c.n;
  g.caixa = [Math.min(g.caixa[0], c.caixa[0]), Math.min(g.caixa[1], c.caixa[1]), Math.max(g.caixa[2], c.caixa[2]), Math.max(g.caixa[3], c.caixa[3])];
  g.membros.push(i);
}
let itens = [...grupos.values()].filter((g) => g.n >= RUIDO_ITEM);

// Ordem de leitura: linhas (um item começa linha nova se o centro dele estiver abaixo do fundo da linha atual).
itens.sort((a, b) => a.caixa[1] - b.caixa[1]);
const linhas = [];
for (const it of itens) {
  const cy = (it.caixa[1] + it.caixa[3]) / 2;
  const linha = linhas.find((l) => cy >= l.topo && cy <= l.fundo);
  if (linha) { linha.itens.push(it); linha.fundo = Math.max(linha.fundo, it.caixa[3]); }
  else linhas.push({ topo: it.caixa[1], fundo: it.caixa[3], itens: [it] });
}
itens = linhas.sort((a, b) => a.topo - b.topo).flatMap((l) => l.itens.sort((a, b) => a.caixa[0] - b.caixa[0]));
console.log(`  ${itens.length} itens encontrados (linhas: ${linhas.map((l) => l.itens.length).join(', ')})`);
if (itens.length !== IDS.length) {
  console.error(`  ATENÇÃO: esperava ${IDS.length} itens. Confira ${path.relative(ROOT, CONFERENCIA)}.`);
  process.exitCode = 1;
}

await mkdir(SAIDA, { recursive: true });
await mkdir(path.dirname(CONFERENCIA), { recursive: true });
const cartoes = [];
for (const [k, it] of itens.entries()) {
  const id = IDS[k] ?? `item-${k + 1}`;
  const [x0, y0, x1, y1] = it.caixa;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // Só os pixels dos componentes deste item (vizinhos que invadem a caixa ficam de fora).
  const membros = new Set(it.membros);
  const corte = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const p = (y0 + y) * w + x0 + x;
    if (!membros.has(rotulo[p])) continue;
    for (let c = 0; c < 4; c++) corte[(y * cw + x) * 4 + c] = d[p * 4 + c];
  }
  const escala = TAMANHO / Math.max(cw, ch);
  const out = path.join(SAIDA, `${id}.png`);
  await sharp(corte, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(Math.max(1, Math.round(cw * escala)), Math.max(1, Math.round(ch * escala)), { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 }).toFile(out);
  cartoes.push({ id, out });
  console.log(`  ${String(k + 1).padStart(2)}. ${id} (${cw}×${ch} → ${Math.round(cw * escala)}×${Math.round(ch * escala)})`);
}

// Folha de conferência: 5 por linha, cada recorte num quadrado com o id embaixo.
const C = 150, POR_LINHA = 5;
const linhasConf = Math.ceil(cartoes.length / POR_LINHA);
const comp = [];
for (const [i, c] of cartoes.entries()) {
  const x = (i % POR_LINHA) * C, y = Math.floor(i / POR_LINHA) * (C + 24);
  comp.push({ input: await sharp(c.out).resize(110, 110, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer(), left: x + 20, top: y + 12 });
  comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${C}" height="30"><text x="${C / 2}" y="20" font-size="15" font-family="sans-serif" text-anchor="middle" fill="#ffd25a">${i + 1}. ${c.id}</text></svg>`), left: x, top: y + C - 10 });
}
await sharp({ create: { width: POR_LINHA * C, height: linhasConf * (C + 24) + 10, channels: 4, background: '#2a3140' } })
  .composite(comp).png().toFile(CONFERENCIA);
console.log(`Pronto: ${cartoes.length} itens em public/assets/img/itens/ (conferência em ${path.relative(ROOT, CONFERENCIA)}).`);
