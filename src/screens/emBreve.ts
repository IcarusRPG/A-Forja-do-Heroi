import { ASSETS, src } from '../core/assets';
import { classePorId, nomeDaClasse } from '../core/classes';
import { getEstado } from '../core/estado';
import type { Genero } from '../core/assets';

const classeDe = (id: string | null, g: Genero) => {
  const c = classePorId(id);
  return c ? nomeDaClasse(c, g) : null;
};
import { racaPorId } from '../core/regras';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, h } from '../core/ui';

/** Tela provisória depois do Capítulo 01: "Capítulo 02 — O Templo de Sólem · Em breve". */
export function telaEmBreve(): Tela {
  const t = textos.emBreve;
  const p = getEstado().personagem;
  const heroi = p
    ? h('figure', { class: 'embreve-heroi' },
        h('img', { src: src(ASSETS.retrato(p.raca, p.genero, p.classe ?? 'comum')), alt: p.nome, draggable: 'false' }),
        h('figcaption', {}, h('span', { class: 'embreve-nome' }, p.nome),
          h('span', { class: 'embreve-raca' }, [racaPorId(p.raca)?.nome, classeDe(p.classe, p.genero)].filter(Boolean).join(' · '))))
    : null;
  const voltar = botao(t.voltar, () => void irPara('menu'), { classe: 'btn-principal' });
  const el = h('div', { class: 'tela-embreve' },
    h('div', { class: 'embreve-conteudo' },
      heroi,
      h('div', { class: 'embreve-texto' },
        h('p', { class: 'embreve-capitulo' }, t.capitulo),
        h('h1', { class: 'embreve-titulo' }, t.titulo),
        h('p', { class: 'embreve-breve' }, t.emBreve),
        voltar,
      ),
    ),
  );
  return {
    el,
    aoEntrar() {
      requestAnimationFrame(() => el.classList.add('entrou'));
      setTimeout(() => voltar.focus({ preventScroll: true }), 600);
    },
  };
}
