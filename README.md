# A Forja do Herói

RPG narrativo de navegador ambientado em **Icarus**, o sistema de RPG de mesa autoral.
Já jogável: carregamento, vídeo de abertura, menu, criação de personagem (Araké, Azakar, Nyashi e Ayoran; cinco classes), prólogo e o **sonho dos deuses**, a primeira cena de exploração.

**Jogar:** https://game.icarusrpg.com.br/aforjadoheroi/

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5174/aforjadoheroi/`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Checa os tipos e gera o site em `dist/` |
| `npm run assets` | Copia e otimiza as mídias da pasta `FdG` para `public/assets` (retratos, wallpaper e mapas navegáveis em WebP, logos em PNG, vídeo em H.264 se passar de 50 MB). Aceita outra pasta: `node scripts/prepare-assets.mjs "D:\caminho\FdG"` |
| `npm run sfx` | Regera os efeitos sonoros provisórios em `public/assets/sfx` |
| `npm run sprites` | Gera as folhas de caminhada (heróis e NPCs) e as folhas de batalha (ver abaixo). Caminhada: gera as folhas do herói (`public/assets/sprites/chibi-<raca>-<m\|f>.png`) a partir das folhas 2 × 2 de vistas paradas em `assets-src/sprites/<raca>-<m\|f>.png`; prévias 6× e GIFs em `tests/screenshots/sprites/`. Batalha (`scripts/build-battle-sprites.mjs`): folhas 3 × 2 de poses paradas em `assets-src/batalha/` viram folhas horizontais de 6 quadros alinhadas pelos pés + JSON em `public/assets/img/batalha/`; prévias em `tests/screenshots/batalha/` |
| `node scripts/conferir-mapa.mjs [saida.png]` | Confere o mapa do sonho: tudo alcançável a pé a partir da escada, caminho até o altar de cada estátua e largura das passagens |
| `node scripts/ver-mapa.mjs [saida.png]` | Desenha colisões, áreas de interação e recortes de profundidade sobre a imagem do mapa |
| `npm run test:unit` | Testes de unidade (`node --test`): simula deploys seguidos e confere que os assets do deploy anterior continuam publicados (`scripts/manter-assets.mjs`) |
| `npm run test:mobile` | Testes e2e (Playwright) da criação de personagem e do sonho dos deuses em Pixel 7, iPhone 13 e paisagem 844×390; screenshots em `tests/screenshots/`. Na primeira vez: `npx playwright install chromium webkit`. Para testar o site publicado em vez do build local: `BASE_URL=https://game.icarusrpg.com.br/aforjadoheroi/ npm run test:mobile` |

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
- **Profundidade:** o herói é desenhado na profundidade do y dos pés. Os `oclusores` do JSON (estátuas e balaustrada da frente) são recortados da própria imagem do mapa ao carregar (`src/exploracao/recorte.ts`: o chão claro é "inundado" a partir do contorno e sobra só a peça) e desenhados na profundidade da sua `base`: com os pés acima dessa linha, o herói fica atrás.
- **Caminhada automática:** `motor.caminharAte(x, y)` calcula o caminho na malha andável (A* + linha de visão) e anda na velocidade normal. Depois da 7ª voz, o herói vai sozinho até o altar.
- **Clima:** neblina em duas camadas (densa nas bordas, leve no caminho; a fina passa na frente do herói), partículas douradas e tremores ocasionais a cada 15–30 s. Os tremores de câmera podem ser desligados em Opções → "Tremores de tela" (com `prefers-reduced-motion`, começam desligados). Se o FPS cair abaixo de 45, a neblina e as partículas diminuem.
- **Modo de ajuste:** abra o jogo com `?debug=1` (ou aperte F2 no `npm run dev`) para ver as colisões (verde/vermelho), as áreas de interação (azul), os gatilhos (amarelo) e os recortes de profundidade (magenta). Um clique no mapa mostra a coordenada daquele ponto.
- **Ganchos de teste:** com `?test=1`, `window.__fdg.teleport(id | "x,y")`, `__fdg.walkTo("x,y")`, `__fdg.interact()`, `__fdg.tremor()` e `__fdg.state()`.

## Capítulos e cenas narrativas

- **Roteiro em dados:** cada capítulo é um JSON em `src/data/capitulos/` com a lista de cenas: `fundo`, `musica` (`"fullmun"` é a playlist da vila; o resto é o nome do arquivo em `music/`), `falas` (`quem`: vazio = narração, `"pensamento"`, `"heroi"` ou o id de um NPC de `src/data/npcs.json`) e `escolhas` (`requer` por origem/flag/semFlag/gênero, `uma_vez`, `efeitos`, `teste` de perícia com `sucesso`/`falha`, `batalha` com `vitoria`/`derrota`). Texto: `{nome}` e `{homem|mulher}`.
- **Testes de perícia:** d20 + atributo + 2 da origem (se for a perícia dela) + bônus raciais + bônus do próximo teste. Antes da Forja, o treino de classe não conta.
- **Save:** 1 slot automático (`fdg.save.auto`) e 2 manuais (`fdg.save.manual1`, `fdg.save.manual2`) no localStorage; opções em `fdg.opcoes`. Salvar no menu de pausa, Carregar e Continuar (o mais recente) no menu inicial, cópia de segurança em .json na tela Carregar. O localStorage é separado por domínio: saves de outro endereço só passam para cá exportando lá e importando aqui.

## Batalha (estilo Final Fantasy VI)

