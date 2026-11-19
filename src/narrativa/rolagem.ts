import { dica } from '../core/tutorial';
import { audio } from '../core/audio';
import { comSinal } from '../core/dados';
import type { ParteBonus } from '../core/pericias';
import { textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';

/**
 * O d20 na tela: gira por ~1 s (som de dado), para no resultado, mostra a conta
 * ("14 + CAR 2 + origem 2 = 18 · CD 12 · SUCESSO") em dourado no sucesso e vermelho escuro na falha;
 * o 20 natural mostra "CRÍTICO!". O jogador toca para seguir.
 */
export interface OpcoesRolagem {
  /** Ex.: "Intimidação". */
  titulo: string;
  d20: number;
  partes: ParteBonus[];
  /** Dificuldade (CD) ou Defesa. */
  alvo: number;
  rotuloAlvo?: string;
  /** Espera o toque do jogador (padrão: sim). Na batalha, segue sozinho depois de um tempo. */
  esperarToque?: boolean;
  /** Duração do giro (ms). */
  giroMs?: number;
}

export interface ResultadoRolagem {
  total: number;
  sucesso: boolean;
  critico: boolean;
  conta: string;
}

const T = () => textos.cenas.rolagem;

/** A conta por extenso: "14 + CAR 2 + origem 2 = 18". */
export function contaDaRolagem(d20: number, partes: ParteBonus[]): { total: number; conta: string } {
  const total = d20 + partes.reduce((s, p) => s + p.valor, 0);
  const termos = partes.map((p) => `${p.valor < 0 ? '−' : '+'} ${p.rotulo} ${Math.abs(p.valor)}`);
  return { total, conta: [String(d20), ...termos].join(' ') + ` = ${total}` };
}

/** Avalia sem mostrar (o 20 natural sempre passa e é crítico). */
export function avaliar(d20: number, partes: ParteBonus[], alvo: number): ResultadoRolagem {
  const { total, conta } = contaDaRolagem(d20, partes);
  const critico = d20 === 20;
  return { total, conta, critico, sucesso: critico || total >= alvo };
}

/** Desenho do d20 (hexágono com faces) com o número no meio. */
function dado(): { el: HTMLElement; numero: HTMLElement } {
  const numero = h('span', { class: 'd20-numero' }, '20');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <polygon points="50,3 93,27 93,73 50,97 7,73 7,27" class="d20-borda"/>
    <polygon points="50,20 80,70 20,70" class="d20-face"/>
    <path d="M50,3 L50,20 M93,27 L80,70 M93,73 L80,70 M50,97 L50,70 M50,97 L20,70 M7,73 L20,70 M7,27 L20,70 M93,27 L50,20 M7,27 L50,20 M50,70 L80,70" class="d20-arestas"/>`;
  return { el: h('div', { class: 'd20' }, svg as unknown as Node, numero), numero };
}

export async function mostrarRolagem(raiz: HTMLElement, o: OpcoesRolagem): Promise<ResultadoRolagem> {
  // Tutorial: o primeiro teste explica o d20 + bônus contra a CD (antes de rolar).
  await dica('teste');
  const r = avaliar(o.d20, o.partes, o.alvo);
  const { el: d20, numero } = dado();
  const conta = h('p', { class: 'rolagem-conta' });
  const veredito = h('p', { class: 'rolagem-veredito' });
  const critico = h('p', { class: 'rolagem-critico', hidden: true }, T().critico);
  const caixa = h('div', { class: 'rolagem', role: 'dialog', 'aria-label': o.titulo, 'aria-live': 'polite' },
    h('p', { class: 'rolagem-titulo' }, o.titulo), d20, critico, conta, veredito);
  const fundo = h('div', { class: 'rolagem-fundo' }, caixa);
  raiz.append(fundo);
  requestAnimationFrame(() => fundo.classList.add('visivel'));

  // Giro: números trocando cada vez mais devagar.
  audio.sfx('dice-roll');
  d20.classList.add('girando');
  const giro = o.giroMs ?? 1000;
  const inicio = performance.now();
  let espera = 40;
  while (performance.now() - inicio < giro) {
    numero.textContent = String(1 + Math.floor(Math.random() * 20));
    await esperar(espera);
    espera = Math.min(160, espera * 1.12);
  }
  d20.classList.remove('girando');
  numero.textContent = String(o.d20);
  d20.classList.add(r.sucesso ? 'sucesso' : 'falha');
  if (r.critico) {
    critico.hidden = false;
    d20.classList.add('critico');
  }
  conta.textContent = `${r.conta} · ${o.rotuloAlvo ?? 'CD'} ${o.alvo}`;
  veredito.textContent = r.sucesso ? T().sucesso : T().falha;
  caixa.classList.add(r.sucesso ? 'sucesso' : 'falha', 'resolvida');
  (caixa as HTMLElement).dataset.resultado = r.sucesso ? 'sucesso' : 'falha';

  if (o.esperarToque !== false) {
    await new Promise<void>((ok) => {
      const seguir = botao(T().seguir, () => ok(), { classe: 'btn-principal rolagem-seguir' });
      caixa.append(seguir);
      seguir.focus({ preventScroll: true });
      fundo.addEventListener('click', (e) => { if (e.target === fundo) ok(); });
    });
  } else {
    await esperar(1300);
  }
  fundo.classList.remove('visivel');
  await esperar(200);
  fundo.remove();
  return r;
}

export { comSinal };
