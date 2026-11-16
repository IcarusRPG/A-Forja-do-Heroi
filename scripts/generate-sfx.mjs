// Sintetiza efeitos sonoros provisórios (.wav, 16 bits, mono, 44,1 kHz) em public/assets/sfx/.
// Serão trocados por versões definitivas; os nomes dos arquivos são estáveis.
// Uso: npm run sfx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'sfx');
const SR = 44100;
const TAU = Math.PI * 2;

// Gerador pseudoaleatório determinístico: o mesmo script gera sempre os mesmos arquivos.
let seed = 1234567;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

const buffer = (seg) => new Float32Array(Math.ceil(seg * SR));

/** Envelope ataque/decaimento exponencial. */
const env = (t, ataque, decai) => (t < ataque ? t / ataque : Math.exp(-(t - ataque) / decai));

/** Soma um tom (com parciais) ao buffer. */
function tom(buf, { inicio = 0, freq, freqFim = freq, dur, amp = 0.5, ataque = 0.005, decai = 0.1, parciais = [[1, 1]], forma = 'sin' }) {
  const i0 = Math.floor(inicio * SR);
  const n = Math.min(buf.length - i0, Math.floor(dur * SR));
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = freq * Math.pow(freqFim / freq, t / dur);
    fase += f / SR;
    let s = 0;
    for (const [mult, a] of parciais) {
      const x = TAU * fase * mult;
      s += a * (forma === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(x)) : Math.sin(x));
    }
    buf[i0 + i] += amp * s * env(t, ataque, decai);
  }
}

/** Soma ruído filtrado (passa-baixa de 1 polo, com corte que pode varrer). */
function ruido(buf, { inicio = 0, dur, amp = 0.3, ataque = 0.005, decai = 0.05, corte = 2000, corteFim = corte, passaAlta = 0 }) {
  const i0 = Math.floor(inicio * SR);
  const n = Math.min(buf.length - i0, Math.floor(dur * SR));
  let lp = 0, hpPrev = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = corte * Math.pow(corteFim / corte, t / dur);
    const a = 1 - Math.exp(-TAU * fc / SR);
    lp += a * (rand() - lp);
    let s = lp;
    if (passaAlta) {
      const b = Math.exp(-TAU * passaAlta / SR);
      hp = b * (hp + s - hpPrev);
      hpPrev = s;
      s = hp;
    }
    buf[i0 + i] += amp * s * env(t, ataque, decai);
  }
}

function normalizar(buf, pico = 0.85) {
  let max = 0;
  for (const s of buf) max = Math.max(max, Math.abs(s));
  if (max > 0) for (let i = 0; i < buf.length; i++) buf[i] *= pico / max;
  // Fade-out final de 5 ms para nunca terminar com estalo.
  const f = Math.floor(0.005 * SR);
  for (let i = 0; i < f; i++) buf[buf.length - 1 - i] *= i / f;
  return buf;
}

function wav(buf) {
  const dados = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) dados.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dados.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(dados.length, 40);
  return Buffer.concat([h, dados]);
}

