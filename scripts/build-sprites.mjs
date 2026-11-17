// Gera as folhas de caminhada do herói a partir das folhas 2 × 2 de vistas paradas.
//
// Entrada: assets-src/sprites/<raca>-<m|f>.png — 4 vistas em grade 2 × 2:
//   superior esquerda = de frente (baixo), superior direita = esquerda,
//   inferior esquerda = direita, inferior direita = de costas (cima).
// Saída:   public/assets/sprites/chibi-<raca>-<m|f>.png — grade 4 × 4 de quadros 48 × 48
//          (linhas: baixo, esquerda, direita, cima; quadros: parado, passo A, parado, passo B).
// Prévias: tests/screenshots/sprites/<raca>-<m|f>-preview.png (6×) e <raca>-<m|f>-andando.gif.
//
// Uso: npm run sprites

import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = path.join(ROOT, 'assets-src', 'sprites');
const SAIDA = path.join(ROOT, 'public', 'assets', 'sprites');
const PREVIAS = path.join(ROOT, 'tests', 'screenshots', 'sprites');

const QUADRO = 48;
const ALTURA_ALVO = 46;
const LIMIAR_ALPHA = 110;
const CORES = 28;

/**
 * Ordem das vistas em cada folha: [baixo, esquerda, direita, cima] → quadrante (coluna, linha).
 * Se alguma folha vier em outra ordem, ajuste só ela aqui.
 */
const ORDEM_PADRAO = { baixo: [0, 0], esquerda: [1, 0], direita: [0, 1], cima: [1, 1] };
const ORDEM_ESPECIAL = {};
const DIRECOES = ['baixo', 'esquerda', 'direita', 'cima'];

// ---------- imagem em memória: { w, h, d: Uint8ClampedArray RGBA } ----------
const nova = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });
const idx = (img, x, y) => (y * img.w + x) * 4;

async function ler(arquivo) {
  const { data, info } = await sharp(arquivo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: new Uint8ClampedArray(data) };
}

/** 1. Fundo: alpha < 128 vira transparente; o branco ligado às bordas some (flood fill). */
function limparFundo(img) {
  const { w, h, d } = img;
  const branco = (i) => d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 128) d[i + 3] = 0;
  const visto = new Uint8Array(w * h);
  const pilha = [];
  const empurrar = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visto[p]) return;
    const i = p * 4;
    if (d[i + 3] !== 0 && !branco(i)) return;
    visto[p] = 1;
    pilha.push(p);
  };
  for (let x = 0; x < w; x++) { empurrar(x, 0); empurrar(x, h - 1); }
  for (let y = 0; y < h; y++) { empurrar(0, y); empurrar(w - 1, y); }
  while (pilha.length) {
    const p = pilha.pop();
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p - x) / w;
    empurrar(x + 1, y); empurrar(x - 1, y); empurrar(x, y + 1); empurrar(x, y - 1);
  }
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) d[i] = d[i + 1] = d[i + 2] = 0;
}

/**
 * 2. Separa as 4 vistas. Algumas folhas têm a cabeça de baixo invadindo a metade de cima (juba,
 * chifres), então não dá para cortar exatamente no meio: cada mancha de pixels conectados vai para
 * o quadrante onde fica o seu centro, e a vista é recortada pela caixa das suas manchas.
 */
function separarVistas(img) {
  const { w, h, d } = img;
  const rotulo = new Int32Array(w * h).fill(-1);
  const quadrante = []; // por mancha
  const fila = new Int32Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (rotulo[p0] !== -1 || d[p0 * 4 + 3] === 0) continue;
    const id = quadrante.length;
    let ini = 0, fim = 0, sx = 0, sy = 0;
    fila[fim++] = p0; rotulo[p0] = id;
    while (ini < fim) {
      const p = fila[ini++];
      const x = p % w, y = (p - x) / w;
      sx += x; sy += y;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (rotulo[q] === -1 && d[q * 4 + 3] !== 0) { rotulo[q] = id; fila[fim++] = q; }
      }
    }
    quadrante.push((sx / fim < w / 2 ? 0 : 1) + (sy / fim < h / 2 ? 0 : 2));
  }
  return (qx, qy, nome) => {
    const alvo = qx + qy * 2;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let p = 0; p < w * h; p++) {
      if (rotulo[p] === -1 || quadrante[rotulo[p]] !== alvo) continue;
      const x = p % w, y = (p - x) / w;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (maxX < 0) throw new Error(`${nome}: quadrante (${qx},${qy}) vazio`);
    const r = nova(maxX - minX + 1, maxY - minY + 1);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const p = (minY + y) * w + minX + x;
      if (rotulo[p] === -1 || quadrante[rotulo[p]] !== alvo) continue;
      const a = p * 4, b = idx(r, x, y);
      for (let c = 0; c < 4; c++) r.d[b + c] = d[a + c];
    }
    return r;
  };
}