- Inimigos em `src/data/inimigos/*.json` (PV, Defesa, Iniciativa, ataques, IA, poses) e regiões em `src/data/regioes.json` (fundo e música). Um combate novo precisa só de dados e sprites.
- Iniciativa automática (d20 + DES), ordem fixa; comandos Bicuda, Intimidar, Acalmar e Aguardar. Não existe fugir.
- Game Over genérico: `?tela=gameover` (não é usado no Capítulo 01).
- Ganchos de teste (`?test=1`): `__fdg.forceRoll([n, …])` (próximos d20), `__fdg.goto(cena)`, `__fdg.state()`; na batalha também `__fdg.setPv(n)`.

## Mídias que podem ser trocadas

- **Vídeo do prólogo:** coloque `public/assets/video/prologo.mp4`. Sem ele, o jogo mostra o prólogo em texto.
- **Efeitos sonoros:** os `.wav` em `public/assets/sfx/` são provisórios. Substitua mantendo os mesmos nomes.
- **Sprites chibi:** as folhas de caminhada são geradas por `npm run sprites` a partir das folhas 2 × 2 em `assets-src/sprites/` (frente, esquerda / direita, costas). Formato final: grade 4 × 4 de quadros de 48 × 48 px; linhas: baixo, esquerda, direita, cima. Sem o arquivo, o jogo desenha um boneco provisório.
- **Música do sonho:** coloque `public/assets/music/sonho.mp3` (ou `.ogg`/`.m4a`), ou um arquivo cujo nome comece com "sonho" na pasta de músicas do FdG antes de `npm run assets`. Sem ela, toca um ambiente sintetizado.
- **Créditos:** acrescente linhas em `creditos.extras` no `textos.json`.

## Variáveis de ambiente

| Variável | Valor | Para quê |
| --- | --- | --- |
| `VITE_PB_URL` | `https://api.icarusrpg.com.br` | Endereço do PocketBase. O código lê `import.meta.env.VITE_PB_URL` e nunca tem o endereço fixo |

- **Local:** copie `.env.example` para `.env.local` (fica fora do git).
- **Publicação:** crie a variável `VITE_PB_URL` no repositório (Settings → Secrets and variables → Actions → Variables); o workflow a passa para o build.

## Endereço e rotas

- O jogo é servido em **https://game.icarusrpg.com.br/aforjadoheroi/**: GitHub Pages do repositório `IcarusRPG/aforjadoheroi`, com o domínio próprio `game.icarusrpg.com.br` configurado no site da conta (`IcarusRPG/icarusrpg.github.io`). O `base` do Vite é `/aforjadoheroi/`, e todos os assets passam por `import.meta.env.BASE_URL` (nada começa com `/assets`).
- **Rotas por hash:** `#/privacidade` vira `https://game.icarusrpg.com.br/aforjadoheroi/#/privacidade`; abrir o link direto ou recarregar funciona. Quem abrir um caminho sem hash (`/aforjadoheroi/privacidade`) cai no `404.html` gerado no build, que leva para a versão com hash mantendo a query. Telas de conferência: `?tela=gameover` ou `#/gameover` (`src/core/rotas.ts`).

## Publicação

Cada push na `main` dispara o workflow `.github/workflows/deploy.yml`, que faz o build, roda os testes de unidade e publica no GitHub Pages.

- **Um deploy por vez:** `concurrency` com `cancel-in-progress: false`; o segundo espera o primeiro terminar.
- **Assets anteriores continuam no ar por 7 dias.** O Pages serve tudo com `Cache-Control: max-age=600`: por até 10 minutos depois de um deploy (ou numa aba aberta há horas) o jogo em execução ainda é o do build antigo e pede pedaços com o hash antigo. Antes de publicar, `scripts/manter-assets.mjs` baixa do site os arquivos de `assets/` do deploy anterior e junta com os novos; o manifesto `assets-manifest.json` (publicado junto) guarda a última vez que cada arquivo esteve num build, e o que saiu de uso há mais de 7 dias é descartado.
- **No jogo:** cada `import()` dinâmico tenta de novo até 2 vezes (500 ms e 1500 ms, com uma query nova), recarrega a página uma vez (marcado no `sessionStorage`) e, se ainda falhar, mostra "O jogo foi atualizado ou a conexão falhou." com o botão Recarregar (`src/core/carregar.ts`). O erro técnico nunca aparece para o jogador. Service workers antigos com o escopo do jogo são desregistrados.

## Registro de erros (PocketBase)

Com `VITE_PB_URL` definida, o jogo envia os erros para a coleção `erros` (no máximo 5 por sessão): mensagem, pilha (até 4 KB), endereço da página sem a query, navegador, versão do jogo (hash do commit, que também aparece no rodapé de Opções) e a tela em que o jogador estava. Nada pessoal: sem e-mail, sem nome do herói, sem save. Sem `VITE_PB_URL`, o envio fica desligado (`src/core/erros.ts`).

Para criar a coleção:

1. Entre no painel do PocketBase (`https://api.icarusrpg.com.br/_/`) como superusuário.
2. **Settings → Import collections → Load from JSON file** e escolha `pocketbase/colecao-erros.json` (formato do PocketBase 0.23 ou mais novo).
3. **Marque "Merge with the existing collections"**. Sem essa opção, o PocketBase apaga as coleções que não estão no arquivo. Na prévia, só a coleção `erros` deve aparecer, como nova. Clique em **Review → Confirm and import**.
4. Regras: **create** público, limitado pelo tamanho de cada campo; **list, view, update e delete** vazios (nulos), ou seja, só superusuário.
5. Para testar: abra o jogo, rode no console `setTimeout(() => { throw new Error('teste') })` e veja o registro em **Collections → erros**.
