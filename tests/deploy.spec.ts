import { expect, test } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/* Endereço novo (game.icarusrpg.com.br/aforjadoheroi/): base do Vite, rotas por hash, 404.html e aviso de saves. */

test('tudo carrega sob /aforjadoheroi/ (nenhum pedido fora do base nem com erro)', async ({ page, baseURL }) => {
  const base = new URL(baseURL!).pathname;
  const fora: string[] = [];
  const falhas: string[] = [];
  page.on('request', (r) => {
    if (!/^https?:/.test(r.url())) return; // blob: e data: são da memória, não pedidos de rede
    const u = new URL(r.url());
    if (u.origin === new URL(baseURL!).origin && !u.pathname.startsWith(base)) fora.push(u.pathname);
  });
  page.on('response', (r) => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`); });
  await irAteMenu(page, './?test=1');
  expect(base).toBe('/aforjadoheroi/');
  expect(fora).toEqual([]);
  expect(falhas).toEqual([]);
});

test('rotas: #/gameover, ?tela=gameover e o caminho /gameover abrem a mesma tela, também ao recarregar', async ({ page }) => {
  for (const caminho of ['./#/gameover', './?tela=gameover', './gameover']) {
    await page.goto(caminho);
    await page.locator('.loading-comecar').click({ timeout: 90_000 });
    await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 20_000 });
  }
  await page.reload();
  await page.locator('.loading-comecar').click({ timeout: 90_000 });
  await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 20_000 });
});

test('404.html: um caminho sem hash vira a rota com hash, mantendo a query', async ({ page, baseURL }) => {
  await page.goto('./404.html?x=1');
  await expect(page).toHaveURL(`${baseURL}?x=1#/404.html`);
  await page.goto('./404.html#/gameover');
  await expect(page).toHaveURL(`${baseURL}#/gameover`);
  await page.locator('.loading-comecar').click({ timeout: 90_000 });
  await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 20_000 });
});

test('aviso de mudança de endereço: só na primeira abertura sem save, com o Importar', async ({ page }, info) => {
  await irAteMenu(page, './?test=1');
  const aviso = page.locator('.menu-aviso-endereco');
  await expect(aviso).toContainText('O jogo mudou de endereço. Se você tinha saves no endereço antigo, abra-o, exporte uma cópia de segurança e importe aqui.');
  await expect(aviso.locator('.menu-importar')).toBeVisible();
  // Não cobre os botões do menu
  await expect(page.getByRole('button', { name: 'Novo Jogo' })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `tests/screenshots/${info.project.name}-deploy-aviso-endereco.png` });
  await aviso.locator('.menu-aviso-ok').click();
  await expect(aviso).toHaveCount(0);
  await irAteMenu(page, './?test=1');
  await expect(page.locator('.menu-aviso-endereco')).toHaveCount(0);
  await expect(page.locator('.menu-importar')).toBeVisible();
});

test('com save, o aviso de endereço não aparece', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1, versaoSave: 4, config: { musica: 0.7, efeitos: 0.8, mudo: false },
      personagem: { nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones', atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [], atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 }, classe: 'arcanista', criadoEm: '2026-11-17T12:00:00.000Z' },
      sonho: { concluido: true, ouvidas: [] }, campanha: { capitulo: 1, cena: 'c01-soleira', modo: 'escolhas' },
    }));
  });
  await irAteMenu(page, './?test=1');
  await expect(page.locator('.btn-continuar')).toBeVisible();
  await expect(page.locator('.menu-aviso-endereco')).toHaveCount(0);
});
