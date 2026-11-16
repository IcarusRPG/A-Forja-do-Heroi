import { ATRIBUTOS, type Atributo, type MapaAtributos } from './estado';
import RACAS_JSON from '../data/racas.json';

/** Regras puras da criação de personagem (point-buy e modificadores raciais). */

export const PONTOS_INICIAIS = 10;
export const MIN = -1;
export const MAX = 4;

/** Custo total de um valor comprado. −1 devolve 1 ponto. */
export const CUSTO: Record<number, number> = { [-1]: -1, 0: 0, 1: 1, 2: 2, 3: 4, 4: 7 };

export const zerados = (): MapaAtributos => ({ FOR: 0, DES: 0, CON: 0, INT: 0, SAB: 0, CAR: 0 });

export const gastos = (m: MapaAtributos): number => ATRIBUTOS.reduce((s, a) => s + CUSTO[m[a]], 0);

export const saldo = (m: MapaAtributos): number => PONTOS_INICIAIS - gastos(m);

/** Algum outro atributo (que não `exceto`) já está em −1? */
const temNegativo = (m: MapaAtributos, exceto?: Atributo) => ATRIBUTOS.some((a) => a !== exceto && m[a] < 0);

export function podeAumentar(m: MapaAtributos, a: Atributo): boolean {
  const v = m[a];
  if (v >= MAX) return false;
  return CUSTO[v + 1] - CUSTO[v] <= saldo(m);
}

export function podeDiminuir(m: MapaAtributos, a: Atributo): boolean {
  const v = m[a];
  if (v > 0) return true;
  // De 0 para −1: só um atributo pode ficar negativo.
  return v === 0 && !temNegativo(m, a);
}

export interface RacaDados {
  id: string;
  nome: string;
  classico: string;
  significado: string;
  jogavelDemo: boolean;
  texto: string;
  naPratica?: string;
  atributos?: { tipo: 'escolha'; quantidade: number; valor: number } | { tipo: 'fixo'; valores: Partial<MapaAtributos> };
  variantes?: { id: string; nome: string; texto: string; elemento: string; pericias: Record<string, number> }[];
}

export const RACAS = RACAS_JSON.racas as RacaDados[];
export const racaPorId = (id: string | null) => RACAS.find((r) => r.id === id) ?? null;

/** Modificadores raciais por atributo. */
export function modificadoresRaciais(racaId: string | null, bonusEscolhidos: Atributo[]): MapaAtributos {
  const mods = zerados();
  const raca = racaPorId(racaId);
  const regra = raca?.atributos;
  if (!regra) return mods;
  if (regra.tipo === 'fixo') {
    for (const [a, v] of Object.entries(regra.valores)) mods[a as Atributo] += v ?? 0;
  } else {
    for (const a of new Set(bonusEscolhidos).values()) mods[a] += regra.valor;
  }
  return mods;
}

export function atributosFinais(comprados: MapaAtributos, racaId: string | null, bonus: Atributo[]): MapaAtributos {
  const mods = modificadoresRaciais(racaId, bonus);
  const final = zerados();
  for (const a of ATRIBUTOS) final[a] = comprados[a] + mods[a];
  return final;
}

/** Quantos bônus a raça deixa escolher (Araké: 3), ou 0. */
export function bonusAEscolher(racaId: string | null): number {
  const regra = racaPorId(racaId)?.atributos;
  return regra?.tipo === 'escolha' ? regra.quantidade : 0;
}

export const sinal = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
