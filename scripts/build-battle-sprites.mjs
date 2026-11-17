// Gera as folhas de batalha (estilo FF6) a partir das folhas de poses paradas em grade 3 × 2.
//
// Entrada: assets-src/batalha/herois/<raca>-<m|f>.png e assets-src/batalha/inimigos/<id>.png
// Saída:   public/assets/img/batalha/herois/<raca>-<m|f>.png + .json
//          public/assets/img/batalha/inimigos/<id>.png + .json
//          — folha horizontal de 6 quadros de mesmo tamanho, poses alinhadas pelos pés.
// Prévias: tests/screenshots/batalha/<nome>-preview.png (ampliadas, com a linha da base).
//
// Uso: npm run sprites (roda depois do build-sprites) ou node scripts/build-battle-sprites.mjs

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { colar, ler, limparFundo, nova, reduzir, reduzirPaleta, salvarPng } from './sprites-comum.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = path.join(ROOT, 'assets-src', 'batalha');
const SAIDA = path.join(ROOT, 'public', 'assets', 'img', 'batalha');
const PREVIAS = path.join(ROOT, 'tests', 'screenshots', 'batalha');

/** Altura da pose "parado" do herói, em px da folha final. O Mirtilo (comprido) tem 1,6 vez essa medida no comprimento. */
const ALTURA_HEROI = 72;
const ESCALA_INIMIGO = 1.6;
const MARGEM = 2;

/** Ordem das células (linha a linha, da esquerda para a direita) → nome da pose. */
const POSES = {
  heroi: ['parado', 'ataque', 'atingido', 'ferido', 'caido', 'vitoria'],
  mirtilo: ['parado', 'ataque', 'atingido', 'recuando', 'fugindo', 'tonto'],
  'mirtilo-enfurecido': ['parado', 'mordida', 'investida', 'atingido', 'exausto', 'fugindo'],
};

/**
 * Borrões: manchas quase transparentes e grandes, soltas da arte (aparecem como sombras borradas nas
 * miniaturas). Medidas na imagem original, antes do corte de alpha, que as quebraria em pedacinhos.
 * Marcas pequenas (impacto, poeira) ficam.
 */
function removerBorroes(img, avisos, nome) {
  const { w, h, d } = img;
  const visto = new Uint8Array(w * h);
  const fila = new Int32Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (visto[p0] || d[p0 * 4 + 3] < 16) continue;
    let ini = 0, fim = 0, sa = 0, sx = 0, sy = 0;
    fila[fim++] = p0; visto[p0] = 1;
    while (ini < fim) {
      const p = fila[ini++];
      const x = p % w, y = (p - x) / w;
      sa += d[p * 4 + 3]; sx += x; sy += y;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!visto[q] && d[q * 4 + 3] >= 16) { visto[q] = 1; fila[fim++] = q; }
      }
    }
    const alfa = sa / fim;
    if ((alfa < 110 && fim > 4000) || (alfa < 40 && fim > 150)) {
      for (let k = 0; k < fim; k++) d[fila[k] * 4 + 3] = 0;
      avisos.push(`${nome}: borrão descartado (${fim} px, alfa médio ${Math.round(alfa)}) em (${Math.round(sx / fim)}, ${Math.round(sy / fim)})`);
    }
  }
}

/**
 * Separa as 6 células por manchas conectadas: cada mancha vai para a célula do seu centro (uma pose pode
 * invadir a vizinha).
 */
function separarCelulas(img, avisos, nome) {
  const { w, h, d } = img;
  const rotulo = new Int32Array(w * h).fill(-1);
  const manchas = [];
  const fila = new Int32Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (rotulo[p0] !== -1 || d[p0 * 4 + 3] === 0) continue;
    const id = manchas.length;
    let ini = 0, fim = 0, sx = 0, sy = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    fila[fim++] = p0; rotulo[p0] = id;
    while (ini < fim) {
      const p = fila[ini++];
      const x = p % w, y = (p - x) / w;
      sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (rotulo[q] === -1 && d[q * 4 + 3] !== 0) { rotulo[q] = id; fila[fim++] = q; }
      }
    }
    manchas.push({ n: fim, cx: sx / fim, cy: sy / fim, caixa: [x0, y0, x1, y1], celula: -1 });
  }
  // As poses (manchas grandes) vão para a célula do seu centro; as manchas pequenas (marcas de golpe,
  // poeira, estrelinhas) vão para a pose mais próxima — senão a marca do chute, perto da divisa, cairia
  // na célula vizinha.
  const grandes = manchas.filter((m) => m.n > 8000);
  for (const m of grandes) {
    m.celula = Math.min(1, Math.floor(m.cy / (h / 2))) * 3 + Math.min(2, Math.floor(m.cx / (w / 3)));
  }
  for (const m of manchas) {
    if (m.celula >= 0) continue;
    let melhor = null, menor = Infinity;
    for (const g of grandes) {
      const [a, b, c, e] = g.caixa;
      const dist = Math.hypot(Math.max(a - m.cx, 0, m.cx - c), Math.max(b - m.cy, 0, m.cy - e));
      if (dist < menor) { menor = dist; melhor = g; }
    }
    m.celula = melhor ? melhor.celula : -1;
  }
  const celulaDe = manchas.map((m) => m.celula);
  return Array.from({ length: 6 }, (_, celula) => {
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let p = 0; p < w * h; p++) {
      if (rotulo[p] === -1 || celulaDe[rotulo[p]] !== celula) continue;
      const x = p % w, y = (p - x) / w;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (maxX < 0) throw new Error(`${nome}: célula ${celula + 1} vazia`);
    const r = nova(maxX - minX + 1, maxY - minY + 1);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const p = (minY + y) * w + minX + x;
      if (rotulo[p] === -1 || celulaDe[rotulo[p]] !== celula) continue;
      for (let c = 0; c < 4; c++) r.d[(y * r.w + x) * 4 + c] = d[p * 4 + c];
    }
    return r;
  });
}

