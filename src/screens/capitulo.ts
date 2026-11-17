import AMEACAS from '../data/ameacas.json';
import NPCS from '../data/npcs.json';
import { ASSETS, SFX_CAPITULO, src } from '../core/assets';
import { audio } from '../core/audio';
import { forcarD20, rolarD20 } from '../core/dados';
import { atualizarCampanha, getEstado, marcarFlag, tremoresLigados } from '../core/estado';
import { PERICIAS, bonusPericia, pvAntesDaForjaDe } from '../core/pericias';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { abrirModal, botao, esperar, h } from '../core/ui';
import {
  CAPITULOS, atende, cenaPorId, interpolar, resumoDoCapitulo, type Capitulo, type Cena, type Efeitos, type Escolha, type Fala, type Seguir,
} from '../narrativa/capitulo';
import { mostrarRolagem } from '../narrativa/rolagem';
import { abrirOpcoes } from './opcoes';

/**
 * Tela de cena narrativa: fundo ilustrado, falas com efeito de digitação (um toque completa, outro
 * avança), busto do NPC ao lado da caixa, escolhas em botões grandes, testes de perícia com o d20
 * e menu de pausa (Continuar, Diário, Opções, Voltar ao menu).
 */

const T = textos.cenas;
const NOMES_NPC = NPCS as Record<string, { nome: string }>;
const DADOS_AMEACAS = AMEACAS as Record<string, { nome: string; tipo: string; selo: string; imagem: string }>;
const PLAYLIST_FULLMUN = ['fullmun-01', 'fullmun-02'];
const parametros = () => new URLSearchParams(location.search);

/** Música de uma cena: "fullmun" é a playlist da vila; null é silêncio. */
export function tocarMusicaDaCena(musica: string | null | undefined, fadeMs = 1500): void {
  if (musica === undefined) return;
  if (musica === null) return audio.pararMusica(fadeMs);
  if (musica === 'fullmun') return audio.tocarPlaylist(PLAYLIST_FULLMUN.map(ASSETS.musica), fadeMs);
  audio.tocarMusica(ASSETS.musica(musica), fadeMs);
}

/** Aplica efeitos de escolha/fala/cena no save. */
export function aplicarEfeitos(e: Efeitos | undefined): void {
  if (!e) return;
  const c = getEstado().campanha;
  const p = getEstado().personagem;
  if (e.flag) marcarFlag(e.flag);
  if (e.bonusProximoTeste) atualizarCampanha({ bonusProximoTeste: c.bonusProximoTeste + e.bonusProximoTeste });
  const max = p ? pvAntesDaForjaDe(p) : 10;
  if (e.pvDefinir !== undefined) atualizarCampanha({ pvAtual: e.pvDefinir });
  if (e.pv) atualizarCampanha({ pvAtual: Math.max(0, Math.min(max, (c.pvAtual ?? max) + e.pv)) });
}

export interface ParamsCapitulo {
  /** Volta de uma batalha: vai para esta cena. */
  cena?: string;
}

