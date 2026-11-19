import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { getEstado } from '../core/estado';
import { estadoProgresso, registrarGanchos } from '../core/ganchos';
import { conhecerEmSilencio } from '../core/progresso';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import { interpolar } from '../narrativa/capitulo';
import { tocarMusicaDaCena } from '../narrativa/palco';

/**
 * Intro de Füllmun (entre o prólogo dos deuses e o sonho), em dois blocos na mesma tela:
 *  1. a vila (frases 1 a 4), sobre a ilustração com zoom lento e a playlist de Füllmun a 50%;
 *  2. o herói (frases 5 a 11): a mesma imagem escurece com vinheta, a música baixa para 35% e some na
 *     frase 11; Artho (frase 6) e Nyme (frase 9) aparecem em busto; a frase 7 ganha a linha da origem.
 * Texto centralizado, palavra por palavra; ◆ quando a frase termina; avança sozinho depois de 8 s.
 * Os nomes próprios vêm marcados com **…** nos dados e aparecem em dourado.
 */

const BLOCO_2 = 4; // índice da frase 5
const FRASE_ORIGEM = 6; // frase 7
const BUSTOS: Record<number, string> = { 5: 'artho', 8: 'nyme' };
const AUTO_MS = 8000;
const MS_POR_PALAVRA = 30;
const ENTRADA_MS = 700;
const SAIDA_MS = 400;

/** Palavras em spans (com o destaque dourado nos trechos entre **). */
function palavras(texto: string, inicio = 0): { nos: Node[]; total: number } {
  const nos: Node[] = [];
  let k = inicio;
  texto.split('**').forEach((parte, i) => {
    const destino: Node[] = [];
    for (const pedaco of parte.split(/(\s+)/)) {
      if (!pedaco) continue;
      if (/^\s+$/.test(pedaco)) { destino.push(document.createTextNode(pedaco)); continue; }
      const s = h('span', { class: 'intro-palavra' }, pedaco);
      s.style.animationDelay = `${k * MS_POR_PALAVRA}ms`;
      k++;
      destino.push(s);
    }
    if (i % 2) nos.push(h('strong', { class: 'destaque' }, ...destino));
    else nos.push(...destino);
  });
  return { nos, total: k - inicio };
}

