import { audio } from '../core/audio';
import { atualizarConfig, getEstado } from '../core/estado';
import { textos } from '../core/textos';
import { comDestaques, definirTutorial } from '../core/tutorial';
import { botao, h } from '../core/ui';
import { interpolar } from '../narrativa/capitulo';

/**
 * Telas do tutorial (Fase 4D): a pergunta do primeiro "Novo jogo" e a ajuda de Füllmun
 * (que aparece sozinha uma vez, mesmo com as dicas desligadas, e fica no menu de pausa no mapa).
 */

/** "Primeira vez em Icarus?" — grava a resposta em fdg.opcoes.tutorial (não pergunta de novo). */
export function perguntarTutorial(): Promise<boolean> {
  const T = textos.tutorial;
  return new Promise((resolver) => {
    const responder = (sim: boolean) => {
      definirTutorial(sim);
      fundo.classList.add('saindo');
      setTimeout(() => fundo.remove(), 220);
      resolver(sim);
    };
    const sim = botao(T.sim, () => responder(true), { classe: 'btn-principal tutorial-sim', som: 'ui-confirm' });
    const nao = botao(T.nao, () => responder(false), { classe: 'tutorial-nao', som: 'ui-back' });
    const caixa = h('div', { class: 'modal pergunta-tutorial', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tutorial-titulo' },
      h('div', { class: 'pergunta-tutorial-selo', 'aria-hidden': 'true' }, '✦'),
      h('h2', { class: 'modal-titulo', id: 'tutorial-titulo' }, T.perguntaTitulo),
      h('p', { class: 'pergunta-tutorial-texto' }, T.perguntaTexto),
      h('div', { class: 'pergunta-tutorial-acoes' }, sim, nao));
    // Sem fechar ao tocar fora: a pergunta precisa de uma resposta.
    const fundo = h('div', { class: 'modal-fundo confirmar-fundo' }, caixa);
    document.body.append(fundo);
    sim.focus({ preventScroll: true });
  });
}

/* ------------------------------ ajuda de Füllmun ------------------------------ */

const ICONES: Record<string, string> = {
  missao: '<span class="ajuda-marca">!</span>',
  andamento: '<span class="ajuda-marca ajuda-marca-andamento">…</span>',
  entregar: '<span class="ajuda-marca">?</span>',
  relogio: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#2a2016" stroke="#d6a94a" stroke-width="3"/><path d="M32 32 L52 22" stroke="#ffd25a" stroke-width="4" stroke-linecap="round"/><path d="M12 38h40" stroke="#f2d48a" stroke-width="2"/><circle cx="32" cy="32" r="4" fill="#ffd25a"/></svg>',
  coracao: '<svg viewBox="0 0 64 64"><path d="M32 54 C10 38 8 26 14 18 c6-8 15-6 18 2 c3-8 12-10 18-2 c6 8 4 20-18 36z" fill="#c4473f" stroke="#f2d48a" stroke-width="2.5"/></svg>',
  templo: '<svg viewBox="0 0 64 64"><path d="M8 24 L32 9 L56 24 Z" fill="#d6a94a"/><rect x="10" y="24" width="44" height="4" fill="#f2d48a"/><g fill="#f3eee5">' +
    '<rect x="14" y="30" width="5" height="18"/><rect x="25" y="30" width="5" height="18"/><rect x="35" y="30" width="5" height="18"/><rect x="45" y="30" width="5" height="18"/></g><rect x="8" y="48" width="48" height="6" fill="#d6a94a"/></svg>',
};

/**
 * Painel "Füllmun desperta" por cima do mapa escurecido. `aoFechar` recebe se o jogador pediu para
 * ver de novo depois (o item do menu de pausa existe de qualquer jeito enquanto ele estiver em Füllmun).
 */
export function abrirAjudaFullmun(aoFechar?: (depois: boolean) => void): () => void {
  const T = textos.ajudaFullmun;
  atualizarConfig({ ajudaFullmunVista: true });
  audio.sfx('compendio');
  const fechar = (depois: boolean) => {
    window.removeEventListener('keydown', tecla, true);
    fundo.classList.add('saindo');
    setTimeout(() => fundo.remove(), 220);
    aoFechar?.(depois);
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key !== ' ') fechar(false);
    } else if (/^(Arrow|Key[WASDE])/.test(e.code)) e.stopImmediatePropagation();
  };
  const p = getEstado().personagem;
  const lista = h('ul', { class: 'ajuda-fullmun-lista' }, ...T.itens.map((i) => {
    const icone = h('span', { class: `ajuda-icone ajuda-icone-${i.icone}`, 'aria-hidden': 'true' });
    icone.innerHTML = ICONES[i.icone] ?? '';
    return h('li', { class: 'ajuda-fullmun-item', 'data-icone': i.icone }, icone, h('p', {}, ...comDestaques(interpolar(i.texto, p))));
  }));
  const entendi = botao(T.entendi, () => fechar(false), { classe: 'btn-principal ajuda-entendi', som: 'ui-confirm' });
  const depois = botao(T.depois, () => fechar(true), { classe: 'ajuda-depois' });
  const caixa = h('div', { class: 'ajuda-fullmun', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ajuda-fullmun-titulo' },
    h('h2', { class: 'ajuda-fullmun-titulo', id: 'ajuda-fullmun-titulo' }, T.titulo),
    lista,
    h('div', { class: 'ajuda-fullmun-acoes' }, entendi, depois));
  const fundo = h('div', { class: 'ajuda-fullmun-fundo' }, caixa);
  window.addEventListener('keydown', tecla, true);
  document.body.append(fundo);
  requestAnimationFrame(() => fundo.classList.add('visivel'));
  entendi.focus({ preventScroll: true });
  return () => fechar(false);
}