const sinos = [[1, 1], [2.76, 0.4], [5.4, 0.2]];
const efeitos = {
  // Tique metálico muito leve
  'ui-hover': (pico) => {
    const b = buffer(0.08);
    tom(b, { freq: 3200, dur: 0.08, amp: 0.25, ataque: 0.001, decai: 0.015, parciais: sinos });
    ruido(b, { dur: 0.02, amp: 0.1, decai: 0.004, corte: 9000, passaAlta: 3000 });
    return normalizar(b, 0.35);
  },
  // Clique de madeira e metal
  'ui-click': () => {
    const b = buffer(0.14);
    ruido(b, { dur: 0.05, amp: 0.8, ataque: 0.001, decai: 0.01, corte: 2500, passaAlta: 300 });
    tom(b, { freq: 420, freqFim: 380, dur: 0.08, amp: 0.6, ataque: 0.001, decai: 0.02, forma: 'tri' });
    tom(b, { freq: 2100, dur: 0.14, amp: 0.15, ataque: 0.001, decai: 0.04, parciais: sinos });
    return normalizar(b, 0.6);
  },
  // Acorde curto ascendente, brilhante
  'ui-confirm': () => {
    const b = buffer(0.5);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tom(b, { inicio: i * 0.045, freq: f, dur: 0.45 - i * 0.045, amp: 0.3, ataque: 0.004, decai: 0.16, parciais: [[1, 1], [2, 0.3], [3, 0.1]] }));
    return normalizar(b, 0.6);
  },
  // Tom curto descendente
  'ui-back': () => {
    const b = buffer(0.25);
    tom(b, { freq: 660, freqFim: 392, dur: 0.25, amp: 0.5, ataque: 0.004, decai: 0.08, parciais: [[1, 1], [2, 0.2]] });
    return normalizar(b, 0.55);
  },
  // Batida abafada, grave
  'ui-locked': () => {
    const b = buffer(0.3);
    tom(b, { freq: 110, freqFim: 70, dur: 0.3, amp: 0.9, ataque: 0.002, decai: 0.07 });
    ruido(b, { dur: 0.08, amp: 0.5, ataque: 0.001, decai: 0.02, corte: 400 });
    return normalizar(b, 0.7);
  },
  // Plim agudo
  'point-up': () => {
    const b = buffer(0.3);
    tom(b, { freq: 1318.5, dur: 0.3, amp: 0.5, ataque: 0.002, decai: 0.08, parciais: sinos });
    return normalizar(b, 0.5);
  },
  // Plim grave
  'point-down': () => {
    const b = buffer(0.3);
    tom(b, { freq: 659.25, dur: 0.3, amp: 0.5, ataque: 0.002, decai: 0.08, parciais: sinos });
    return normalizar(b, 0.5);
  },
  // Gongo suave com cauda longa
  'start': () => {
    const b = buffer(4.5);
    const parciais = [[1, 1], [1.48, 0.5], [2.02, 0.45], [2.74, 0.25], [3.6, 0.15], [4.9, 0.08]];
    tom(b, { freq: 98, freqFim: 96, dur: 4.5, amp: 0.7, ataque: 0.02, decai: 1.3, parciais });
    tom(b, { freq: 196.5, dur: 4.5, amp: 0.15, ataque: 0.05, decai: 0.9 });
    ruido(b, { dur: 0.25, amp: 0.25, ataque: 0.002, decai: 0.06, corte: 1500 });
    return normalizar(b, 0.75);
  },
  // Brilho mágico ascendente (~1,5 s)
  'hero-confirm': () => {
    const b = buffer(1.8);
    const escala = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568, 1760, 2093];
    escala.forEach((f, i) =>
      tom(b, { inicio: i * 0.09, freq: f, dur: 1.8 - i * 0.09, amp: 0.22, ataque: 0.005, decai: 0.35, parciais: sinos }));
    tom(b, { freq: 261.63, dur: 1.8, amp: 0.25, ataque: 0.4, decai: 0.6, parciais: [[1, 1], [1.5, 0.5], [2, 0.4]] });
    ruido(b, { dur: 1.6, amp: 0.08, ataque: 1.0, decai: 0.3, corte: 6000, corteFim: 12000, passaAlta: 4000 });
    return normalizar(b, 0.7);
  },
  // Whoosh de ar suave
  'transition': () => {
    const b = buffer(0.7);
    ruido(b, { dur: 0.7, amp: 0.8, ataque: 0.3, decai: 0.15, corte: 300, corteFim: 2500, passaAlta: 150 });
    return normalizar(b, 0.4);
  },
};

await mkdir(OUT, { recursive: true });
for (const [nome, gerar] of Object.entries(efeitos)) {
  const dados = wav(gerar());
  await writeFile(path.join(OUT, `${nome}.wav`), dados);
  console.log(`  ${nome}.wav (${(dados.length / 1024).toFixed(1)} KB)`);
}
console.log('Efeitos gerados em public/assets/sfx/.');
