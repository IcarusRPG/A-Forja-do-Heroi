# A Forja do Herói

RPG narrativo de navegador ambientado em **Icarus**, o sistema de RPG de mesa autoral.
Fase 1: tela de carregamento, vídeo de abertura, menu inicial, criação de personagem e prólogo.

**Jogar:** https://icarusrpg.github.io/A-Forja-do-Heroi/

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5174/A-Forja-do-Heroi/`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Checa os tipos e gera o site em `dist/` |
| `npm run assets` | Copia e otimiza as mídias da pasta `FdG` para `public/assets` (retratos e wallpaper em WebP, logos em PNG, vídeo em H.264 se passar de 50 MB). Aceita outra pasta: `node scripts/prepare-assets.mjs "D:\caminho\FdG"` |
| `npm run sfx` | Regera os efeitos sonoros provisórios em `public/assets/sfx` |
| `npm run test:mobile` | Testes e2e (Playwright) da criação de personagem em Pixel 7, iPhone 13 e paisagem 844×390; screenshots em `tests/screenshots/`. Na primeira vez: `npx playwright install chromium webkit` |

Os originais da pasta `FdG` nunca são movidos nem alterados. Para recodificar o vídeo mesmo que já exista uma versão otimizada, use `FORCAR_VIDEO=1 npm run assets`.

## Estrutura

```
src/
├─ main.ts        # registra as telas e começa no carregamento
├─ core/          # telas, estado (localStorage), áudio, pré-carregamento, vídeo, regras
├─ screens/       # loading, intro, menu, opções, créditos, criação, prólogo, em breve
├─ data/          # raças, origens, classes, nomes e todos os textos do jogo
└─ styles/
public/assets/    # vídeo, música, logos, wallpaper, retratos e efeitos
```

Todo texto visível ao jogador está em `src/data/textos.json` (com flexão de gênero: `{heroi}` vira herói ou heroína).

## Mídias que podem ser trocadas

- **Vídeo do prólogo:** coloque `public/assets/video/prologo.mp4`. Sem ele, o jogo mostra o prólogo em texto.
- **Efeitos sonoros:** os `.wav` em `public/assets/sfx/` são provisórios. Substitua mantendo os mesmos nomes.
- **Créditos:** acrescente linhas em `creditos.extras` no `textos.json`.

## Publicação

Cada push na `main` dispara o workflow `.github/workflows/deploy.yml`, que faz o build e publica no GitHub Pages.
