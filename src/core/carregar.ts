import { registrarErro } from './erros';

/**
 * Carregamento à prova de deploy dos pedaços dinâmicos do jogo (Phaser, exploração, batalha).
 *
 * Por que falha: o GitHub Pages serve o index.html com `Cache-Control: max-age=600`. Por até 10 minutos
 * depois de um deploy (ou por horas, numa aba que ficou aberta), o jogo que está rodando ainda é o do
 * build antigo e pede pedaços com o hash antigo. O deploy agora mantém os assets anteriores por 7 dias
 * (scripts/manter-assets.mjs), mas se mesmo assim um pedaço não vier (rede ruim, CDN), aqui:
 *   1. tenta de novo até 2 vezes (500 ms e 1500 ms), com uma query nova para furar o cache;
 *   2. recarrega a página uma única vez (marcado no sessionStorage, para não entrar em loop);
 *   3. se ainda falhar, mostra uma tela simples com "Recarregar". O erro técnico nunca aparece ao jogador:
 *      vai para o console e para o registro de erros.
 */

const ESPERAS = [500, 1500];
const CHAVE_RECARGA = 'fdg.recarregouPorModulo';
/** Uma recarga automática a cada 5 minutos, no máximo. */
const JANELA_RECARGA = 5 * 60_000;

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const mensagemDe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** Erros de pedaço que não veio (Chrome, Firefox, Safari e o preload do Vite). */
export function ehErroDeModulo(e: unknown): boolean {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|module script failed|ChunkLoadError/i.test(mensagemDe(e));
}

/** O endereço do pedaço, quando o navegador põe na mensagem (Chrome e Firefox põem; o Safari não). */
function urlDoErro(e: unknown): string | null {
  const m = mensagemDe(e).match(/https?:\/\/\S+?\.(?:m?js|css)(?:\?[^\s'"]*)?/);
  return m ? m[0] : null;
}

/** import() com novas tentativas. Uso: `const m = await importar(() => import('phaser'))`. */
export async function importar<T>(carregar: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  try {
    return await carregar();
  } catch (e) {
    ultimo = e;
  }
  for (const ms of ESPERAS) {
    if (!ehErroDeModulo(ultimo)) break;
    await esperar(ms);
    try {
      const url = urlDoErro(ultimo);
      if (url) {
        const base = url.replace(/[?&]v=\d+/, '');
        const nova = `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`;
        return (await import(/* @vite-ignore */ nova)) as T;
      }
      return await carregar();
    } catch (e) {
      ultimo = e;
    }
  }
  if (ehErroDeModulo(ultimo)) falhaDeModulo(ultimo);
  throw ultimo;
}

let tratando = false;

/** Recarrega uma vez; se já recarregou há pouco, mostra a tela amigável. */
export function falhaDeModulo(erro: unknown): void {
  if (tratando) return;
  tratando = true;
  registrarErro(erro, { mensagem: 'Pedaço do jogo não carregou' });
  let ultima = 0;
  try { ultima = Number(sessionStorage.getItem(CHAVE_RECARGA)) || 0; } catch { /* sem sessionStorage */ }
  if (Date.now() - ultima > JANELA_RECARGA) {
    try {
      sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
      location.reload();
      return;
    } catch { /* sem sessionStorage: sem recarga automática (evita loop) */ }
  }
  mostrarTelaDeErro();
}

/** "O jogo foi atualizado ou a conexão falhou." + Recarregar. Fica por cima de tudo. */
export function mostrarTelaDeErro(): void {
  if (document.querySelector('.tela-erro')) return;
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'btn btn-principal tela-erro-recarregar';
  botao.textContent = 'Recarregar';
  botao.addEventListener('click', () => {
    try { sessionStorage.removeItem(CHAVE_RECARGA); } catch { /* nada */ }
    location.reload();
  });
  const titulo = document.createElement('p');
  titulo.className = 'tela-erro-texto';
  titulo.textContent = 'O jogo foi atualizado ou a conexão falhou.';
  const caixa = document.createElement('div');
  caixa.className = 'tela-erro-caixa';
  caixa.append(titulo, botao);
  const el = document.createElement('div');
  el.className = 'tela-erro';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-label', titulo.textContent);
  el.append(caixa);
  document.body.append(el);
  botao.focus({ preventScroll: true });
}

/**
 * Proteções globais (chamadas uma vez no main.ts):
 * - erros não tratados de pedaço dinâmico → recarrega uma vez ou mostra a tela;
 * - qualquer outro erro não tratado vai para o registro;
 * - desregistra service workers antigos deste jogo (nenhum PWA deve servir assets velhos).
 */
export function instalarProtecoes(): void {
  // `vite:preloadError` NÃO é cancelado aqui: com preventDefault(), o Vite engole o erro e o import()
  // resolve com undefined. O erro precisa chegar ao importar(), que tenta de novo e recarrega.
  window.addEventListener('error', (ev) => {
    if (ev.error === undefined && !ev.message) return; // erro de carregamento de imagem/áudio
    if (ehErroDeModulo(ev.error ?? ev.message)) return falhaDeModulo(ev.error ?? ev.message);
    registrarErro(ev.error ?? ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    if (ehErroDeModulo(ev.reason)) {
      ev.preventDefault();
      return falhaDeModulo(ev.reason);
    }
    registrarErro(ev.reason);
  });
  // Deu certo até aqui depois de uma recarga automática: libera a próxima (num próximo deploy).
  window.setTimeout(() => { try { sessionStorage.removeItem(CHAVE_RECARGA); } catch { /* nada */ } }, JANELA_RECARGA);
  desregistrarServiceWorkers();
}

function desregistrarServiceWorkers(): void {
  const sw = navigator.serviceWorker;
  if (!sw?.getRegistrations) return;
  const base = new URL(import.meta.env.BASE_URL, location.origin).href;
  void sw.getRegistrations().then((regs) => {
    // Só os deste jogo: outros jogos no mesmo domínio (game.icarusrpg.com.br/...) têm escopo próprio.
    for (const r of regs) if (r.scope.startsWith(base)) void r.unregister();
  }).catch(() => {});
}
