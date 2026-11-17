import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { getEstado, temSave } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { ehToque, textos } from '../core/textos';
import { botao, h } from '../core/ui';
import { abrirCreditos } from './creditos';
import { abrirOpcoes } from './opcoes';

export function telaMenu(): Tela {
  const t = textos.menu;
  const continuar = botao(t.continuar, () => {
    const p = getEstado().personagem;
    // Heróis salvos antes da escolha de classe retomam a criação no passo Classe.
    if (p && !p.classe) void irPara('criacao', { retomar: p });
    else void irPara('emBreve');
  }, { desabilitado: !temSave() });
  const botoes = h('nav', { class: 'menu-botoes', 'aria-label': 'Menu principal' },
    botao(t.novoJogo, () => void irPara('criacao'), { classe: 'btn-principal', som: 'ui-confirm' }),
    continuar,
    botao(t.opcoes, abrirOpcoes),
    botao(t.creditos, abrirCreditos),
  );

  const el = h('div', { class: 'tela-menu' },
    h('img', { class: 'menu-wallpaper', src: src(ASSETS.wallpaperMenu), alt: '', draggable: 'false' }),
    h('div', { class: 'menu-sombra' }),
    h('div', { class: 'menu-conteudo' },
      h('div', { class: 'menu-logos' },
        h('img', { class: 'menu-logo-icarus', src: src(ASSETS.logoIcarus), alt: 'Icarus', draggable: 'false' }),
        h('img', { class: 'menu-logo-forja', src: src(ASSETS.logoForja), alt: 'A Forja do Herói', draggable: 'false' }),
      ),
      botoes,
    ),
    h('div', { class: 'menu-versao' }, t.versao),
  );

  return {
    el,
    aoEntrar() {
      audio.tocarMusica(ASSETS.musicaMenu, 2000);
      requestAnimationFrame(() => el.classList.add('entrou'));
      // Foco no primeiro botão para quem usa teclado, sem mostrar o anel de foco no mouse.
      if (!ehToque()) setTimeout(() => (botoes.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true }), 1500);
    },
  };
}
