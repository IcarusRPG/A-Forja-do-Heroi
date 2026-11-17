import { expect, test, type Page } from '@playwright/test';
import { avancar, cartaoComConteudo, dentroDoCartao, foto, irAteMenu, rodapeAlcancavel } from './ajudantes';

const titulo = (page: Page, texto: string) => page.getByRole('heading', { name: texto });
const retratoResumo = (page: Page) => page.locator('.painel-retrato');
/** Card de classe pelo título exato ("Paladina" contém "ladina"). */
const cardClasse = (page: Page, nome: string) =>
  page.locator('.card-classe').filter({ has: page.locator('.card-titulo').getByText(nome, { exact: true }) });

/** Confere o passo: cartão com conteúdo, rodapé alcançável e Avançar ainda bloqueado. */
async function inicioDoPasso(page: Page, tituloPasso: string) {
  await expect(titulo(page, tituloPasso)).toBeVisible();
  await cartaoComConteudo(page);
  await rodapeAlcancavel(page);
}

async function comprar(page: Page, compras: Record<string, number>) {
  for (const [atributo, vezes] of Object.entries(compras))
    for (let i = 0; i < vezes; i++) await page.getByRole('button', { name: `Aumentar ${atributo}` }).click();
}

test('criação completa: Azakar mulher, Sombra, Curandeiro, Paladina', async ({ page }, info) => {
  await irAteMenu(page);
  await page.getByRole('button', { name: 'Novo Jogo' }).click();

  // 1. Gênero
  await inicioDoPasso(page, 'Quem atende ao chamado?');
  await expect(avancar(page)).toBeDisabled();
  await page.locator('.card-genero', { hasText: 'Mulher' }).click();
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, '1-genero');
  await avancar(page).click();

  // 2. Raça + variante
  await inicioDoPasso(page, 'De que povo você vem?');
  await expect(avancar(page)).toBeDisabled();
  await page.locator('.card-raca', { hasText: 'Azakar' }).click();
  await expect(avancar(page)).toBeDisabled(); // falta a variante
  await page.locator('.card-variante', { hasText: 'Sombra' }).click();
  await expect(avancar(page)).toBeEnabled();
  await expect(retratoResumo(page)).toHaveAttribute('src', /./);
  await foto(page, info, '2-raca');
  await avancar(page).click();

  // 3. Origem
  await inicioDoPasso(page, 'Quem você era antes da aventura?');
  await expect(avancar(page)).toBeDisabled();
  await page.locator('.card-origem', { hasText: 'Curandeiro' }).click();
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, '3-origem');
  await avancar(page).click();

  // 4. Classe
  await inicioDoPasso(page, 'Que caminho você vai seguir?');
  await expect(avancar(page)).toBeDisabled();
  await expect(page.locator('.card-classe')).toHaveCount(8);
  await expect(page.locator('.card-classe:not(.bloqueado)')).toHaveCount(5);
  await expect(page.locator('.card-classe.bloqueado')).toHaveCount(3);
  for (const nome of ['Guerreira', 'Paladina', 'Ladina', 'Arcanista (Mago)', 'Monja']) await expect(cardClasse(page, nome)).toBeVisible();
  // Retrato do card conforme raça e gênero.
  await expect(cardClasse(page, 'Paladina').locator('img')).toHaveAttribute('data-retrato', /azakar-f-paladino/);
  // Indisponível: não seleciona e mostra o aviso no toque.
  const pistoleira = cardClasse(page, 'Pistoleira');
  await pistoleira.scrollIntoViewIfNeeded();
  // aria-disabled faz o Playwright recusar o .tap(); um dedo de verdade toca do mesmo jeito.
  const caixa = (await pistoleira.boundingBox())!;
  await page.touchscreen.tap(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await expect(pistoleira.locator('.card-aviso')).toHaveText('Indisponível na versão DEMO');
  await expect(pistoleira.locator('.card-aviso')).toHaveCSS('opacity', '1');
  await expect(avancar(page)).toBeDisabled();
  await expect(page.locator('.card-classe.selecionado')).toHaveCount(0);
  // O aviso some sozinho em 2 s.
  await expect(pistoleira.locator('.card-aviso')).toHaveCSS('opacity', '0', { timeout: 4000 });
  // Escolhe Paladina: o retrato do resumo vira o da classe.
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/azakar-f-comum.webp');
  await cardClasse(page, 'Paladina').click();
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/azakar-f-paladino.webp');
  await expect(page.locator('.detalhe-classe')).toContainText('Paladina');
  await expect(page.locator('.detalhe-classe')).toContainText('Espada e escudo');
  await expect(page.locator('.pv-formula')).toHaveText('18 + Constituição');
  await expect(page.locator('.pm-formula')).toHaveText('4');
  await expect(avancar(page)).toBeEnabled();
  await page.locator('.passo-classe .passo-cabecalho').scrollIntoViewIfNeeded();
  await foto(page, info, '4-classe');
  await page.locator('.detalhe-classe').scrollIntoViewIfNeeded();
  await foto(page, info, '4-classe-detalhe');
  await avancar(page).click();

  // 5. Nome
  await inicioDoPasso(page, 'Como você se chama?');
  const input = page.locator('.campo-nome');
  await dentroDoCartao(page, input);
  await dentroDoCartao(page, page.locator('.nome-dica'));
  await dentroDoCartao(page, page.getByRole('button', { name: 'Sugerir nome' }));
  expect(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(avancar(page)).toBeDisabled();
  await foto(page, info, '5-nome');
  await input.fill('L');
  await expect(avancar(page)).toBeDisabled();
  await input.fill('Lilith');
  await expect(avancar(page)).toBeEnabled();
  await input.press('Enter');

  // 6. Atributos
  await inicioDoPasso(page, 'Distribua seus atributos');
  await expect(page.locator('.selo-chave')).toHaveText('Atributo-chave da Paladina: CAR');
  await expect(page.locator('.atributo.chave')).toHaveAttribute('data-atributo', 'CAR');
  await expect(page.locator('.pv-valor')).toHaveText('17'); // 18 + CON −1 (Azakar)
  await expect(page.locator('.pm-valor')).toHaveText('4');
  await expect(avancar(page)).toBeDisabled();
  await comprar(page, { Carisma: 3, Força: 2, Constituição: 2, Destreza: 1, Sabedoria: 1 });
  await expect(page.locator('.pontos-valor')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Aumentar Inteligência' })).toBeDisabled();
  await expect(page.locator('.pv-valor')).toHaveText('19'); // 18 + (2 − 1)
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, '6-atributos');
  await avancar(page).click();

  // 7. Revisão
  await inicioDoPasso(page, 'Sua heroína está pronta');
  await expect(page.locator('.revisao-classe')).toHaveText('Paladina');
  await expect(page.locator('.passo-revisao')).toContainText('Espada e escudo');
  await expect(page.locator('.revisao-retrato')).toHaveAttribute('data-retrato', 'img/herois/azakar-f-paladino.webp');
  await expect(page.locator('.passo-revisao .pv-valor')).toHaveText('19');
  await expect(page.locator('.passo-revisao .pm-valor')).toHaveText('4');
  await expect(avancar(page)).toHaveText('Confirmar heroína');
  await foto(page, info, '7-revisao');
  await avancar(page).click();

  await expect(page.locator('.tela-prologo')).toBeVisible({ timeout: 10_000 });
  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('a-forja-do-heroi:estado') ?? '{}').personagem);
  expect(salvo).toMatchObject({
    nome: 'Lilith', genero: 'f', raca: 'azakar', variante: 'sombra', origem: 'curandeiro', classe: 'paladino',
    pvMax: 19, pmMax: 4, pedras: { tolerancia: false, egide: false, verdade: false, preco: false },
  });
});

