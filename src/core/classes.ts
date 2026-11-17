import CLASSES_JSON from '../data/classes.json';
import type { Genero } from './assets';
import type { Atributo, MapaAtributos } from './estado';
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

/** PM no 1º nível = base + atributo (Mago: INT, Monge: SAB; os outros, fixo). */
export const pmPrimeiroNivel = (c: ClasseDados, finais: MapaAtributos) =>
  (c.pm?.base ?? 0) + (c.pm?.atributo ? finais[c.pm.atributo] : 0);

const extenso = (a: Atributo) => (textos.atributos as Record<Atributo, string>)[a];

/** Fórmula antes dos atributos: "20 + Constituição". */
export const formulaPv = (c: ClasseDados) => `${c.pvBase} + ${extenso('CON')}`;
export const formulaPm = (c: ClasseDados) => (c.pm?.atributo ? `${c.pm.base} + ${extenso(c.pm.atributo)}` : `${c.pm?.base ?? 0}`);

/** As quatro pedras da Forja (fase futura). */
export const pedrasIniciais = () => ({ tolerancia: false, egide: false, verdade: false, preco: false });
