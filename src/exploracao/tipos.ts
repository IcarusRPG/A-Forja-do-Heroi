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

export interface DadosMapa {
  id: string;
  /** Caminho relativo a public/assets. */
  imagem: string;
  largura: number;
  altura: number;
  inicio: { x: number; y: number; direcao: Direcao };
  colisoes: CamadaColisao[];
  interacoes: AreaInteracao[];
  gatilhos: Gatilho[];
  /** Pontos nomeados que a cena usa (centro do altar, por exemplo). */
  pontos?: Record<string, { x: number; y: number }>;
}
