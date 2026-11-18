import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarCampanha, getEstado } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, h } from '../core/ui';
import { CAPITULOS, resumoDoCapitulo } from '../narrativa/capitulo';
import { nomeAtraso } from '../core/progresso';

/**
 * "Fim do Capítulo 01 — Amanhecer Tardio", com o resumo das escolhas (pelas flags). Salva o avanço
 * para o capítulo seguinte (capitulo: 2, cena: "inicio") com o estado do herói (PV atual e flags).
 */
export function telaFimCapitulo(): Tela {
  const T = textos.cenas.fim;
  const c = getEstado().campanha;
  const cap = CAPITULOS[c.capitulo] ?? CAPITULOS[1];
  const resumo = resumoDoCapitulo(cap);
  if (cap.resumoAtraso) resumo.push(T.atraso.replace('{estado}', nomeAtraso(c.atraso)));
  const proximo = CAPITULOS[cap.proximoCapitulo.numero];
  const num = (n: number) => String(n).padStart(2, '0');
  // Depois do resumo, segue direto para o próximo capítulo (ou para o "Em breve", se ele ainda não existe).
  const seguir = botao(T.seguir, () => void irPara(proximo ? 'capitulo' : 'emBreve', undefined, { duracao: 800 }), { classe: 'btn-principal' });
  const el = h('div', { class: 'tela-fim-capitulo' },
    h('img', { class: 'fim-fundo', src: src(ASSETS.cena(cap.fundoFim ?? 'cena-templo-porta')), alt: '', draggable: 'false' }),
    h('div', { class: 'fim-conteudo' },
      h('p', { class: 'fim-rotulo' }, `${T.fimDo} ${textos.cenas.capitulo} ${num(cap.numero)}`),
      h('h1', { class: 'fim-titulo' }, cap.titulo),
      h('ul', { class: 'fim-resumo' }, ...resumo.map((l) => h('li', {}, l))),
      seguir,
    ));
  return {
    el,
    aoEntrar() {
      atualizarCampanha({ capitulo: cap.proximoCapitulo.numero, cena: 'inicio', modo: 'falas', local: { tela: 'capitulo' } });
      if (cap.musicaFim === null) audio.pararMusica(1500);
      else audio.tocarMusica(ASSETS.musica(cap.musicaFim ?? 'fullmun-02'), 2000);
      requestAnimationFrame(() => el.classList.add('entrou'));
      setTimeout(() => seguir.focus({ preventScroll: true }), 900);
    },
  };
}
