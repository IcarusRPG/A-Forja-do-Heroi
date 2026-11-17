import type { Genero } from '../core/assets';

/**
 * Herói chibi PROVISÓRIO, desenhado por código numa folha 4 × 4 de quadros de 48 × 48 px
 * (linhas: baixo, esquerda, direita, cima; 4 quadros de caminhada cada) — o mesmo formato
 * esperado de public/assets/sprites/chibi-<raca>-<m|f>.png, que substitui este desenho quando existir.
 */

export const QUADRO = 48;
export const COLUNAS = 4;

interface Aparencia {
  pele: string;
  cabelo: string;
  olhos: string;
  roupa: string;
  detalhe: string;
  calca: string;
  bota: string;
  saia: boolean;
  cabeloLongo: boolean;
  chifres?: string;
  cauda?: string;
  orelhasFelinas?: string;
  orelhasPontudas?: boolean;
  moicano?: boolean;
  faixa?: string;
}

/** Cores tiradas da roupa comum de cada retrato. */
export function aparenciaDe(raca: string, genero: Genero): Aparencia {
  const f = genero === 'f';
  switch (raca) {
    case 'azakar':
      return f
        ? { pele: '#b693d6', cabelo: '#1d1420', olhos: '#ffd76a', roupa: '#8f2b2b', detalhe: '#e8d4a6', calca: '#8f2b2b', bota: '#5a3a24', saia: true, cabeloLongo: true, chifres: '#efe6da', cauda: '#a983c9' }
        : { pele: '#b8443a', cabelo: '#1e1418', olhos: '#ffd76a', roupa: '#2e3b5e', detalhe: '#6b4a2e', calca: '#6b5e52', bota: '#4a3324', saia: false, cabeloLongo: false, chifres: '#3a1d1d', cauda: '#a63a31' };
    case 'nyashi':
      return f
        ? { pele: '#2b2730', cabelo: '#141118', olhos: '#e9d36a', roupa: '#2f5c55', detalhe: '#c9a46a', calca: '#2f5c55', bota: '#5a3a24', saia: true, cabeloLongo: true, orelhasFelinas: '#2b2730', cauda: '#2b2730' }
        : { pele: '#dca447', cabelo: '#b8611f', olhos: '#9fd65a', roupa: '#eadcc0', detalhe: '#6e3d24', calca: '#3d2c24', bota: '#dca447', saia: false, cabeloLongo: false, orelhasFelinas: '#dca447', cauda: '#dca447', moicano: true, faixa: '#a8322e' };
    case 'ayoran':
      return f
        ? { pele: '#f4e6d8', cabelo: '#f0cf6a', olhos: '#4d7a4a', roupa: '#8e9e5e', detalhe: '#7a4a2a', calca: '#8e9e5e', bota: '#6a4a30', saia: true, cabeloLongo: true, orelhasPontudas: true }
        : { pele: '#f4e6d8', cabelo: '#dfe3ec', olhos: '#4a6a8a', roupa: '#89a3c4', detalhe: '#5a4632', calca: '#707a88', bota: '#5a3a24', saia: false, cabeloLongo: true, orelhasPontudas: true };
    default: // arake
      return f
        ? { pele: '#b98058', cabelo: '#2a1c14', olhos: '#2a1c14', roupa: '#3f5f3a', detalhe: '#efe4cc', calca: '#3f5f3a', bota: '#5a3a24', saia: true, cabeloLongo: true }
        : { pele: '#b98058', cabelo: '#2a1c14', olhos: '#2a1c14', roupa: '#ece3cf', detalhe: '#6b4126', calca: '#3b2a22', bota: '#5a3a24', saia: false, cabeloLongo: false };
  }
}

const CONTORNO = 'rgba(30, 18, 24, 0.85)';

function forma(ctx: CanvasRenderingContext2D, cor: string, desenhar: () => void, contorno = true) {
  ctx.beginPath();
  desenhar();
  ctx.fillStyle = cor;
  ctx.fill();
  if (contorno) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = CONTORNO;
    ctx.stroke();
  }
}

const elipse = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
const retangulo = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 2) => ctx.roundRect(x, y, w, h, r);

