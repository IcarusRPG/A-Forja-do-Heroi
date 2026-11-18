import CAP01 from '../data/capitulos/cap01.json';
import CAP02 from '../data/capitulos/cap02.json';
import { getEstado, type EstadoMissao, type Personagem } from '../core/estado';
import type { IdPericia } from '../core/pericias';
import { atrasoFinal, cestoIntacto, contador, estadoMissao, qtdItem, relacao } from '../core/progresso';

/**
 * Formato dos capítulos (src/data/capitulos/capNN.json): uma lista de cenas com fundo, música, falas,
 * escolhas (com condições, testes de perícia e batalhas) e o resumo gerado pelas flags.
 */

/** Condição para uma fala ou escolha aparecer. Escolha que não atende NÃO aparece (nem cinza). */
export interface Condicao {
  origem?: string;
  /** Uma flag ou várias (todas precisam estar marcadas). */
  flag?: string | string[];
  semFlag?: string | string[];
  /** Alguma destas flags. */
  algumaFlag?: string[];
  genero?: 'm' | 'f';
  /** Estado de missões, ex.: { "hulda": "concluida" }. */
  missao?: Record<string, EstadoMissao>;
  /** Alguma destas missões neste estado. */
  algumaMissao?: Record<string, EstadoMissao>;
  /** Cesto de pães: intacto, com pão faltando, ou sem cesto. */
  cesto?: 'intacto' | 'faltando' | 'sem';
  /** Faixa do atraso final do Capítulo 02 (com o desconto do cesto), inclusiva. */
  atrasoFinal?: [number, number];
  /** Pontos mínimos de relação, ex.: { "selene": 1 }. */
  relacaoMin?: Record<string, number>;
  /** Contadores mínimos, ex.: { "estantes": 2 }. */
  contadorMin?: Record<string, number>;
  contadorMax?: Record<string, number>;
  /** Tem estes itens (todos). */
  temItem?: string | string[];
  /** Quantidade mínima de itens, ex.: { "repolho": 5 }. */
  itemMin?: Record<string, number>;
}

export interface Efeitos {
  flag?: string | string[];
  /** Soma (ou subtrai) PV. */
  pv?: number;
  /** Define os PV (ex.: 1 depois da derrota). */
  pvDefinir?: number;
  bonusProximoTeste?: number;
  /** Pontos de relação, ex.: { "kobanu": 2 }. */
  relacao?: Record<string, number>;
  /** Marcas do relógio do atraso. */
  atraso?: number;
  /** Itens ganhos (ou perdidos, com número negativo). */
  itens?: Record<string, number>;
  reais?: number;
  missao?: Record<string, EstadoMissao>;
  /** Libera a ficha do personagem no Compêndio. */
  conhecer?: string | string[];
  /** Bestiário: criatura encontrada; `sabe` libera "O que você sabe". */
  bestiario?: { id: string; sabe?: boolean };
  contador?: Record<string, number>;
  /** Estes efeitos só contam uma vez no jogo inteiro (chave única). */
  uma_vez?: string;
  /** Efeitos que só valem se a condição for verdadeira. */
  condicional?: { requer: Condicao; efeitos: Efeitos }[];
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
  /** Falas do mesmo grupo aparecem no máximo `limite` vezes por cena (ex.: as boas ações do sermão). */
  grupo?: string;
  limite?: number;
  /** Efeitos de tela e som ao mostrar a fala (alçapão, gritos, tragédia). */
  som?: string;
  tremor?: boolean;
  flash?: boolean;
  /** Classe visual do palco: "dessaturado", "normal", "preto", "alcapao"… */
  visual?: string;
  /** Som em loop (ex.: batida do coração); null para. */
  loop?: string | null;
  /** Troca a música; null para de uma vez (sem fade). */
  musica?: string | null;
  musicaCorte?: boolean;
  /** Abafa a música (câmera lenta). */
  abafar?: boolean;
  /** Velocidade da digitação (ms por letra; padrão 22). */
  velocidade?: number;
  /** Avança sozinha depois de tantos ms (sem esperar o toque). */
  auto?: number;
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
  mapa?: string;
  x?: number;
  y?: number;
  voltar?: boolean;
  /** Fala do herói ao escolher (aparece antes do destino). */
  fala?: string;
}

