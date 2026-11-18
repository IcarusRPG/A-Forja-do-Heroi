import type { Genero } from './assets';

/** Estado único do jogo, salvo inteiro no localStorage. */

export const ATRIBUTOS = ['FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'] as const;
export type Atributo = (typeof ATRIBUTOS)[number];
export type MapaAtributos = Record<Atributo, number>;

export interface Personagem {
  nome: string;
  genero: Genero;
  raca: string;
  variante: string | null;
  origem: string;
  atributosComprados: MapaAtributos;
  bonusArake: Atributo[];
  atributosFinais: MapaAtributos;
  /** Id da classe. Saves de antes da escolha de classe têm null e retomam no passo Classe. */
  classe: string | null;
  pvMax?: number;
  pmMax?: number;
  /** Pedras da Forja (fase futura). */
  pedras?: { tolerancia: boolean; egide: boolean; verdade: boolean; preco: boolean };
  criadoEm: string;
}

export interface Config {
  /** 0 a 1 */
  musica: number;
  /** 0 a 1 */
  efeitos: number;
  mudo: boolean;
  /**
   * Tremores de tela (câmera) no sonho. Sem valor salvo, o padrão é ligado — ou desligado se o sistema
   * pede menos movimento (prefers-reduced-motion).
   */
  tremores?: boolean;
}

/** Progresso do sonho dos deuses (primeira cena de exploração). */
export interface ProgressoSonho {
  concluido: boolean;
  /** Ids das estátuas cuja voz o herói já ouviu. */
  ouvidas: string[];
}

/** Um passo do caminho do jogador: a cena e, se houve, a escolha feita nela. */
export interface PassoCaminho {
  cena: string;
  escolha?: string;
  resultado?: string;
}

/**
 * Progresso nos capítulos. `cena` é a cena atual (null = início do capítulo, com o cartão de título);
 * `modo` diz se ela retoma nas falas ou direto nas escolhas.
 */
export interface Campanha {
  capitulo: number;
  cena: string | null;
  modo: 'falas' | 'escolhas';
  flags: string[];
  caminho: PassoCaminho[];
  /** Escolhas "uma vez só" já usadas ("cena#índice"). */
  usadas: string[];
  /** PV atuais do herói (null = cheio). */
  pvAtual: number | null;
  bonusProximoTeste: number;
  /** Cena com a escolha que levou à última batalha (Game Over → "Tentar novamente"). */
  cenaAntesDaBatalha: string | null;
  // ---- Fase 4 (versaoSave 4) ----
  /** Marcas do relógio do atraso (0 a 4). */
  atraso: number;
  missoes: Record<string, EstadoMissao>;
  /** Quantidade de cada item (cura, itens-chave, peças de missão). */
  inventario: Record<string, number>;
  reais: number;
  /** Pontos de relação por personagem. */
  relacoes: Record<string, number>;
  compendio: ProgressoCompendio;
  /** Itens de mapa já recolhidos e pontos já usados (ids únicos: "fullmun:lenco", "salao:mancha-3"…). */
  coletados: string[];
  /** Contadores livres (abóboras quebradas, manchas limpas, estantes…). */
  contadores: Record<string, number>;
  /** Onde o jogo retoma: numa cena (tela de capítulo) ou num mapa, na posição salva. */
  local: LocalJogo;
}

export type EstadoMissao = 'nao_iniciada' | 'aceita' | 'concluida' | 'recusada';

export interface LocalJogo {
  tela: 'capitulo' | 'mapa';
  mapa?: string;
  x?: number;
  y?: number;
  direcao?: string;
}

/** Quantos parágrafos de cada ficha o jogador já viu, e o que ainda não abriu. */
export interface ProgressoCompendio {
  /** Personagens conhecidos (ficha liberada). */
  conhecidos: string[];
  /** Criaturas encontradas; `sabe` = "O que você sabe" liberado. */
  bestiario: Record<string, { sabe: boolean }>;
  /** Parágrafos já anunciados por ficha (para os avisos de novidade). */
  vistos: Record<string, number>;
  /** Há novidade não vista (ponto dourado no menu de pausa). */
  novidade: boolean;
}

/** Relações iniciais (Fase 4). Também usadas na migração de saves antigos. */
export const RELACOES_INICIAIS: Readonly<Record<string, number>> = {
  artho: 2, nyme: 2, aylin: 1, 'vo-hulda': 0, osric: 0, kobanu: 0, gerulf: 0, tobias: 0, selene: 0, dagna: 0,
};