type Vista = 'frente' | 'costas' | 'lado';

/** Desenha um quadro com os pés em (24, 45). `passo` é −1, 0 ou 1; `sobe` é o balanço do corpo. */
function quadro(ctx: CanvasRenderingContext2D, a: Aparencia, vista: Vista, passo: number, sobe: number) {
  const cx = 24;
  const yCorpo = 26 + sobe;
  const yCabeca = 15 + sobe;

  // Sombra
  forma(ctx, 'rgba(0,0,0,0.22)', () => elipse(ctx, cx, 45, 10, 3), false);

  const cauda = () => {
    if (!a.cauda) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = CONTORNO;
    ctx.lineWidth = 4.5;
    const desenhar = () => {
      ctx.beginPath();
      if (vista === 'lado') {
        ctx.moveTo(cx - 6, yCorpo + 9);
        ctx.quadraticCurveTo(cx - 17, yCorpo + 8 + passo, cx - 15, yCorpo - 3 + passo);
      } else {
        ctx.moveTo(cx + 3, yCorpo + 10);
        ctx.quadraticCurveTo(cx + 15, yCorpo + 12, cx + 14 + passo, yCorpo + 1);
      }
      ctx.stroke();
    };
    desenhar();
    ctx.strokeStyle = a.cauda;
    ctx.lineWidth = 2.6;
    desenhar();
    if (!a.orelhasFelinas) {
      // Ponta de seta da cauda Azakar
      const [px, py] = vista === 'lado' ? [cx - 15, yCorpo - 4 + passo] : [cx + 14 + passo, yCorpo];
      forma(ctx, a.cauda, () => { ctx.moveTo(px, py - 3); ctx.lineTo(px + 3, py + 1); ctx.lineTo(px - 3, py + 1); ctx.closePath(); });
    }
    ctx.restore();
  };

  const pernas = () => {
    if (a.saia) {
      // Saia/vestido até perto dos pés; só os pés aparecem
      const pe = (x: number, dy: number) => forma(ctx, a.bota, () => retangulo(ctx, x, 41 + dy, 5, 4, 1.5));
      if (vista === 'lado') { pe(cx - 4 + passo * 2, 0); pe(cx - 1 - passo * 2, 0); }
      else { pe(cx - 6, passo > 0 ? 1 : 0); pe(cx + 1, passo < 0 ? 1 : 0); }
      return;
    }
    const perna = (x: number, dy: number) => {
      forma(ctx, a.calca, () => retangulo(ctx, x, 36 + sobe, 5, 7 + dy - sobe, 1.5));
      forma(ctx, a.bota, () => retangulo(ctx, x - 0.5, 41 + dy, 6, 4, 1.5));
    };
    if (vista === 'lado') { perna(cx - 5 - passo * 2.5, 0); perna(cx - 1 + passo * 2.5, 0); }
    else { perna(cx - 6, passo > 0 ? 1 : passo < 0 ? -1 : 0); perna(cx + 1, passo < 0 ? 1 : passo > 0 ? -1 : 0); }
  };

  const tronco = () => {
    if (a.saia) {
      forma(ctx, a.roupa, () => {
        ctx.moveTo(cx - 7, yCorpo);
        ctx.lineTo(cx + 7, yCorpo);
        ctx.lineTo(cx + 10, 43);
        ctx.lineTo(cx - 10, 43);
        ctx.closePath();
      });
      if (vista === 'frente') forma(ctx, a.detalhe, () => retangulo(ctx, cx - 4.5, yCorpo + 5, 9, 12, 2)); // avental/faixa
      else if (vista !== 'costas') forma(ctx, a.detalhe, () => retangulo(ctx, cx - 7, yCorpo + 6, 12, 2.5, 1), false);
    } else {
      forma(ctx, a.roupa, () => retangulo(ctx, cx - 8, yCorpo, 16, 12, 4));
      if (vista === 'frente') {
        // Colete ou casaco aberto
        forma(ctx, a.detalhe, () => retangulo(ctx, cx - 8, yCorpo + 1, 5, 11, 2), false);
        forma(ctx, a.detalhe, () => retangulo(ctx, cx + 3, yCorpo + 1, 5, 11, 2), false);
      } else if (vista === 'costas') {
        forma(ctx, a.detalhe, () => retangulo(ctx, cx - 8, yCorpo + 1, 16, 10, 3), false);
      } else {
        forma(ctx, a.detalhe, () => retangulo(ctx, cx - 6, yCorpo + 1, 8, 10, 2), false);
      }
      forma(ctx, a.faixa ?? a.detalhe, () => retangulo(ctx, cx - 8, yCorpo + 9, 16, 2.5, 1), false);
    }
  };

  const braco = (x: number, dy: number) => {
    forma(ctx, a.roupa, () => retangulo(ctx, x, yCorpo + 1 + dy, 4, 9, 2));
    forma(ctx, a.pele, () => elipse(ctx, x + 2, yCorpo + 10.5 + dy, 2.2, 2.2));
  };

  const cabeca = () => {
    forma(ctx, a.pele, () => elipse(ctx, cx, yCabeca, 11, 10.5));
  };

  const orelhas = () => {
    if (a.orelhasFelinas) {
      const orelha = (x: number, lado: number) => {
        forma(ctx, a.orelhasFelinas!, () => { ctx.moveTo(x - 4 * lado, yCabeca - 7); ctx.lineTo(x + 1 * lado, yCabeca - 16); ctx.lineTo(x + 5 * lado, yCabeca - 6); ctx.closePath(); });
        if (vista !== 'costas') forma(ctx, '#e9a0a8', () => { ctx.moveTo(x - 1.5 * lado, yCabeca - 8); ctx.lineTo(x + 1 * lado, yCabeca - 13); ctx.lineTo(x + 3 * lado, yCabeca - 7.5); ctx.closePath(); }, false);
      };
      if (vista === 'lado') orelha(cx - 1, 1);
      else { orelha(cx - 6, 1); orelha(cx + 6, -1); }
    }
    if (a.orelhasPontudas) {
      const orelha = (lado: number) => forma(ctx, a.pele, () => {
        ctx.moveTo(cx + 9 * lado, yCabeca - 1);
        ctx.lineTo(cx + 17 * lado, yCabeca - 6);
        ctx.lineTo(cx + 10 * lado, yCabeca + 3);
        ctx.closePath();
      });
      if (vista === 'lado') orelha(-1);
      else { orelha(-1); orelha(1); }
    }
    if (a.chifres) {
      const chifre = (x: number, lado: number) => forma(ctx, a.chifres!, () => {
        ctx.moveTo(x - 2.5 * lado, yCabeca - 8);
        ctx.quadraticCurveTo(x + 2 * lado, yCabeca - 17, x + 6 * lado, yCabeca - 15);
        ctx.quadraticCurveTo(x + 3 * lado, yCabeca - 12, x + 2.5 * lado, yCabeca - 7);
        ctx.closePath();
      });
      if (vista === 'lado') chifre(cx + 1, 1);
      else { chifre(cx - 5, -1); chifre(cx + 5, 1); }
    }
  };

  const cabelo = () => {
    const c = a.cabelo;
    if (vista === 'costas') {
      forma(ctx, c, () => elipse(ctx, cx, yCabeca - 1, 11.5, 10.5));
      if (a.cabeloLongo) forma(ctx, c, () => retangulo(ctx, cx - 9, yCabeca + 2, 18, 13, 5));
    } else if (vista === 'frente') {
      if (a.cabeloLongo) {
        forma(ctx, c, () => retangulo(ctx, cx - 12, yCabeca - 3, 5, 17, 3));
        forma(ctx, c, () => retangulo(ctx, cx + 7, yCabeca - 3, 5, 17, 3));
      }
      forma(ctx, c, () => {
        ctx.ellipse(cx, yCabeca - 2, 11.5, 9.5, 0, Math.PI, Math.PI * 2);
        ctx.lineTo(cx + 11, yCabeca - 1);
        ctx.quadraticCurveTo(cx + 5, yCabeca - 5, cx, yCabeca - 2);
        ctx.quadraticCurveTo(cx - 5, yCabeca - 5, cx - 11, yCabeca - 1);
        ctx.closePath();
      });
    } else {
      // Lado (virado para a direita): cabelo cobre a nuca
      forma(ctx, c, () => {
        ctx.ellipse(cx - 1, yCabeca - 2, 11.5, 9.5, 0, Math.PI * 0.95, Math.PI * 2);
        ctx.lineTo(cx + 9, yCabeca - 4);
        ctx.quadraticCurveTo(cx + 2, yCabeca - 4, cx - 2, yCabeca + 2);
        ctx.lineTo(cx - 6, yCabeca + 4);
        ctx.lineTo(cx - 11, yCabeca + 1);
        ctx.closePath();
      });
      if (a.cabeloLongo) forma(ctx, c, () => retangulo(ctx, cx - 12, yCabeca - 1, 7, 15, 3));
    }
    if (a.moicano) {
      // Juba/moicano do Nyashi
      forma(ctx, c, () => {
        ctx.moveTo(cx - 3, yCabeca - 9);
        ctx.quadraticCurveTo(cx, yCabeca - 17, cx + 4, yCabeca - 9);
        ctx.closePath();
      });
      if (vista !== 'frente') forma(ctx, c, () => retangulo(ctx, cx - (vista === 'lado' ? 12 : 9), yCabeca - 2, vista === 'lado' ? 7 : 18, 12, 4));
    }
  };

  const rosto = () => {
    const olho = (x: number) => {
      forma(ctx, a.olhos, () => elipse(ctx, x, yCabeca + 2, 1.8, 2.4), false);
      forma(ctx, '#ffffff', () => elipse(ctx, x + 0.6, yCabeca + 1.1, 0.7, 0.7), false);
    };
    if (vista === 'frente') { olho(cx - 4.5); olho(cx + 4.5); }
    else if (vista === 'lado') olho(cx + 6);
    if (vista !== 'costas') {
      forma(ctx, 'rgba(230,110,110,0.35)', () => elipse(ctx, vista === 'lado' ? cx + 4 : cx - 6.5, yCabeca + 5, 2, 1.2), false);
      if (vista === 'frente') forma(ctx, 'rgba(230,110,110,0.35)', () => elipse(ctx, cx + 6.5, yCabeca + 5, 2, 1.2), false);
    }
  };

  if (vista === 'frente') {
    cauda();
    pernas();
    tronco();
    braco(cx - 11, -passo);
    braco(cx + 7, passo);
    cabeca();
    orelhas();
    cabelo();
    rosto();
  } else if (vista === 'costas') {
    pernas();
    tronco();
    braco(cx - 11, passo);
    braco(cx + 7, -passo);
    cabeca();
    cabelo();
    orelhas();
    cauda();
  } else {
    cauda();
    braco(cx - 4 - passo * 2, 0);
    pernas();
    tronco();
    braco(cx - 2 + passo * 2, 0);
    cabeca();
    orelhas();
    cabelo();
    rosto();
  }
}

/** Gera a folha 4 × 4 (192 × 192 px) num canvas. */
export function desenharFolhaChibi(raca: string, genero: Genero): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = QUADRO * COLUNAS;
  canvas.height = QUADRO * 4;
  const ctx = canvas.getContext('2d')!;
  const a = aparenciaDe(raca, genero);
  const linhas: { vista: Vista; espelhar: boolean }[] = [
    { vista: 'frente', espelhar: false }, // baixo
    { vista: 'lado', espelhar: true }, // esquerda
    { vista: 'lado', espelhar: false }, // direita
    { vista: 'costas', espelhar: false }, // cima
  ];
  linhas.forEach(({ vista, espelhar }, linha) => {
    for (let q = 0; q < COLUNAS; q++) {
      const passo = q === 1 ? 1 : q === 3 ? -1 : 0;
      const sobe = q === 1 || q === 3 ? -1 : 0;
      ctx.save();
      ctx.translate(q * QUADRO, linha * QUADRO);
      if (espelhar) {
        ctx.translate(QUADRO, 0);
        ctx.scale(-1, 1);
      }
      quadro(ctx, a, vista, passo, sobe);
      ctx.restore();
    }
  });
  return canvas;
}
