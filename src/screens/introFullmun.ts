import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { getEstado } from '../core/estado';
import { registrarGanchos } from '../core/ganchos';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import { interpolar } from '../narrativa/capitulo';
import { tocarMusicaDaCena } from '../narrativa/palco';

/**
 * Intro de Füllmun (entre o prólogo dos deuses e o sonho): a ilustração da vila com um zoom lento
 * (Ken Burns), a playlist de Füllmun a 50% e o texto frase a frase, com fade. Cada toque mostra a
 * frase seguinte; o último faz fade para o preto e segue para o sonho. "Pular" no canto.
 */
export function telaIntroFullmun(): Tela {
  const T = textos.introFullmun;
  const frases = (T.frases as string[]).map((f) => interpolar(f, getEstado().personagem));
  const fundo = h('img', { class: 'intro-fullmun-fundo', src: src(ASSETS.cena('intro-fullmun')), alt: '', draggable: 'false' });
  const frase = h('p', { class: 'intro-fullmun-frase', 'aria-live': 'polite' });
  const toque = h('p', { class: 'intro-fullmun-toque' }, T.toque);
  const pular = botao(T.pular, () => void terminar(), { classe: 'btn-discreto intro-fullmun-pular', som: 'ui-back' });
  const preto = h('div', { class: 'intro-fullmun-preto' });
  const el = h('div', { class: 'tela-intro-fullmun', role: 'button', tabindex: '0', 'aria-label': T.avancar },
    fundo, h('div', { class: 'intro-fullmun-veu' }), h('div', { class: 'intro-fullmun-texto' }, frase, toque), pular, preto);

  let i = -1;
  let saindo = false;
  let trocando = false;

  async function mostrar(k: number) {
    trocando = true;
    frase.classList.remove('visivel');
    await esperar(i < 0 ? 300 : 450);
    i = k;
    frase.textContent = frases[k];
    el.dataset.frase = String(k + 1);
    frase.classList.add('visivel');
    await esperar(300);
    trocando = false;
  }

  async function avancar() {
    if (saindo || trocando) return;
    if (i + 1 < frases.length) return mostrar(i + 1);
    return terminar();
  }

  async function terminar() {
    if (saindo) return;
    saindo = true;
    preto.classList.add('visivel');
    audio.pararMusica(1600);
    await esperar(1700);
    audio.volumeRelativo(1);
    void irPara('sonho', undefined, { som: false, duracao: 0 });
  }

  el.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button')) void avancar(); });
  const tecla = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void avancar(); }
    else if (e.key === 'Escape') void terminar();
  };

  registrarGanchos({
    avancar: () => void avancar(),
    state: () => ({ tela: 'introFullmun', frase: i + 1, total: frases.length, texto: frase.textContent, musica: audio.estadoMusica() }),
  });

  return {
    el,
    aoEntrar() {
      audio.volumeRelativo(0.5);
      tocarMusicaDaCena('fullmun', 2500);
      window.addEventListener('keydown', tecla);
      requestAnimationFrame(() => el.classList.add('entrou'));
      void mostrar(0);
    },
    aoSair() {
      window.removeEventListener('keydown', tecla);
      audio.volumeRelativo(1);
    },
  };
}
