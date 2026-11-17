import { ASSETS, CLASSES_RETRATO, RACAS_JOGAVEIS, SFX, src, urlAsset } from '../core/assets';
import { audio } from '../core/audio';
import { preCarregar, preCarregarEmSegundoPlano, type ItemPreload } from '../core/preloader';
import { irPara, type Tela } from '../core/telas';
import { ehToque, textos } from '../core/textos';
import { h } from '../core/ui';
import { criarElementoVideo } from '../core/video';

const KB = 1024;
const MB = KB * KB;

/** Itens que precisam estar prontos antes do "Clique para começar". */
function itensEssenciais(): ItemPreload[] {
  const itens: ItemPreload[] = [
    { caminho: ASSETS.videoIntro, estimativa: 16 * MB },
    { caminho: ASSETS.musicaMenu, estimativa: 7 * MB },
    { caminho: ASSETS.logoIcarus, estimativa: 850 * KB },
    { caminho: ASSETS.logoForja, estimativa: 1.1 * MB },
    { caminho: ASSETS.wallpaperMenu, estimativa: 100 * KB },
  ];
  for (const r of RACAS_JOGAVEIS) for (const g of ['m', 'f'] as const) itens.push({ caminho: ASSETS.retrato(r, g), estimativa: 280 * KB });
  for (const nome of SFX) itens.push({ caminho: ASSETS.sfx(nome), estimativa: 40 * KB });
  return itens;
}

/** Retratos das classes: carregam depois, em segundo plano. */
function itensSecundarios(): ItemPreload[] {
  const itens: ItemPreload[] = [];
  for (const r of RACAS_JOGAVEIS)
    for (const g of ['m', 'f'] as const)
      for (const c of CLASSES_RETRATO) if (c !== 'comum') itens.push({ caminho: ASSETS.retrato(r, g, c), estimativa: 290 * KB });
  return itens;
}

export function telaLoading(): Tela {
  const logo = h('img', { class: 'loading-logo', alt: 'Icarus', src: urlAsset(ASSETS.logoIcarus), draggable: 'false' });
  const preenchimento = h('div', { class: 'barra-preenchimento' });
  const porcentagem = h('div', { class: 'barra-porcentagem' }, '0%');
  const barra = h('div', { class: 'barra', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': textos.loading.carregando },
    h('div', { class: 'barra-trilho' }, preenchimento), porcentagem);
  const comecar = h('button', { type: 'button', class: 'loading-comecar', hidden: true }, ehToque() ? textos.loading.comecarToque : textos.loading.comecar);
  const el = h('div', { class: 'tela-loading' }, logo, barra, comecar);

  logo.addEventListener('load', () => logo.classList.add('visivel'), { once: true });
  if (logo.complete) logo.classList.add('visivel');

  let iniciado = false;
  const iniciar = () => {
    if (iniciado) return;
    iniciado = true;
    // Este clique é o gesto que libera vídeo e música com som. O play() do vídeo
    // acontece aqui, dentro do gesto, para funcionar também no iOS.
    audio.desbloquear();
    audio.sfx('start');
    window.removeEventListener('keydown', tecla);
    // Para conferir telas soltas: ?tela=gameover.
    if (new URLSearchParams(location.search).get('tela') === 'gameover') return void irPara('gameOver', undefined, { som: false, duracao: 700 });
    const video = criarElementoVideo(src(ASSETS.videoIntro));
    video.play().catch(() => {});
    void irPara('intro', { video }, { som: false, duracao: 700 });
  };
  const tecla = (e: KeyboardEvent) => {
    if (!comecar.hidden && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      iniciar();
    }
  };

  return {
    el,
    async aoEntrar() {
      const progresso = (f: number) => {
        const pct = Math.round(f * 100);
        preenchimento.style.transform = `scaleX(${f})`;
        porcentagem.textContent = `${pct}%`;
        barra.setAttribute('aria-valuenow', String(pct));
      };
      await preCarregar(itensEssenciais(), progresso);
      await Promise.all([audio.carregarEfeitos(), document.fonts?.ready]);
      await new Promise((r) => setTimeout(r, 350));
      barra.classList.add('some');
      setTimeout(() => {
        barra.hidden = true;
        comecar.hidden = false;
        el.addEventListener('click', iniciar);
        window.addEventListener('keydown', tecla);
        comecar.focus({ preventScroll: true });
      }, 400);
      void preCarregarEmSegundoPlano(itensSecundarios());
    },
    aoSair() {
      window.removeEventListener('keydown', tecla);
    },
  };
}
