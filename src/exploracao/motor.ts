import Phaser from 'phaser';
import type { Genero } from '../core/assets';
import { h } from '../core/ui';
import { COLUNAS, QUADRO, desenharFolhaChibi } from './chibi';
import { PES, dentroDoPoligono, encontrarCaminho, pesLivres, pontoLivreMaisProximo } from './geometria';
import { caixaDoContorno, mascaraRecorte } from './recorte';
import { DIRECOES, type DadosMapa, type Direcao } from './tipos';

/**
 * Motor de exploração reutilizável (Phaser 3): mapa de fundo, herói andando em 4 direções, colisões por
 * polígonos, áreas de interação, gatilhos, câmera presa ao mapa e modo de ajuste (F2 / ?debug=1).
 * Cada mapa é só um JSON (src/data/mapas/*.json); o que é específico da cena (estátuas, clímax…) fica
 * em quem usa o motor, pelos callbacks.
 */

export interface OpcoesMotor {
  container: HTMLElement;
  mapa: DadosMapa;
  /** URL final da imagem do mapa. */
  imagemUrl: string;
  heroi: { raca: string; genero: Genero; spriteUrl: string | null };
  /** Direção desejada pelo jogador (módulo até 1). */
  entrada: () => { x: number; y: number };
  /** Pode ligar o modo de ajuste com F2? */
  debugPermitido: boolean;
  debugInicial: boolean;
  /** Quantas alturas de tela o mapa ocupa (o zoom se ajusta a isso). */
  alturasDeTela?: number;
  /** Imagens a mais para carregar junto do mapa (folhas de moradores, ícones de itens). */
  extras?: { chave: string; url: string; tipo: 'folha' | 'imagem' }[];
  /** Começa aqui em vez do `inicio` do mapa (posição salva, saída de outro mapa). */
  inicio?: { x: number; y: number; direcao?: Direcao };
  aoProximidade?: (id: string | null) => void;
  aoEntrarGatilho?: (id: string) => void;
  aoSairGatilho?: (id: string) => void;
  /** A cada passo da animação (som de passo). */
  aoPasso?: () => void;
  /** Chamado uma vez, com a cena pronta (para a cena específica criar seus efeitos). */
  aoCriar?: (motor: Motor) => void;
  aoAtualizar?: (dtMs: number) => void;
}

export interface Motor {
  cena: Phaser.Scene;
  heroi: Phaser.GameObjects.Sprite;
  /** Bloqueia o controle do jogador (diálogos, clímax). */
  bloquear(sim: boolean): void;
  teleportar(x: number, y: number, direcao?: Direcao): void;
  virar(direcao: Direcao): void;
  andarAte(x: number, y: number, ms: number): Promise<void>;
  /**
   * Anda sozinho até (x, y) na velocidade normal, com a animação de caminhada, desviando das colisões
   * (caminho calculado na malha andável). Resolve ao chegar; false se não houver caminho.
   */
  caminharAte(x: number, y: number): Promise<boolean>;
  /** Para toda caminhada por script e tween do herói (ao voltar de uma cena, por exemplo). */
  pararMovimento(): void;
  /** Religa a câmera ao sprite atual do herói e centraliza nele. */
  seguirCamera(): void;
  /** Herói fora dos limites do mapa ou com os pés numa colisão. */
  foraDaArea(): boolean;
  /** Ponto andável mais próximo do herói (ou o início do mapa, se não achar nenhum por perto). */
  pontoSeguro(): { x: number; y: number };
  /** Fade rápido da câmera (escurece, chama `meio`, clareia). */
  piscar(meio: () => void, ms?: number): Promise<void>;
  /** O controle do jogador está bloqueado (diálogo, clímax) ou o herói anda por script? */
  travado(): boolean;
  /** Id do recorte que está cobrindo o herói agora (ele está atrás dele), ou null. */
  atrasDe(): string | null;
  posicao(): { x: number; y: number; direcao: Direcao };
  proximo(): string | null;
  /** Multiplica o zoom base (1 = normal), suavemente. */
  zoomPara(fator: number, ms: number): void;
  tremer(ms: number, intensidade: number): void;
  pausar(sim: boolean): void;
  alternarDebug(): void;
  destruir(): void;
}

const VELOCIDADE = 150; // px do mapa por segundo

