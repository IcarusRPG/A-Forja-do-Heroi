import { defineConfig, type Plugin } from 'vite';

/**
 * O jogo é servido em https://game.icarusrpg.com.br/aforjadoheroi/ (GitHub Pages do repositório
 * IcarusRPG/aforjadoheroi; o domínio próprio vem do site da conta, IcarusRPG/icarusrpg.github.io).
 */
const BASE = '/aforjadoheroi/';

/**
 * Rotas internas são por hash (#/privacidade): o GitHub Pages sempre entrega o index.html para
 * /aforjadoheroi/, então abrir o link direto ou recarregar funciona. Para quem abrir um caminho sem
 * hash (/aforjadoheroi/privacidade), o GitHub Pages entrega o 404.html, que leva para a versão com
 * hash, mantendo a query (?tela=gameover) e o hash que já houver.
 */
function paginaDe404(): Plugin {
  return {
    name: 'fdg-404-para-hash',
    apply: 'build',
    generateBundle() {
      const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>A Forja do Herói</title>
<script>
  (function () {
    var base = ${JSON.stringify(BASE)};
    var l = window.location;
    var resto = l.pathname.indexOf(base) === 0 ? l.pathname.slice(base.length) : '';
    resto = resto.replace(/^\\/+|\\/+$/g, '').replace(/\\/?index\\.html$/, '');
    var hash = l.hash || (resto ? '#/' + resto : '');
    l.replace(base + l.search + hash);
  })();
</script>
</head>
<body><a href="${BASE}">A Forja do Herói</a></body>
</html>
`;
      this.emitFile({ type: 'asset', fileName: '404.html', source: html });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [paginaDe404()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    // O Phaser (~1,5 MB) fica num pedaço próprio, baixado só ao entrar na exploração.
    chunkSizeWarningLimit: 1600,
  },
  server: { port: 5174 },
  preview: { port: 4174 },
});
