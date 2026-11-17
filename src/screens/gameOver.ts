import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarCampanha, getEstado } from '../core/estado';
import { pvAntesDaForjaDe } from '../core/pericias';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, h } from '../core/ui';

/**
 * Game Over genérico (não é usado no Capítulo 01, que não tem morte): fundo com fade-in lento, música,
 * "Sua jornada termina aqui…" e os botões "Tentar novamente" (volta à última cena salva antes da
 * batalha, com os PV cheios) e "Voltar ao menu". Para conferir: ?tela=gameover.
 */
export function telaGameOver(): Tela {
  const T = textos.gameOver;
  const tentar = botao(T.tentar, () => {
    const c = getEstado().campanha;
    const p = getEstado().personagem;
    if (!p) return void irPara('menu');
    atualizarCampanha({ cena: c.cenaAntesDaBatalha ?? c.cena, modo: 'escolhas', pvAtual: pvAntesDaForjaDe(p) });
    void irPara('capitulo');
  }, { classe: 'btn-principal' });
  const menu = botao(T.menu, () => void irPara('menu'), { som: 'ui-back' });
  const el = h('div', { class: 'tela-game-over' },
    h('img', { class: 'go-fundo', src: src(ASSETS.gameOver), alt: '', draggable: 'false' }),
    h('div', { class: 'go-veu' }),
    h('div', { class: 'go-conteudo' },
      h('p', { class: 'go-texto' }, T.texto),
      h('div', { class: 'go-botoes' }, tentar, menu)));
  return {
    el,
    aoEntrar() {
      if (new URLSearchParams(location.search).has('test')) {
        (window as unknown as { __fdg: unknown }).__fdg = { state: () => ({ tela: 'gameOver', musica: audio.estadoMusica() }) };
      }
      audio.tocarMusica(ASSETS.musica('game-over'), 1500);
      requestAnimationFrame(() => el.classList.add('entrou'));
      setTimeout(() => tentar.focus({ preventScroll: true }), 3200);
    },
  };
}
