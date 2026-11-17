import Phaser from 'phaser';
import { PROF } from './motor';

/**
 * Clima do sonho: neblina em camadas e partículas douradas.
 *
 * - Uma camada de neblina com a densidade já embutida na textura (densa nas bordas e sobre as nuvens, bem
 *   leve sobre o anel, o altar e a escada), que balança devagar e "respira" (alfa entre 0,10 e 0,30).
 * - Uma camada fina e uniforme que passa na frente do herói e das estátuas, rolando sem parar em outra
 *   direção e velocidade.
 * Cada camada cobre a tela inteira, e no celular o custo é de preenchimento: por isso são só duas.
 * - Partículas douradas pequenas subindo devagar, só em volta da área visível, com teto de quantidade.
 * - Se o FPS cair abaixo de 45, as camadas e as partículas diminuem sozinhas.
 */

export interface OpcoesClima {
  largura: number;
  altura: number;
  /** Andável "principal" (anel): a neblina fica leve dentro dessa elipse. */
  centro: { x: number; y: number; rx: number; ry: number };
  /** Retângulos onde a neblina também fica leve (escada, por exemplo). */
  claros?: { x0: number; y0: number; x1: number; y1: number }[];
  /** Celular: menos partículas desde o início. */
  economico: boolean;
  /** Reduz a neblina sozinho se o FPS cair (desligado nos testes, que rodam sem GPU). */
  vigiarFps?: boolean;
}

const TEX_PONTO = 'clima-ponto';
const TEX_FRENTE = 'clima-neblina-frente';

