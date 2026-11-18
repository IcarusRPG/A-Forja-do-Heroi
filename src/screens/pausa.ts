import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { getEstado } from '../core/estado';
import { ITENS_DEF, comerPao, pvAtual, pvMaxAtual, qtdItem, usarItemCura } from '../core/progresso';
import { irPara } from '../core/telas';
import { textos } from '../core/textos';
import { abrirModal, botao, h } from '../core/ui';
import { CAPITULOS, resumoDoCapitulo } from '../narrativa/capitulo';
import { abrirCompendio } from './compendio';
import { abrirOpcoes } from './opcoes';

/**
 * Menu de pausa compartilhado (cenas e mapas): Continuar · Itens · Compêndio · Diário · Opções ·
 * Voltar ao menu. O botão do Compêndio ganha um ponto dourado quando há novidade.
 */
export function abrirMenuPausa(o: { aoFechar?: () => void; aoMudarPv?: (recuperou: number) => void } = {}): () => void {
  audio.sfx('ui-click');
  let fecharModal = () => {};
  const fechar = () => fecharModal();
  const novidade = getEstado().campanha.compendio.novidade;
  const btnCompendio = botao(textos.compendio.titulo, () => abrirCompendio());
  if (novidade) btnCompendio.append(h('span', { class: 'ponto-novidade', 'aria-label': 'novidade' }));
  btnCompendio.classList.add('btn-compendio');
  const corpo = h('div', { class: 'pausa-botoes' },
    botao(textos.cenas.continuar, () => fechar(), { classe: 'btn-principal' }),
    botao(textos.progresso.itens, () => abrirItens({ aoMudarPv: o.aoMudarPv })),
    btnCompendio,
    botao(textos.cenas.diario.titulo, () => abrirDiario()),
    botao(textos.sonho.opcoes, () => abrirOpcoes()),
    botao(textos.sonho.voltarMenu, () => { fechar(); void irPara('menu'); }, { som: 'ui-back' }),
  );
  fecharModal = abrirModal(textos.cenas.pausa, corpo, textos.cenas.fechar, () => o.aoFechar?.());
  return fechar;
}

export function abrirDiario(): void {
  const T = textos.cenas;
  const c = getEstado().campanha;
  const corpo = h('div', { class: 'diario' });
  for (const cap of Object.values(CAPITULOS).filter((x) => x.numero <= c.capitulo)) {
    const resumo = resumoDoCapitulo(cap);
    corpo.append(
      h('h3', {}, `${T.capitulo} ${String(cap.numero).padStart(2, '0')} · ${cap.titulo}`),
      resumo.length ? h('ul', { class: 'diario-resumo' }, ...resumo.map((l) => h('li', {}, l))) : h('p', { class: 'diario-vazio' }, T.diario.semResumo),
    );
  }
  abrirModal(T.diario.titulo, corpo, T.fechar);
}

/** Itens: Reais no topo; itens de cura com "Usar"; cesto com "Comer um pão" (com confirmação); peças de missão com contador. */
export function abrirItens(o: { aoMudarPv?: (recuperou: number) => void } = {}): void {
  const T = textos.progresso;
  const corpo = h('div', { class: 'itens' });
  const desenhar = () => {
    const c = getEstado().campanha;
    const linhas: Node[] = [h('p', { class: 'itens-reais' }, h('strong', {}, `${c.reais}`), ` ${T.reais}`),
      h('p', { class: 'itens-pv' }, `PV ${pvAtual()} / ${pvMaxAtual()}`)];
    const grupos = new Map<string, { atual: number; total: number; icone: string }>();
    for (const [id, def] of Object.entries(ITENS_DEF)) {
      const n = qtdItem(id);
      if (def.grupo) {
        const g = grupos.get(def.grupo) ?? { atual: 0, total: def.total ?? 0, icone: def.icone };
        g.atual += n;
        grupos.set(def.grupo, g);
        continue;
      }
      if (n <= 0) continue;
      const icone = h('img', { class: 'item-icone', src: src(ASSETS.item(def.icone)), alt: '', draggable: 'false' });
      const info = h('div', { class: 'item-info' }, h('p', { class: 'item-nome' }, def.contador ? def.nome : `${def.nome} ×${n}`),
        h('p', { class: 'item-texto' }, def.contador
          ? `${def.contador.rotulo} ${n}/${def.contador.total} · ${c.flags.includes('comeu_pao') ? T.faltaPao : T.intacto}`
          : def.texto ?? ''));
      let acao: HTMLButtonElement | null = null;
      if (def.tipo === 'cura') {
        acao = botao(T.usar, () => {
          if (pvAtual() >= pvMaxAtual()) return aviso(T.pvCheio);
          const r = usarItemCura(id);
          o.aoMudarPv?.(r);
          aviso(T.pvMais.replace('{n}', String(r)));
          desenhar();
        }, { classe: 'btn-discreto item-usar' });
      } else if (id === 'cesto-paes') {
        acao = botao(T.comerPao, () => confirmarPao(), { classe: 'btn-discreto item-usar' });
      }
      const linha = h('div', { class: 'item-linha', 'data-item': id }, icone, info);
      if (acao) linha.append(acao);
      linhas.push(linha);
    }
    for (const [grupo, g] of grupos) {
      if (!g.atual) continue;
      linhas.push(h('div', { class: 'item-linha', 'data-grupo': grupo },
        h('img', { class: 'item-icone', src: src(ASSETS.item(g.icone)), alt: '', draggable: 'false' }),
        h('div', { class: 'item-info' }, h('p', { class: 'item-nome' }, `${grupo} ${g.atual}/${g.total}`))));
    }
    if (linhas.length === 2) linhas.push(h('p', { class: 'itens-vazio' }, T.semItens));
    corpo.replaceChildren(...linhas);
  };
  const aviso = (t: string) => {
    const a = h('p', { class: 'itens-aviso', role: 'status' }, t);
    corpo.querySelector('.itens-aviso')?.remove();
    corpo.prepend(a);
    setTimeout(() => a.remove(), 1800);
  };
  const confirmarPao = () => {
    if (getEstado().campanha.flags.includes('comeu_pao')) return comer();
    const caixa = h('div', { class: 'itens-confirmar' }, h('p', {}, T.confirmarPao),
      botao(T.comerMesmo, () => { caixa.remove(); comer(); }, { classe: 'btn-principal' }),
      botao(T.naoComer, () => caixa.remove(), { som: 'ui-back' }));
    corpo.append(caixa);
  };
  const comer = () => {
    const r = comerPao();
    o.aoMudarPv?.(r);
    desenhar();
    aviso(T.pvMais.replace('{n}', String(r)));
  };
  desenhar();
  abrirModal(T.itens, corpo, textos.cenas.fechar);
}
