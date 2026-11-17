import CLASSES_JSON from '../data/classes.json';
import type { Genero } from './assets';
import type { Atributo, MapaAtributos } from './estado';
import { pmExtraDaRaca } from './regras';
import { textos } from './textos';

/** Classes do sistema Icarus e o cálculo de PV/PM do 1º nível. */

export interface ClasseDados {
  id: string;
  nome: { m: string; f: string };
  selo?: { m: string; f: string };
  papel: string;
  jogavelDemo: boolean;
  pvBase?: number;
  pvPorNivel?: number;
  pm?: { base: number; porNivel: number; atributo: Atributo | null };
  atributoChave?: Atributo;
  periciasObrigatorias?: string;
  reliquia?: string;
  texto: string;
  naPratica?: string;
}

export const CLASSES = CLASSES_JSON.classes as ClasseDados[];
export const classePorId = (id: string | null | undefined) => CLASSES.find((c) => c.id === id) ?? null;

export const nomeDaClasse = (c: ClasseDados, genero: Genero | null) => c.nome[genero ?? 'm'];

/** PV no 1º nível = PV base + CON final. */
export const pvPrimeiroNivel = (c: ClasseDados, finais: MapaAtributos) => (c.pvBase ?? 0) + finais.CON;

/** PM no 1º nível = base + atributo (Mago: INT, Monge: SAB; os outros, fixo) + extra da raça (Ayoran: +1). */
export const pmPrimeiroNivel = (c: ClasseDados, finais: MapaAtributos, racaId: string | null = null) =>
  (c.pm?.base ?? 0) + (c.pm?.atributo ? finais[c.pm.atributo] : 0) + pmExtraDaRaca(racaId);

/** Nome do atributo por extenso ("Constituição") ou a sigla ("CON"), para telas estreitas. */
const nomeAtributo = (a: Atributo, curto: boolean) => (curto ? a : (textos.atributos as Record<Atributo, string>)[a]);

/**
 * Antes da Forja, o herói ainda não tem classe: PV = 10 + CON e nenhum PM.
 * A classe só desperta quando ele jura na Forja.
 */
export const PV_ANTES_DA_FORJA = 10;
export const PM_ANTES_DA_FORJA = 0;
export const pvAntesDaForja = (finais: MapaAtributos) => PV_ANTES_DA_FORJA + finais.CON;
export const formulaPvAntesDaForja = (curto = false) => `${PV_ANTES_DA_FORJA} + ${nomeAtributo('CON', curto)}`;

/** Fórmula antes dos atributos: "20 + Constituição" (ou "20 + CON"). */
export const formulaPv = (c: ClasseDados, curto = false) => `${c.pvBase} + ${nomeAtributo('CON', curto)}`;
export function formulaPm(c: ClasseDados, racaId: string | null = null, curto = false): string {
  const base = c.pm?.atributo ? `${c.pm.base} + ${nomeAtributo(c.pm.atributo, curto)}` : `${c.pm?.base ?? 0}`;
  const extra = pmExtraDaRaca(racaId);
  if (!extra) return base;
  return curto ? `${base} + ${extra}` : `${base} + ${extra} (${textos.criacao.classe.pmRaca})`;
}

/** As quatro pedras da Forja (fase futura). */
export const pedrasIniciais = () => ({ tolerancia: false, egide: false, verdade: false, preco: false });
