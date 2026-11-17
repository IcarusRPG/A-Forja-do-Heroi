import { defineConfig, devices } from '@playwright/test';

const PORTA = 4174;

/** Testes e2e de celular contra o build de produção (o mesmo que vai para o GitHub Pages). */
export default defineConfig({
  testDir: 'tests',
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}/A-Forja-do-Heroi/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    {
      name: 'paisagem-844x390',
      use: { ...devices['Pixel 7'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}/A-Forja-do-Heroi/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