export function telaCapitulo(params?: unknown): Tela {
  const prm = (params ?? {}) as ParamsCapitulo;
  const estado = getEstado();
  const p = estado.personagem;
  const cap: Capitulo = CAPITULOS[estado.campanha.capitulo] ?? CAPITULOS[1];

  const fundoA = h('img', { class: 'cena-fundo visivel', alt: '', draggable: 'false' });
  const fundoB = h('img', { class: 'cena-fundo', alt: '', draggable: 'false' });
  const busto = h('img', { class: 'cena-busto', alt: '', draggable: 'false', hidden: true });
  const nome = h('p', { class: 'cena-nome', hidden: true });
  const texto = h('p', { class: 'cena-texto' });
  const seta = h('span', { class: 'cena-seta', 'aria-hidden': 'true' }, '▾');
  const caixa = h('div', { class: 'cena-caixa', role: 'button', tabindex: '0', 'aria-label': T.avancar }, nome, texto, seta);
  const escolhas = h('div', { class: 'cena-escolhas', role: 'group', 'aria-label': T.escolhas });
  const painel = h('div', { class: 'cena-painel' }, busto, caixa, escolhas);
  const ameaca = h('aside', { class: 'cena-ameaca', hidden: true, 'aria-live': 'polite' });
  const cartao = h('div', { class: 'cena-cartao-titulo', hidden: true },
    h('p', { class: 'cartao-capitulo' }, `${T.capitulo} ${String(cap.numero).padStart(2, '0')}`),
    h('h1', { class: 'cartao-titulo' }, cap.titulo));
  const btnPausa = h('button', { type: 'button', class: 'btn-pausa cena-btn-pausa', 'aria-label': T.pausa }, h('span', { 'aria-hidden': 'true' }, 'II'));
  const el = h('div', { class: 'tela-capitulo' }, fundoA, fundoB, h('div', { class: 'cena-veu' }), ameaca, painel, btnPausa, cartao);

  let saiu = false;
  let cena: Cena | null = null;
  let fundoAtual = '';
  let digitando = false;
  let completar: (() => void) | null = null;
  let avancar: (() => void) | null = null;
  let menuPausa: (() => void) | null = null;
  let timerFala = 0;
  /** Corta a fala em andamento (troca de cena): a digitação antiga não pode mais responder aos toques. */
  function pararFala() {
    window.clearInterval(timerFala);
    digitando = false;
    completar = null;
    avancar = null;
  }
  let ocupado = false;
  const caminhoAtual = { indiceFala: 0 };

  /* ----------------------------- fundo ----------------------------- */

  function trocarFundo(id: string, lento = false) {
    if (id === fundoAtual) return;
    const primeira = !fundoAtual;
    fundoAtual = id;
    const [visivel, outro] = fundoA.classList.contains('visivel') ? [fundoA, fundoB] : [fundoB, fundoA];
    outro.src = src(ASSETS.cena(id));
    outro.dataset.cena = id;
    outro.classList.toggle('lento', lento);
    if (primeira) { visivel.src = outro.src; visivel.dataset.cena = id; return; }
    outro.classList.add('visivel');
    visivel.classList.remove('visivel');
  }

  /* ----------------------------- falas ----------------------------- */

  function quemFala(f: Fala): { nome: string | null; retrato: string | null; classe: string } {
    if (!f.quem) return { nome: null, retrato: null, classe: 'narracao' };
    if (f.quem === 'pensamento') return { nome: null, retrato: null, classe: 'pensamento' };
    if (f.quem === 'heroi') return { nome: p?.nome ?? '', retrato: p ? ASSETS.retrato(p.raca, p.genero, 'comum') : null, classe: 'heroi' };
    return { nome: NOMES_NPC[f.quem]?.nome ?? f.quem, retrato: ASSETS.retratoNpc(f.quem), classe: 'npc' };
  }

  /** Mostra uma fala com efeito de digitação. Um toque completa; outro avança. */
  function mostrarFala(f: Fala): Promise<void> {
    const q = quemFala(f);
    caixa.className = `cena-caixa ${q.classe}`;
    nome.hidden = !q.nome;
    nome.textContent = q.nome ?? '';
    if (q.retrato) {
      busto.src = src(q.retrato);
      busto.dataset.retrato = q.retrato;
      busto.alt = q.nome ?? '';
      busto.hidden = false;
      painel.classList.add('com-busto');
    } else {
      busto.hidden = true;
      busto.removeAttribute('data-retrato');
      painel.classList.remove('com-busto');
    }
    const cheio = interpolar(f.texto);
    texto.textContent = '';
    caixa.dataset.quem = f.quem ?? 'narracao';
    return new Promise((ok) => {
      digitando = true;
      caixa.classList.remove('completa');
      let i = 0;
      window.clearInterval(timerFala);
      const timer = window.setInterval(() => {
        i++;
        texto.textContent = cheio.slice(0, i);
        if (i % 3 === 0 && cheio[i - 1] !== ' ') audio.sfx('text-blip', { ganho: 0.5 });
        if (i >= cheio.length) terminar();
      }, 22);
      timerFala = timer;
      const terminar = () => {
        window.clearInterval(timer);
        texto.textContent = cheio;
        digitando = false;
        caixa.classList.add('completa');
        completar = null;
        avancar = () => { avancar = null; ok(); };
      };
      completar = terminar;
    });
  }

  function tocarCaixa() {
    if (ocupado && !digitando && !avancar) return;
    if (digitando && completar) completar();
    else if (avancar) { audio.sfx('ui-click', { ganho: 0.4 }); avancar(); }
  }
  caixa.addEventListener('click', tocarCaixa);
  const teclado = (e: KeyboardEvent) => {
    if (menuPausa || document.querySelector('.modal-fundo, .rolagem-fundo')) return;
    if (e.key === 'Escape') { e.preventDefault(); return abrirPausa(); }
    if ((e.key === ' ' || e.key === 'Enter') && (digitando || avancar) && !(document.activeElement instanceof HTMLButtonElement)) {
      e.preventDefault();
      tocarCaixa();
    }
  };
  window.addEventListener('keydown', teclado);

  function mostrarAmeaca(id: string) {
    const a = DADOS_AMEACAS[id];
    if (!a) return;
    ameaca.replaceChildren(
      h('img', { src: src(ASSETS.ameaca(a.imagem)), 'data-ameaca': a.imagem, alt: a.nome, draggable: 'false' }),
      h('div', { class: 'ameaca-legenda' },
        h('span', { class: 'ameaca-selo' }, a.selo),
        h('p', { class: 'ameaca-nome' }, `${a.nome.toUpperCase()} · ${a.tipo}`)));
    ameaca.hidden = false;
    requestAnimationFrame(() => ameaca.classList.add('entrou'));
  }

  /* ----------------------------- escolhas ----------------------------- */

  const chaveEscolha = (c: Cena, i: number) => `${c.id}#${i}`;

  function escolhasVisiveis(c: Cena): { e: Escolha; i: number }[] {
    const usadas = getEstado().campanha.usadas;
    return (c.escolhas ?? []).map((e, i) => ({ e, i })).filter(({ e, i }) => atende(e.requer) && !(e.uma_vez && usadas.includes(chaveEscolha(c, i))));
  }

  function seloTeste(e: Escolha): string | null {
    if (!e.teste || !p) return null;
    const b = bonusPericia(p, e.teste.pericia, getEstado().campanha.bonusProximoTeste);
    const sinal = b.total < 0 ? `−${Math.abs(b.total)}` : `+${b.total}`;
    return `${e.rotulo ? `${e.rotulo} · ` : ''}${PERICIAS[e.teste.pericia].nome} CD ${e.teste.cd} · ${T.seuBonus} ${sinal}`;
  }

  function mostrarEscolhas(c: Cena) {
    const lista = escolhasVisiveis(c);
    escolhas.replaceChildren(...lista.map(({ e, i }) => {
      const selo = seloTeste(e);
      const b = botao('', () => void escolher(c, e, i), { classe: 'cena-escolha', som: 'ui-confirm' });
      const partes: Node[] = [];
      if (e.rotulo && !selo) partes.push(h('span', { class: 'escolha-rotulo' }, e.rotulo));
      if (selo) partes.push(h('span', { class: 'escolha-selo' }, selo));
      partes.push(h('span', { class: 'escolha-texto' }, interpolar(e.texto)));
      b.replaceChildren(...partes);
      b.dataset.escolha = String(i);
      if (e.batalha) b.dataset.batalha = e.batalha;
      return b;
    }));
    painel.classList.add('com-escolhas');
    el.classList.add('com-escolhas');
    escolhas.classList.add('visivel');
    (escolhas.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    requestAnimationFrame(() => escolhas.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  }

  function mostrarSeguir(s: Seguir) {
    const b = botao(s.texto ?? T.continuar, () => void seguir(s), { classe: 'cena-escolha cena-seguir', som: 'ui-confirm' });
    escolhas.replaceChildren(b);
    painel.classList.add('com-escolhas');
    escolhas.classList.add('visivel');
    b.focus({ preventScroll: true });
  }

  function limparEscolhas() {
    escolhas.replaceChildren();
    escolhas.classList.remove('visivel');
    painel.classList.remove('com-escolhas');
    el.classList.remove('com-escolhas');
  }

  function registrarCaminho(passo: { cena: string; escolha?: string; resultado?: string }) {
    atualizarCampanha({ caminho: [...getEstado().campanha.caminho, passo] });
  }

  async function escolher(c: Cena, e: Escolha, i: number) {
    if (ocupado) return;
    ocupado = true;
    limparEscolhas();
    if (e.uma_vez) atualizarCampanha({ usadas: [...getEstado().campanha.usadas, chaveEscolha(c, i)] });
    aplicarEfeitos(e.efeitos);
    if (e.teste && p) {
      const bonus = bonusPericia(p, e.teste.pericia, getEstado().campanha.bonusProximoTeste);
      atualizarCampanha({ bonusProximoTeste: 0 });
      const r = await mostrarRolagem(el, { titulo: PERICIAS[e.teste.pericia].nome, d20: rolarD20(), partes: bonus.partes, alvo: e.teste.cd });
      registrarCaminho({ cena: c.id, escolha: e.texto, resultado: r.sucesso ? 'sucesso' : 'falha' });
      ocupado = false;
      return void entrar(r.sucesso ? e.sucesso! : e.falha!, 'falas');
    }
    registrarCaminho({ cena: c.id, escolha: e.texto });
    ocupado = false;
    if (e.batalha) return void irParaBatalha(e.batalha, e.vitoria!, e.derrota!);
    if (e.vai_para) return void entrar(e.vai_para, 'falas');
  }

  async function seguir(s: Seguir) {
    limparEscolhas();
    if (s.batalha) return void irParaBatalha(s.batalha, s.vitoria!, s.derrota!);
    if (s.fim) return void terminarCapitulo();
    if (s.vai_para) return void entrar(s.vai_para, 'falas');
  }

  function irParaBatalha(inimigo: string, vitoria: string, derrota: string) {
    marcarFlag('lutou');
    atualizarCampanha({ cenaAntesDaBatalha: cena?.id ?? null });
    void irPara('batalha', { inimigo, vitoria, derrota });
  }

  function terminarCapitulo() {
    void irPara('fimCapitulo', undefined, { duracao: 900 });
  }

  /* ----------------------------- cenas ----------------------------- */

  async function entrar(id: string, modo: 'falas' | 'escolhas') {
    if (saiu) return;
    const c = cenaPorId(cap, id);
    pararFala();
    cena = c;
    atualizarCampanha({ cena: c.id, modo });
    ameaca.hidden = true;
    ameaca.classList.remove('entrou');
    limparEscolhas();
    trocarFundo(c.fundo);
    el.dataset.cena = c.id;
    if (modo === 'falas') {
      aplicarEfeitos(c.aoEntrar);
      if (c.aoEntrar?.som) audio.sfx(c.aoEntrar.som as never);
      if (c.aoEntrar?.tremor) tremer();
      if (c.vinheta) {
        audio.tocarVinheta(ASSETS.musica(c.vinheta), () => !saiu && cena === c && tocarMusicaDaCena(c.musica, 1500));
      } else if (c.silencioAntes) {
        audio.pararMusica(400);
        window.setTimeout(() => !saiu && tocarMusicaDaCena(c.musica, 1500), c.silencioAntes);
      } else {
        tocarMusicaDaCena(c.musica, c.fadeMusica ?? 1500);
      }
      for (caminhoAtual.indiceFala = 0; caminhoAtual.indiceFala < c.falas.length; caminhoAtual.indiceFala++) {
        const f = c.falas[caminhoAtual.indiceFala];
        if (!atende(f.requer)) continue;
        aplicarEfeitos(f.efeitos);
        if (f.fundo) trocarFundo(f.fundo, true);
        if (f.ameaca) mostrarAmeaca(f.ameaca);
        await mostrarFala(f);
        if (saiu || cena !== c) return;
      }
    } else {
      tocarMusicaDaCena(c.musica, 1500);
      // Retomando nas escolhas: a caixa mostra a última fala da cena, já completa.
      const ultima = [...c.falas].reverse().find((f) => atende(f.requer));
      if (ultima) { texto.textContent = interpolar(ultima.texto); caixa.classList.add('completa'); }
    }
    if (c.retorna) return entrar(c.retorna, 'escolhas');
    if (c.escolhas?.length) return mostrarEscolhas(c);
    if (c.seguir) return mostrarSeguir(c.seguir);
  }

  function tremer() {
    if (!tremoresLigados()) return;
    el.classList.remove('tremendo');
    void el.offsetWidth;
    el.classList.add('tremendo');
  }

  async function cartaoDeTitulo() {
    cartao.hidden = false;
    requestAnimationFrame(() => cartao.classList.add('visivel'));
    await esperar(3000);
    cartao.classList.remove('visivel');
    await esperar(700);
    cartao.hidden = true;
  }

  /* ----------------------------- pausa e diário ----------------------------- */

  function abrirDiario() {
    const vozes = textos.sonho.vozes as Record<string, { titulo: string; mensagem: string }>;
    const ouvidas = getEstado().sonho.ouvidas;
    const resumo = resumoDoCapitulo(cap);
    const corpo = h('div', { class: 'diario' },
      h('h3', {}, T.diario.vozes),
      ouvidas.length
        ? h('ul', { class: 'diario-vozes' }, ...ouvidas.map((id) => h('li', {}, h('strong', {}, vozes[id]?.titulo ?? id), h('span', {}, vozes[id]?.mensagem ?? ''))))
        : h('p', { class: 'diario-vazio' }, T.diario.semVozes),
      h('h3', {}, `${T.capitulo} ${String(cap.numero).padStart(2, '0')} · ${cap.titulo}`),
      resumo.length ? h('ul', { class: 'diario-resumo' }, ...resumo.map((l) => h('li', {}, l))) : h('p', { class: 'diario-vazio' }, T.diario.semResumo),
    );
    abrirModal(T.diario.titulo, corpo, T.fechar);
  }

  function abrirPausa() {
    if (menuPausa) return;
    audio.sfx('ui-click');
    const fechar = () => { menuPausa = null; fecharModal(); };
    const corpo = h('div', { class: 'pausa-botoes' },
      botao(T.continuar, () => fechar(), { classe: 'btn-principal' }),
      botao(T.diario.titulo, () => abrirDiario()),
      botao(textos.sonho.opcoes, () => abrirOpcoes()),
      botao(textos.sonho.voltarMenu, () => { fechar(); void irPara('menu'); }, { som: 'ui-back' }),
    );
    const fecharModal = abrirModal(T.pausa, corpo, T.fechar, () => { menuPausa = null; });
    menuPausa = fechar;
  }
  btnPausa.addEventListener('click', (e) => { e.stopPropagation(); abrirPausa(); });

  /* ----------------------------- testes ----------------------------- */

  function ganchosDeTeste() {
    if (!parametros().has('test')) return;
    (window as unknown as { __fdg: unknown }).__fdg = {
      forceRoll: (valores: number[]) => forcarD20(valores),
      goto: (id: string) => void entrar(id, 'falas'),
      /** Um toque: completa a fala que está sendo digitada ou, se já está completa, avança. */
      avancar: () => { if (digitando && completar) completar(); else if (avancar) avancar(); },
      pularFaixa: () => audio.pularParaOFim(),
      state: () => {
        const c = getEstado().campanha;
        return {
          tela: 'capitulo',
          capitulo: c.capitulo,
          cena: cena?.id ?? null,
          modo: c.modo,
          flags: [...c.flags],
          pv: c.pvAtual,
          pvMax: p ? pvAntesDaForjaDe(p) : null,
          bonusProximoTeste: c.bonusProximoTeste,
          caminho: c.caminho,
          digitando,
          escolhas: [...escolhas.querySelectorAll('.cena-escolha')].map((b) => b.querySelector('.escolha-texto')?.textContent ?? b.textContent),
          fundo: fundoAtual,
          musica: audio.estadoMusica(),
        };
      },
    };
  }

  return {
    el,
    aoEntrar() {
      void audio.carregarEfeitos(SFX_CAPITULO);
      ganchosDeTeste();
      void (async () => {
        const c = getEstado().campanha;
        if (prm.cena) return entrar(prm.cena, 'falas');
        if (!c.cena) {
          if (p && c.pvAtual === null) atualizarCampanha({ pvAtual: pvAntesDaForjaDe(p) });
          tocarMusicaDaCena(cenaPorId(cap, cap.inicio).musica, 2500);
          await cartaoDeTitulo();
          if (saiu) return;
          return entrar(cap.inicio, 'falas');
        }
        return entrar(c.cena, c.modo);
      })();
    },
    aoSair() {
      saiu = true;
      pararFala();
      window.removeEventListener('keydown', teclado);
      document.querySelectorAll('.modal-fundo').forEach((m) => m.remove());
    },
  };
}
