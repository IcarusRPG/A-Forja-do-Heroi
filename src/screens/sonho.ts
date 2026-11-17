import { ASSETS, SFX_SONHO, existeAsset, src, urlAsset } from '../core/assets';
import { audio } from '../core/audio';
import { concluirSonho, getEstado, ouvirVoz } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { ehToque, fmt, textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import MAPA_JSON from '../data/mapas/sonho.json';
import type { DadosMapa } from '../exploracao/tipos';
import { CaixaFala } from '../exploracao/caixaFala';
import { Controles } from '../exploracao/controles';
import type { EstatuaSonho } from '../exploracao/efeitosSonho';
import { abrirOpcoes } from './opcoes';

/**
 * O sonho dos deuses: primeira cena de exploração.
 * O herói (chibi) anda pelo templo celestial, ouve as sete vozes e, no altar, recebe o clímax.
 * Phaser só é carregado aqui, por import() dinâmico.
 */

const MAPA = MAPA_JSON as unknown as DadosMapa & { estatuas: EstatuaSonho[] };
const T = textos.sonho;
const VOZES = T.vozes as Record<string, { titulo: string; mensagem: string }>;
const TOTAL = MAPA.estatuas.length;
const COR_HEROI = '#d6a94a';

const parametros = () => new URLSearchParams(location.search);

async function musicaDoSonho(): Promise<string | null> {
  for (const c of ASSETS.musicaSonho) if (await existeAsset(c, 'audio')) return c;
  return null;
}

export function telaSonho(): Tela {
  const p = getEstado().personagem;
  const toque = ehToque();
  const palco = h('div', { class: 'sonho-palco' });
  const carregando = h('p', { class: 'sonho-carregando' }, T.carregando);
  const contador = h('div', { class: 'sonho-contador', 'aria-live': 'polite' });
  const dica = h('p', { class: 'sonho-dica' }, toque ? T.dicaToque : T.dicaTeclado);
  const hud = h('div', { class: 'sonho-hud' }, contador, dica);
  const clarao = h('div', { class: 'sonho-clarao' });
  const pularClimax = h('div', { class: 'dica-pular sonho-pular' }, toque ? T.pularClimaxToque : T.pularClimax);
  const el = h('div', { class: 'tela-sonho' }, palco, carregando, hud, pularClimax, clarao);

  let saiu = false;
  let pausado = false;
  let emClimax = false;
  let musica: string | null = null;
  let menuPausa: HTMLElement | null = null;
  let motor: import('../exploracao/motor').Motor | null = null;
  let efeitos: import('../exploracao/efeitosSonho').EfeitosSonho | null = null;
  const timers: number[] = [];
  const depois = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !saiu && fn(), ms));

  const caixa = new CaixaFala(el);
  const controles = new Controles({
    raiz: el,
    toque,
    rotuloInteragir: T.interagir,
    rotuloPausa: T.pausa,
    aoInteragir: () => interagir(),
    aoPausar: () => alternarPausa(),
  });

  const atualizarContador = () => {
    contador.textContent = fmt(T.contador, p?.genero ?? 'm', { n: getEstado().sonho.ouvidas.length, total: TOTAL });
  };
  atualizarContador();

  /* ----------------------------- interação ----------------------------- */

  function interagir() {
    if (!motor || pausado || emClimax) return;
    if (caixa.aberta) return caixa.avancar();
    const id = motor.proximo();
    const voz = id ? VOZES[id] : null;
    const estatua = MAPA.estatuas.find((e) => e.id === id);
    if (!id || !voz || !estatua) return;
    audio.sfx('statue-awaken');
    efeitos?.acender(id);
    const jaTinhaTodas = getEstado().sonho.ouvidas.length === TOTAL;
    ouvirVoz(id);
    atualizarContador();
    if (!jaTinhaTodas && getEstado().sonho.ouvidas.length === TOTAL) efeitos?.altarPronto();
    motor.bloquear(true);
    controles.mostrarInteracao(false);
    caixa.mostrar({
      titulo: voz.titulo,
      texto: voz.mensagem,
      cor: estatua.cor,
      aoFechar: () => {
        motor?.bloquear(false);
        controles.mostrarInteracao(motor?.proximo() !== null);
      },
    });
  }

  /** Clique/toque fora da caixa também avança a fala (mas não move o herói). */
  el.addEventListener('pointerup', (e) => {
    if (caixa.aberta && !(e.target as HTMLElement).closest('button')) caixa.avancar();
  });

  function aoProximidade(id: string | null) {
    for (const e of MAPA.estatuas) efeitos?.perto(e.id, e.id === id);
    if (id) audio.sfx('statue-glow', { ganho: 0.8 });
    controles.mostrarInteracao(id !== null && !caixa.aberta && !emClimax);
  }

  function aoEntrarGatilho(id: string) {
    if (id !== 'altar' || emClimax || caixa.aberta) return;
    if (getEstado().sonho.ouvidas.length < TOTAL) {
      motor?.bloquear(true);
      caixa.mostrar({ titulo: p?.nome, texto: T.altarIncompleto, cor: COR_HEROI, aoFechar: () => motor?.bloquear(false) });
    } else {
      void climax();
    }
  }

  /* ----------------------------- pausa ----------------------------- */

  function alternarPausa() {
    if (emClimax || !motor) return;
    // Esc com Opções aberto fecha só o Opções.
    if (document.querySelector('.modal-fundo:not(.saindo):not(.pausa-fundo)')) return;
    if (pausado) return fecharPausa();
    if (caixa.aberta) return caixa.fechar();
    pausado = true;
    motor.pausar(true);
    controles.habilitar(false);
    audio.sfx('ui-click');
    const continuar = botao(T.continuar, () => fecharPausa(), { classe: 'btn-principal' });
    menuPausa = h('div', { class: 'modal-fundo pausa-fundo' },
      h('div', { class: 'modal pausa', role: 'dialog', 'aria-modal': 'true', 'aria-label': T.pausa },
        h('h2', { class: 'modal-titulo' }, T.pausa),
        h('div', { class: 'pausa-botoes' },
          continuar,
          botao(T.opcoes, () => abrirOpcoes()),
          botao(T.voltarMenu, () => {
            fecharPausa(false);
            void irPara('menu');
          }, { som: 'ui-back' }),
        ),
      ),
    );
    el.append(menuPausa);
    continuar.focus({ preventScroll: true });
  }

  function fecharPausa(retomar = true) {
    if (!pausado) return;
    pausado = false;
    menuPausa?.remove();
    menuPausa = null;
    if (retomar) {
      motor?.pausar(false);
      controles.habilitar(true);
    }
  }

  /* ----------------------------- clímax ----------------------------- */

  async function climax() {
    if (!motor || !efeitos || emClimax) return;
    emClimax = true;
    const m = motor;
    const fx = efeitos;
    controles.habilitar(false);
    controles.mostrarInteracao(false);
    m.bloquear(true);
    el.classList.add('em-climax');
    if (musica) audio.pararMusica(2500);
    else audio.pararAmbiente(2500);

    let pulou = false;
    let fimDado = false;
    const t0 = performance.now();
    const pular = () => {
      if (performance.now() - t0 < 2000 || pulou) return;
      pulou = true;
      void trovao();
    };
    depois(2000, () => pularClimax.classList.add('visivel'));
    el.addEventListener('pointerup', pular);
    const tecla = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') pular(); };
    window.addEventListener('keydown', tecla);

    /** O estrondo interrompe a voz: tremor, clarão branco e fade para o preto. */
    async function trovao() {
      if (fimDado) return;
      fimDado = true;
      el.removeEventListener('pointerup', pular);
      window.removeEventListener('keydown', tecla);
      pularClimax.classList.remove('visivel');
      audio.sfx('thunder');
      m.tremer(700, 0.012);
      clarao.classList.add('branco');
      await esperar(650);
      if (saiu) return;
      caixa.fechar();
      clarao.classList.add('preto');
      await esperar(1300);
      if (saiu) return;
      concluirSonho();
      void irPara('despertar', undefined, { som: false, duracao: 0 });
    }

    // 1. O herói para no centro do altar, virado para baixo.
    const altar = MAPA.pontos?.altar ?? { x: m.posicao().x, y: m.posicao().y };
    await m.andarAte(altar.x, altar.y, 700);
    m.virar('baixo');
    if (pulou || saiu) return;
    // 2. As sete estátuas acendem ao mesmo tempo.
    fx.maximo();
    await esperar(500);
    if (pulou || saiu) return;
    // 3–4. Os feixes convergem no herói; acorde coral; zoom lento.
    fx.iniciarFeixes(1600);
    audio.sfx('divine-chord');
    m.zoomPara(1.7, 5000);
    await esperar(1700);
    if (pulou || saiu) return;
    // 5. "O escolhido…", mais devagar.
    caixa.mostrar({ texto: T.escolhido, cor: '#ffd25a', velocidade: 7, interativa: false });
    await esperar(3200);
    if (pulou || saiu) return;
    // 6. Antes de a frase continuar: o trovão.
    void trovao();
  }

  /* ----------------------------- montagem ----------------------------- */

  function ganchosDeTeste() {
    if (!parametros().has('test')) return;
    (window as unknown as { __fdg: unknown }).__fdg = {
      teleport(id: string) {
        if (!motor) return false;
        if (id === 'altar') {
          const a = MAPA.pontos!.altar;
          motor.teleportar(a.x, a.y + 30, 'cima');
          return true;
        }
        const i = MAPA.interacoes.find((x) => x.id === id);
        if (!i) return false;
        motor.teleportar(i.x, i.y, 'cima');
        return true;
      },
      interact: () => interagir(),
      fecharFala: () => caixa.aberta && caixa.fechar(),
      state: () => ({
        pronto: motor !== null,
        heroi: motor?.posicao() ?? null,
        proximo: motor?.proximo() ?? null,
        ouvidas: [...getEstado().sonho.ouvidas],
        concluido: getEstado().sonho.concluido,
        falaAberta: caixa.aberta,
        climax: emClimax,
        feixes: efeitos?.feixesAtivos ?? 0,
        pausado,
      }),
    };
  }

  async function montar() {
    void audio.carregarEfeitos(SFX_SONHO);
    const raca = p?.raca ?? 'arake';
    const genero = p?.genero ?? 'm';
    const [{ criarMotor }, { EfeitosSonho }, temSprite, faixa] = await Promise.all([
      import('../exploracao/motor'),
      import('../exploracao/efeitosSonho'),
      existeAsset(ASSETS.spriteChibi(raca, genero), 'image'),
      musicaDoSonho(),
    ]);
    if (saiu) return;
    musica = faixa;
    const debug = parametros().has('debug');
    const m = await criarMotor({
      container: palco,
      mapa: MAPA,
      imagemUrl: src(MAPA.imagem),
      heroi: { raca, genero, spriteUrl: temSprite ? urlAsset(ASSETS.spriteChibi(raca, genero)) : null },
      entrada: () => controles.vetor(),
      debugPermitido: import.meta.env.DEV || debug,
      debugInicial: debug,
      aoProximidade,
      aoEntrarGatilho,
      aoPasso: () => audio.sfx('step-marble', { taxa: 0.85 + Math.random() * 0.3, ganho: 0.55 }),
      aoCriar: (mm) => {
        efeitos = new EfeitosSonho(mm.cena, mm.heroi, MAPA.estatuas, MAPA.pontos!.altar);
        // Ao retomar um save, as estátuas já ouvidas continuam acesas.
        for (const id of getEstado().sonho.ouvidas) efeitos.acender(id);
        if (getEstado().sonho.ouvidas.length === TOTAL) efeitos.altarPronto();
      },
    });
    if (saiu) return m.destruir();
    motor = m;
    el.classList.add('pronto');
    if (musica) audio.tocarMusica(musica, 2000);
    else audio.tocarAmbiente(2000);
    depois(6000, () => dica.classList.add('some'));
    ganchosDeTeste();
  }

  return {
    el,
    aoEntrar() {
      montar().catch((erro) => {
        console.error('O sonho não carregou.', erro);
        carregando.textContent = String(erro);
      });
    },
    aoSair() {
      saiu = true;
      timers.forEach(clearTimeout);
      controles.destruir();
      caixa.destruir();
      menuPausa?.remove();
      efeitos?.destruir();
      motor?.destruir();
      motor = null;
      audio.pararAmbiente(800);
      if (musica) audio.pararMusica(800);
      delete (window as unknown as { __fdg?: unknown }).__fdg;
    },
  };
}
