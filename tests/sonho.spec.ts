import { expect, test, type Page } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/** Herói pronto (com classe) que ainda não terminou o sonho: Continuar começa no sonho. */
function semearHeroi(page: Page, sonho = { concluido: false, ouvidas: [] as string[] }) {
  return page.addInitScript((s) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      config: { musica: 0.7, efeitos: 0.8, mudo: false },
      personagem: {
        nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'estudioso',
        atributosComprados: { FOR: 0, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 1 }, bonusArake: [],
        atributosFinais: { FOR: 0, DES: 3, CON: 2, INT: 4, SAB: 1, CAR: 2 },
        classe: 'arcanista', pvMax: 14, pmMax: 10, criadoEm: '2026-11-17T12:00:00.000Z',
      },
      sonho: s,
    }));
  }, sonho);
}

interface EstadoSonho {
  pronto: boolean;
  heroi: { x: number; y: number; direcao: string } | null;
  proximo: string | null;
  ouvidas: string[];
  concluido: boolean;
  falaAberta: boolean;
  climax: boolean;
  feixes: number;
}
type Ganchos = { state(): EstadoSonho } & Record<string, (x?: string) => unknown>;
const estado = (page: Page) => page.evaluate(() => (window as unknown as { __fdg: Ganchos }).__fdg.state());
const fdg = (page: Page, metodo: 'teleport' | 'interact' | 'fecharFala', arg?: string) =>
  page.evaluate(([m, a]) => (window as unknown as { __fdg: Ganchos }).__fdg[m](a), [metodo, arg] as const);

