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

export interface EstadoJogo {
  versao: 1;
  config: Config;
  personagem: Personagem | null;
  sonho: ProgressoSonho;
}

const CHAVE = 'a-forja-do-heroi:estado';

const padrao = (): EstadoJogo => ({
  versao: 1,
  config: { musica: 0.7, efeitos: 0.8, mudo: false },
  personagem: null,
  sonho: { concluido: false, ouvidas: [] },
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
      sonho: {
        concluido: dados.sonho?.concluido === true,
        ouvidas: Array.isArray(dados.sonho?.ouvidas) ? dados.sonho!.ouvidas.filter((x) => typeof x === 'string') : [],
      },
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
  salvar();
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
