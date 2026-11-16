import { ASSETS, src } from '../core/assets';
import { textos } from '../core/textos';
import { abrirModal, h } from '../core/ui';

export function abrirCreditos(): void {
  const t = textos.creditos;
  const extras = t.extras as string[];
  const corpo = h('div', { class: 'creditos' },
    h('img', { class: 'creditos-logo', src: src(ASSETS.logoForja), alt: 'A Forja do Herói' }),
    ...t.linhas.map((l) => h('p', {}, l)),
    ...extras.map((l) => h('p', { class: 'creditos-extra' }, l)),
  );
  abrirModal(t.titulo, corpo, t.fechar);
}
