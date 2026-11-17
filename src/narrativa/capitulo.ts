import CAP01 from '../data/capitulos/cap01.json';
import { getEstado, type Personagem } from '../core/estado';
import type { IdPericia } from '../core/pericias';

/**
 * Formato dos capítulos (src/data/capitulos/capNN.json): uma lista de cenas com fundo, música, falas,
 * escolhas (com condições, testes de perícia e batalhas) e o resumo gerado pelas flags.
 */

/** Condição para uma fala ou escolha aparecer. Escolha que não atende NÃO aparece (nem cinza). */
export interface Condicao {
  origem?: string;
  flag?: string;
  semFlag?: string;
  genero?: 'm' | 'f';
}

export interface Efeitos {
  flag?: string;
  /** Soma (ou subtrai) PV. */
  pv?: number;
  /** Define os PV (ex.: 1 depois da derrota). */
  pvDefinir?: number;
  bonusProximoTeste?: number;
}

export interface Fala {
  /** Sem `quem`: narração. "pensamento": pensamento do herói. "heroi": fala do herói. Ou o id de um NPC. */
  quem?: string;
  texto: string;
  requer?: Condicao;
  efeitos?: Efeitos;
  /** Troca o fundo da cena nesta fala (com fade lento). */
  fundo?: string;
  /** Mostra o cartão de ameaça (src/data/ameacas.json). */
  ameaca?: string;
}

export interface Escolha {
  texto: string;
  rotulo?: string;
  requer?: Condicao;
  uma_vez?: boolean;
  efeitos?: Efeitos;
  vai_para?: string;
  teste?: { pericia: IdPericia; cd: number };
  sucesso?: string;
  falha?: string;
  batalha?: string;
  vitoria?: string;
  derrota?: string;
}

/** O que acontece depois da última fala de uma cena sem escolhas. */
export interface Seguir {
  vai_para?: string;
  batalha?: string;
  vitoria?: string;
  derrota?: string;
  fim?: boolean;
  /** Texto do botão (padrão: "Continuar"). */
  texto?: string;
}

export interface Cena {
  id: string;
  fundo: string;
  /** "fullmun" é uma playlist; o resto é o nome do arquivo em music/; null = silêncio. */
  musica?: string | null;
  fadeMusica?: number;
  /** Vinheta (sem loop) que toca ao entrar; depois a música da cena volta. */
  vinheta?: string;
  /** Silêncio antes de a música da cena entrar (ms). */
  silencioAntes?: number;
  aoEntrar?: Efeitos & { som?: string; tremor?: boolean };
  falas: Fala[];
  escolhas?: Escolha[];
  seguir?: Seguir;
  /** Cena "de resultado": depois das falas, volta às escolhas restantes desta outra cena. */
  retorna?: string;
}

export interface Capitulo {
  id: string;
  numero: number;
  titulo: string;
  inicio: string;
  proximoCapitulo: { numero: number; titulo: string };
  resumo: (Condicao & { texto: string })[];
  cenas: Cena[];
}

export const CAPITULOS: Record<number, Capitulo> = { 1: CAP01 as unknown as Capitulo };

export function cenaPorId(cap: Capitulo, id: string): Cena {
  const c = cap.cenas.find((x) => x.id === id);
  if (!c) throw new Error(`Cena desconhecida: ${id}`);
  return c;
}

export function atende(cond: Condicao | undefined, p: Personagem | null = getEstado().personagem): boolean {
  if (!cond) return true;
  const flags = getEstado().campanha.flags;
  if (cond.origem && p?.origem !== cond.origem) return false;
  if (cond.genero && p?.genero !== cond.genero) return false;
  if (cond.flag && !flags.includes(cond.flag)) return false;
  if (cond.semFlag && flags.includes(cond.semFlag)) return false;
  return true;
}

/**
 * Variáveis do texto: {nome} é o nome do herói; {a|b} flexiona pelo gênero do herói (o primeiro termo
 * para homem, o segundo para mulher). Ex.: "{garoto|garota}".
 */
export function interpolar(texto: string, p: Personagem | null = getEstado().personagem): string {
  return texto
    .replace(/\{nome\}/g, p?.nome ?? 'Herói')
    .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_m, a: string, b: string) => (p?.genero === 'f' ? b : a));
}

/** Linhas do resumo do capítulo (fim de capítulo e Diário), pelas flags. */
export function resumoDoCapitulo(cap: Capitulo): string[] {
  return cap.resumo.filter((r) => atende(r)).map((r) => interpolar(r.texto));
}
