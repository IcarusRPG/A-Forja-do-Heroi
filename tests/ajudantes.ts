import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Do carregamento até o menu: toca em "começar" e pula a abertura assim que der. */
export async function irAteMenu(page: Page, caminho = './'): Promise<void> {
  await page.goto(caminho);
  const comecar = page.locator('.loading-comecar');
  await expect(comecar).toBeVisible({ timeout: 90_000 });
  await comecar.click();
  const menu = page.locator('.tela-menu');
  for (let i = 0; i < 80 && !(await menu.isVisible()); i++) {
    // O "pular" só vale depois de 5 s de vídeo; se o vídeo falhar, o jogo já vai ao menu.
    if (await page.locator('.dica-pular.visivel').isVisible()) await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  await expect(menu).toBeVisible();
}

export const avancar = (page: Page): Locator => page.locator('.criacao-rodape .btn-principal');

/** O elemento está inteiro dentro do cartão do passo (não vazou para fora nem ficou escondido). */
export async function dentroDoCartao(page: Page, alvo: Locator): Promise<void> {
  await expect(alvo).toBeVisible();
  const cartao = await page.locator('.criacao-conteudo').boundingBox();
  await alvo.scrollIntoViewIfNeeded();
  const caixa = await alvo.boundingBox();
  expect(cartao && caixa).toBeTruthy();
  expect(caixa!.x).toBeGreaterThanOrEqual(cartao!.x - 1);
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(cartao!.x + cartao!.width + 1);
}

/** O cartão do passo não está vazio (tem conteúdo de verdade, visível). */
export async function cartaoComConteudo(page: Page): Promise<void> {
  const secao = page.locator('.criacao-conteudo > section');
  await expect(secao).toBeVisible();
  const caixa = await secao.boundingBox();
  expect(caixa!.height).toBeGreaterThan(60);
}

/** Avançar e Voltar alcançáveis (dentro da tela e com 44 px de altura). */
export async function rodapeAlcancavel(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  for (const b of await page.locator('.criacao-rodape .btn').all()) {
    if (!(await b.isVisible())) continue;
    const c = (await b.boundingBox())!;
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height + 1);
    expect(c.height).toBeGreaterThanOrEqual(44);
  }
}

export async function foto(page: Page, info: TestInfo, nome: string): Promise<void> {
  await page.waitForTimeout(450); // termina a animação de entrada do passo
  await page.screenshot({ path: `tests/screenshots/${info.project.name}-${nome}.png` });
}
