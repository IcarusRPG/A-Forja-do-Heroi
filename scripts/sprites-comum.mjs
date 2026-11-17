// Funções de imagem compartilhadas pelos geradores de sprites (build-sprites e build-battle-sprites).
// Imagem em memória: { w, h, d: Uint8ClampedArray RGBA }.
import sharp from 'sharp';

export const LIMIAR_ALPHA = 110;
export const CORES = 28;

export const nova = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });
export const idx = (img, x, y) => (y * img.w + x) * 4;

export async function ler(arquivo) {
  const { data, info } = await sharp(arquivo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: new Uint8ClampedArray(data) };
}

/**
 * Fundo: alpha abaixo do corte vira transparente (padrão 128); o branco ligado às bordas some (flood fill,
 * para não apagar o branco das roupas e dos olhos).
 */
export function limparFundo(img, corteAlpha = 128) {
  const { w, h, d } = img;
  const branco = (i) => d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < corteAlpha) d[i + 3] = 0;
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

/** Reduz (Lanczos) e aplica o limiar de alpha (null = mantém o alpha suave, para auras). */
export async function reduzir(vista, fator, limiar = LIMIAR_ALPHA) {
  const w = Math.max(1, Math.round(vista.w * fator));
  const h = Math.max(1, Math.round(vista.h * fator));
  const { data } = await sharp(Buffer.from(vista.d.buffer), { raw: { width: vista.w, height: vista.h, channels: 4 } })
    .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  const r = { w, h, d: new Uint8ClampedArray(data) };
  for (let i = 0; i < r.d.length; i += 4) {
    if (limiar === null) { if (r.d[i + 3] < 16) r.d[i] = r.d[i + 1] = r.d[i + 2] = r.d[i + 3] = 0; }
    else if (r.d[i + 3] > limiar) r.d[i + 3] = 255;
    else r.d[i] = r.d[i + 1] = r.d[i + 2] = r.d[i + 3] = 0;
  }
  return r;
}

/** Reduz a paleta das vistas juntas (paleta única por personagem). `suave`: preserva o alpha parcial. */
export async function reduzirPaleta(vistas, cores = CORES, suave = false) {
  const largura = vistas.reduce((s, v) => s + v.w + 1, 0);
  const altura = Math.max(...vistas.map((v) => v.h));
  const tira = nova(largura, altura);
  let x0 = 0;
  for (const v of vistas) { colar(tira, v, x0, 0); x0 += v.w + 1; }
  const png = await sharp(Buffer.from(tira.d.buffer), { raw: { width: largura, height: altura, channels: 4 } })
    .png({ palette: true, colors: cores, dither: 0, effort: 10 }).toBuffer();
  const q = await ler(png);
  x0 = 0;
  return vistas.map((v) => {
    const r = nova(v.w, v.h);
    for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
      const a = idx(q, x0 + x, y), b = idx(r, x, y);
      if (suave ? q.d[a + 3] > 0 : q.d[a + 3] > 127) { r.d[b] = q.d[a]; r.d[b + 1] = q.d[a + 1]; r.d[b + 2] = q.d[a + 2]; r.d[b + 3] = suave ? q.d[a + 3] : 255; }
    }
    x0 += v.w + 1;
    return r;
  });
}

/** Cola `src` em `dst` (só pixels opacos), com filtro opcional de linhas/colunas e deslocamento por linha. */
export function colar(dst, src, dx, dy, { linhas, colunas, desloc } = {}) {
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

export async function salvarPng(img, arquivo, escala = 1) {
  let s = sharp(Buffer.from(img.d.buffer), { raw: { width: img.w, height: img.h, channels: 4 } });
  if (escala !== 1) s = s.resize(img.w * escala, img.h * escala, { kernel: 'nearest' });
  await s.png({ compressionLevel: 9 }).toFile(arquivo);
}

