import TEXTOS from '../data/textos.json';
import type { Genero } from './assets';

export const textos = TEXTOS;

type Flexao = Record<string, { m: string; f: string }>;
const FLEXAO = TEXTOS.flexao as Flexao;

/**
 * Preenche um texto: {chave} vira a variável informada ou, se for uma palavra de flexão
 * (herói/heroína, o/a, seu/sua…), a forma do gênero do personagem.
 */
export function fmt(texto: string, genero: Genero | null = 'm', vars: Record<string, string | number> = {}): string {
  return texto.replace(/\{(\w+)\}/g, (inteiro, chave: string) => {
    if (chave in vars) return String(vars[chave]);
    const f = FLEXAO[chave];
    return f ? f[genero ?? 'm'] : inteiro;
  });
}

/** Dispositivo de toque (para trocar "Clique" por "Toque"). */
export const ehToque = (): boolean => window.matchMedia('(pointer: coarse)').matches;