export interface EstadoJogo {
  versao: 1;
  /** Formato do save (4 = Fase 4: atraso, missões, inventário, relações, Compêndio). */
  versaoSave?: number;
  config: Config;
  personagem: Personagem | null;
  sonho: ProgressoSonho;
  campanha: Campanha;
}

const CHAVE = 'a-forja-do-heroi:estado';

const padrao = (): EstadoJogo => ({
  versao: 1,
  versaoSave: 4,
  config: { musica: 0.7, efeitos: 0.8, mudo: false },
  personagem: null,
  sonho: { concluido: false, ouvidas: [] },
  campanha: campanhaNova(),
});

export const campanhaNova = (): Campanha => ({
  capitulo: 1, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null,
  atraso: 0, missoes: {}, inventario: {}, reais: 0, relacoes: { ...RELACOES_INICIAIS },
  compendio: { conhecidos: [], bestiario: {}, vistos: {}, novidade: false },
  coletados: [], contadores: {}, local: { tela: 'capitulo' },
});

/**
 * Migração de saves anteriores à Fase 4. Um save parado em "Capítulo 02 · Em breve" (capítulo 2,
 * cena "inicio") entra no início do Capítulo 02 com as relações iniciais, atraso 2, sem cesto e com o
 * inventário vazio. Saves no meio do Capítulo 01 antigo recomeçam na soleira (a corrida virou o mapa).
 */
function migrar(c: Campanha, versao: number | undefined): Campanha {
  const base = campanhaNova();
  const m: Campanha = {
    ...base, ...c,
    relacoes: { ...base.relacoes, ...(c.relacoes ?? {}) },
    compendio: { ...base.compendio, ...(c.compendio ?? {}) },
    local: c.local ?? base.local,
  };
  if ((versao ?? 1) < 4) {
    if (m.capitulo >= 2) {
      Object.assign(m, { capitulo: 2, cena: null, modo: 'falas', atraso: 2, inventario: {}, reais: 0, relacoes: { ...RELACOES_INICIAIS }, local: { tela: 'capitulo' } });
    } else if (m.cena && ['c01-hulda', 'c01-osric', 'c01-kobanu'].includes(m.cena)) {
      Object.assign(m, { cena: 'c01-soleira', modo: 'escolhas' });
    }
  }
  return m;
}

function carregar(): EstadoJogo {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return padrao();
    const dados = JSON.parse(bruto) as Partial<EstadoJogo>;
    const base = padrao();
    return {
      versao: 1,
      config: { ...base.config, ...(dados.config ?? {}) },
      personagem: dados.personagem ?? null,
      sonho: {
        concluido: dados.sonho?.concluido === true,
        ouvidas: Array.isArray(dados.sonho?.ouvidas) ? dados.sonho!.ouvidas.filter((x) => typeof x === 'string') : [],
      },
      campanha: dados.campanha ? migrar(dados.campanha as Campanha, dados.versaoSave) : base.campanha,
      versaoSave: 4,
    };
  } catch {
    return padrao();
  }
}

const estado: EstadoJogo = carregar();

export const getEstado = (): Readonly<EstadoJogo> => estado;

function salvar(): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (erro) {
    console.warn('Não foi possível salvar o jogo.', erro);
  }
}

/** A câmera pode tremer? (Opções → "Tremores de tela"; o som do tremor toca de qualquer jeito.) */
export function tremoresLigados(): boolean {
  const salvo = estado.config.tremores;
  if (typeof salvo === 'boolean') return salvo;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function atualizarConfig(parcial: Partial<Config>): void {
  Object.assign(estado.config, parcial);
  salvar();
}

/** Salva um herói novo (e zera o progresso do sonho, que é dele). */
export function salvarPersonagem(p: Personagem): void {
  estado.personagem = p;
  estado.sonho = { concluido: false, ouvidas: [] };
  estado.campanha = campanhaNova();
  salvar();
}

/** Atualiza o progresso do capítulo e salva. */
export function atualizarCampanha(parcial: Partial<Campanha>): void {
  Object.assign(estado.campanha, parcial);
  salvar();
}

export function temFlag(flag: string): boolean {
  return estado.campanha.flags.includes(flag);
}

export function marcarFlag(flag: string): void {
  if (!temFlag(flag)) {
    estado.campanha.flags.push(flag);
    salvar();
  }
}

/** Registra uma voz ouvida no sonho (sem repetir). */
export function ouvirVoz(id: string): void {
  if (!estado.sonho.ouvidas.includes(id)) {
    estado.sonho.ouvidas.push(id);
    salvar();
  }
}

export function concluirSonho(): void {
  estado.sonho.concluido = true;
  salvar();
}

export const temSave = (): boolean => estado.personagem !== null;
