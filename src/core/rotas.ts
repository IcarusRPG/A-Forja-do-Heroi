/**
 * Rotas internas do jogo, por hash: https://game.icarusrpg.com.br/aforjadoheroi/#/privacidade.
 *
 * O GitHub Pages sempre entrega o index.html em /aforjadoheroi/, então abrir o link direto ou
 * recarregar funciona sem servidor. Quem abrir um caminho sem hash (/aforjadoheroi/privacidade) cai
 * no 404.html gerado no build (vite.config.ts), que leva para a versão com hash.
 *
 * A query também vale para as telas de conferência: ?tela=gameover é o mesmo que #/gameover.
 */

/** Nome da rota atual: "privacidade", "gameover"… ou "" na raiz do jogo. */
export function rotaAtual(): string {
  const hash = location.hash.replace(/^#\/?/, '').replace(/\/+$/, '').split('?')[0];
  if (hash) return decodeURIComponent(hash).toLowerCase();
  const tela = new URLSearchParams(location.search).get('tela');
  if (tela) return tela.toLowerCase();
  // Caminho depois do base (/aforjadoheroi/gameover), para servidores que entregam o index.html
  // em qualquer caminho (o vite preview, por exemplo). No GitHub Pages quem faz isso é o 404.html.
  const base = import.meta.env.BASE_URL;
  const resto = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : '';
  return decodeURIComponent(resto.replace(/\/+$/, '').replace(/^index\.html$/, '')).toLowerCase();
}

/** Link para uma rota interna (ex.: urlDaRota('privacidade') → /aforjadoheroi/#/privacidade). */
export const urlDaRota = (nome: string): string => `${import.meta.env.BASE_URL}#/${nome}`;