/** 4. Reduz (Lanczos) e aplica o limiar de alpha. */
async function reduzir(vista, fator) {
  const w = Math.max(1, Math.round(vista.w * fator));
  const h = Math.max(1, Math.round(vista.h * fator));
  const { data } = await sharp(Buffer.from(vista.d.buffer), { raw: { width: vista.w, height: vista.h, channels: 4 } })
    .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  const r = { w, h, d: new Uint8ClampedArray(data) };
  for (let i = 0; i < r.d.length; i += 4) {
    if (r.d[i + 3] > LIMIAR_ALPHA) r.d[i + 3] = 255;
    else r.d[i] = r.d[i + 1] = r.d[i + 2] = r.d[i + 3] = 0;
  }
  return r;
}

/** Reduz a paleta das 4 vistas juntas (paleta única por personagem). */
async function reduzirPaleta(vistas) {
  const largura = vistas.reduce((s, v) => s + v.w + 1, 0);
  const altura = Math.max(...vistas.map((v) => v.h));
  const tira = nova(largura, altura);
  let x0 = 0;
  for (const v of vistas) { colar(tira, v, x0, 0); x0 += v.w + 1; }
  const png = await sharp(Buffer.from(tira.d.buffer), { raw: { width: largura, height: altura, channels: 4 } })
    .png({ palette: true, colors: CORES, dither: 0, effort: 10 }).toBuffer();
  const q = await ler(png);
  x0 = 0;
  return vistas.map((v) => {
    const r = nova(v.w, v.h);
    for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
      const a = idx(q, x0 + x, y), b = idx(r, x, y);
      if (q.d[a + 3] > 127) { r.d[b] = q.d[a]; r.d[b + 1] = q.d[a + 1]; r.d[b + 2] = q.d[a + 2]; r.d[b + 3] = 255; }
    }
    x0 += v.w + 1;
    return r;
  });
}

/** Cola `src` em `dst` (só pixels opacos), com filtro opcional de linhas/colunas e deslocamento por linha. */
function colar(dst, src, dx, dy, { linhas, colunas, desloc } = {}) {
  for (let y = 0; y < src.h; y++) {
    if (linhas && (y < linhas[0] || y >= linhas[1])) continue;
    const sx = desloc ? desloc(y) : 0;
    for (let x = 0; x < src.w; x++) {
      if (colunas && (x < colunas[0] || x >= colunas[1])) continue;
      const a = idx(src, x, y);
      if (src.d[a + 3] === 0) continue;
      const tx = dx + x + sx, ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const b = idx(dst, tx, ty);
      for (let c = 0; c < 4; c++) dst.d[b + c] = src.d[a + c];
    }
  }
}

/** 5–7. Monta os 4 quadros de uma direção. */
function quadrosDaDirecao(v, direcao) {
  const ox = Math.floor((QUADRO - v.w) / 2);
  const oy = QUADRO - 1 - v.h; // pés 1 px acima da base
  const quadros = [];
  const deLado = direcao === 'esquerda' || direcao === 'direita';
  const quadril = Math.round(v.h * (deLado ? 0.62 : 0.66));
  const meio = Math.round(v.w / 2);
  for (let f = 0; f < 4; f++) {
    const q = nova(QUADRO, QUADRO);
    const passo = f === 1 ? 'A' : f === 3 ? 'B' : null;
    if (!passo) { colar(q, v, ox, oy); quadros.push(q); continue; }
    const by = oy - 1; // balanço: o corpo sobe 1 px
    if (!deLado) {
      // Pernas primeiro (uma sobe 2 px), depois o tronco por cima.
      const sobe = passo === 'A' ? [0, meio] : [meio, v.w];
      const fica = passo === 'A' ? [meio, v.w] : [0, meio];
      colar(q, v, ox, by, { linhas: [quadril, v.h], colunas: fica });
      colar(q, v, ox, by - 2, { linhas: [quadril, v.h], colunas: sobe });
      colar(q, v, ox, by, { linhas: [0, quadril] });
    } else {
      // Cisalhamento das pernas: até ±3 px no pé, para a frente no passo A e para trás no B.
      const frente = direcao === 'esquerda' ? -1 : 1;
      const sinal = passo === 'A' ? frente : -frente;
      const desloc = (y) => (y < quadril ? 0 : Math.round((sinal * 3 * (y - quadril)) / Math.max(1, v.h - 1 - quadril)));
      colar(q, v, ox, by, { desloc });
    }
    quadros.push(q);
  }
  return quadros;
}

