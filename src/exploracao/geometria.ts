import type { CamadaColisao, Ponto } from './tipos';

/** Ponto dentro do polígono (regra par-ímpar). */
export function dentroDoPoligono(x: number, y: number, pontos: Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const [xi, yi] = pontos[i];
    const [xj, yj] = pontos[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Andável segundo as camadas: a última camada que contém o ponto decide. */
export function pontoAndavel(camadas: CamadaColisao[], x: number, y: number): boolean {
  let andavel = false;
  for (const c of camadas) if (dentroDoPoligono(x, y, c.pontos)) andavel = c.tipo === 'andavel';
  return andavel;
}

/** Meia largura e meia altura da "sombra" dos pés do herói, usada na colisão. */
export const PES = { rx: 8, ry: 4 };

/** Os pés cabem nessa posição? Confere o centro e quatro pontos ao redor. */
export function pesLivres(camadas: CamadaColisao[], x: number, y: number): boolean {
  return (
    pontoAndavel(camadas, x, y) &&
    pontoAndavel(camadas, x - PES.rx, y) &&
    pontoAndavel(camadas, x + PES.rx, y) &&
    pontoAndavel(camadas, x, y - PES.ry) &&
    pontoAndavel(camadas, x, y + PES.ry)
  );
}

/**
 * Ponto andável mais próximo de `de` (busca em anéis de `passo` px até `raio`), dentro do mapa.
 * Devolve o próprio ponto se ele já estiver livre; null se não houver nada por perto.
 */
export function pontoLivreMaisProximo(
  camadas: CamadaColisao[], largura: number, altura: number, de: { x: number; y: number }, passo = 6, raio = 900,
): { x: number; y: number } | null {
  const x0 = Math.min(Math.max(de.x, PES.rx), largura - PES.rx);
  const y0 = Math.min(Math.max(de.y, PES.ry), altura - PES.ry);
  if (x0 === de.x && y0 === de.y && pesLivres(camadas, x0, y0)) return { x: de.x, y: de.y };
  if (pesLivres(camadas, x0, y0)) return { x: x0, y: y0 };
  for (let r = passo; r <= raio; r += passo) {
    let melhor: { x: number; y: number; d: number } | null = null;
    // Contorno do quadrado de "raio" r: o primeiro anel com ponto livre tem o mais próximo (aprox.).
    for (let k = -r; k <= r; k += passo) {
      for (const [x, y] of [[x0 + k, y0 - r], [x0 + k, y0 + r], [x0 - r, y0 + k], [x0 + r, y0 + k]]) {
        if (x < PES.rx || y < PES.ry || x > largura - PES.rx || y > altura - PES.ry) continue;
        if (!pesLivres(camadas, x, y)) continue;
        const d = Math.hypot(x - de.x, y - de.y);
        if (!melhor || d < melhor.d) melhor = { x, y, d };
      }
    }
    if (melhor) return { x: melhor.x, y: melhor.y };
  }
  return null;
}

/** Centro (média dos vértices) de um polígono. */
export function centro(pontos: Ponto[]): { x: number; y: number } {
  const s = pontos.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
  return { x: s[0] / pontos.length, y: s[1] / pontos.length };
}

/** Os pés passam livres de `a` até `b`? (amostra a cada 4 px) */
export function linhaLivre(camadas: CamadaColisao[], a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const passos = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  for (let i = 1; i <= passos; i++) {
    const t = i / passos;
    if (!pesLivres(camadas, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/**
 * Caminho andável de `de` até `para` (A* numa grade de `passo` px sobre as colisões, depois "puxado"
 * por linha de visão para virar poucos trechos retos). Devolve os pontos de passagem, sem o início,
 * ou null se não houver caminho.
 */
export function encontrarCaminho(
  camadas: CamadaColisao[], largura: number, altura: number,
  de: { x: number; y: number }, para: { x: number; y: number }, passo = 10,
): { x: number; y: number }[] | null {
  if (linhaLivre(camadas, de, para)) return [para];
  const cols = Math.ceil(largura / passo), lins = Math.ceil(altura / passo);
  const livre = new Int8Array(cols * lins).fill(-1); // -1 = ainda não calculado
  const ehLivre = (c: number, l: number) => {
    const i = l * cols + c;
    if (livre[i] === -1) livre[i] = pesLivres(camadas, c * passo + passo / 2, l * passo + passo / 2) ? 1 : 0;
    return livre[i] === 1;
  };
  const celula = (p: { x: number; y: number }) => {
    const c = Math.floor(p.x / passo), l = Math.floor(p.y / passo);
    // Se a célula do ponto não estiver livre, usa a vizinha livre mais próxima.
    for (let r = 0; r <= 3; r++) for (let dl = -r; dl <= r; dl++) for (let dc = -r; dc <= r; dc++) {
      const cc = c + dc, ll = l + dl;
      if (cc >= 0 && ll >= 0 && cc < cols && ll < lins && ehLivre(cc, ll)) return ll * cols + cc;
    }
    return -1;
  };
  const ini = celula(de), alvo = celula(para);
  if (ini < 0 || alvo < 0) return null;
  const g = new Float32Array(cols * lins).fill(Infinity);
  const veio = new Int32Array(cols * lins).fill(-1);
  const fechado = new Uint8Array(cols * lins);
  const hx = (i: number) => Math.hypot((i % cols) - (alvo % cols), Math.floor(i / cols) - Math.floor(alvo / cols));
  // Fila de prioridade simples (heap binário de [f, i]).
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) { const pai = (k - 1) >> 1; if (heap[pai][0] <= heap[k][0]) break; [heap[pai], heap[k]] = [heap[k], heap[pai]]; k = pai; }
  };
  const pop = () => {
    const topo = heap[0];
    const ult = heap.pop()!;
    if (heap.length) {
      heap[0] = ult;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1, b = a + 1;
        let m = k;
        if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
        if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return topo;
  };
  g[ini] = 0;
  push(hx(ini), ini);
  while (heap.length) {
    const [, i] = pop();
    if (fechado[i]) continue;
    fechado[i] = 1;
    if (i === alvo) break;
    const c = i % cols, l = Math.floor(i / cols);
    for (let dl = -1; dl <= 1; dl++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dl) continue;
      const cc = c + dc, ll = l + dl;
      if (cc < 0 || ll < 0 || cc >= cols || ll >= lins || !ehLivre(cc, ll)) continue;
      if (dc && dl && (!ehLivre(c + dc, l) || !ehLivre(c, l + dl))) continue; // sem cortar quina
      const j = ll * cols + cc;
      const ng = g[i] + (dc && dl ? Math.SQRT2 : 1);
      if (ng < g[j]) { g[j] = ng; veio[j] = i; push(ng + hx(j), j); }
    }
  }
  if (!fechado[alvo]) return null;
  const celulas: { x: number; y: number }[] = [];
  for (let i = alvo; i !== -1; i = veio[i]) celulas.push({ x: (i % cols) * passo + passo / 2, y: Math.floor(i / cols) * passo + passo / 2 });
  celulas.reverse();
  celulas[celulas.length - 1] = para;
  // Puxa o barbante: de cada ponto, avança enquanto o próximo ainda está à vista.
  const caminho: { x: number; y: number }[] = [];
  let atual = de;
  let k = 0;
  while (k < celulas.length) {
    let melhor = k;
    while (melhor + 1 < celulas.length && linhaLivre(camadas, atual, celulas[melhor + 1])) melhor++;
    atual = celulas[melhor];
    caminho.push(atual);
    k = melhor + 1;
  }
  return caminho;
}