export function telaIntroFullmun(): Tela {
  const T = textos.introFullmun;
  const p = getEstado().personagem;
  const frases = (T.frases as string[]).map((f) => interpolar(f, p));
  const origens = T.origens as Record<string, string>;
  const linhaOrigem = p?.origem && origens[p.origem] ? interpolar(origens[p.origem], p) : '';

  const imagem = src(ASSETS.cena('intro-fullmun'));
  const fundo = h('img', { class: 'intro-fullmun-fundo', src: imagem, alt: '', draggable: 'false' });
  const fundoEscuro = h('img', { class: 'intro-fullmun-fundo intro-fullmun-fundo-escuro', src: imagem, alt: '', draggable: 'false' });
  const frase = h('p', { class: 'intro-fullmun-frase', 'aria-live': 'polite' });
  const toque = h('span', { class: 'intro-fullmun-toque', 'aria-hidden': 'true' }, '◆');
  const busto = h('img', { class: 'intro-fullmun-busto', alt: '', draggable: 'false', hidden: true });
  const pular = botao(T.pular, () => void terminar(), { classe: 'btn-discreto intro-fullmun-pular', som: 'ui-back' });
  const clarao = h('div', { class: 'intro-fullmun-preto' });
  const el = h('div', { class: 'tela-intro-fullmun', role: 'button', tabindex: '0', 'aria-label': T.avancar },
    fundo, fundoEscuro, h('div', { class: 'intro-fullmun-vinheta' }), h('div', { class: 'intro-fullmun-veu' }),
    h('div', { class: 'intro-fullmun-centro' }, busto, h('div', { class: 'intro-fullmun-texto' }, frase, toque)),
    pular, clarao);

  let i = -1;
  let saindo = false;
  let trocando = false;
  let terminou = false;
  let timers: number[] = [];
  const limparTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function mostrarBusto(k: number) {
    const id = BUSTOS[k];
    if (!id) {
      busto.classList.remove('visivel');
      return;
    }
    busto.src = src(ASSETS.retratoNpc(id));
    busto.dataset.npc = id;
    busto.hidden = false;
    requestAnimationFrame(() => busto.classList.add('visivel'));
    // O parágrafo 1 da ficha fica liberado no Compêndio, sem aviso.
    conhecerEmSilencio(id);
  }

  async function mostrar(k: number) {
    trocando = true;
    limparTimers();
    toque.classList.remove('visivel');
    if (i >= 0) {
      frase.classList.remove('visivel');
      frase.classList.add('saindo');
      busto.classList.remove('visivel');
      await esperar(SAIDA_MS);
      if (saindo) return;
    }
    i = k;
    el.dataset.frase = String(k + 1);
    el.classList.toggle('bloco-2', k >= BLOCO_2);
    // Música: 50% no bloco 1, 35% no bloco 2 e silêncio até o sonho na frase 11.
    if (k === BLOCO_2) audio.volumeRelativo(0.35);
    if (k === frases.length - 1) audio.pararMusica(6000);
    const a = palavras(frases[k]);
    const nos = [...a.nos];
    let total = a.total;
    if (k === FRASE_ORIGEM && linhaOrigem) {
      // A linha da origem entra logo depois, sem toque extra.
      const b = palavras(linhaOrigem, total + 4);
      nos.push(document.createTextNode(' '), h('span', { class: 'intro-fullmun-origem' }, ...b.nos));
      total += 4 + b.total;
    }
    frase.replaceChildren(...nos);
    frase.classList.remove('saindo', 'completa');
    void frase.offsetWidth;
    frase.classList.add('visivel');
    mostrarBusto(k);
    terminou = false;
    timers.push(window.setTimeout(() => completar(), ENTRADA_MS + total * MS_POR_PALAVRA));
    trocando = false;
  }

  /** A frase aparece inteira (toque no meio da animação) e o ◆ pulsa; 8 s depois, avança sozinha. */
  function completar() {
    if (terminou || saindo) return;
    terminou = true;
    frase.classList.add('completa');
    toque.classList.add('visivel');
    limparTimers();
    timers.push(window.setTimeout(() => void avancar(true), AUTO_MS));
  }

  async function avancar(forcar = false) {
    if (saindo || trocando) return;
    if (!terminou && !forcar) return completar();
    if (i + 1 < frases.length) return mostrar(i + 1);
    return terminar();
  }

  async function terminar() {
    if (saindo) return;
    saindo = true;
    limparTimers();
    // Fade lento para o branco e o sonho.
    clarao.classList.add('visivel');
    audio.pararMusica(1600);
    await esperar(2200);
    audio.volumeRelativo(1);
    void irPara('sonho', undefined, { som: false, duracao: 0 });
  }

  el.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button')) void avancar(); });
  const tecla = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void avancar(); }
    else if (e.key === 'Escape') void terminar();
  };

  registrarGanchos({
    avancar: () => void avancar(true),
    state: () => ({
      ...estadoProgresso(),
      tela: 'introFullmun',
      frase: i + 1,
      total: frases.length,
      texto: frase.textContent,
      musica: audio.estadoMusica(),
      destaques: [...frase.querySelectorAll('.destaque')].map((d) => d.textContent),
      busto: busto.classList.contains('visivel') ? busto.dataset.npc ?? null : null,
      bloco: i >= BLOCO_2 ? 2 : 1,
      completa: terminou,
      compendio: [...getEstado().campanha.compendio.conhecidos],
    }),
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
      saindo = true;
      limparTimers();
      window.removeEventListener('keydown', tecla);
      audio.volumeRelativo(1);
    },
  };
}
