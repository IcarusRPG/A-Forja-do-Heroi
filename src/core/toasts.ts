import { audio } from './audio';
import type { NomeSfx } from './assets';
import { h } from './ui';

/**
 * Avisos curtos no topo da tela ("Kobanu ♥ +2", "Compêndio atualizado: Kobanu"). Entram numa fila:
 * um de cada vez, nunca sobrepostos, sem capturar toques (não cobrem botões).
 */
interface Aviso { texto: string; classe: string; som?: NomeSfx }

const fila: Aviso[] = [];
let mostrando = false;
const historico: string[] = [];

function raiz(): HTMLElement {
  let el = document.querySelector<HTMLElement>('.toasts');
  if (!el) {
    el = h('div', { class: 'toasts', 'aria-live': 'polite', role: 'status' });
    document.body.append(el);
  }
  return el;
}

export function avisar(texto: string, classe = '', som?: NomeSfx): void {
  fila.push({ texto, classe, som });
  historico.push(texto);
  if (historico.length > 60) historico.shift();
  if (!mostrando) void proximo();
}

/** Para testes: os últimos avisos, em ordem. */
export const avisosRecentes = (): string[] => [...historico];

async function proximo(): Promise<void> {
  const a = fila.shift();
  if (!a) { mostrando = false; return; }
  mostrando = true;
  const el = h('div', { class: `toast ${a.classe}`.trim() }, a.texto);
  raiz().append(el);
  if (a.som) audio.sfx(a.som, { ganho: 0.7 });
  requestAnimationFrame(() => el.classList.add('visivel'));
  await new Promise((r) => setTimeout(r, 1700));
  el.classList.remove('visivel');
  await new Promise((r) => setTimeout(r, 260));
  el.remove();
  void proximo();
}