/**
 * Profundidade (ordem de desenho). Tudo o que fica "em pé" no mapa usa o próprio y como profundidade
 * (o herói, pelo y dos pés; os recortes, pelo y da base): quem está mais abaixo na tela fica na frente.
 */
export const PROF = {
  mapa: -100_000,
  luzChao: -50_000,
  /** Camadas acima de tudo o que está no mapa (neblina da frente, feixes, depuração). */
  neblinaFrente: 200_000,
  feixes: 300_000,
  debug: 1_000_000,
} as const;
const CHAVE_FOLHA = 'heroi';

export function criarMotor(o: OpcoesMotor): Promise<Motor> {
  return new Promise((resolver) => {
    const { mapa } = o;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let fatorZoom = 1;
    let bloqueado = false;
    let direcao: Direcao = mapa.inicio.direcao;
    let proximo: string | null = null;
    const dentroDe = new Set<string>();
    let debugLigado = o.debugInicial;
    let movendoPorScript = false;
    let destruido = false;

    const rotuloDebug = h('div', { class: 'debug-coords', hidden: !debugLigado });
    o.container.append(rotuloDebug);

    const zoomBase = () => {
      const w = o.container.clientWidth || window.innerWidth;
      const hgt = o.container.clientHeight || window.innerHeight;
      const alvo = Math.max(((o.alturasDeTela ?? 1.75) * hgt) / mapa.altura, w / mapa.largura);
      return Phaser.Math.Clamp(alvo, 0.7, 3);
    };

    let heroi!: Phaser.GameObjects.Sprite;
    const recortes: { id: string; base: number; img: Phaser.GameObjects.Image }[] = [];
    let gDebug!: Phaser.GameObjects.Graphics;
    let gPes!: Phaser.GameObjects.Graphics;
    let motor!: Motor;

    const animar = (andando: boolean) => {
      if (andando) heroi.anims.play(`andar-${direcao}`, true);
      else {
        heroi.anims.stop();
        heroi.setFrame(DIRECOES.indexOf(direcao) * COLUNAS);
      }
    };

    const desenharDebug = () => {
      gDebug.clear();
      if (!debugLigado) return;
      for (const c of mapa.colisoes) {
        const cor = c.tipo === 'andavel' ? 0x00e05a : 0xff2030;
        gDebug.fillStyle(cor, 0.18).lineStyle(2, cor, 0.9);
        gDebug.fillPoints(c.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        gDebug.strokePoints(c.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
      }
      for (const g of mapa.gatilhos) {
        gDebug.fillStyle(0xffe000, 0.25).lineStyle(2, 0xffe000, 1);
        gDebug.fillPoints(g.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        gDebug.strokePoints(g.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
      }
      for (const i of mapa.interacoes) {
        gDebug.fillStyle(0x00d0ff, 0.2).lineStyle(2, 0x00d0ff, 1);
        gDebug.fillCircle(i.x, i.y, i.raio).strokeCircle(i.x, i.y, i.raio);
      }
      // Recortes de profundidade: contorno em magenta e a linha da base.
      for (const oc of mapa.oclusores ?? []) {
        gDebug.lineStyle(1.5, 0xff40ff, 0.9);
        gDebug.strokePoints(oc.contorno.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        if (oc.base < mapa.altura) {
          const xs = oc.contorno.map((p) => p[0]);
          gDebug.lineStyle(1, 0xff40ff, 0.6).lineBetween(Math.min(...xs), oc.base, Math.max(...xs), oc.base);
        }
      }
    };

    const atualizarRotulo = (extra = '') => {
      if (!debugLigado) return;
      rotuloDebug.textContent = `herói ${Math.round(heroi.x)}, ${Math.round(heroi.y)}${extra}`;
    };

    /** Proximidade e gatilhos, avaliados a cada quadro. */
    const avaliarAreas = () => {
      let maisPerto: string | null = null;
      let menor = Infinity;
      for (const a of mapa.interacoes) {
        const d = Math.hypot(heroi.x - a.x, heroi.y - a.y);
        if (d <= a.raio && d < menor) { menor = d; maisPerto = a.id; }
      }
      if (maisPerto !== proximo) {
        proximo = maisPerto;
        o.aoProximidade?.(proximo);
      }
      for (const g of mapa.gatilhos) {
        const dentro = dentroDoPoligono(heroi.x, heroi.y, g.pontos);
        if (dentro && !dentroDe.has(g.id)) { dentroDe.add(g.id); o.aoEntrarGatilho?.(g.id); }
        else if (!dentro && dentroDe.has(g.id)) { dentroDe.delete(g.id); o.aoSairGatilho?.(g.id); }
      }
    };

    class CenaExploracao extends Phaser.Scene {
      constructor() {
        super('exploracao');
      }

      preload() {
        this.load.image('mapa', o.imagemUrl);
        if (o.heroi.spriteUrl) this.load.spritesheet(CHAVE_FOLHA, o.heroi.spriteUrl, { frameWidth: QUADRO, frameHeight: QUADRO });
        for (const e of o.extras ?? []) {
          if (e.tipo === 'folha') this.load.spritesheet(e.chave, e.url, { frameWidth: QUADRO, frameHeight: QUADRO });
          else this.load.image(e.chave, e.url);
        }
      }

      create() {
        this.add.image(0, 0, 'mapa').setOrigin(0).setDepth(PROF.mapa);
        criarRecortes(this);

        // Sem sprite real (ou se ele falhar): o boneco desenhado por código.
        if (!this.textures.exists(CHAVE_FOLHA)) {
          const tex = this.textures.addCanvas(CHAVE_FOLHA, desenharFolhaChibi(o.heroi.raca, o.heroi.genero))!;
          for (let i = 0; i < COLUNAS * 4; i++) tex.add(i, 0, (i % COLUNAS) * QUADRO, Math.floor(i / COLUNAS) * QUADRO, QUADRO, QUADRO);
        }
        DIRECOES.forEach((d, linha) => {
          this.anims.create({
            key: `andar-${d}`,
            frames: this.anims.generateFrameNumbers(CHAVE_FOLHA, { start: linha * COLUNAS, end: linha * COLUNAS + COLUNAS - 1 }),
            frameRate: 7,
            repeat: -1,
          });
        });

        if (o.inicio?.direcao) direcao = o.inicio.direcao;
        heroi = this.add.sprite(o.inicio?.x ?? mapa.inicio.x, o.inicio?.y ?? mapa.inicio.y, CHAVE_FOLHA, DIRECOES.indexOf(direcao) * COLUNAS);
        heroi.setOrigin(0.5, 46 / QUADRO).setDepth(heroi.y);
        heroi.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, quadro: Phaser.Animations.AnimationFrame) => {
          if (quadro.index === 2 || quadro.index === 4) o.aoPasso?.();
        });

        const cam = this.cameras.main;
        cam.setBounds(0, 0, mapa.largura, mapa.altura);
        cam.setZoom(zoomBase() * dpr);
        cam.startFollow(heroi, false, 0.12, 0.12);
        cam.centerOn(heroi.x, heroi.y);

        gDebug = this.add.graphics().setDepth(PROF.debug);
        gPes = this.add.graphics().setDepth(PROF.debug + 1);
        desenharDebug();

        // No modo de ajuste, um toque/clique mostra as coordenadas do mapa naquele ponto.
        this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
          if (!debugLigado) return;
          const texto = ` · ponto ${Math.round(p.worldX)}, ${Math.round(p.worldY)}`;
          atualizarRotulo(texto);
          console.info(`[mapa ${mapa.id}]${texto}`);
        });

        motor = {
          cena: this,
          heroi,
          bloquear(sim) {
            bloqueado = sim;
            if (sim && !movendoPorScript) animar(false);
          },
          teleportar(x, y, dir) {
            heroi.setPosition(x, y);
            if (dir) direcao = dir;
            animar(false);
            cam.centerOn(x, y);
          },
          virar(dir) {
            direcao = dir;
            animar(false);
          },
          andarAte: (x, y, ms) => new Promise((ok) => {
            const dx = x - heroi.x;
            const dy = y - heroi.y;
            if (Math.hypot(dx, dy) < 2) return ok();
            direcao = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo';
            movendoPorScript = true;
            animar(true);
            this.tweens.add({
              targets: heroi, x, y, duration: ms, ease: 'Sine.easeInOut',
              onComplete: () => { movendoPorScript = false; animar(false); ok(); },
            });
          }),
          caminharAte: async (x, y) => {
            const caminho = encontrarCaminho(mapa.colisoes, mapa.largura, mapa.altura, { x: heroi.x, y: heroi.y }, { x, y });
            if (!caminho) return false;
            movendoPorScript = true;
            for (const p of caminho) {
              if (destruido) return false;
              await new Promise<void>((ok) => {
                const dx = p.x - heroi.x;
                const dy = p.y - heroi.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 1) return ok();
                direcao = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo';
                heroi.anims.timeScale = 1;
                animar(true);
                this.tweens.add({ targets: heroi, x: p.x, y: p.y, duration: (dist / VELOCIDADE) * 1000, ease: 'Linear', onComplete: () => ok() });
              });
            }
            movendoPorScript = false;
            animar(false);
            return true;
          },
          pararMovimento: () => {
            this.tweens.killTweensOf(heroi);
            movendoPorScript = false;
            animar(false);
          },
          seguirCamera: () => {
            cam.stopFollow();
            cam.startFollow(heroi, false, 0.12, 0.12);
            cam.centerOn(heroi.x, heroi.y);
          },
          foraDaArea: () => heroi.x < 0 || heroi.y < 0 || heroi.x > mapa.largura || heroi.y > mapa.altura || !pesLivres(mapa.colisoes, heroi.x, heroi.y),
          pontoSeguro: () => pontoLivreMaisProximo(mapa.colisoes, mapa.largura, mapa.altura, { x: heroi.x, y: heroi.y }) ?? { x: mapa.inicio.x, y: mapa.inicio.y },
          piscar: (meio, ms = 140) => new Promise<void>((ok) => {
            // Cena pausada (menu aberto): o fade não andaria; faz o "meio" na hora.
            if (!this.scene.isActive()) { meio(); return ok(); }
            cam.fadeOut(ms, 0, 0, 0);
            cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
              meio();
              cam.fadeIn(ms, 0, 0, 0);
              ok();
            });
          }),
          travado: () => bloqueado || movendoPorScript,
          atrasDe: () => {
            const b = heroi.getBounds();
            const r = recortes.find((rc) => rc.base > heroi.y && Phaser.Geom.Intersects.RectangleToRectangle(b, rc.img.getBounds()) && cobre(rc.id, b));
            return r?.id ?? null;
          },
          posicao: () => ({ x: heroi.x, y: heroi.y, direcao }),
          proximo: () => proximo,
          zoomPara(fator, ms) {
            fatorZoom = fator;
            cam.zoomTo(zoomBase() * dpr * fator, ms, 'Sine.easeInOut');
          },
          tremer(ms, intensidade) {
            cam.shake(ms, intensidade);
          },
          pausar: (sim) => {
            if (sim) { this.scene.pause(); animar(false); }
            else this.scene.resume();
          },
          alternarDebug() {
            if (!o.debugPermitido) return;
            debugLigado = !debugLigado;
            rotuloDebug.hidden = !debugLigado;
            desenharDebug();
            gPes.clear();
          },
          destruir: () => destruir(),
        };
        o.aoCriar?.(motor);
        resolver(motor);
      }

      update(_t: number, delta: number) {
        // Até 100 ms por quadro: em aparelhos lentos o herói não fica mais devagar (e ainda não atravessa paredes).
        const dt = Math.min(delta, 100) / 1000;
        if (!bloqueado && !movendoPorScript) {
          const v = o.entrada();
          const forca = Math.hypot(v.x, v.y);
          if (forca > 0.05) {
            direcao = Math.abs(v.x) > Math.abs(v.y) ? (v.x < 0 ? 'esquerda' : 'direita') : v.y < 0 ? 'cima' : 'baixo';
            const dx = v.x * VELOCIDADE * dt;
            const dy = v.y * VELOCIDADE * dt;
            const camadas = mapa.colisoes;
            // Tenta o movimento inteiro; se bater, desliza no eixo que estiver livre.
            if (pesLivres(camadas, heroi.x + dx, heroi.y + dy)) heroi.setPosition(heroi.x + dx, heroi.y + dy);
            else if (dx && pesLivres(camadas, heroi.x + dx, heroi.y)) heroi.x += dx;
            else if (dy && pesLivres(camadas, heroi.x, heroi.y + dy)) heroi.y += dy;
            animar(true);
            heroi.anims.timeScale = Math.max(0.6, forca);
          } else {
            animar(false);
          }
        }
        heroi.setDepth(heroi.y);
        avaliarAreas();
        if (debugLigado) {
          gPes.clear().lineStyle(2, 0xff00ff, 1).strokeEllipse(heroi.x, heroi.y, PES.rx * 2, PES.ry * 2);
          if (!rotuloDebug.textContent?.includes('ponto')) atualizarRotulo();
        }
        o.aoAtualizar?.(delta);
      }
    }

    /** Recorta do próprio mapa as partes que devem passar na frente do herói (estátuas, balaustrada). */
    const mascaras = new Map<string, { m: Uint8Array; x0: number; y0: number; w: number }>();
    function criarRecortes(cena: Phaser.Scene) {
      const fonte = cena.textures.get('mapa').getSourceImage() as CanvasImageSource;
      for (const oc of mapa.oclusores ?? []) {
        const c = caixaDoContorno(oc.contorno, mapa.largura, mapa.altura);
        const canvas = document.createElement('canvas');
        canvas.width = c.largura;
        canvas.height = c.altura;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(fonte, c.x0, c.y0, c.largura, c.altura, 0, 0, c.largura, c.altura);
        const dados = ctx.getImageData(0, 0, c.largura, c.altura);
        const m = mascaraRecorte({ rgba: dados.data, ...c, contorno: oc.contorno, sementes: oc.sementes, fixo: oc.fixo, limiar: oc.limiar });
        for (let p = 0; p < m.length; p++) if (!m[p]) dados.data[p * 4 + 3] = 0;
        ctx.putImageData(dados, 0, 0);
        const chave = `recorte-${oc.id}`;
        if (cena.textures.exists(chave)) cena.textures.remove(chave);
        cena.textures.addCanvas(chave, canvas);
        const img = cena.add.image(c.x0, c.y0, chave).setOrigin(0).setDepth(oc.base);
        recortes.push({ id: oc.id, base: oc.base, img });
        mascaras.set(oc.id, { m, x0: c.x0, y0: c.y0, w: c.largura });
      }
    }

    /** Algum pixel do recorte cai dentro da caixa do herói? (amostra a cada 2 px) */
    function cobre(id: string, b: Phaser.Geom.Rectangle) {
      const k = mascaras.get(id);
      if (!k) return false;
      const alt = k.m.length / k.w;
      for (let y = Math.max(0, Math.floor(b.top - k.y0)); y < Math.min(alt, b.bottom - k.y0); y += 2)
        for (let x = Math.max(0, Math.floor(b.left - k.x0)); x < Math.min(k.w, b.right - k.x0); x += 2)
          if (k.m[y * k.w + x]) return true;
      return false;
    }

    const largura = () => Math.max(1, o.container.clientWidth);
    const altura = () => Math.max(1, o.container.clientHeight);
    const jogo = new Phaser.Game({
      type: Phaser.AUTO,
      parent: o.container,
      width: Math.round(largura() * dpr),
      height: Math.round(altura() * dpr),
      backgroundColor: '#0b1020',
      banner: false,
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
      audio: { noAudio: true },
      input: { keyboard: false, gamepad: false },
      render: { antialias: true, powerPreference: 'high-performance' },
      scene: CenaExploracao,
    });

    // Acompanha o tamanho do container (girar o celular, teclado, redimensionar a janela).
    const observador = new ResizeObserver(() => {
      if (destruido) return;
      jogo.scale.resize(Math.round(largura() * dpr), Math.round(altura() * dpr));
      jogo.scale.setZoom(1 / dpr);
      const cam = jogo.scene.getScene('exploracao')?.cameras?.main;
      if (cam) cam.setZoom(zoomBase() * dpr * fatorZoom);
    });
    observador.observe(o.container);

    const teclaF2 = (e: KeyboardEvent) => {
      if (e.key === 'F2' && motor) {
        e.preventDefault();
        motor.alternarDebug();
      }
    };
    window.addEventListener('keydown', teclaF2);

    function destruir() {
      if (destruido) return;
      destruido = true;
      observador.disconnect();
      window.removeEventListener('keydown', teclaF2);
      rotuloDebug.remove();
      jogo.destroy(true);
    }
  });
}
