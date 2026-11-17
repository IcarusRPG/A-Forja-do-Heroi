# A Forja do Herói

RPG narrativo de navegador ambientado em **Icarus**, o sistema de RPG de mesa autoral.
Já jogável: carregamento, vídeo de abertura, menu, criação de personagem (Araké, Azakar, Nyashi e Ayoran; cinco classes), prólogo e o **sonho dos deuses**, a primeira cena de exploração.

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
| `npm run assets` | Copia e otimiza as mídias da pasta `FdG` para `public/assets` (retratos, wallpaper e mapas navegáveis em WebP, logos em PNG, vídeo em H.264 se passar de 50 MB). Aceita outra pasta: `node scripts/prepare-assets.mjs "D:\caminho\FdG"` |
| `npm run sfx` | Regera os efeitos sonoros provisórios em `public/assets/sfx` |
| `npm run test:mobile` | Testes e2e (Playwright) da criação de personagem e do sonho dos deuses em Pixel 7, iPhone 13 e paisagem 844×390; screenshots em `tests/screenshots/`. Na primeira vez: `npx playwright install chromium webkit`. Para testar o site publicado em vez do build local: `BASE_URL=https://icarusrpg.github.io/A-Forja-do-Heroi/ npm run test:mobile` |

Os originais da pasta `FdG` nunca são movidos nem alterados. Para recodificar o vídeo mesmo que já exista uma versão otimizada, use `FORCAR_VIDEO=1 npm run assets`.

## Estrutura

```
src/
├─ main.ts        # registra as telas e começa no carregamento
├─ core/          # telas, estado (localStorage), áudio, pré-carregamento, vídeo, regras
├─ exploracao/    # motor de exploração (Phaser 3): mapa, colisões, herói chibi, controles, caixa de fala
├─ screens/       # loading, intro, menu, opções, créditos, criação, prólogo, sonho, despertar, em breve
├─ data/          # raças, origens, classes, nomes, mapas/*.json e todos os textos do jogo
└─ styles/
public/assets/    # vídeo, música, logos, wallpaper, retratos e efeitos
```

Todo texto visível ao jogador está em `src/data/textos.json` (com flexão de gênero: `{heroi}` vira herói ou heroína).

## Exploração (sonho dos deuses)

- **Controles:** setas ou WASD para andar; E ou Espaço para interagir; Esc para pausar. No celular: joystick no canto inferior esquerdo, botão ✦ (aparece perto de algo) e botão de pausa.
- **Motor reutilizável:** cada mapa é um JSON em `src/data/mapas/` com a imagem, o ponto de início, as camadas de colisão (polígonos `andavel`/`bloqueado`, avaliados em ordem: a última camada que contém o ponto decide), as áreas de interação e os gatilhos. O Phaser só é baixado ao entrar na exploração.
- **Modo de ajuste:** abra o jogo com `?debug=1` (ou aperte F2 no `npm run dev`) para ver as colisões (verde/vermelho), as áreas de interação (azul) e os gatilhos (amarelo). Um clique no mapa mostra a coordenada daquele ponto.
- **Ganchos de teste:** com `?test=1`, `window.__fdg.teleport(id)`, `__fdg.interact()` e `__fdg.state()`.

## Mídias que podem ser trocadas

- **Vídeo do prólogo:** coloque `public/assets/video/prologo.mp4`. Sem ele, o jogo mostra o prólogo em texto.
- **Efeitos sonoros:** os `.wav` em `public/assets/sfx/` são provisórios. Substitua mantendo os mesmos nomes.
- **Sprites chibi:** coloque `public/assets/sprites/chibi-<raca>-<m|f>.png` (grade 4 × 4 de quadros de 48 × 48 px; linhas: baixo, esquerda, direita, cima). Sem o arquivo, o jogo desenha um boneco provisório.
- **Música do sonho:** coloque `public/assets/music/sonho.mp3` (ou `.ogg`/`.m4a`), ou um arquivo cujo nome comece com "sonho" na pasta de músicas do FdG antes de `npm run assets`. Sem ela, toca um ambiente sintetizado.
- **Créditos:** acrescente linhas em `creditos.extras` no `textos.json`.

## Publicação

Cada push na `main` dispara o workflow `.github/workflows/deploy.yml`, que faz o build e publica no GitHub Pages.
