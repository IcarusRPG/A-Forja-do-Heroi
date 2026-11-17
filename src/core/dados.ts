/**
 * Rolagens de dados. Nos testes (?test=1), `forcarD20([n, …])` faz os próximos d20 saírem com esses
 * valores, na ordem; os outros dados (dano) continuam aleatórios.
 */

const forcados: number[] = [];

export function forcarD20(valores: number[]): void {
  forcados.push(...valores.map((v) => Math.max(1, Math.min(20, Math.round(v)))));
}

export const d20Forcados = (): number[] => [...forcados];

export function rolarD20(): number {
  const f = forcados.shift();
  return f ?? 1 + Math.floor(Math.random() * 20);
}

export function rolar(qtd: number, lados: number): number[] {
  return Array.from({ length: qtd }, () => 1 + Math.floor(Math.random() * lados));
}

/** "1d4+1" → { qtd: 1, lados: 4, mod: 1 } */
export function lerDado(expr: string): { qtd: number; lados: number; mod: number } {
  const m = /^(\d+)d(\d+)\s*([+-]\s*\d+)?$/.exec(expr.replace(/\s+/g, ''));
  if (!m) throw new Error(`Dado inválido: ${expr}`);
  return { qtd: Number(m[1]), lados: Number(m[2]), mod: m[3] ? Number(m[3].replace(/\s+/g, '')) : 0 };
}

/** Número com sinal, com o menos tipográfico: +3, −1, +0. */
export const comSinal = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