/** `alvo`: tamanho da pose "parado" — a altura (heróis) ou a maior dimensão (inimigos, que são compridos). */
async function processar(tipo, arquivo, alvo, suave) {
  const nome = path.parse(arquivo).name;
  const avisos = [];
  const img = await ler(path.join(ENTRADA, tipo, arquivo));
  // Auras (Mirtilo enfurecido) são semitransparentes: corte de alpha mais baixo e sem limiar binário.
  if (!suave) removerBorroes(img, avisos, nome);
  limparFundo(img, suave ? 20 : 128);
  const poses = separarCelulas(img, avisos, nome);
  const fator = alvo / (tipo === 'herois' ? poses[0].h : Math.max(poses[0].w, poses[0].h));
  const reduzidas = await reduzirPaleta(await Promise.all(poses.map((p) => reduzir(p, fator, suave ? null : 110))), suave ? 64 : 40, suave);
  // Quadro comum: largura e altura da maior pose; todas apoiadas na mesma base (pés), centradas.
  const qw = Math.max(...reduzidas.map((p) => p.w)) + MARGEM * 2;
  const qh = Math.max(...reduzidas.map((p) => p.h)) + MARGEM * 2;
  const base = qh - MARGEM;
  const folha = nova(qw * 6, qh);
  reduzidas.forEach((p, i) => colar(folha, p, i * qw + Math.floor((qw - p.w) / 2), base - p.h));
  const lista = POSES[tipo === 'herois' ? 'heroi' : nome];
  if (!lista) throw new Error(`Poses desconhecidas para ${nome}`);
  const meta = {
    quadro: { largura: qw, altura: qh },
    base,
    poses: Object.fromEntries(lista.map((p, i) => [p, i])),
    altura: Object.fromEntries(lista.map((p, i) => [p, reduzidas[i].h])),
  };
  const dir = path.join(SAIDA, tipo);
  await mkdir(dir, { recursive: true });
  await salvarPng(folha, path.join(dir, `${nome}.png`));
  await writeFile(path.join(dir, `${nome}.json`), JSON.stringify(meta, null, 2) + '\n');
  // Prévia: fundo escuro, linha da base em vermelho e o nome de cada pose.
  const E = tipo === 'herois' ? 4 : 3;
  const previa = await sharp(Buffer.from(folha.d.buffer), { raw: { width: folha.w, height: folha.h, channels: 4 } })
    .resize(folha.w * E, folha.h * E, { kernel: 'nearest' }).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${folha.w * E}" height="${folha.h * E + 24}">
    <line x1="0" y1="${base * E}" x2="${folha.w * E}" y2="${base * E}" stroke="#ff4040" stroke-width="1"/>
    ${lista.map((p, i) => `<text x="${i * qw * E + 6}" y="${folha.h * E + 18}" font-size="15" font-family="sans-serif" fill="#ffd25a">${p}</text>`).join('')}
    ${lista.map((_, i) => `<rect x="${i * qw * E}" y="0" width="${qw * E}" height="${folha.h * E}" fill="none" stroke="#ffffff30"/>`).join('')}
  </svg>`;
  await sharp({ create: { width: folha.w * E, height: folha.h * E + 24, channels: 4, background: '#2a3140' } })
    .composite([{ input: previa, left: 0, top: 0 }, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png().toFile(path.join(PREVIAS, `${tipo === 'herois' ? 'heroi' : 'inimigo'}-${nome}-preview.png`));
  console.log(`  ${tipo}/${nome}: quadro ${qw}×${qh}, poses ${reduzidas.map((p) => `${p.w}×${p.h}`).join(', ')}`);
  return avisos;
}

await mkdir(PREVIAS, { recursive: true });
const avisos = [];
const herois = (await readdir(path.join(ENTRADA, 'herois'))).filter((f) => /^[a-z]+-[mf]\.png$/.test(f)).sort();
if (herois.length !== 8) console.warn(`  Atenção: esperava 8 folhas de herói, achei ${herois.length}.`);
for (const f of herois) avisos.push(...(await processar('herois', f, ALTURA_HEROI, false)));
for (const f of (await readdir(path.join(ENTRADA, 'inimigos'))).filter((f) => f.endsWith('.png')).sort()) {
  const suave = f.includes('enfurecido');
  avisos.push(...(await processar('inimigos', f, Math.round(ALTURA_HEROI * ESCALA_INIMIGO), suave)));
}
if (avisos.length) console.warn('  AVISOS:\n   - ' + avisos.join('\n   - '));
console.log('Pronto: folhas de batalha em public/assets/img/batalha/.');
