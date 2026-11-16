import { audio } from '../core/audio';
import { atualizarConfig, getEstado, type Config } from '../core/estado';
import { textos } from '../core/textos';
import { abrirModal, h } from '../core/ui';

function controleVolume(rotulo: string, chave: 'musica' | 'efeitos', aoMudar?: () => void): HTMLElement {
  const id = `vol-${chave}`;
  const valor = h('output', { class: 'opcao-valor', for: id }, `${Math.round(getEstado().config[chave] * 100)}%`);
  const range = h('input', { id, type: 'range', min: 0, max: 100, step: 5, value: Math.round(getEstado().config[chave] * 100) });
  range.addEventListener('input', () => {
    const v = Number(range.value) / 100;
    atualizarConfig({ [chave]: v } as Partial<Config>);
    valor.textContent = `${range.value}%`;
    audio.aplicarVolumes();
    aoMudar?.();
  });
  return h('div', { class: 'opcao' }, h('label', { for: id }, rotulo), h('div', { class: 'opcao-controle' }, range, valor));
}

export function abrirOpcoes(): void {
  const t = textos.opcoes;
  let ultimoTeste = 0;
  // Toca um efeito de amostra ao mexer no volume dos efeitos (no máximo a cada 150 ms).
  const testarEfeito = () => {
    const agora = performance.now();
    if (agora - ultimoTeste > 150) {
      ultimoTeste = agora;
      audio.sfx('point-up');
    }
  };
  const mudo = h('input', { id: 'opcao-mudo', type: 'checkbox', class: 'interruptor', checked: getEstado().config.mudo });
  mudo.addEventListener('change', () => {
    atualizarConfig({ mudo: mudo.checked });
    audio.aplicarVolumes();
    audio.sfx('ui-click');
  });
  const corpo = h('div', { class: 'opcoes' },
    controleVolume(t.musica, 'musica'),
    controleVolume(t.efeitos, 'efeitos', testarEfeito),
    h('div', { class: 'opcao opcao-linha' }, h('label', { for: 'opcao-mudo' }, t.mudo), mudo),
  );
  abrirModal(t.titulo, corpo, t.fechar);
}