async function salvarPng(img, arquivo, escala = 1) {
  let s = sharp(Buffer.from(img.d.buffer), { raw: { width: img.w, height: img.h, channels: 4 } });
  if (escala !== 1) s = s.resize(img.w * escala, img.h * escala, { kernel: 'nearest' });
  await s.png({ compressionLevel: 9 }).toFile(arquivo);
}

async function salvarGif(folha, arquivo) {
  // Um quadro do GIF = as 4 direções lado a lado, no mesmo passo, ampliadas 4×.
  const E = 4;
  const paginas = [];
  for (let f = 0; f < 4; f++) {
    const p = nova(QUADRO * 4, QUADRO);
    for (let i = 0; i < p.d.length; i += 4) { p.d[i] = 70; p.d[i + 1] = 92; p.d[i + 2] = 110; p.d[i + 3] = 255; }
    DIRECOES.forEach((_, linha) => {
      const q = nova(QUADRO, QUADRO);
      for (let y = 0; y < QUADRO; y++) for (let x = 0; x < QUADRO; x++) {
        const a = idx(folha, f * QUADRO + x, linha * QUADRO + y), b = idx(q, x, y);
        for (let c = 0; c < 4; c++) q.d[b + c] = folha.d[a + c];
      }
      colar(p, q, linha * QUADRO, 0);
    });
    paginas.push(await sharp(Buffer.from(p.d.buffer), { raw: { width: p.w, height: p.h, channels: 4 } })
      .resize(p.w * E, p.h * E, { kernel: 'nearest' }).png().toBuffer());
  }
  await sharp(paginas, { join: { animated: true } }).gif({ loop: 0, delay: [180, 180, 180, 180] }).toFile(arquivo);
}

async function processar(arquivo) {
  const nome = path.parse(arquivo).name;
  const avisos = [];
  const img = await ler(path.join(ENTRADA, arquivo));
  limparFundo(img);
  const ordem = ORDEM_ESPECIAL[nome] ?? ORDEM_PADRAO;
  const recortar = separarVistas(img);
  const brutas = DIRECOES.map((d) => recortar(ordem[d][0], ordem[d][1], nome));
  // 3. Escala única: a vista mais alta fica com 46 px (e nenhuma passa da largura do quadro).
  const altMax = Math.max(...brutas.map((v) => v.h));
  const largMax = Math.max(...brutas.map((v) => v.w));
  const fator = Math.min(ALTURA_ALVO / altMax, (QUADRO - 6) / largMax);
  const reduzidas = await reduzirPaleta(await Promise.all(brutas.map((v) => reduzir(v, fator))));

  const folha = nova(QUADRO * 4, QUADRO * 4);
  DIRECOES.forEach((d, linha) => {
    quadrosDaDirecao(reduzidas[linha], d).forEach((q, col) => colar(folha, q, col * QUADRO, linha * QUADRO));
  });
  await salvarPng(folha, path.join(SAIDA, `chibi-${nome}.png`));
  await salvarPng(folha, path.join(PREVIAS, `${nome}-preview.png`), 6);
  await salvarGif(folha, path.join(PREVIAS, `${nome}-andando.gif`));
  console.log(`  ${nome}: vistas ${reduzidas.map((v) => `${v.w}×${v.h}`).join(', ')} (fator ${fator.toFixed(4)})`);
  return avisos;
}

await mkdir(SAIDA, { recursive: true });
await mkdir(PREVIAS, { recursive: true });
const arquivos = (await readdir(ENTRADA)).filter((f) => /^[a-z]+-[mf]\.png$/.test(f)).sort();
if (arquivos.length !== 8) console.warn(`  Atenção: esperava 8 folhas, achei ${arquivos.length}.`);
const avisos = [];
for (const f of arquivos) avisos.push(...(await processar(f)));
if (avisos.length) console.warn('  AVISOS:\n   - ' + avisos.join('\n   - '));
console.log(`Pronto: ${arquivos.length} folhas em public/assets/sprites/.`);
