import { getEstado } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { fmt, textos } from '../core/textos';
import { telaSequenciaTexto } from '../core/video';

/** Depois do clímax do sonho: o herói acorda, atrasado. Em seguida, a tela "Em breve". */
export function telaDespertar(): Tela {
  const genero = getEstado().personagem?.genero ?? 'm';
  return telaSequenciaTexto({
    linhas: textos.sonho.despertar.map((l) => fmt(l, genero)),
    msPorLinha: 2400,
    aoTerminar: () => void irPara('emBreve', undefined, { som: false, duracao: 800 }),
  });
}
