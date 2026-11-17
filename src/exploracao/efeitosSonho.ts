import Phaser from 'phaser';

/** Efeitos de luz do sonho dos deuses: brilho das estátuas, altar, aura do herói e feixes do clímax. */

export interface EstatuaSonho {
  id: string;
  cor: string;
  /** Centro da base da plataforma (onde fica o brilho). */
  base: { x: number; y: number };
  /** Altura do peito da estátua (de onde sai o feixe). */
  foco: { x: number; y: number };
}

type Estado = 'repouso' | 'perto' | 'acesa' | 'maximo';

const TEX_LUZ = 'luz-suave';

/** Textura de luz radial branca (tingida por sprite). */
function criarTexturaLuz(cena: Phaser.Scene) {
  if (cena.textures.exists(TEX_LUZ)) return;
  const tam = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = tam;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tam, tam);
  cena.textures.addCanvas(TEX_LUZ, canvas);
}

const cor = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;

class LuzEstatua {
  readonly base: Phaser.GameObjects.Image;
  readonly pilar: Phaser.GameObjects.Image;
  private pulso: Phaser.Tweens.Tween | null = null;
  estado: Estado = 'repouso';

  constructor(private cena: Phaser.Scene, readonly dados: EstatuaSonho) {
    const tinta = cor(dados.cor);
    this.base = cena.add.image(dados.base.x, dados.base.y, TEX_LUZ)
      .setTint(tinta).setBlendMode(Phaser.BlendModes.ADD).setScale(2.1, 0.95).setDepth(5).setAlpha(0);
    this.pilar = cena.add.image(dados.foco.x, (dados.foco.y + dados.base.y) / 2, TEX_LUZ)
      .setTint(tinta).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5, 2.6).setDepth(5).setAlpha(0);
    this.definir('repouso');
  }

  /** Pulsa entre dois níveis de alfa. */
  private pulsar(de: number, ate: number, ms: number) {
    this.pulso?.remove();
    this.base.setAlpha(de);
    this.pulso = this.cena.tweens.add({ targets: this.base, alpha: ate, duration: ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  definir(estado: Estado) {
    // Uma estátua acesa não volta a apagar ao se afastar.
    if (this.estado === 'acesa' && (estado === 'repouso' || estado === 'perto')) return;
    if (this.estado === 'maximo') return;
    this.estado = estado;
    switch (estado) {
      case 'repouso':
        this.pulsar(0.1, 0.22, 1800);
        break;
      case 'perto':
        this.pulsar(0.45, 0.8, 650);
        break;
      case 'acesa':
        this.pulsar(0.75, 0.95, 1400);
        this.cena.tweens.add({ targets: this.pilar, alpha: 0.32, duration: 600 });
        // Clarão ao acender
        this.cena.tweens.add({ targets: this.base, scaleX: 2.9, scaleY: 1.3, duration: 220, yoyo: true, ease: 'Quad.easeOut' });
        break;
      case 'maximo':
        this.pulso?.remove();
        this.cena.tweens.add({ targets: this.base, alpha: 1, scaleX: 3, scaleY: 1.35, duration: 500 });
        this.cena.tweens.add({ targets: this.pilar, alpha: 0.7, scaleX: 2, scaleY: 3.2, duration: 500 });
        break;
    }
  }
}

export class EfeitosSonho {
  private luzes = new Map<string, LuzEstatua>();
  private aura: Phaser.GameObjects.Image;
  private altar: Phaser.GameObjects.Image | null = null;
  private feixes: Phaser.GameObjects.Graphics;
  private feixesInicio = -1;
  private feixesDuracao = 1500;

  constructor(private cena: Phaser.Scene, private heroi: Phaser.GameObjects.Sprite, estatuas: EstatuaSonho[], private centroAltar: { x: number; y: number }) {
    criarTexturaLuz(cena);
    for (const e of estatuas) this.luzes.set(e.id, new LuzEstatua(cena, e));
    // Aura dourada suave e pulsante ao redor do herói (no sonho)
    this.aura = cena.add.image(heroi.x, heroi.y - 20, TEX_LUZ)
      .setTint(cor('#ffd98a')).setBlendMode(Phaser.BlendModes.ADD).setScale(0.75, 0.9).setDepth(9).setAlpha(0.35);
    cena.tweens.add({ targets: this.aura, alpha: 0.6, scaleX: 0.85, scaleY: 1, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.feixes = cena.add.graphics().setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
    cena.events.on(Phaser.Scenes.Events.UPDATE, this.atualizar, this);
  }

  perto(id: string, sim: boolean) {
    this.luzes.get(id)?.definir(sim ? 'perto' : 'repouso');
  }

  acender(id: string) {
    this.luzes.get(id)?.definir('acesa');
  }

  /** As 7 vozes foram ouvidas: o altar brilha. */
  altarPronto() {
    if (this.altar) return;
    this.altar = this.cena.add.image(this.centroAltar.x, this.centroAltar.y, TEX_LUZ)
      .setTint(cor('#ffd25a')).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 1.4).setDepth(4).setAlpha(0);
    this.cena.tweens.add({ targets: this.altar, alpha: { from: 0.35, to: 0.75 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  maximo() {
    for (const l of this.luzes.values()) l.definir('maximo');
    this.cena.tweens.add({ targets: this.aura, alpha: 0.9, scaleX: 1.2, scaleY: 1.4, duration: 800 });
  }

  /** Começa os sete feixes, crescendo das estátuas até o herói. */
  iniciarFeixes(duracaoMs: number) {
    this.feixesInicio = this.cena.time.now;
    this.feixesDuracao = duracaoMs;
  }

  private atualizar() {
    this.aura.setPosition(this.heroi.x, this.heroi.y - 20);
    if (this.feixesInicio < 0) return;
    const t = Math.min(1, (this.cena.time.now - this.feixesInicio) / this.feixesDuracao);
    const p = Phaser.Math.Easing.Sine.Out(t);
    const brilho = 0.75 + 0.25 * Math.sin(this.cena.time.now / 90);
    const alvo = { x: this.heroi.x, y: this.heroi.y - 22 };
    const g = this.feixes.clear();
    for (const l of this.luzes.values()) {
      const { foco } = l.dados;
      const x = foco.x + (alvo.x - foco.x) * p;
      const y = foco.y + (alvo.y - foco.y) * p;
      const c = cor(l.dados.cor);
      // Três passadas: halo largo, corpo e núcleo claro
      g.lineStyle(18, c, 0.16 * brilho).lineBetween(foco.x, foco.y, x, y);
      g.lineStyle(8, c, 0.45 * brilho).lineBetween(foco.x, foco.y, x, y);
      g.lineStyle(2.5, 0xffffff, 0.85 * brilho).lineBetween(foco.x, foco.y, x, y);
    }
    if (t >= 1) {
      g.fillStyle(0xfff3c4, 0.35 * brilho).fillCircle(alvo.x, alvo.y, 22);
      g.fillStyle(0xffffff, 0.55 * brilho).fillCircle(alvo.x, alvo.y, 10);
    }
  }

  /** Para testes: quantos feixes estão sendo desenhados. */
  get feixesAtivos(): number {
    return this.feixesInicio < 0 ? 0 : this.luzes.size;
  }

  destruir() {
    this.cena.events.off(Phaser.Scenes.Events.UPDATE, this.atualizar, this);
  }
}
