import type { Ponto } from './tipos';

/**
 * Máscara de recorte de um elemento do mapa (estátua, balaustrada) a partir da própria imagem do mapa,
 * para desenhá-lo por cima do herói quando ele passa atrás (profundidade).
 *
 * 1. Só vale o que está dentro do `contorno` (polígono aproximado, em pixels do mapa).
 * 2. O chão e o céu (pixels claros) são "inundados" a partir das bordas do contorno, sem passar pelo
 *    traço escuro do pixel art; o que sobra é o elemento.
 * 3. Ficam só as manchas ligadas às `sementes` (pontos dentro do elemento), o que descarta pedaços de
 *    coluna ou de nuvem que caíram dentro do contorno.
 *
 * A borda de baixo do contorno não semeia a inundação: ela normalmente corta a plataforma ou o manto,
 * que são claros, e a inundação "comeria" a estátua por dentro.
 */
export interface OpcoesRecorte {
  /** RGBA do recorte retangular (caixa do contorno). */
  rgba: Uint8ClampedArray;
  largura: number;
  altura: number;
  /** Canto superior esquerdo do recorte, em pixels do mapa. */
  x0: number;
  y0: number;
  contorno: Ponto[];
  sementes: Ponto[];
  /** Polígono sempre incluído, sem inundação (ex.: a balaustrada da frente, por onde o herói nunca passa). */
  fixo?: Ponto[];
  /** Luminância a partir da qual o pixel conta como chão/céu (padrão 150). */
  limiar?: number;
}

export function caixaDoContorno(contorno: Ponto[], larguraMapa: number, alturaMapa: number) {
  const xs = contorno.map((p) => p[0]);
  const ys = contorno.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(larguraMapa, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(alturaMapa, Math.ceil(Math.max(...ys)));
  return { x0, y0, largura: Math.max(1, x1 - x0), altura: Math.max(1, y1 - y0) };
}

/** Devolve 1 para os pixels do elemento e 0 para o resto (largura × altura). */
export function mascaraRecorte(o: OpcoesRecorte): Uint8Array {
  const { rgba, largura: w, altura: h, x0, y0, contorno } = o;
  const limiar = o.limiar ?? 150;
  const n = w * h;

  const dentro = preencher(contorno, w, h, x0, y0);
  const fixo = o.fixo ? preencher(o.fixo, w, h, x0, y0) : null;

  const claro = (p: number) => {
    const i = p * 4;
    return rgba[i + 3] < 128 || 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2] >= limiar;
  };

  // Inundação do chão a partir da borda (menos a borda de baixo).
  const yMaxSemente = h - 4;
  const chao = new Uint8Array(n);
  const fila = new Int32Array(n);
  let fim = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!dentro[p] || y > yMaxSemente || !claro(p)) continue;
    const borda = x === 0 || y === 0 || x === w - 1 || !dentro[p - 1] || !dentro[p + 1] || !dentro[p - w] || (y + 1 < h && !dentro[p + w]);
    if (borda) { chao[p] = 1; fila[fim++] = p; }
  }
  for (let ini = 0; ini < fim; ini++) {
    const p = fila[ini];
    const x = p % w;
    const viz = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
    for (const q of viz) {
      if (q < 0 || q >= n || chao[q] || !dentro[q] || !claro(q)) continue;
      chao[q] = 1;
      fila[fim++] = q;
    }
  }

  // Manchas ligadas às sementes.
  const mascara = new Uint8Array(n);
  fim = 0;
  if (fixo) for (let p = 0; p < n; p++) if (fixo[p]) { mascara[p] = 1; fila[fim++] = p; }
  for (const [sx, sy] of o.sementes) {
    const x = Math.round(sx - x0), y = Math.round(sy - y0);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (dentro[p] && !chao[p] && !mascara[p]) { mascara[p] = 1; fila[fim++] = p; }
  }
  for (let ini = 0; ini < fim; ini++) {
    const p = fila[ini];
    const x = p % w;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if ((ox < 0 && x === 0) || (ox > 0 && x === w - 1)) continue;
      const q = p + oy * w + ox;
      if (q < 0 || q >= n || mascara[q] || !dentro[q] || chao[q]) continue;
      mascara[q] = 1;
      fila[fim++] = q;
    }
  }
  return mascara;
}

/** Pixels dentro do polígono (varredura por linha, regra par-ímpar no centro do pixel). */
function preencher(poligono: Ponto[], w: number, h: number, x0: number, y0: number): Uint8Array {
  const r = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const py = y0 + y + 0.5;
    const cortes: number[] = [];
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [xi, yi] = poligono[i];
      const [xj, yj] = poligono[j];
      if (yi > py !== yj > py) cortes.push(xi + ((py - yi) * (xj - xi)) / (yj - yi));
    }
    cortes.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cortes.length; k += 2) {
      const a = Math.max(0, Math.ceil(cortes[k] - x0 - 0.5));
      const b = Math.min(w - 1, Math.floor(cortes[k + 1] - x0 - 0.5));
      for (let x = a; x <= b; x++) r[y * w + x] = 1;
    }
  }
  return r;
}
