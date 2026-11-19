/** Formato dos arquivos de mapa (src/data/mapas/*.json). Coordenadas em pixels da imagem do mapa. */

export type Ponto = [number, number];
export type Direcao = 'baixo' | 'esquerda' | 'direita' | 'cima';
export const DIRECOES: Direcao[] = ['baixo', 'esquerda', 'direita', 'cima'];

/**
 * Camadas de colisão, avaliadas em ordem: a ÚLTIMA camada que contém o ponto decide se ele é andável.
 * Fora de todas, é bloqueado. Assim, "anel andável → espelho d'água bloqueado → pontes andáveis" funciona
 * sem precisar recortar polígonos.
 */
export interface CamadaColisao {
  id: string;
  tipo: 'andavel' | 'bloqueado';
  pontos: Ponto[];
}

/** Área circular onde o jogador pode interagir (E / Espaço / botão ✦). */
export interface AreaInteracao {
  id: string;
  x: number;
  y: number;
  raio: number;
}

/** Polígono que dispara eventos ao entrar e sair (sem precisar interagir). */
export interface Gatilho {
  id: string;
  pontos: Ponto[];
}

/**
 * Pedaço do próprio mapa recortado e desenhado por cima do herói quando ele passa atrás (profundidade).
 * O recorte é desenhado na profundidade `base` (o y do "pé" do elemento): se os pés do herói estão acima
 * dessa linha (y menor), ele fica atrás. Ver recorte.ts.
 */
export interface Oclusor {
  id: string;
  /** Profundidade: quem tem os pés acima desta linha (y menor) está atrás do recorte. */
  base: number;
  contorno: Ponto[];
  sementes: Ponto[];
  fixo?: Ponto[];
  limiar?: number;
}

/** Um pedaço da imagem do chão (mapas grandes são divididos em blocos de 1024 px). */
export interface BlocoChao {
  /** Caminho relativo a public/assets. */
  imagem: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/**
 * O mapa em camadas: `chao` (a imagem, inteira ou em blocos), `objetos`, `oclusores`, `colisoes`,
 * `interacoes` e `npcs`. Hoje o chão é a ilustração inteira e os oclusores são recortes dela; quando o
 * mapa virar "chão + sprites de objetos", só estes dados mudam.
 */
export interface DadosMapa {
  id: string;
  chao?: { imagem?: string; blocos?: BlocoChao[] };
  /** Formato antigo (uma imagem só); use `chao`. */
  imagem?: string;
  /** Tamanho dos personagens neste mapa (padrão 1): herói, NPCs, seguidores, pés, interações e velocidade. */
  escalaPersonagens?: number;
  largura: number;
  altura: number;
  inicio: { x: number; y: number; direcao: Direcao };
  colisoes: CamadaColisao[];
  interacoes: AreaInteracao[];
  gatilhos: Gatilho[];
  /** Pontos nomeados que a cena usa (centro do altar, por exemplo). */
  pontos?: Record<string, { x: number; y: number }>;
  oclusores?: Oclusor[];
}

/** Os blocos do chão (uma imagem inteira vira um bloco só). */
export function blocosDoChao(mapa: DadosMapa): BlocoChao[] {
  if (mapa.chao?.blocos?.length) return mapa.chao.blocos;
  const imagem = mapa.chao?.imagem ?? mapa.imagem;
  if (!imagem) throw new Error(`Mapa ${mapa.id} sem imagem de chão`);
  return [{ imagem, x: 0, y: 0, largura: mapa.largura, altura: mapa.altura }];
}
