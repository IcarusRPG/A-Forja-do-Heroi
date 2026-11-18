import AMEACAS from '../data/ameacas.json';
import NPCS from '../data/npcs.json';
import { ASSETS, existeAsset, src, type NomeSfx } from '../core/assets';
import { audio } from '../core/audio';
import { rolarD20 } from '../core/dados';
import { atualizarCampanha, getEstado, marcarFlag, tremoresLigados } from '../core/estado';
import { PERICIAS, bonusPericia } from '../core/pericias';
import {
  conhecer, darItem, definirMissao, encontrarCriatura, mudarRelacao, pvMaxAtual, somarAtraso, somarContador, somarReais, verificarCompendio,
} from '../core/progresso';
import { textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import { atende, cenaGlobal, interpolar, type Cena, type Efeitos, type Escolha, type Fala, type Seguir } from './capitulo';
import { mostrarRolagem } from './rolagem';

/**
 * Palco de cena: fundo ilustrado (ou o mapa escurecido por trás), falas com digitação (um toque completa,
 * outro avança), busto do NPC, escolhas em botões grandes, testes de perícia com o d20 e efeitos de tela.
 * Usado pela tela de capítulo e, por cima do mapa, pelas conversas da exploração.
 */

const T = textos.cenas;
const NOMES_NPC = NPCS as Record<string, { nome: string }>;
const DADOS_AMEACAS = AMEACAS as Record<string, { nome: string; tipo: string; selo: string; imagem: string }>;
const PLAYLIST_FULLMUN = ['fullmun-01', 'fullmun-02'];

/** Música de uma cena: "fullmun" é a playlist da vila; null é silêncio; "nome?" só se o arquivo existir. */
export function tocarMusicaDaCena(musica: string | null | undefined, fadeMs = 1500): void {
  if (musica === undefined) return;
  if (musica === null) return audio.pararMusica(fadeMs);
  if (musica === 'fullmun') return audio.tocarPlaylist(PLAYLIST_FULLMUN.map(ASSETS.musica), fadeMs);
  if (musica.endsWith('?')) {
    const id = musica.slice(0, -1);
    void existeAsset(ASSETS.musica(id), 'audio').then((ok) => { if (ok) audio.tocarMusica(ASSETS.musica(id), fadeMs); else audio.pararMusica(0); });
    return;
  }
  audio.tocarMusica(ASSETS.musica(musica), fadeMs);
}

/** Aplica efeitos de escolha/fala/cena no save (e avisa as novidades do Compêndio). */
export function aplicarEfeitos(e: Efeitos | undefined): void {
  if (!e) return;
  const c = getEstado().campanha;
  if (e.uma_vez) {
    const chave = `ef:${e.uma_vez}`;
    if (c.usadas.includes(chave)) return;
    atualizarCampanha({ usadas: [...c.usadas, chave] });
  }
  for (const f of e.flag === undefined ? [] : Array.isArray(e.flag) ? e.flag : [e.flag]) marcarFlag(f);
  if (e.bonusProximoTeste) atualizarCampanha({ bonusProximoTeste: getEstado().campanha.bonusProximoTeste + e.bonusProximoTeste });
  const max = pvMaxAtual();
  if (e.pvDefinir !== undefined) atualizarCampanha({ pvAtual: e.pvDefinir });
  if (e.pv) atualizarCampanha({ pvAtual: Math.max(e.pv < 0 ? 1 : 0, Math.min(max, (getEstado().campanha.pvAtual ?? max) + e.pv)) });
  for (const [id, n] of Object.entries(e.relacao ?? {})) mudarRelacao(id, n);
  if (e.atraso) somarAtraso(e.atraso);
  for (const [id, n] of Object.entries(e.itens ?? {})) darItem(id, n);
  if (e.reais) somarReais(e.reais);
  for (const [id, est] of Object.entries(e.missao ?? {})) definirMissao(id, est);
  for (const [id, n] of Object.entries(e.contador ?? {})) somarContador(id, n);
  for (const id of e.conhecer === undefined ? [] : Array.isArray(e.conhecer) ? e.conhecer : [e.conhecer]) conhecer(id);
  if (e.bestiario) encontrarCriatura(e.bestiario.id, e.bestiario.sabe);
  for (const c2 of e.condicional ?? []) if (atende(c2.requer)) aplicarEfeitos(c2.efeitos);
  verificarCompendio();
}

export interface DestinoBatalha { batalha: string; vitoria: string; derrota: string; cenaOrigem: string | null }

export interface OpcoesPalco {
  /** Por cima do mapa: sem ilustração, a não ser que a cena tenha `fundo`. */
  sobreMapa?: boolean;
  aoBatalha(d: DestinoBatalha): void;
  aoFim(): void;
  aoMapa(m: { mapa: string; x?: number; y?: number }): void;
  /** Conversa no mapa terminou (seguir.voltar). */
  aoVoltar?(): void;
  /** Avisado a cada cena (o capítulo salva a cena atual). */
  aoEntrarCena?(c: Cena, modo: 'falas' | 'escolhas'): void;
}

export interface Palco {
  el: HTMLElement;
  entrar(id: string, modo?: 'falas' | 'escolhas'): Promise<void>;
  /** Um toque: completa a fala ou avança. */
  tocar(): void;
  cenaAtual(): Cena | null;
  digitando(): boolean;
  escolhasVisiveis(): string[];
  fundo(): string;
  destruir(): void;
}

export function criarPalco(o: OpcoesPalco): Palco {
  const p = getEstado().personagem;
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
  const brilho = h('div', { class: 'cena-brilho-alcapao', 'aria-hidden': 'true' });
  const flash = h('div', { class: 'cena-flash', 'aria-hidden': 'true' });
  const el = h('div', { class: `palco-cena${o.sobreMapa ? ' sobre-mapa' : ''}` },
    fundoA, fundoB, brilho, h('div', { class: 'cena-veu' }), ameaca, painel, flash);

  let destruido = false;
  let cena: Cena | null = null;
  let fundoAtual = '';
  let digitando = false;
  let completar: (() => void) | null = null;
  let avancar: (() => void) | null = null;
  let timerFala = 0;
  let ocupado = false;
  let pararLoop: (() => void) | null = null;

  function pararFala() {
    window.clearInterval(timerFala);
    digitando = false;
    completar = null;
    avancar = null;
  }

  function trocarFundo(id: string | undefined, lento = false) {
    el.classList.toggle('sem-fundo', !id);
    if (!id || id === fundoAtual) return;
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

  function quemFala(f: Fala): { nome: string | null; retrato: string | null; classe: string } {
    if (!f.quem) return { nome: null, retrato: null, classe: 'narracao' };
    if (f.quem === 'pensamento') return { nome: null, retrato: null, classe: 'pensamento' };
    if (f.quem === 'heroi') return { nome: p?.nome ?? '', retrato: p ? ASSETS.retrato(p.raca, p.genero, 'comum') : null, classe: 'heroi' };
    return { nome: NOMES_NPC[f.quem]?.nome ?? f.quem, retrato: ASSETS.retratoNpc(f.quem), classe: 'npc' };
  }

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
      }, f.velocidade ?? 22);
      timerFala = timer;
      const terminar = () => {
        window.clearInterval(timer);
        texto.textContent = cheio;
        digitando = false;
        caixa.classList.add('completa');
        completar = null;
        avancar = () => { avancar = null; ok(); };
        if (f.auto) window.setTimeout(() => { if (avancar && cena) avancar(); }, f.auto);
      };
      completar = terminar;
    });
  }

  function tocar() {
    if (ocupado && !digitando && !avancar) return;
    if (digitando && completar) completar();
    else if (avancar) { audio.sfx('ui-click', { ganho: 0.4 }); avancar(); }
  }
  caixa.addEventListener('click', tocar);

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

  const chaveEscolha = (c: Cena, i: number) => `${c.id}#${i}`;

  function escolhasDe(c: Cena): { e: Escolha; i: number }[] {
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
    const lista = escolhasDe(c);
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
    if (e.teste && p) {
      aplicarEfeitos(e.efeitos);
      const bonus = bonusPericia(p, e.teste.pericia, getEstado().campanha.bonusProximoTeste);
      atualizarCampanha({ bonusProximoTeste: 0 });
      const r = await mostrarRolagem(el, { titulo: PERICIAS[e.teste.pericia].nome, d20: rolarD20(), partes: bonus.partes, alvo: e.teste.cd });
      registrarCaminho({ cena: c.id, escolha: e.texto, resultado: r.sucesso ? 'sucesso' : 'falha' });
      ocupado = false;
      return void entrar(r.sucesso ? e.sucesso! : e.falha!, 'falas');
    }
    aplicarEfeitos(e.efeitos);
    registrarCaminho({ cena: c.id, escolha: e.texto });
    if (e.fala) await mostrarFala({ quem: 'heroi', texto: e.fala });
    ocupado = false;
    return seguir(e);
  }

  async function seguir(s: Seguir | Escolha) {
    limparEscolhas();
    if (s.batalha) return o.aoBatalha({ batalha: s.batalha, vitoria: s.vitoria!, derrota: s.derrota!, cenaOrigem: cena?.id ?? null });
    if ('fim' in s && s.fim) return o.aoFim();
    if (s.mapa) return o.aoMapa({ mapa: s.mapa, x: s.x, y: s.y });
    if (s.voltar) { pararFala(); cena = null; return o.aoVoltar?.(); }
    if (s.vai_para) return void entrar(s.vai_para, 'falas');
  }

  function tremer() {
    if (!tremoresLigados()) return;
    const alvo = el.closest('.tela') as HTMLElement ?? el;
    alvo.classList.remove('tremendo');
    void alvo.offsetWidth;
    alvo.classList.add('tremendo');
  }

  async function efeitosDaFala(f: Fala) {
    if (f.musica !== undefined) {
      if (f.musica === null && f.musicaCorte) audio.pararMusica(0);
      else tocarMusicaDaCena(f.musica, f.musicaCorte ? 0 : 1500);
    }
    if (f.abafar !== undefined) audio.abafar(f.abafar);
    if (f.loop !== undefined) {
      pararLoop?.();
      pararLoop = f.loop ? audio.sfxLoop(f.loop as NomeSfx) : null;
    }
    if (f.visual) { for (const c of [...el.classList]) if (c.startsWith('visual-')) el.classList.remove(c); el.classList.add(`visual-${f.visual}`); }
    if (f.som) audio.sfx(f.som as NomeSfx);
    if (f.flash) { flash.classList.remove('ativo'); void flash.offsetWidth; flash.classList.add('ativo'); }
    if (f.tremor) tremer();
  }

  async function entrar(id: string, modo: 'falas' | 'escolhas' = 'falas'): Promise<void> {
    if (destruido) return;
    const achada = cenaGlobal(id);
    if (!achada) throw new Error(`Cena desconhecida: ${id}`);
    const c = achada.cena;
    if (c.rotas) {
      const rota = c.rotas.find((r) => atende(r.requer));
      if (rota) return entrar(rota.vai_para, 'falas');
    }
    pararFala();
    cena = c;
    o.aoEntrarCena?.(c, modo);
    ameaca.hidden = true;
    ameaca.classList.remove('entrou');
    limparEscolhas();
    trocarFundo(c.fundo);
    for (const k of [...el.classList]) if (k.startsWith('visual-')) el.classList.remove(k);
    if (c.visual) el.classList.add(`visual-${c.visual}`);
    el.dataset.cena = c.id;
    if (modo === 'falas') {
      aplicarEfeitos(c.aoEntrar);
      if (c.aoEntrar?.som) audio.sfx(c.aoEntrar.som as NomeSfx);
      if (c.aoEntrar?.tremor) tremer();
      if (c.vinheta) {
        audio.tocarVinheta(ASSETS.musica(c.vinheta), () => !destruido && cena === c && tocarMusicaDaCena(c.musica, 1500));
      } else if (c.silencioAntes) {
        audio.pararMusica(400);
        window.setTimeout(() => !destruido && tocarMusicaDaCena(c.musica, 1500), c.silencioAntes);
      } else {
        tocarMusicaDaCena(c.musica, c.fadeMusica ?? 1500);
      }
      const grupos: Record<string, number> = {};
      for (const f of c.falas) {
        if (!atende(f.requer)) continue;
        if (f.grupo) {
          grupos[f.grupo] = (grupos[f.grupo] ?? 0) + 1;
          if (f.limite && grupos[f.grupo] > f.limite) continue;
        }
        aplicarEfeitos(f.efeitos);
        if (f.fundo) trocarFundo(f.fundo, true);
        if (f.ameaca) mostrarAmeaca(f.ameaca);
        await efeitosDaFala(f);
        await mostrarFala(f);
        if (destruido || cena !== c) return;
      }
    } else {
      tocarMusicaDaCena(c.musica, 1500);
      const ultima = [...c.falas].reverse().find((f) => atende(f.requer));
      if (ultima) { texto.textContent = interpolar(ultima.texto); caixa.classList.add('completa'); }
    }
    if (c.retorna) return entrar(c.retorna, 'escolhas');
    if (escolhasDe(c).length) return mostrarEscolhas(c);
    if (c.seguir) {
      // Cena sem falas (só efeitos ou só um destino): segue direto, sem botão.
      if (!c.falas.length) return void seguir(c.seguir);
      return mostrarSeguir(c.seguir);
    }
  }

  return {
    el,
    entrar,
    tocar,
    cenaAtual: () => cena,
    digitando: () => digitando,
    escolhasVisiveis: () => [...escolhas.querySelectorAll('.cena-escolha')].map((b) => b.querySelector('.escolha-texto')?.textContent ?? b.textContent ?? ''),
    fundo: () => fundoAtual,
    destruir() {
      destruido = true;
      pararFala();
      pararLoop?.();
      audio.abafar(false);
    },
  };
}

export { esperar };
