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
  /** A classe é escolhida na Forja, ao fim do prólogo (fase futura). */
  classe: string | null;
  criadoEm: string;
}

export interface Config {
  /** 0 a 1 */
  musica: number;
  /** 0 a 1 */
  efeitos: number;
  mudo: boolean;
}

export interface EstadoJogo {
  versao: 1;
  config: Config;
  personagem: Personagem | null;
}

const CHAVE = 'a-forja-do-heroi:estado';

const padrao = (): EstadoJogo => ({
  versao: 1,
  config: { musica: 0.7, efeitos: 0.8, mudo: false },
  personagem: null,
});

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

export function atualizarConfig(parcial: Partial<Config>): void {
  Object.assign(estado.config, parcial);
  salvar();
}

export function salvarPersonagem(p: Personagem): void {
  estado.personagem = p;
  salvar();
}

export const temSave = (): boolean => estado.personagem !== null;