async function entrarNoSonho(page: Page, query = '?test=1') {
  await irAteMenu(page, `./${query}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.tela-sonho.pronto canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await estado(page)).pronto).toBe(true);
}

const foto = (page: Page, nome: string, projeto: string) => page.screenshot({ path: `tests/screenshots/${projeto}-${nome}.png` });

const ESTATUAS = ['solem', 'justar', 'ardor', 'expiria', 'eternus', 'mentis', 'irae'];

test('sonho dos deuses: andar, ouvir as sete vozes, clímax e despertar', async ({ page }, info) => {
  const toque = info.project.use.hasTouch === true;
  await semearHeroi(page);
  await entrarNoSonho(page);

  // Canvas, contador e (no celular) joystick
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 0 / 7');
  if (toque) {
    await expect(page.locator('.joystick')).toBeVisible();
    const j = (await page.locator('.joystick').boundingBox())!;
    expect(j.width).toBeGreaterThanOrEqual(44);
  }
  const pausa = (await page.locator('.btn-pausa').boundingBox())!;
  expect(pausa.width).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.btn-interagir')).toBeHidden();
  await page.waitForTimeout(800);
  await foto(page, 'sonho-inicio', info.project.name);

  // Andar com o teclado (sobe a escada)
  const antes = (await estado(page)).heroi!;
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await estado(page)).heroi!.y, { timeout: 10_000 }).toBeLessThan(antes.y - 60);
  await page.keyboard.up('ArrowUp');
  expect((await estado(page)).heroi!.direcao).toBe('cima');

  // Andar contra a borda: não atravessa as nuvens à esquerda da escada
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  expect((await estado(page)).heroi!.x).toBeGreaterThan(555);

  // No celular, o joystick também anda
  if (toque) {
    const j = (await page.locator('.joystick').boundingBox())!;
    const y0 = (await estado(page)).heroi!.y;
    const cx = j.x + j.width / 2;
    const cy = j.y + j.height / 2;
    const opcoes = { pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: cx, clientY: cy - j.height * 0.45 };
    await page.locator('.joystick').dispatchEvent('pointerdown', opcoes);
    await expect.poll(async () => (await estado(page)).heroi!.y, { timeout: 10_000 }).toBeLessThan(y0 - 30);
    await page.locator('.joystick').dispatchEvent('pointerup', { ...opcoes, clientY: cy });
  }

  // Perto de uma estátua: o botão ✦ aparece
  await fdg(page, 'teleport', 'justar');
  await expect(page.locator('.btn-interagir')).toBeVisible();
  expect((await estado(page)).proximo).toBe('justar');
  const btn = (await page.locator('.btn-interagir').boundingBox())!;
  expect(btn.width).toBeGreaterThanOrEqual(44);

  // Interagir: caixa de fala com o título "Uma voz {cor}", sem o nome da divindade
  if (toque) await page.locator('.btn-interagir').tap();
  else await page.keyboard.press('e');
  await expect(page.locator('.caixa-fala')).toBeVisible();
  await expect(page.locator('.fala-titulo')).toHaveText('Uma voz prateada');
  await expect(page.locator('.fala-texto')).toHaveText('Toda mentira pesa na balança. Um dia, ela pende.', { timeout: 5000 });
  await expect(page.locator('.caixa-fala')).not.toContainText('Justar');
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 1 / 7');
  await page.waitForTimeout(500);
  await foto(page, 'sonho-estatua-fala', info.project.name);
  // O texto já está completo: um clique fecha
  await page.locator('.caixa-fala').click();
  await expect(page.locator('.caixa-fala')).toBeHidden();

  // Altar antes das sete vozes: só a fala do herói
  await fdg(page, 'teleport', 'altar');
  await expect(page.locator('.fala-texto')).toHaveText('Ainda há vozes a ouvir…', { timeout: 5000 });
  await expect(page.locator('.fala-titulo')).toHaveText('Thaelion');
  expect((await estado(page)).climax).toBe(false);
  await fdg(page, 'fecharFala');

  // As outras seis vozes
  for (const id of ESTATUAS.filter((x) => x !== 'justar')) {
    await fdg(page, 'teleport', id);
    await expect.poll(async () => (await estado(page)).proximo).toBe(id);
    await fdg(page, 'interact');
    await expect(page.locator('.caixa-fala')).toBeVisible();
    await fdg(page, 'fecharFala');
  }
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 7 / 7');
  expect((await estado(page)).ouvidas.sort()).toEqual([...ESTATUAS].sort());

  // O altar dispara o clímax
  await fdg(page, 'teleport', 'altar');
  await expect.poll(async () => (await estado(page)).climax).toBe(true);
  await expect.poll(async () => (await estado(page)).feixes, { timeout: 8000 }).toBe(7);
  await page.waitForTimeout(1600);
  await foto(page, 'sonho-climax', info.project.name);
  await expect(page.locator('.fala-texto')).toContainText('O esc', { timeout: 8000 });

  // Despertar e tela provisória
  await expect(page.locator('.tela-sequencia')).toContainText('Você acorda num sobressalto.', { timeout: 20_000 });
  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('a-forja-do-heroi:estado') ?? '{}').sonho);
  expect(salvo.concluido).toBe(true);
  await expect(page.locator('.tela-embreve')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tela-embreve')).toContainText('Amanhecer Tardio');
  await expect(page.locator('.tela-embreve')).toContainText('Thaelion');
  await expect(page.locator('.tela-embreve')).toContainText('Ayoran · Arcanista (Mago)');
  await page.waitForTimeout(1200);
  await foto(page, 'sonho-fim-embreve', info.project.name);
});

test('sonho: Continuar retoma com as vozes já ouvidas; modo de ajuste mostra as colisões', async ({ page }, info) => {
  await semearHeroi(page, { concluido: false, ouvidas: ['solem', 'irae'] });
  await entrarNoSonho(page, '?test=1&debug=1');
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 2 / 7');
  await expect(page.locator('.debug-coords')).toBeVisible();
  await fdg(page, 'teleport', 'altar');
  await fdg(page, 'fecharFala');
  await page.waitForTimeout(900);
  await foto(page, 'sonho-debug-colisoes', info.project.name);
});

test('sonho concluído: Continuar vai direto para "Em breve"', async ({ page }) => {
  await semearHeroi(page, { concluido: true, ouvidas: ESTATUAS });
  await irAteMenu(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.tela-embreve')).toBeVisible();
});
