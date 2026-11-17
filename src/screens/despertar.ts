import { getEstado } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { fmt, textos } from '../core/textos';
import { telaSequenciaTexto } from '../core/video';

/** Depois do clímax do sonho: o herói acorda, atrasado. Em seguida, o Capítulo 01. */
export function telaDespertar(): Tela {
  const genero = getEstado().personagem?.genero ?? 'm';
  return telaSequenciaTexto({
    linhas: textos.sonho.despertar.map((l) => fmt(l, genero)),
    msPorLinha: 2400,
    aoTerminar: () => void irPara('capitulo', undefined, { som: false, duracao: 800 }),
  });
}
