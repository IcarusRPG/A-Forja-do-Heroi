import DICAS from '../data/tutorial.json';
import { audio } from './audio';
import { atualizarConfig, getEstado } from './estado';
import { textos } from './textos';
import { h } from './ui';

/**
 * Tutorial opcional (Fase 4D): dicas curtas, uma vez cada, na primeira vez em que a situação acontece.
 *
 * - Ligado/desligado em `fdg.opcoes.tutorial` (perguntado no primeiro "Novo jogo"; Opções muda).
 * - As dicas já vistas ficam em `fdg.opcoes.dicasVistas` e valem para todas as aventuras.
 * - Nunca duas ao mesmo tempo: entram numa fila. Enquanto uma está aberta, a tela que registrou um
 *   "pausador" (mapa, sonho) fica parada; as outras esperam a promessa de `dica()`.
 * - Os textos ficam em src/data/tutorial.json (id, gatilho, texto, alvo na tela).
 */

interface Dica { id: string; gatilho: string; texto: string; alvo?: string; suprimida?: boolean }
const LISTA = DICAS as Dica[];
const T = () => textos.tutorial;

export const tutorialLigado = (): boolean => getEstado().config.tutorial === true;
/** A pergunta inicial já foi respondida (em qualquer aventura). */
export const tutorialRespondido = (): boolean => typeof getEstado().config.tutorial === 'boolean';
const vistas = (): string[] => getEstado().config.dicasVistas ?? [];
export const dicaVista = (id: string): boolean => vistas().includes(id);

export function definirTutorial(sim: boolean): void {
  atualizarConfig({ tutorial: sim });
  if (!sim) esvaziarFila();
}

/** "Rever todas as dicas": esquece as já vistas. */
export function zerarDicas(): void {
  atualizarConfig({ dicasVistas: [] });
}

type Pausador = (sim: boolean) => void;
let pausador: Pausador | null = null;
/** A tela atual diz como pausar o jogo enquanto a dica está aberta. Devolve a função para desfazer. */
export function definirPausador(p: Pausador): () => void {
  pausador = p;
  return () => { if (pausador === p) pausador = null; };
}

const fila: { d: Dica; ok: () => void }[] = [];
let aberta: { d: Dica; ok: () => void; el: HTMLElement; fechar: () => void } | null = null;

export const dicaAberta = (): string | null => aberta?.d.id ?? null;

/**
 * Mostra a dica `id` se o tutorial estiver ligado e ela ainda não tiver sido vista. A promessa resolve
 * quando ela fecha (ou na hora, se não for mostrada). Pode ser chamada à vontade: só aparece uma vez.
 */
export function dica(id: string): Promise<void> {
  const d = LISTA.find((x) => x.id === id);
  if (!d || d.suprimida || !tutorialLigado() || dicaVista(id)) return Promise.resolve();
  if (aberta?.d.id === id || fila.some((f) => f.d.id === id)) return new Promise((ok) => fila.push({ d, ok }));
  return new Promise((ok) => {
    fila.push({ d, ok });
    if (aberta) return;
    // A anterior ainda está saindo: espera ela sumir (nunca dois balões na tela).
    const falta = saindoAte - Date.now();
    if (falta > 0) agendar(falta + 40);
    else proxima();
  });
}

let agendada = false;
let saindoAte = 0;
function agendar(ms: number) {
  if (agendada) return;
  agendada = true;
  setTimeout(() => { agendada = false; proxima(); }, ms);
}

function esvaziarFila() {
  while (fila.length) fila.shift()!.ok();
  aberta?.fechar();
}

function proxima() {
  if (aberta) return;
  const item = fila.shift();
  if (!item) return;
  if (!tutorialLigado() || dicaVista(item.d.id)) { item.ok(); return proxima(); }
  atualizarConfig({ dicasVistas: [...vistas(), item.d.id] });
  mostrar(item.d, item.ok);
}

/** Texto com **destaque** em dourado. */
export function comDestaques(texto: string): Node[] {
  return texto.split('**').map((parte, i) => (i % 2 ? h('strong', { class: 'destaque' }, parte) : document.createTextNode(parte)));
}