test('Araké homem Mago: o +1 de Araké em INT entra no PM', async ({ page }, info) => {
  await irAteMenu(page);
  await page.getByRole('button', { name: 'Novo Jogo' }).click();
  await page.locator('.card-genero', { hasText: 'Homem' }).click();
  await avancar(page).click();
  await page.locator('.card-raca', { hasText: 'Araké' }).click();
  await avancar(page).click();
  await page.locator('.card-origem', { hasText: 'Estudioso' }).click();
  await avancar(page).click();
  await expect(cardClasse(page, 'Arcanista (Mago)').locator('img')).toHaveAttribute('data-retrato', /arake-m-arcanista/);
  await expect(cardClasse(page, 'Guerreiro')).toBeVisible();
  await cardClasse(page, 'Arcanista (Mago)').click();
  await expect(page.locator('.pm-formula')).toHaveText('5 + Inteligência');
  await avancar(page).click();
  await page.locator('.campo-nome').fill('Aldren');
  await avancar(page).click();

  await expect(page.locator('.selo-chave')).toHaveText('Atributo-chave do Mago: INT');
  await comprar(page, { Inteligência: 3, Constituição: 2, Destreza: 2, Sabedoria: 1, Carisma: 1 });
  await expect(page.locator('.pm-valor')).toHaveText('8'); // 5 + INT 3
  await expect(avancar(page)).toBeDisabled(); // faltam os bônus de Araké
  await page.locator('[data-atributo="INT"] .btn-bonus').click();
  await expect(page.locator('.pm-valor')).toHaveText('9'); // 5 + INT 4
  await page.locator('[data-atributo="CON"] .btn-bonus').click();
  await page.locator('[data-atributo="DES"] .btn-bonus').click();
  await expect(page.locator('.pv-valor')).toHaveText('15'); // 12 + CON 3
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, 'mago-atributos');
  await avancar(page).click();

  await expect(page.locator('.revisao-classe')).toHaveText('Arcanista (Mago)');
  await expect(page.locator('.passo-revisao .pm-valor')).toHaveText('9');
  await expect(page.locator('.passo-revisao')).toContainText('Cajado (também é o foco arcano)');
  await expect(avancar(page)).toHaveText('Confirmar herói');
  await foto(page, info, 'mago-revisao');
});

