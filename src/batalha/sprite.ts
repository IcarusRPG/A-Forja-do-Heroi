import { src } from '../core/assets';
import { esperar, h } from '../core/ui';

/**
 * Sprite de batalha: folha horizontal de 6 poses de mesmo tamanho (gerada por build-battle-sprites),
 * escalada sem suavização (image-rendering: pixelated), em múltiplos inteiros quando possível.
 * Os gestos do FF6 são feitos por código: avançar e voltar, piscar em branco, recuar, fugir com fade e
 * se desfazer em pixels.
 */
export interface MetaFolha {
  quadro: { largura: number; altura: number };
  base: number;
  poses: Record<string, number>;
  altura: Record<string, number>;
}

export async function carregarFolha(caminhoSemExtensao: string): Promise<{ meta: MetaFolha; url: string; largura: number; altura: number }> {
  const url = src(`${caminhoSemExtensao}.png`);
  const meta = (await (await fetch(src(`${caminhoSemExtensao}.json`))).json()) as MetaFolha;
  await new Promise<void>((ok, erro) => {
    const img = new Image();
    img.onload = () => ok();
    img.onerror = () => erro(new Error(`Folha não carregou: ${caminhoSemExtensao}`));
    img.src = url;
  });
  return { meta, url, largura: meta.quadro.largura * 6, altura: meta.quadro.altura };
}

export class SpriteBatalha {
  readonly el: HTMLElement;
  private corpo: HTMLElement;
  private escala = 1;
  pose = 'parado';

  constructor(private folha: { meta: MetaFolha; url: string; largura: number; altura: number }, classe: string, readonly lado: 'esquerda' | 'direita') {
    this.corpo = h('div', { class: 'sprite-corpo' });
    this.el = h('div', { class: `sprite-batalha ${classe}` }, this.corpo);
    this.corpo.style.backgroundImage = `url("${folha.url}")`;
    this.mudarPose('parado');
  }

  /** Escala (inteira quando possível) e tamanho do quadro na tela. */
  escalar(fator: number) {
    this.escala = fator;
    const { quadro } = this.folha.meta;
    Object.assign(this.corpo.style, {
      width: `${quadro.largura * fator}px`,
      height: `${quadro.altura * fator}px`,
      backgroundSize: `${this.folha.largura * fator}px ${this.folha.altura * fator}px`,
    });
    this.mudarPose(this.pose);
  }

  get alturaQuadro(): number {
    return this.folha.meta.quadro.altura;
  }

  get larguraQuadro(): number {
    return this.folha.meta.quadro.largura;
  }

  mudarPose(nome: string) {
    const i = this.folha.meta.poses[nome];
    if (i === undefined) return;
    this.pose = nome;
    this.el.dataset.pose = nome;
    this.corpo.style.backgroundPosition = `${-i * this.folha.meta.quadro.largura * this.escala}px 0`;
  }

  /** Respiração leve no idle (só por CSS). */
  respirar(sim: boolean) {
    this.el.classList.toggle('respirando', sim);
  }

  private animar(keyframes: Keyframe[], ms: number, easing = 'ease-out'): Promise<void> {
    const a = this.el.animate(keyframes, { duration: ms, easing, fill: 'forwards' });
    return a.finished.then(() => { a.commitStyles?.(); a.cancel(); }).catch(() => {});
  }

  /** Para a frente do inimigo (heróis vão para a esquerda; inimigos, para a direita). */
  private get frente(): number {
    return this.lado === 'direita' ? -1 : 1;
  }

  /** Ataque: avança ~20 px, troca para a pose de ataque e volta. */
  async atacar(pose: string, distancia = 20, aoBater?: () => void | Promise<void>) {
    this.respirar(false);
    const dx = this.frente * distancia * Math.max(1, this.escala / 2);
    await this.animar([{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], 160);
    this.mudarPose(pose);
    await esperar(140);
    await aoBater?.();
    await esperar(220);
    await this.animar([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], 200, 'ease-in-out');
  }

  /** Rasteira: a pose de chute num deslize baixo, rente ao chão, com um rastro de poeira. */
  async rasteira(aoBater?: () => void | Promise<void>) {
    this.respirar(false);
    this.mudarPose('ataque');
    const k = Math.max(1, this.escala / 2);
    const dx = this.frente * 44 * k;
    const poeira = document.createElement('span');
    poeira.className = 'poeira-rasteira';
    this.el.append(poeira);
    await this.animar([{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${6 * k}px)` }], 260, 'ease-in');
    await aoBater?.();
    await esperar(260);
    await this.animar([{ transform: `translate(${dx}px, ${6 * k}px)` }, { transform: 'translate(0, 0)' }], 260, 'ease-out');
    poeira.remove();
  }

  /** Dano: pisca em branco duas vezes e recua 4 px. */
  async levarDano(pose = 'atingido') {
    this.respirar(false);
    this.mudarPose(pose);
    this.el.classList.add('piscando');
    const recuo = -this.frente * 4 * Math.max(1, this.escala / 2);
    await this.animar([{ transform: 'translateX(0)' }, { transform: `translateX(${recuo}px)` }, { transform: `translateX(${recuo}px)` }, { transform: 'translateX(0)' }], 420);
    this.el.classList.remove('piscando');
  }

  /** Fuga: vira e corre para fora da tela pela esquerda, sumindo com fade. */
  async fugir(pose = 'fugindo') {
    this.respirar(false);
    this.mudarPose(pose);
    const largura = this.el.parentElement?.clientWidth ?? 600;
    await this.animar([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-largura * 0.6}px)`, opacity: 0 }], 1100, 'ease-in');
    this.el.hidden = true;
  }

  /** Inimigo derrubado: pisca e se desfaz em pixels (efeito clássico do FF6). */
  async desfazer() {
    this.respirar(false);
    const { meta } = this.folha;
    const w = meta.quadro.largura, hgt = meta.quadro.altura;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    canvas.className = 'sprite-desfazendo';
    Object.assign(canvas.style, { width: `${w * this.escala}px`, height: `${hgt * this.escala}px` });
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = this.folha.url;
    await img.decode().catch(() => {});
    ctx.drawImage(img, (meta.poses[this.pose] ?? 0) * w, 0, w, hgt, 0, 0, w, hgt);
    this.el.classList.add('piscando');
    await esperar(300);
    this.el.classList.remove('piscando');
    this.corpo.replaceWith(canvas);
    const dados = ctx.getImageData(0, 0, w, hgt);
    const passos = 18;
    for (let k = 0; k < passos; k++) {
      // A cada passo, some uma fatia aleatória dos pixels e o resto desce um pouco.
      for (let i = 0; i < dados.data.length; i += 4) if (Math.random() < 1 / (passos - k)) dados.data[i + 3] = 0;
      ctx.putImageData(dados, 0, 0);
      canvas.style.transform = `translateY(${k}px)`;
      await esperar(45);
    }
    this.el.hidden = true;
  }
}
