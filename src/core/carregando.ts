import { textos } from './textos';
import { h } from './ui';

/**
 * Tela de carregamento por cima de uma tela (mapa, intro, sonho, capítulo): o mesmo visual da tela
 * inicial, com a barra de progresso. Só aparece se a espera passar de 150 ms (cache quente não pisca).
 * Em falha, troca a barra por "Não foi possível carregar. Verifique sua conexão." + "Tentar de novo".
 */
export interface TelaCarregando {
  progresso(fracao: number): void;
  /** Mostra a mensagem de falha e resolve quando o jogador tocar em "Tentar de novo". */
  falhou(): Promise<void>;
  fechar(): void;
}

export function mostrarCarregando(raiz: HTMLElement, rotulo = textos.loading.carregando): TelaCarregando {
  const preenchimento = h('div', { class: 'barra-preenchimento' });
  const porcentagem = h('div', { class: 'barra-porcentagem' }, '0%');
  const barra = h('div', { class: 'barra', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': rotulo },
    h('div', { class: 'barra-trilho' }, preenchimento), porcentagem);
  const mensagem = h('p', { class: 'carregando-msg', hidden: true }, textos.loading.falhou);
  const tentar = h('button', { type: 'button', class: 'btn btn-principal carregando-tentar', hidden: true }, textos.loading.tentarDeNovo);
  const el = h('div', { class: 'carregando-etapa', role: 'status', 'aria-live': 'polite' },
    h('p', { class: 'carregando-titulo' }, rotulo), barra, mensagem, tentar);
  raiz.append(el);
  const atraso = window.setTimeout(() => el.classList.add('visivel'), 150);
  return {
    progresso(f) {
      const pct = Math.round(f * 100);
      preenchimento.style.transform = `scaleX(${f})`;
      porcentagem.textContent = `${pct}%`;
      barra.setAttribute('aria-valuenow', String(pct));
    },
    falhou() {
      clearTimeout(atraso);
      el.classList.add('visivel', 'com-erro');
      barra.hidden = true;
      mensagem.hidden = false;
      tentar.hidden = false;
      tentar.focus({ preventScroll: true });
      return new Promise<void>((ok) => {
        tentar.onclick = () => {
          el.classList.remove('com-erro');
          barra.hidden = false;
          mensagem.hidden = true;
          tentar.hidden = true;
          ok();
        };
      });
    },
    fechar() {
      clearTimeout(atraso);
      el.classList.add('saindo');
      el.classList.remove('visivel');
      window.setTimeout(() => el.remove(), 250);
    },
  };
}
