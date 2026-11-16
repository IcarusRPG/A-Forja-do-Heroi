import { ASSETS, SFX, src, type NomeSfx } from './assets';
import { getEstado } from './estado';

/**
 * Gerenciador de áudio único do jogo.
 * - Música: um só HTMLAudioElement (streaming, loop), que sobrevive às trocas de tela.
 *   Pedir a mesma faixa que já está tocando não a reinicia.
 * - Efeitos: Web Audio (buffers decodificados no pré-carregamento, com um nó de ganho).
 * Volume e mudo vêm das Opções (estado.config).
 */
class GerenciadorAudio {
  private ctx: AudioContext | null = null;
  private ganhoSfx: GainNode | null = null;
  private buffers = new Map<NomeSfx, AudioBuffer>();
  private musica = new Audio();
  private faixaAtual: string | null = null;
  /** Fator do fade (0 a 1), multiplicado pelo volume das Opções. */
  private fator = 0;
  private querTocando = false;
  private animFade = 0;
  private ultimoHover = 0;
  private videos = new Set<HTMLMediaElement>();

  constructor() {
    this.musica.loop = true;
    this.musica.preload = 'auto';
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.musica.pause();
      else if (this.querTocando) this.musica.play().catch(() => {});
    });
  }

  private contexto(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.ganhoSfx = this.ctx.createGain();
    this.ganhoSfx.connect(this.ctx.destination);
    this.aplicarVolumes();
    return this.ctx;
  }

  /** Decodifica os efeitos (chamado durante o pré-carregamento). */
  async carregarEfeitos(): Promise<void> {
    const ctx = this.contexto();
    if (!ctx) return;
    await Promise.all(
      SFX.map(async (nome) => {
        try {
          const dados = await (await fetch(src(ASSETS.sfx(nome)))).arrayBuffer();
          this.buffers.set(nome, await ctx.decodeAudioData(dados));
        } catch (erro) {
          console.warn(`Efeito não carregado: ${nome}`, erro);
        }
      }),
    );
  }

  /**
   * Chamado no clique "Clique para começar": libera o áudio do navegador.
   * Não contorna o bloqueio de autoplay, só aproveita o gesto do jogador.
   */
  desbloquear(): void {
    this.contexto()?.resume().catch(() => {});
    // iOS: um play() dentro do gesto libera o elemento para tocar depois, fora de gestos.
    if (!this.faixaAtual) {
      this.musica.src = src(ASSETS.musicaMenu);
      this.faixaAtual = ASSETS.musicaMenu;
      this.musica.muted = true;
      this.musica.play().then(() => {
        if (!this.querTocando) this.musica.pause();
        this.aplicarVolumes();
      }).catch(() => this.aplicarVolumes());
    }
  }

  sfx(nome: NomeSfx): void {
    const { config } = getEstado();
    if (config.mudo || config.efeitos <= 0) return;
    const ctx = this.ctx;
    const buffer = this.buffers.get(nome);
    if (!ctx || !buffer || !this.ganhoSfx || ctx.state !== 'running') return;
    if (nome === 'ui-hover') {
      const agora = performance.now();
      if (agora - this.ultimoHover < 60) return;
      this.ultimoHover = agora;
    }
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    fonte.connect(this.ganhoSfx);
    fonte.start();
  }

  /** Toca a faixa em loop com fade-in. Se ela já estiver tocando, não reinicia. */
  tocarMusica(caminho: string, fadeMs = 2000): void {
    this.querTocando = true;
    if (this.faixaAtual === caminho && !this.musica.paused && this.musica.currentTime > 0 && !this.musica.muted) {
      this.fade(1, fadeMs);
      return;
    }
    if (this.faixaAtual !== caminho) {
      this.musica.src = src(caminho);
      this.faixaAtual = caminho;
    } else if (this.musica.paused) {
      this.musica.currentTime = 0;
    }
    this.fator = 0;
    this.aplicarVolumes();
    this.musica.play().catch((erro) => console.warn('Música bloqueada pelo navegador.', erro));
    this.fade(1, fadeMs);
  }

  pararMusica(fadeMs = 1000): void {
    this.querTocando = false;
    this.fade(0, fadeMs, () => this.musica.pause());
  }

  private fade(alvo: number, ms: number, aoTerminar?: () => void): void {
    cancelAnimationFrame(this.animFade);
    const inicio = performance.now();
    const de = this.fator;
    const passo = (agora: number) => {
      const t = ms <= 0 ? 1 : Math.min(1, (agora - inicio) / ms);
      this.fator = de + (alvo - de) * t;
      this.aplicarVolumes();
      if (t < 1) this.animFade = requestAnimationFrame(passo);
      else aoTerminar?.();
    };
    this.animFade = requestAnimationFrame(passo);
  }

  /** Vídeos com som (abertura, prólogo) seguem o volume da música e o mudo. */
  registrarVideo(v: HTMLMediaElement): () => void {
    this.videos.add(v);
    this.aplicarVolumes();
    return () => this.videos.delete(v);
  }

  aplicarVolumes(): void {
    const { config } = getEstado();
    this.musica.muted = config.mudo;
    this.musica.volume = Math.max(0, Math.min(1, config.musica * this.fator));
    if (this.ganhoSfx) this.ganhoSfx.gain.value = config.mudo ? 0 : config.efeitos;
    for (const v of this.videos) {
      v.muted = config.mudo;
      v.volume = config.musica;
    }
  }
}

export const audio = new GerenciadorAudio();
