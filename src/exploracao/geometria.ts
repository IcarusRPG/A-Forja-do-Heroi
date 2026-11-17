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

/** Centro (média dos vértices) de um polígono. */
export function centro(pontos: Ponto[]): { x: number; y: number } {
  const s = pontos.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
  return { x: s[0] / pontos.length, y: s[1] / pontos.length };
}
