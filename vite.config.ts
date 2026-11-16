import { defineConfig } from 'vite';

// O site é servido em https://icarusrpg.github.io/A-Forja-do-Heroi/ (nome do repositório).
export default defineConfig({
  base: '/A-Forja-do-Heroi/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
  server: { port: 5174 },
  preview: { port: 4174 },
});
