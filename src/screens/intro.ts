import { ASSETS, src } from '../core/assets';
import { irPara, type Tela } from '../core/telas';
import { telaVideo } from '../core/video';

/** Vídeo de abertura (apresentação de Icarus). Termina ou é pulado → menu inicial. */
export function telaIntro(params?: unknown): Tela {
  const video = (params as { video?: HTMLVideoElement } | undefined)?.video ?? src(ASSETS.videoIntro);
  const irMenu = () => void irPara('menu', undefined, { som: false, duracao: 600 });
  return telaVideo({ video, aoTerminar: irMenu, aoFalhar: irMenu });
}
