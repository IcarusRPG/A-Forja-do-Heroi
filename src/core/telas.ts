import { audio } from './audio';
import { esperar } from './ui';

/** Máquina de telas: uma tela visível por vez, com fade entre elas. */

export interface Tela {
  el: HTMLElement;
  /** Chamado depois que a tela entrou no DOM. */
  aoEntrar?: () => void;
  /** Chamado antes de sair (limpar timers, listeners, vídeo…). */
  aoSair?: () => void;
}

export type NomeTela =
  | 'loading' | 'intro' | 'menu' | 'criacao' | 'prologo' | 'sonho' | 'despertar'
  | 'introFullmun' | 'capitulo' | 'mapa' | 'batalha' | 'fimCapitulo' | 'gameOver' | 'emBreve';
type Fabrica = (params?: unknown) => Tela;

const fabricas = new Map<NomeTela, Fabrica>();
let atual: Tela | null = null;
let trocando = false;

export function registrarTela(nome: NomeTela, fabrica: Fabrica): void {
  fabricas.set(nome, fabrica);
}

export interface OpcoesTroca {
  /** Toca o whoosh de transição (padrão: sim). */
  som?: boolean;
  /** Duração do fade de saída/entrada, em ms. */
  duracao?: number;
}

export async function irPara(nome: NomeTela, params?: unknown, opcoes: OpcoesTroca = {}): Promise<void> {
  if (trocando) return;
  trocando = true;
  const { som = true, duracao = 450 } = opcoes;
  const raiz = document.getElementById('app')!;
  try {
    if (som) audio.sfx('transition');
    if (atual) {
      atual.aoSair?.();
      atual.el.style.setProperty('--fade', `${duracao}ms`);
      atual.el.classList.add('tela-saindo');
      await esperar(duracao);
      atual.el.remove();
    }
    const fabrica = fabricas.get(nome);
    if (!fabrica) throw new Error(`Tela desconhecida: ${nome}`);
    const nova = fabrica(params);
    nova.el.classList.add('tela', 'tela-entrando');
    nova.el.style.setProperty('--fade', `${duracao}ms`);
    raiz.append(nova.el);
    atual = nova;
    // Força o reflow para a transição de entrada acontecer.
    void nova.el.offsetWidth;
    nova.el.classList.remove('tela-entrando');
    nova.aoEntrar?.();
  } finally {
    trocando = false;
  }
}