const PERGAMINHO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 5h15a3 3 0 0 1 3 3v2h-4v15a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-2h4V8a3 3 0 0 1 3-3" fill="#f3e3bf" stroke="#8a6a2a" stroke-width="1.6"/><path d="M12 12h7M12 16h7M12 20h5" stroke="#8a6a2a" stroke-width="1.6" stroke-linecap="round"/></svg>';

function mostrar(d: Dica, ok: () => void) {
  pausador?.(true);
  const icone = h('span', { class: 'dica-icone' });
  icone.innerHTML = PERGAMINHO;
  const entendi = h('button', { type: 'button', class: 'btn btn-principal dica-ok' }, T().entendi);
  const pular = h('button', { type: 'button', class: 'dica-pular-todas' }, T().pularTodas);
  const seta = h('span', { class: 'dica-seta', 'aria-hidden': 'true', hidden: true });
  const balao = h('div', { class: 'dica-balao', role: 'dialog', 'aria-label': T().rotulo, 'aria-live': 'polite' },
    seta, h('div', { class: 'dica-corpo' }, icone, h('p', { class: 'dica-texto' }, ...comDestaques(d.texto))),
    h('div', { class: 'dica-botoes' }, entendi, pular));
  const el = h('div', { class: 'dica-tutorial', 'data-dica': d.id }, balao);
  document.body.append(el);

  const posicionar = () => posicionarBalao(balao, seta, d.alvo);
  posicionar();
  window.addEventListener('resize', posicionar);

  // Espaço, Enter e Esc ficam com a dica (não avançam a conversa nem andam no mapa por baixo).
  const tecla = (e: KeyboardEvent) => {
    if (['Enter', ' ', 'Escape'].includes(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === 'keydown' && !e.repeat) fechar();
    } else if (/^(Arrow|Key[WASDE])/.test(e.code)) e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', tecla, true);
  window.addEventListener('keyup', tecla, true);

  let fechada = false;
  function fechar() {
    if (fechada) return;
    fechada = true;
    window.removeEventListener('resize', posicionar);
    window.removeEventListener('keydown', tecla, true);
    window.removeEventListener('keyup', tecla, true);
    el.classList.add('saindo');
    setTimeout(() => el.remove(), 180);
    aberta = null;
    saindoAte = Date.now() + 180;
    pausador?.(false);
    ok();
    if (fila.length) agendar(220);
  }
  entendi.addEventListener('click', () => { audio.sfx('ui-click'); fechar(); });
  pular.addEventListener('click', () => { audio.sfx('ui-back'); definirTutorial(false); fechar(); });
  aberta = { d, ok, el, fechar };
  audio.sfx('compendio');
  requestAnimationFrame(() => el.classList.add('visivel'));
  entendi.focus({ preventScroll: true });
}

/** Põe o balão perto do alvo (acima ou abaixo), com a seta apontando para ele; sem alvo, no centro. */
function posicionarBalao(balao: HTMLElement, seta: HTMLElement, seletor?: string) {
  const alvo = seletor ? [...document.querySelectorAll<HTMLElement>(seletor)].find((e) => e.getClientRects().length > 0 && !e.closest('.dica-tutorial')) : undefined;
  balao.style.left = balao.style.top = balao.style.bottom = '';
  balao.classList.remove('com-alvo', 'acima', 'abaixo');
  seta.hidden = true;
  if (!alvo) return;
  const r = alvo.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const largura = balao.offsetWidth || Math.min(360, vw - 24);
  const cx = r.left + r.width / 2;
  const esquerda = Math.min(Math.max(12, cx - largura / 2), vw - largura - 12);
  const acima = r.top + r.height / 2 > vh / 2;
  balao.classList.add('com-alvo', acima ? 'acima' : 'abaixo');
  balao.style.left = `${esquerda}px`;
  if (acima) balao.style.bottom = `${Math.max(8, vh - r.top + 14)}px`;
  else balao.style.top = `${Math.min(vh - 120, r.bottom + 14)}px`;
  seta.hidden = false;
  seta.style.left = `${Math.min(Math.max(16, cx - esquerda), largura - 16)}px`;
}

/** Para os testes: a dica aberta e as já vistas. */
export const estadoTutorial = () => ({ ligado: getEstado().config.tutorial ?? null, aberta: dicaAberta(), fila: fila.map((f) => f.d.id), vistas: vistas() });