/** O que acontece depois da última fala de uma cena sem escolhas. */
export interface Seguir {
  vai_para?: string;
  /** Vai para um mapa explorável (na posição dada ou no início dele). */
  mapa?: string;
  x?: number;
  y?: number;
  /** Conversa no mapa: fecha o palco e volta a explorar. */
  voltar?: boolean;
  batalha?: string;
  vitoria?: string;
  derrota?: string;
  fim?: boolean;
  /** Texto do botão (padrão: "Continuar"). */
  texto?: string;
}

export interface Cena {
  id: string;
  /** Ilustração de fundo; sem fundo (conversa no mapa), o mapa escurecido aparece por trás. */
  fundo?: string;
  /** Classe visual do palco ao entrar (ex.: "alcapao", "dessaturado"). */
  visual?: string;
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
  /** Roteador: vai para o primeiro destino cuja condição for verdadeira (sem falas). */
  rotas?: { requer?: Condicao; vai_para: string }[];
}

export interface Capitulo {
  id: string;
  numero: number;
  titulo: string;
  inicio: string;
  proximoCapitulo: { numero: number; titulo: string };
  resumo: (Condicao & { texto: string })[];
  /** Acrescenta o estado do relógio do atraso ao resumo do fim. */
  resumoAtraso?: boolean;
  fundoFim?: string;
  /** Música da tela de fim (null = silêncio). */
  musicaFim?: string | null;
  cenas: Cena[];
}

export const CAPITULOS: Record<number, Capitulo> = { 1: CAP01 as unknown as Capitulo, 2: CAP02 as unknown as Capitulo };

/** Procura a cena em todos os capítulos (as conversas do mapa podem ser de qualquer um). */
export function cenaGlobal(id: string): { cap: Capitulo; cena: Cena } | null {
  for (const cap of Object.values(CAPITULOS)) {
    const cena = cap.cenas.find((x) => x.id === id);
    if (cena) return { cap, cena };
  }
  return null;
}

export function cenaPorId(cap: Capitulo, id: string): Cena {
  const c = cap.cenas.find((x) => x.id === id);
  if (!c) throw new Error(`Cena desconhecida: ${id}`);
  return c;
}

export function atende(cond: Condicao | undefined, p: Personagem | null = getEstado().personagem): boolean {
  if (!cond) return true;
  const flags = getEstado().campanha.flags;
  const lista = (x: string | string[] | undefined) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
  if (cond.origem && p?.origem !== cond.origem) return false;
  if (cond.genero && p?.genero !== cond.genero) return false;
  if (lista(cond.flag).some((f) => !flags.includes(f))) return false;
  if (lista(cond.semFlag).some((f) => flags.includes(f))) return false;
  if (cond.algumaFlag && !cond.algumaFlag.some((f) => flags.includes(f))) return false;
  if (cond.missao && Object.entries(cond.missao).some(([id, e]) => estadoMissao(id) !== e)) return false;
  if (cond.algumaMissao && !Object.entries(cond.algumaMissao).some(([id, e]) => estadoMissao(id) === e)) return false;
  if (cond.cesto) {
    const atual = cestoIntacto() ? 'intacto' : qtdItem('cesto-paes') > 0 || flags.includes('comeu_pao') ? 'faltando' : 'sem';
    if (atual !== cond.cesto) return false;
  }
  if (cond.atrasoFinal) {
    const a = atrasoFinal();
    if (a < cond.atrasoFinal[0] || a > cond.atrasoFinal[1]) return false;
  }
  if (cond.relacaoMin && Object.entries(cond.relacaoMin).some(([id, n]) => relacao(id) < n)) return false;
  if (cond.contadorMin && Object.entries(cond.contadorMin).some(([id, n]) => contador(id) < n)) return false;
  if (cond.contadorMax && Object.entries(cond.contadorMax).some(([id, n]) => contador(id) > n)) return false;
  if (lista(cond.temItem).some((i) => qtdItem(i) <= 0)) return false;
  if (cond.itemMin && Object.entries(cond.itemMin).some(([id, n]) => qtdItem(id) < n)) return false;
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