/** Ruído suave (value noise com várias oitavas), opcionalmente periódico (para virar ladrilho). */
function criarRuido(semente: number, periodo: number) {
  const n = periodo;
  const tabela = new Float32Array(n * n);
  let s = semente >>> 0;
  for (let i = 0; i < tabela.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    tabela[i] = s / 4294967296;
  }
  const v = (x: number, y: number) => tabela[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  const suave = (t: number) => t * t * (3 - 2 * t);
  const base = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = suave(x - xi), fy = suave(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  // x, y em "células" do ruído (0..periodo); 3 oitavas.
  return (x: number, y: number) => (base(x, y) * 0.57 + base(x * 2, y * 2) * 0.29 + base(x * 4, y * 4) * 0.14);
}

const suaveEntre = (a: number, b: number, t: number) => {
  const k = Phaser.Math.Clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

export class ClimaSonho {
  private camadas: { img: Phaser.GameObjects.Image; ax: number; ay: number; px: number; py: number; fase: number; x0: number; y0: number }[] = [];
  private frente: Phaser.GameObjects.TileSprite;
  private particulas: Phaser.GameObjects.Particles.ParticleEmitter;
  private poeira: Phaser.GameObjects.Particles.ParticleEmitter;
  private tempo = 0;
  private fpsJanela: number[] = [];
  private proximaChecagem = 5000;
  /** 0 = completo; 1 = sem a camada da frente e com metade das partículas; 2 = um quarto das partículas. */
  nivel = 0;

  constructor(private cena: Phaser.Scene, private o: OpcoesClima) {
    this.criarTexturas();
    // Camadas de fundo (densidade embutida), em 1/4 da resolução do mapa e esticadas: a neblina é macia.
    const config = [
      { semente: 11, escala: 9, ax: 34, ay: 14, px: 23_000, py: 31_000, alfa: [0.5, 0.75], dur: 7000 },
    ];
    config.forEach((c, i) => {
      const chave = `clima-neblina-${i}`;
      if (!cena.textures.exists(chave)) cena.textures.addCanvas(chave, this.texturaDensa(c.semente, c.escala));
      // Um pouco maior que o mapa, para o balanço não mostrar a borda.
      const img = cena.add.image(o.largura / 2, o.altura / 2, chave)
        .setDisplaySize(o.largura + 120, o.altura + 120)
        .setDepth(PROF.neblinaFrente - 10 + i)
        .setAlpha(c.alfa[0]);
      cena.tweens.add({ targets: img, alpha: c.alfa[1], duration: c.dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.camadas.push({ img, ax: c.ax, ay: c.ay, px: c.px, py: c.py, fase: i * 1.7, x0: img.x, y0: img.y });
    });
    // Camada fina da frente: ladrilho uniforme rolando devagar.
    this.frente = cena.add.tileSprite(0, 0, o.largura, o.altura, TEX_FRENTE)
      .setOrigin(0).setDepth(PROF.neblinaFrente).setAlpha(0.12).setTileScale(2.5);
    cena.tweens.add({ targets: this.frente, alpha: 0.2, duration: 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Partículas douradas subindo, nascendo só perto da área visível.
    const cam = cena.cameras.main;
    const zona = {
      getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
        const v = cam.worldView;
        p.x = v.x + Math.random() * v.width;
        p.y = v.y + v.height * (0.15 + Math.random() * 0.95);
        return p;
      },
    };
    this.particulas = cena.add.particles(0, 0, TEX_PONTO, {
      emitZone: { type: 'random', source: zona as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      lifespan: { min: 5000, max: 9000 },
      speedY: { min: -16, max: -6 },
      speedX: { min: -5, max: 5 },
      scale: { start: 0.55, end: 0.15 },
      alpha: { values: [0, 0.85, 0.6, 0] },
      tint: [0xffe7a0, 0xffd25a, 0xfff3c4],
      blendMode: Phaser.BlendModes.ADD,
      frequency: o.economico ? 320 : 200,
      maxAliveParticles: o.economico ? 26 : 44,
    }).setDepth(PROF.neblinaFrente + 5);

    // Poeira dourada que cai do alto da tela nos tremores (só em rajadas).
    const zonaTopo = {
      getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
        const v = cam.worldView;
        p.x = v.x + Math.random() * v.width;
        p.y = v.y - 4 + Math.random() * v.height * 0.1;
        return p;
      },
    };
    this.poeira = cena.add.particles(0, 0, TEX_PONTO, {
      emitZone: { type: 'random', source: zonaTopo as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      lifespan: { min: 1400, max: 2400 },
      speedY: { min: 30, max: 70 },
      speedX: { min: -10, max: 10 },
      gravityY: 40,
      scale: { start: 0.45, end: 0.2 },
      alpha: { values: [0, 0.9, 0.7, 0] },
      tint: [0xffd25a, 0xe8c27a],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      maxAliveParticles: 40,
    }).setDepth(PROF.neblinaFrente + 6);

    cena.events.on(Phaser.Scenes.Events.UPDATE, this.atualizar, this);
  }

  /** Rajada de poeira dourada caindo do alto (tremor). */
  derrubarPoeira(qtd = 14) {
    this.poeira.explode(this.nivel >= 2 ? Math.ceil(qtd / 2) : qtd);
  }

  get camadasVisiveis(): number {
    return this.camadas.filter((c) => c.img.visible).length + (this.frente.visible ? 1 : 0);
  }

  private criarTexturas() {
    const cena = this.cena;
    if (!cena.textures.exists(TEX_PONTO)) {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 16);
      cena.textures.addCanvas(TEX_PONTO, c);
    }
    if (!cena.textures.exists(TEX_FRENTE)) {
      // Ladrilho periódico de 128 px (sem emenda ao repetir).
      const tam = 128, periodo = 8;
      const ruido = criarRuido(97, periodo);
      const c = document.createElement('canvas');
      c.width = c.height = tam;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(tam, tam);
      for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
        const v = ruido((x / tam) * periodo, (y / tam) * periodo);
        const a = 0.25 + 0.75 * suaveEntre(0.3, 0.8, v);
        const i = (y * tam + x) * 4;
        img.data[i] = 226; img.data[i + 1] = 222; img.data[i + 2] = 250; img.data[i + 3] = Math.round(a * 255);
      }
      ctx.putImageData(img, 0, 0);
      cena.textures.addCanvas(TEX_FRENTE, c);
    }
  }

  /** Neblina com a densidade do mapa embutida: forte nas bordas, leve no caminho. */
  private texturaDensa(semente: number, escala: number): HTMLCanvasElement {
    const { largura, altura, centro, claros = [] } = this.o;
    const w = Math.ceil((largura + 120) / 4), hh = Math.ceil((altura + 120) / 4);
    const ruido = criarRuido(semente, 64);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const mx = x * 4 - 60, my = y * 4 - 60;
      const r = Math.hypot((mx - centro.x) / centro.rx, (my - centro.y) / centro.ry);
      let dens = 0.3 + 0.7 * suaveEntre(0.72, 1.1, r);
      for (const q of claros) if (mx >= q.x0 && mx <= q.x1 && my >= q.y0 && my <= q.y1) dens = Math.min(dens, 0.35);
      const v = ruido((x / w) * escala, (y / hh) * escala);
      const a = dens * (0.35 + 0.65 * suaveEntre(0.25, 0.85, v));
      const i = (y * w + x) * 4;
      img.data[i] = 214; img.data[i + 1] = 212; img.data[i + 2] = 246; img.data[i + 3] = Math.round(a * 0.42 * 255);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  private atualizar(_t: number, delta: number) {
    this.tempo += delta;
    for (const c of this.camadas) {
      c.img.x = c.x0 + Math.sin(this.tempo / c.px * Math.PI * 2 + c.fase) * c.ax;
      c.img.y = c.y0 + Math.cos(this.tempo / c.py * Math.PI * 2 + c.fase) * c.ay;
    }
    this.frente.tilePositionX += delta * 0.006;
    this.frente.tilePositionY -= delta * 0.0025;
    if (this.o.vigiarFps !== false) this.vigiarFps();
  }

  /** Se o FPS médio cair abaixo de 45, tira uma camada e corta as partículas. */
  private vigiarFps() {
    const fps = this.cena.game.loop.actualFps;
    this.fpsJanela.push(fps);
    if (this.fpsJanela.length > 120) this.fpsJanela.shift();
    if (this.tempo < this.proximaChecagem || this.nivel >= 2) return;
    this.proximaChecagem = this.tempo + 4000;
    const media = this.fpsJanela.reduce((a, b) => a + b, 0) / this.fpsJanela.length;
    if (media >= 45) return;
    this.reduzir();
  }

  /** Um degrau a menos de clima (também usado pelos testes). */
  reduzir() {
    if (this.nivel >= 2) return;
    this.nivel++;
    // A camada de densidade (bordas) fica sempre: a neblina nunca some de todo.
    if (this.nivel === 1) this.frente.setVisible(false);
    this.particulas.maxAliveParticles = Math.ceil(this.particulas.maxAliveParticles / 2);
    console.info(`[clima] FPS baixo: nível de neblina reduzido para ${this.nivel}.`);
  }

  destruir() {
    this.cena.events.off(Phaser.Scenes.Events.UPDATE, this.atualizar, this);
  }
}
