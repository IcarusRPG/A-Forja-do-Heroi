import CONVERSAS from '../data/conversas.json';
import LIVROS from '../data/livros.json';
import MISSOES from '../data/missoes.json';
import { ASSETS, SFX_CAPITULO, SFX_FASE4, SFX_SONHO, existeAsset, src, urlAsset } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarCampanha, getEstado, marcarFlag } from '../core/estado';
import { estadoProgresso, registrarGanchos } from '../core/ganchos';
import {
  aoMudarAtraso, contador, definirMissao, nomeAtraso, pvAtual, somarAtraso, somarContador, verificarCompendio,
} from '../core/progresso';
import { irPara, type Tela } from '../core/telas';
import { ehToque, textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import { Controles } from '../exploracao/controles';
import type { Motor } from '../exploracao/motor';
import type { DadosMapa, Direcao } from '../exploracao/tipos';
import { atende, type Condicao, type Efeitos } from '../narrativa/capitulo';
import { aplicarEfeitos, criarPalco, tocarMusicaDaCena, type Palco } from '../narrativa/palco';
import { abrirMenuPausa } from './pausa';

/**
 * Exploração de um mapa da história (Füllmun, salão do templo, biblioteca): o motor do sonho com
 * moradores parados (respiração leve, marcadores ! … ?), itens no chão, seguidores pelo rastro do herói,
 * HUD (relógio do atraso ou contador), gatilhos de cena e as conversas no palco por cima do mapa.
 * Tudo vem de src/data/mapas/<id>.json e src/data/conversas.json.
 */

interface NpcMapa { id: string; x: number; y: number; direcao?: Direcao; requer?: Condicao }
interface ObjetoMapa {
  id: string;
  /** Ícone (public/assets/img/itens/<item>.png). */
  item: string;
  x: number;
  y: number;
  /** Onde o herói fica para interagir (se o ícone estiver num telhado, por exemplo). */
  interacao?: { x: number; y: number };
  requer?: Condicao;
  /** Cena ao interagir (ou efeitos diretos em `coletar`). */
  cena?: string;
  coletar?: Efeitos;
  /** "esfregar" (manchas, poeira, altar): 1 s de animação; "ler" (livros). */
  acao?: 'esfregar' | 'ler' | 'polir';
  livro?: string;
  /** Contador somado ao terminar a ação. */
  contador?: string;
  /** Some depois de usado (padrão: sim, menos livros). */
  fica?: boolean;
  /** Ponto de interação sem ícone no chão (alçapão, altar). */
  semIcone?: boolean;
  marcador?: { requer?: Condicao; tipo: string }[];
}
interface GatilhoCena { id: string; pontos: [number, number][]; requer?: Condicao; cena: string; empurra?: { x: number; y: number } }
export interface DadosMapaJogo extends DadosMapa {
  musica?: string;
  alturasDeTela?: number;
  hud?: 'relogio' | { contador: string; rotulo: string; total?: number | { requer?: Condicao; n: number }[] };
  npcs?: NpcMapa[];
  objetos?: ObjetoMapa[];
  gatilhosCena?: GatilhoCena[];
  seguidores?: { id: string; requer?: Condicao }[];
  dicas?: { requer?: Condicao; texto: string }[];
  /** Cenas disparadas quando um contador chega a um valor (estantes limpas…). */
  aoContador?: { contador: string; valor: number; cena: string; requer?: Condicao }[];
  /** Cena ao entrar no mapa (uma vez, se a condição valer). */
  aoEntrar?: { cena: string; requer?: Condicao; umaVez?: string }[];
  /** Falas curtas sobre um seguidor (balões), sem parar o jogo. */
  baloes?: { quem: string; texto: string; requer?: Condicao; umaVez: string; contador?: { id: string; valor: number } }[];
  /** Espirro de vez em quando (biblioteca). */
  espirros?: boolean;
}
type Regra = { requer?: Condicao; cena?: string; tipo?: string | null };
const CONV = CONVERSAS as Record<string, { conversas: Regra[]; marcadores?: Regra[] }>;
const MAPAS = import.meta.glob<DadosMapaJogo>('../data/mapas/*.json', { eager: true, import: 'default' });
export const mapaPorId = (id: string): DadosMapaJogo => {
  const m = Object.values(MAPAS).find((x) => x.id === id);
  if (!m) throw new Error(`Mapa desconhecido: ${id}`);
  return m;
};

export interface ParamsMapa { mapa?: string; x?: number; y?: number; cena?: string }

export function telaMapa(params?: unknown): Tela {
  const prm = (params ?? {}) as ParamsMapa;
  const local = getEstado().campanha.local;
  const idMapa = prm.mapa ?? local.mapa ?? 'fullmun';
  // Cópia: as listas de interação e gatilhos são remontadas a cada mudança.
  const base = mapaPorId(idMapa);
  const mapa: DadosMapaJogo = { ...base, interacoes: [], gatilhos: [] };
  const p = getEstado().personagem!;
  const toque = ehToque();

  const palcoEl = h('div', { class: 'mapa-palco' });
  const hud = h('div', { class: 'mapa-hud', 'aria-live': 'polite' });
  const dica = h('p', { class: 'mapa-dica', hidden: true });
  const el = h('div', { class: `tela-mapa mapa-${idMapa}` }, palcoEl, hud, dica);

  let saiu = false;
  let motor: Motor | null = null;
  let palco: Palco | null = null;
  let fecharPausa: (() => void) | null = null;
  let ocupado = false;
  let phaser: typeof import('phaser') | null = null;
  const sprites = new Map<string, { s: import('phaser').GameObjects.Sprite; marcador: import('phaser').GameObjects.Text; npc: NpcMapa }>();
  const objetosSprites = new Map<string, import('phaser').GameObjects.Image>();
  const objetosMarcadores = new Map<string, import('phaser').GameObjects.Text>();
  const seguidores = new Map<string, { s: import('phaser').GameObjects.Sprite; dir: Direcao }>();
  const rastro: { x: number; y: number }[] = [];
  const gatilhosDentro = new Set<string>();
  const timers: number[] = [];

  const controles = new Controles({
    raiz: el, toque, rotuloInteragir: textos.sonho.interagir, rotuloPausa: textos.sonho.pausa,
    aoInteragir: () => interagir(), aoPausar: () => abrirPausa(),
  });

  /* ------------------------------------------------------------ estado e posição */

  function salvarPosicao() {
    if (!motor) return;
    const { x, y, direcao } = motor.posicao();
    atualizarCampanha({ local: { tela: 'mapa', mapa: idMapa, x: Math.round(x), y: Math.round(y), direcao } });
  }

  const coletado = (id: string) => getEstado().campanha.coletados.includes(`${idMapa}:${id}`);
  const marcarColetado = (id: string) => {
    if (!coletado(id)) atualizarCampanha({ coletados: [...getEstado().campanha.coletados, `${idMapa}:${id}`] });
  };
  const npcsVisiveis = () => (mapa.npcs ?? []).filter((n) => atende(n.requer));
  const objetosVisiveis = () => (mapa.objetos ?? []).filter((o) => atende(o.requer) && (o.fica || !coletado(o.id)));

  function conversaDe(id: string): string | null {
    return CONV[id]?.conversas.find((r) => atende(r.requer))?.cena ?? null;
  }
  function marcadorDe(id: string): string | null {
    return CONV[id]?.marcadores?.find((r) => atende(r.requer))?.tipo ?? null;
  }

  /** Remonta interações, marcadores, itens, seguidores, gatilhos, dica e HUD a partir do save. */
  function atualizar() {
    if (!motor || !phaser) return;
    const inter: DadosMapa['interacoes'] = [];
    for (const n of mapa.npcs ?? []) {
      const vis = atende(n.requer);
      const reg = sprites.get(n.id);
      if (reg) {
        reg.s.setVisible(vis);
        const m = vis ? marcadorDe(n.id) : null;
        reg.marcador.setText(m ?? '').setVisible(!!m);
      }
      if (vis) inter.push({ id: `npc:${n.id}`, x: n.x, y: n.y + 8, raio: 58 });
    }
    for (const [id, img] of objetosSprites) if (!objetosVisiveis().some((o) => o.id === id)) { img.destroy(); objetosSprites.delete(id); }
    for (const o of objetosVisiveis()) {
      inter.push({ id: `obj:${o.id}`, x: o.interacao?.x ?? o.x, y: o.interacao?.y ?? o.y, raio: 52 });
      if (!o.semIcone && !objetosSprites.has(o.id)) objetosSprites.set(o.id, criarObjeto(o));
      const marca = o.marcador?.find((r) => atende(r.requer))?.tipo ?? null;
      let txt = objetosMarcadores.get(o.id);
      if (marca && !txt) {
        txt = motor.cena.add.text(o.x, o.y - 44, marca, { fontFamily: 'Cinzel, serif', fontSize: '24px', color: '#ffd25a', stroke: '#2a1a10', strokeThickness: 4 })
          .setOrigin(0.5, 1).setDepth(150_000);
        motor.cena.tweens.add({ targets: txt, y: o.y - 50, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        objetosMarcadores.set(o.id, txt);
      }
      txt?.setText(marca ?? '').setVisible(!!marca);
    }
    for (const [id, txt] of objetosMarcadores) if (!objetosVisiveis().some((o) => o.id === id)) txt.setVisible(false);
    mapa.interacoes = inter;
    mapa.gatilhos = (mapa.gatilhosCena ?? []).filter((g) => atende(g.requer)).map((g) => ({ id: g.id, pontos: g.pontos }));
    for (const s of mapa.seguidores ?? []) {
      const ativo = atende(s.requer);
      if (ativo && !seguidores.has(s.id)) criarSeguidor(s.id);
      if (!ativo && seguidores.has(s.id)) { seguidores.get(s.id)!.s.destroy(); seguidores.delete(s.id); }
    }
    const d = (mapa.dicas ?? []).find((x) => atende(x.requer));
    dica.hidden = !d;
    dica.textContent = d?.texto ?? '';
    desenharHud();
  }

  /* ------------------------------------------------------------ HUD */

  function desenharHud(animar = false) {
    if (mapa.hud === 'relogio') {
      const marcas = getEstado().campanha.atraso;
      const ponteiro = -150 + marcas * 60;
      hud.className = `mapa-hud hud-relogio${animar ? ' piscando' : ''}`;
      hud.innerHTML = `
        <svg class="relogio-sol" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="#2a2016" stroke="#d6a94a" stroke-width="3"/>
          ${[0, 1, 2, 3, 4].map((k) => { const a = ((-150 + k * 60) * Math.PI) / 180; return `<line x1="${32 + Math.cos(a) * 20}" y1="${32 + Math.sin(a) * 20}" x2="${32 + Math.cos(a) * 26}" y2="${32 + Math.sin(a) * 26}" stroke="#f2d48a" stroke-width="2"/>`; }).join('')}
          <g class="relogio-ponteiro" style="transform: rotate(${ponteiro}deg)"><line x1="32" y1="32" x2="54" y2="32" stroke="#ffd25a" stroke-width="4" stroke-linecap="round"/></g>
          <circle cx="32" cy="32" r="4" fill="#ffd25a"/>
        </svg>`;
      hud.append(
        h('span', { class: 'relogio-bolinhas', 'aria-label': `${marcas} de 4` }, ...[0, 1, 2, 3].map((k) => h('span', { class: k < marcas ? 'cheia' : 'vazia' }, k < marcas ? '●' : '○'))),
        h('span', { class: 'relogio-estado' }, nomeAtraso(marcas)),
      );
      hud.dataset.marcas = String(marcas);
    } else if (mapa.hud) {
      const cfg = mapa.hud;
      const total = typeof cfg.total === 'number' ? cfg.total : (cfg.total ?? []).find((t) => atende(t.requer))?.n ?? 0;
      hud.className = 'mapa-hud hud-contador';
      hud.textContent = total ? `${cfg.rotulo} ${Math.min(total, contador(cfg.contador))}/${total}` : '';
      hud.hidden = !total;
    }
  }

  /* ------------------------------------------------------------ sprites */

  const quadro = (dir: Direcao) => ['baixo', 'esquerda', 'direita', 'cima'].indexOf(dir) * 4;

  function animsDe(chave: string) {
    const cena = motor!.cena;
    ['baixo', 'esquerda', 'direita', 'cima'].forEach((d, linha) => {
      const k = `${chave}-${d}`;
      if (!cena.anims.exists(k)) cena.anims.create({ key: k, frames: cena.anims.generateFrameNumbers(chave, { start: linha * 4, end: linha * 4 + 3 }), frameRate: 7, repeat: -1 });
    });
  }

  function criarNpc(n: NpcMapa) {
    const cena = motor!.cena;
    const chave = `npc-${n.id}`;
    const s = cena.add.sprite(n.x, n.y, chave, quadro(n.direcao ?? 'baixo')).setOrigin(0.5, 46 / 48).setDepth(n.y);
    // Respiração leve por código.
    cena.tweens.add({ targets: s, scaleY: 1.03, duration: 1400 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const marcador = cena.add.text(n.x, n.y - 60, '', { fontFamily: 'Cinzel, serif', fontSize: '22px', color: '#ffd25a', stroke: '#2a1a10', strokeThickness: 4 })
      .setOrigin(0.5, 1).setDepth(150_000);
    cena.tweens.add({ targets: marcador, y: n.y - 66, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    s.setData('id', n.id);
    sprites.set(n.id, { s, marcador, npc: n });
  }

  function criarObjeto(o: ObjetoMapa) {
    const cena = motor!.cena;
    const img = cena.add.image(o.x, o.y, `item-${o.item}`).setDepth(o.acao ? -60_000 : o.y);
    const lado = o.acao === 'esfregar' && o.item === 'mancha' ? 40 : 30;
    img.setDisplaySize(lado, lado * (img.height / img.width));
    if (!o.acao) cena.tweens.add({ targets: img, alpha: 0.65, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return img;
  }

  function criarSeguidor(id: string) {
    const cena = motor!.cena;
    const chave = `npc-${id}`;
    animsDe(chave);
    const h0 = motor!.posicao();
    const s = cena.add.sprite(h0.x, h0.y + 30, chave, quadro('cima')).setOrigin(0.5, 46 / 48).setDepth(h0.y + 30);
    seguidores.set(id, { s, dir: 'cima' });
    rastro.length = 0;
  }

  /** Seguidores andam pelo rastro do herói, ~40 px atrás, sem bloquear. */
  function atualizarSeguidores() {
    if (!motor || !seguidores.size) return;
    const hpos = motor.posicao();
    const ult = rastro[rastro.length - 1];
    if (!ult || Math.hypot(hpos.x - ult.x, hpos.y - ult.y) > 3) rastro.push({ x: hpos.x, y: hpos.y });
    if (rastro.length > 200) rastro.shift();
    let k = 0;
    for (const [id, f] of seguidores) {
      // Ponto do rastro a ~40 px (por seguidor) do herói, medido ao longo do caminho.
      let dist = 0;
      let alvo = rastro[0] ?? hpos;
      const atras = 40 * (k + 1);
      for (let i = rastro.length - 1; i > 0; i--) {
        dist += Math.hypot(rastro[i].x - rastro[i - 1].x, rastro[i].y - rastro[i - 1].y);
        if (dist >= atras) { alvo = rastro[i - 1]; break; }
      }
      const dx = alvo.x - f.s.x, dy = alvo.y - f.s.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const passo = Math.min(d, 2.6);
        f.s.x += (dx / d) * passo;
        f.s.y += (dy / d) * passo;
        f.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo';
        f.s.anims.play(`npc-${id}-${f.dir}`, true);
      } else {
        f.s.anims.stop();
        f.s.setFrame(quadro(f.dir));
      }
      f.s.setDepth(f.s.y);
      k++;
    }
  }

  /** Balão curto sobre um seguidor ou morador, sem parar o jogo. */
  function balao(quem: string, texto: string) {
    if (!motor) return;
    const alvo = seguidores.get(quem)?.s ?? sprites.get(quem)?.s;
    if (!alvo) return;
    const t = motor.cena.add.text(alvo.x, alvo.y - 56, texto, {
      fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#2a1a10', backgroundColor: '#f3eee5', padding: { x: 6, y: 4 },
      wordWrap: { width: 190 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(160_000);
    const seguir = () => t.setPosition(alvo.x, alvo.y - 56);
    motor.cena.events.on('update', seguir);
    window.setTimeout(() => { motor?.cena.events.off('update', seguir); t.destroy(); }, 3800);
    ultimoBalao = texto;
  }
  let ultimoBalao = '';

  function verificarBaloes() {
    for (const b of mapa.baloes ?? []) {
      if (getEstado().campanha.usadas.includes(`balao:${b.umaVez}`)) continue;
      if (b.contador && contador(b.contador.id) < b.contador.valor) continue;
      if (!atende(b.requer)) continue;
      atualizarCampanha({ usadas: [...getEstado().campanha.usadas, `balao:${b.umaVez}`] });
      balao(b.quem, b.texto);
    }
  }

  /* ------------------------------------------------------------ palco (conversas por cima do mapa) */

  function abrirCena(id: string) {
    if (!motor || saiu) return;
    salvarPosicao();
    ocupado = true;
    motor.bloquear(true);
    controles.habilitar(false);
    controles.mostrarInteracao(false);
    el.classList.add('com-palco');
    palco?.destruir();
    palcoEl.replaceChildren();
    palco = criarPalco({
      sobreMapa: true,
      aoBatalha: (d) => {
        marcarFlag('lutou');
        atualizarCampanha({ cenaAntesDaBatalha: d.cenaOrigem });
        salvarPosicao();
        void irPara('batalha', { batalha: d.batalha, vitoria: d.vitoria, derrota: d.derrota, retorno: 'mapa' });
      },
      aoFim: () => void irPara('fimCapitulo', undefined, { duracao: 900 }),
      aoMapa: (m) => {
        if (m.mapa === idMapa) { fecharCena(); if (m.x !== undefined) motor?.teleportar(m.x, m.y ?? 0); salvarPosicao(); return; }
        void irPara('mapa', { mapa: m.mapa, x: m.x, y: m.y });
      },
      aoVoltar: () => fecharCena(),
    });
    palcoEl.append(palco.el);
    void palco.entrar(id, 'falas');
  }

  function fecharCena() {
    palco?.destruir();
    palco = null;
    palcoEl.replaceChildren();
    el.classList.remove('com-palco');
    ocupado = false;
    motor?.bloquear(false);
    controles.habilitar(true);
    tocarMusicaDaCena(mapa.musica, 1200);
    if (empurrarPara) { motor?.teleportar(empurrarPara.x, empurrarPara.y); empurrarPara = null; }
    atualizar();
    controles.mostrarInteracao(motor?.proximo() != null);
    salvarPosicao();
    verificarContadores();
    verificarBaloes();
    verificarCompendio();
  }
  let empurrarPara: { x: number; y: number } | null = null;

  /* ------------------------------------------------------------ interação */

  function interagir(alvo?: string) {
    if (!motor || ocupado || fecharPausa) return;
    const id = alvo ?? motor.proximo();
    if (!id) return;
    if (id.startsWith('npc:')) {
      const npc = id.slice(4);
      const reg = sprites.get(npc);
      if (reg) {
        // O morador vira para o herói.
        const hp = motor.posicao();
        const dx = hp.x - reg.s.x, dy = hp.y - reg.s.y;
        reg.s.setFrame(quadro(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo'));
      }
      const cena = conversaDe(npc);
      if (cena) abrirCena(cena);
      return;
    }
    if (id.startsWith('obj:')) void usarObjeto(id.slice(4));
  }

  async function usarObjeto(oid: string) {
    const o = (mapa.objetos ?? []).find((x) => x.id === oid);
    if (!o || !motor) return;
    if (o.acao === 'ler' && o.livro) return abrirLivro(o);
    if (o.acao === 'esfregar' || o.acao === 'polir') {
      ocupado = true;
      motor.bloquear(true);
      controles.mostrarInteracao(false);
      await esfregar(o.acao === 'polir' ? 'dourado' : o.item === 'poeira' ? 'poeira' : 'espuma');
      ocupado = false;
      if (saiu) return;
      motor.bloquear(false);
      marcarColetado(o.id);
      if (o.contador) somarContador(o.contador);
      aplicarEfeitos(o.coletar);
      atualizar();
      desenharHud();
      verificarContadores();
      verificarBaloes();
      if (o.cena) abrirCena(o.cena);
      return;
    }
    if (!o.fica) marcarColetado(o.id);
    if (o.coletar) {
      audio.sfx('pegar-item');
      aplicarEfeitos(o.coletar);
    }
    atualizar();
    if (o.cena) abrirCena(o.cena);
  }

  /** O herói fica parado 1 s esfregando (balanço por código e partículas). */
  async function esfregar(tipo: 'espuma' | 'poeira' | 'dourado') {
    if (!motor || !phaser) return;
    audio.sfx('esfregar');
    const heroi = motor.heroi;
    const cena = motor.cena;
    const x0 = heroi.x;
    const tw = cena.tweens.add({ targets: heroi, x: x0 + 2, duration: 90, yoyo: true, repeat: 5 });
    const cor = tipo === 'poeira' ? 0xcbb89a : tipo === 'dourado' ? 0xffd25a : 0xffffff;
    for (let i = 0; i < 12; i++) {
      const c = cena.add.circle(heroi.x + (Math.random() - 0.5) * 30, heroi.y - 4 - Math.random() * 10, 2 + Math.random() * 3, cor, 0.85).setDepth(heroi.y + 1);
      cena.tweens.add({ targets: c, y: c.y - 14 - Math.random() * 12, alpha: 0, duration: 700 + Math.random() * 300, delay: i * 50, onComplete: () => c.destroy() });
    }
    await esperar(1000);
    tw.stop();
    heroi.x = x0;
    if (tipo === 'dourado') {
      const brilho = cena.add.circle(heroi.x, heroi.y - 30, 30, 0xffd25a, 0.5).setDepth(heroi.y + 2).setBlendMode(phaser.BlendModes.ADD);
      cena.tweens.add({ targets: brilho, scale: 2.4, alpha: 0, duration: 700, onComplete: () => brilho.destroy() });
    }
  }

  function verificarContadores() {
    for (const r of mapa.aoContador ?? []) {
      const chave = `cont:${idMapa}:${r.contador}:${r.valor}`;
      if (getEstado().campanha.usadas.includes(chave)) continue;
      if (contador(r.contador) < r.valor || !atende(r.requer)) continue;
      atualizarCampanha({ usadas: [...getEstado().campanha.usadas, chave] });
      if (!ocupado) abrirCena(r.cena);
      return;
    }
  }

  /** Painel de livro: duas colunas no computador, uma no celular, em pergaminho. */
  function abrirLivro(o: ObjetoMapa) {
    // TODO(Adam): revisar lore — os textos dos livros estão em src/data/livros.json.
    const l = (LIVROS as unknown as Record<string, { titulo: string; paragrafos: string[] }>)[o.livro!];
    if (!l || !motor) return;
    ocupado = true;
    motor.bloquear(true);
    audio.sfx('compendio');
    const fechar = botao(textos.cenas.fechar, () => {
      painel.remove();
      ocupado = false;
      motor?.bloquear(false);
      // Cada livro conta uma vez (o da guerra também conta quando a Nyme o mostra).
      aplicarEfeitos({ uma_vez: `livro-${o.livro}`, contador: { livros_lidos: 1 } });
      aplicarEfeitos(o.coletar);
      atualizar();
      verificarContadores();
    }, { classe: 'btn-principal livro-fechar' });
    const painel = h('div', { class: 'livro-fundo' },
      h('article', { class: 'livro', role: 'dialog', 'aria-label': l.titulo },
        h('h2', { class: 'livro-titulo' }, l.titulo),
        h('div', { class: 'livro-texto' }, ...l.paragrafos.map((t) => h('p', {}, t))),
        fechar));
    el.append(painel);
    fechar.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------ gatilhos e pausa */

  function aoEntrarGatilho(id: string) {
    if (ocupado || gatilhosDentro.has(id)) return;
    gatilhosDentro.add(id);
    const g = (mapa.gatilhosCena ?? []).find((x) => x.id === id);
    if (!g || !atende(g.requer)) return;
    if (g.empurra) empurrarPara = g.empurra;
    abrirCena(g.cena);
  }

  function abrirPausa() {
    if (fecharPausa || ocupado) return;
    motor?.pausar(true);
    controles.habilitar(false);
    fecharPausa = abrirMenuPausa({
      aoFechar: () => { fecharPausa = null; motor?.pausar(false); controles.habilitar(true); },
    });
  }

  /* ------------------------------------------------------------ montagem */

  async function montar() {
    void audio.carregarEfeitos([...SFX_CAPITULO, ...SFX_FASE4, ...SFX_SONHO]);
    const raca = p.raca, genero = p.genero;
    const ids = new Set([...(mapa.npcs ?? []).map((n) => n.id), ...(mapa.seguidores ?? []).map((s) => s.id)]);
    const itens = new Set((mapa.objetos ?? []).filter((o) => !o.semIcone).map((o) => o.item));
    const [{ criarMotor }, phaserMod, temSprite] = await Promise.all([
      import('../exploracao/motor'), import('phaser'), existeAsset(ASSETS.spriteChibi(raca, genero), 'image'),
    ]);
    if (saiu) return;
    phaser = phaserMod.default ?? phaserMod;
    const salvo = getEstado().campanha.local;
    const inicio = prm.x !== undefined
      ? { x: prm.x, y: prm.y ?? 0, direcao: 'cima' as Direcao }
      : salvo.mapa === idMapa && salvo.x !== undefined ? { x: salvo.x, y: salvo.y ?? 0, direcao: (salvo.direcao ?? 'baixo') as Direcao } : undefined;
    const m = await criarMotor({
      container: el,
      mapa,
      imagemUrl: src(base.imagem),
      heroi: { raca, genero, spriteUrl: temSprite ? urlAsset(ASSETS.spriteChibi(raca, genero)) : null },
      entrada: () => controles.vetor(),
      debugPermitido: import.meta.env.DEV || new URLSearchParams(location.search).has('debug'),
      debugInicial: new URLSearchParams(location.search).has('debug'),
      alturasDeTela: base.alturasDeTela ?? 1.6,
      inicio,
      extras: [
        ...[...ids].map((id) => ({ chave: `npc-${id}`, url: src(ASSETS.chibi(id)), tipo: 'folha' as const })),
        ...[...itens].map((id) => ({ chave: `item-${id}`, url: src(ASSETS.item(id)), tipo: 'imagem' as const })),
      ],
      aoProximidade: (id) => controles.mostrarInteracao(id !== null && !ocupado),
      aoEntrarGatilho,
      aoSairGatilho: (id) => gatilhosDentro.delete(id),
      aoPasso: () => audio.sfx('step-marble', { taxa: 0.8 + Math.random() * 0.2, ganho: 0.3 }),
      aoAtualizar: () => atualizarSeguidores(),
    });
    if (saiu) return m.destruir();
    motor = m;
    for (const n of mapa.npcs ?? []) criarNpc(n);
    atualizar();
    el.classList.add('pronto');
    tocarMusicaDaCena(mapa.musica, 1500);
    if (idMapa === 'fullmun') audio.volumeRelativo(1);
    salvarPosicao();
    registrarGanchosMapa();
    if (mapa.espirros) {
      const espirrar = () => { if (!saiu) { if (!ocupado) audio.sfx('espirro', { ganho: 0.7 }); timers.push(window.setTimeout(espirrar, 14_000 + Math.random() * 12_000)); } };
      timers.push(window.setTimeout(espirrar, 9000));
    }
    if (prm.cena) return abrirCena(prm.cena);
    for (const a of mapa.aoEntrar ?? []) {
      const chave = `entrou:${a.umaVez ?? a.cena}`;
      if (a.umaVez && getEstado().campanha.usadas.includes(chave)) continue;
      if (!atende(a.requer)) continue;
      if (a.umaVez) atualizarCampanha({ usadas: [...getEstado().campanha.usadas, chave] });
      return abrirCena(a.cena);
    }
    verificarBaloes();
  }

  const pararAtraso = aoMudarAtraso(() => { desenharHud(true); window.setTimeout(() => hud.classList.remove('piscando'), 1500); });

  function registrarGanchosMapa() {
    registrarGanchos({
      goto: (id: string) => abrirCena(id),
      avancar: () => palco?.tocar(),
      teleport: (x: number, y: number) => { motor?.teleportar(x, y); salvarPosicao(); },
      gotoMapa: (mid: string, x?: number, y?: number) => {
        if (mid === idMapa && x !== undefined) { motor?.teleportar(x, y ?? 0); salvarPosicao(); }
        else void irPara('mapa', { mapa: mid, x, y });
      },
      walkTo: async (x: number, y: number) => (motor ? motor.caminharAte(x, y) : false),
      interact: () => interagir(),
      interactWith: (alvo: string) => {
        const i = mapa.interacoes.find((x) => x.id === alvo);
        if (!i || !motor) return false;
        motor.teleportar(i.x, i.y + 2);
        window.setTimeout(() => interagir(alvo), 60);
        return true;
      },
      completeMissao: (id: string) => {
        definirMissao(id, 'concluida');
        somarAtraso((MISSOES as Record<string, { atraso: number }>)[id]?.atraso ?? 0);
        atualizar();
      },
      state: () => ({
        ...estadoProgresso(),
        tela: 'mapa',
        mapa: idMapa,
        pronto: motor !== null,
        heroi: motor?.posicao() ?? null,
        camera: motor ? { x: Math.round(motor.cena.cameras.main.scrollX), y: Math.round(motor.cena.cameras.main.scrollY) } : null,
        pv: pvAtual(),
        proximo: motor?.proximo() ?? null,
        npcs: npcsVisiveis().map((n) => ({ id: n.id, marcador: marcadorDe(n.id) })),
        objetos: objetosVisiveis().map((o) => o.id),
        seguidores: [...seguidores.entries()].map(([id, f]) => ({ id, x: Math.round(f.s.x), y: Math.round(f.s.y) })),
        palco: palco !== null,
        cena: palco?.cenaAtual()?.id ?? null,
        escolhas: palco?.escolhasVisiveis() ?? [],
        digitando: palco?.digitando() ?? false,
        hud: hud.textContent?.trim() ?? '',
        dica: dica.hidden ? null : dica.textContent,
        balao: ultimoBalao,
        livroAberto: !!el.querySelector('.livro'),
      }),
    });
  }

  return {
    el,
    aoEntrar() {
      montar().catch((erro) => { console.error('O mapa não carregou.', erro); });
    },
    aoSair() {
      saiu = true;
      salvarPosicao();
      pararAtraso();
      timers.forEach(clearTimeout);
      palco?.destruir();
      controles.destruir();
      motor?.destruir();
      motor = null;
      document.querySelectorAll('.modal-fundo, .compendio-fundo').forEach((m) => m.remove());
    },
  };
}
