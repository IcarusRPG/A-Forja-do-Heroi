import { ASSETS, urlAsset } from '../core/assets';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { h } from '../core/ui';
import { telaSequenciaTexto, telaVideo } from '../core/video';

/** O vídeo do prólogo existe? (no dev server do Vite, um arquivo ausente pode voltar como HTML.) */
async function existeVideoPrologo(): Promise<boolean> {
  try {
    const r = await fetch(urlAsset(ASSETS.videoPrologo), { method: 'HEAD', cache: 'no-store' });
    return r.ok && (r.headers.get('content-type') ?? '').startsWith('video/');
  } catch {
    return false;
  }
}

/**
 * Prólogo: toca public/assets/video/prologo.mp4 se existir; senão, o texto linha por linha.
 * Ao terminar (ou pular), o herói adormece: começa o sonho dos deuses.
 */
export function telaPrologo(): Tela {
  const el = h('div', { class: 'tela-prologo' });
  let atual: Tela | null = null;
  let saiu = false;
  const fim = () => void irPara('sonho', undefined, { som: false, duracao: 800 });
  const usarTexto = () => {
    if (saiu) return;
    atual?.aoSair?.();
    atual = telaSequenciaTexto({ linhas: textos.prologo.linhas, aoTerminar: fim });
    el.replaceChildren(atual.el);
    atual.aoEntrar?.();
  };

  return {
    el,
    async aoEntrar() {
      if (await existeVideoPrologo()) {
        if (saiu) return;
        // Se o vídeo falhar ou o navegador não deixar tocar, cai no texto.
        atual = telaVideo({ video: urlAsset(ASSETS.videoPrologo), aoTerminar: fim, aoFalhar: usarTexto });
        el.replaceChildren(atual.el);
        atual.aoEntrar?.();
      } else {
        usarTexto();
      }
    },
    aoSair() {
      saiu = true;
      atual?.aoSair?.();
    },
  };
}
