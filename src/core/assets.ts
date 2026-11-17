/** Caminhos das mídias (relativos a public/assets) e resolução para URL final. */

export type Genero = 'm' | 'f';

const BASE = import.meta.env.BASE_URL;

/** URL pública de um asset (respeita o `base` do Vite, ex.: /A-Forja-do-Heroi/). */
export const urlAsset = (caminho: string): string => `${BASE}assets/${caminho}`;

export const ASSETS = {
  videoIntro: 'video/intro-icarus.mp4',
  videoPrologo: 'video/prologo.mp4',
  musicaMenu: 'music/the-first-choice.mp3',
  logoIcarus: 'img/logos/icarus.png',
  logoForja: 'img/logos/a-forja-do-heroi.png',
  wallpaperMenu: 'img/wallpapers/menu.webp',
  /** Música opcional do sonho: a primeira extensão que existir. */
  musicaSonho: ['music/sonho.mp3', 'music/sonho.ogg', 'music/sonho.m4a', 'music/sonho.wav'],
  spriteChibi: (raca: string, genero: Genero) => `sprites/chibi-${raca}-${genero}.png`,
  retrato: (raca: string, genero: Genero, classe = 'comum') => `img/herois/${raca}-${genero}-${classe}.webp`,
  sfx: (nome: string) => `sfx/${nome}.wav`,
} as const;

export const SFX = [
  'ui-hover', 'ui-click', 'ui-confirm', 'ui-back', 'ui-locked',
  'point-up', 'point-down', 'start', 'hero-confirm', 'transition',
] as const;
/** Efeitos do sonho: carregados só ao entrar na exploração. */
export const SFX_SONHO = [
  'step-marble', 'statue-glow', 'statue-awaken', 'divine-chord', 'thunder', 'text-blip', 'tremor',
] as const;
export type NomeSfx = (typeof SFX)[number] | (typeof SFX_SONHO)[number];

/** O arquivo existe e é do tipo esperado? (No dev server do Vite, um arquivo ausente pode voltar como HTML.) */
export async function existeAsset(caminho: string, tipo: 'image' | 'audio' | 'video'): Promise<boolean> {
  try {
    const r = await fetch(urlAsset(caminho), { method: 'HEAD', cache: 'no-store' });
    return r.ok && (r.headers.get('content-type') ?? '').startsWith(`${tipo}/`);
  } catch {
    return false;
  }
}

export const RACAS_JOGAVEIS = ['arake', 'azakar', 'nyashi', 'ayoran'] as const;
export const CLASSES_RETRATO = ['comum', 'guerreiro', 'paladino', 'ladino', 'arcanista', 'monge'] as const;

/** URLs de objeto (blob:) dos arquivos já pré-carregados: usar estas evita baixar de novo. */
const blobs = new Map<string, string>();

export function registrarBlob(caminho: string, urlObjeto: string): void {
  blobs.set(caminho, urlObjeto);
}

/** Melhor URL para um asset: a cópia em memória, se houver, ou a URL pública. */
export const src = (caminho: string): string => blobs.get(caminho) ?? urlAsset(caminho);

export const jaCarregado = (caminho: string): boolean => blobs.has(caminho);
