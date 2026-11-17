/**
 * Ambiente sintetizado para cenas sem música própria (o sonho dos deuses, por enquanto):
 * um drone grave e suave (quinta justa com leve batimento) e, de vez em quando, um brilho agudo.
 * Segue o volume da música das Opções.
 */
export interface Ambiente {
  iniciar(fadeMs: number): void;
  parar(fadeMs: number): void;
  atualizarVolume(): void;
}

const NIVEL = 0.22;

export function criarAmbiente(ctx: AudioContext, volume: () => number): Ambiente {
  const mestre = ctx.createGain();
  mestre.gain.value = 0;
  // Passa-baixa para o drone ficar macio.
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 900;
  filtro.connect(mestre).connect(ctx.destination);

  const osciladores: OscillatorNode[] = [];
  const voz = (freq: number, ganho: number, tipo: OscillatorType = 'sine', detune = 0) => {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = ganho;
    o.connect(g).connect(filtro);
    osciladores.push(o);
    return g;
  };
  // Lá grave + mi + lá, com um pouco de batimento entre as cópias.
  voz(55, 0.5);
  voz(55, 0.3, 'sine', 7);
  voz(82.41, 0.28, 'triangle');
  voz(110, 0.18, 'sine', -5);
  const respiro = voz(220, 0.06, 'sine', 3);
  // O agudo "respira" devagar.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGanho = ctx.createGain();
  lfoGanho.gain.value = 0.05;
  lfo.connect(lfoGanho).connect(respiro.gain);
  osciladores.push(lfo);

  let fator = 0;
  let timerBrilho = 0;
  let ativo = false;

  const aplicar = (rampaS = 0.1) => {
    const alvo = NIVEL * fator * volume();
    mestre.gain.cancelScheduledValues(ctx.currentTime);
    mestre.gain.setTargetAtTime(alvo, ctx.currentTime, rampaS / 3);
  };

  /** Um brilho agudo ocasional: duas notas de sino bem baixas, de uma escala pentatônica. */
  const brilho = () => {
    if (!ativo) return;
    const notas = [880, 987.77, 1108.73, 1318.51, 1479.98, 1760];
    const agora = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = notas[Math.floor(Math.random() * notas.length)];
      const g = ctx.createGain();
      const t0 = agora + i * 0.22;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
      o.connect(g).connect(mestre);
      o.start(t0);
      o.stop(t0 + 2.5);
    }
    timerBrilho = window.setTimeout(brilho, 5000 + Math.random() * 6000);
  };

  return {
    iniciar(fadeMs) {
      ativo = true;
      for (const o of osciladores) o.start();
      fator = 1;
      aplicar(fadeMs / 1000);
      timerBrilho = window.setTimeout(brilho, 3000);
    },
    parar(fadeMs) {
      ativo = false;
      clearTimeout(timerBrilho);
      fator = 0;
      aplicar(fadeMs / 1000);
      window.setTimeout(() => {
        for (const o of osciladores) try { o.stop(); } catch { /* já parado */ }
        mestre.disconnect();
      }, fadeMs + 300);
    },
    atualizarVolume() {
      if (ativo) aplicar(0.1);
    },
  };
}