test('save antigo sem classe: Continuar retoma no passo Classe', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      config: { musica: 0.7, efeitos: 0.8, mudo: false },
      personagem: {
        nome: 'Feliks', genero: 'm', raca: 'arake', variante: null, origem: 'guarda',
        atributosComprados: { FOR: 4, DES: 2, CON: 1, INT: 1, SAB: -1, CAR: 0 }, bonusArake: ['FOR', 'CAR', 'SAB'],
        atributosFinais: { FOR: 5, DES: 2, CON: 1, INT: 1, SAB: 0, CAR: 1 }, classe: null, criadoEm: '2026-11-16T20:28:05.999Z',
      },
    }));
  });
  await irAteMenu(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(titulo(page, 'Que caminho você vai seguir?')).toBeVisible();
  await expect(page.locator('.painel-resumo')).toContainText('Araké');
  await expect(page.locator('.painel-resumo')).toContainText('Guarda');
  await cardClasse(page, 'Guerreiro').click();
  await avancar(page).click();
  await expect(page.locator('.campo-nome')).toHaveValue('Feliks');
  await avancar(page).click();
  await expect(page.locator('.pontos-valor')).toHaveText('0');
  await expect(page.locator('.pv-valor')).toHaveText('21'); // 20 + CON 1
  await avancar(page).click();
  await expect(page.locator('.revisao-classe')).toHaveText('Guerreiro');
  await avancar(page).click();
  await expect(page.locator('.tela-prologo')).toBeVisible({ timeout: 10_000 });
  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('a-forja-do-heroi:estado') ?? '{}').personagem);
  expect(salvo).toMatchObject({ classe: 'guerreiro', pvMax: 21, pmMax: 3 });
});
