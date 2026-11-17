import { expect, test } from '@playwright/test';
import { avancar, cartaoComConteudo, dentroDoCartao, foto, irAteMenu, rodapeAlcancavel } from './ajudantes';

test('passo Nome: input, dica e "Sugerir nome" dentro do cartão; digitar e avançar', async ({ page }, info) => {
  await irAteMenu(page);
  await page.getByRole('button', { name: 'Novo Jogo' }).click();

  await page.locator('.card-genero', { hasText: 'Mulher' }).click();
  await avancar(page).click();
  await page.locator('.card-raca', { hasText: 'Azakar' }).click();
  await page.locator('.card-variante', { hasText: 'Luz' }).click();
  await avancar(page).click();
  await page.locator('.card-origem', { hasText: 'Curandeiro' }).click();
  await avancar(page).click();

  await cartaoComConteudo(page);
  await expect(page.getByRole('heading', { name: 'Como você se chama?' })).toBeVisible();
  const input = page.locator('.campo-nome');
  await dentroDoCartao(page, input);
  await dentroDoCartao(page, page.locator('.nome-dica'));
  await dentroDoCartao(page, page.getByRole('button', { name: 'Sugerir nome' }));
  expect(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await rodapeAlcancavel(page);
  await expect(avancar(page)).toBeDisabled();
  await foto(page, info, 'nome');

  await input.fill('L');
  await expect(avancar(page)).toBeDisabled();
  await input.fill('Lia');
  await expect(avancar(page)).toBeEnabled();
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'Distribua seus atributos' })).toBeVisible();
});
