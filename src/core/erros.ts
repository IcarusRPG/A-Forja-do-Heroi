/**
 * Registro de erros no PocketBase (coleção `erros`, ver pocketbase/colecao-erros.json).
 *
 * - Só envia se o build tiver `VITE_PB_URL`; sem ela, o erro vai só para o console.
 * - No máximo 5 erros por sessão (por aba), para um erro em loop não lotar a coleção.
 * - Nada pessoal: sem nome do herói, sem e-mail, sem save. Vão a mensagem, a pilha (até 4 KB), o
 *   endereço da página sem a query, o navegador, a versão do jogo e a tela em que o jogador estava.
 */

/** Hash curto do commit do build (injetado pelo vite.config.ts). */
export const VERSAO_JOGO: string = __VERSAO_JOGO__;

export const LIMITE_POR_SESSAO = 5;
const MAX_MENSAGEM = 1000;
const MAX_PILHA = 4096;

let enviados = 0;
let telaAtual = 'inicio';

/** A máquina de telas avisa onde o jogador está (vai junto com cada erro). */
export function definirTelaAtual(nome: string): void {
  telaAtual = nome;
}

/** Endereço do PocketBase. Nos testes (?test=1), `?pb=` simula um endereço. */
function urlPocketBase(): string | null {
  const q = new URLSearchParams(location.search);
  if (q.has('test') && q.get('pb')) return q.get('pb');
  return import.meta.env.VITE_PB_URL || null;
}

const cortar = (t: string, max: number) => (t.length > max ? t.slice(0, max) : t);

export interface RegistroErro {
  mensagem: string;
  pilha: string;
  url: string;
  navegador: string;
  versaoJogo: string;
  tela: string;
}

export function montarRegistro(erro: unknown, extra: { mensagem?: string; tela?: string } = {}): RegistroErro {
  const e = erro instanceof Error ? erro : null;
  const bruta = extra.mensagem ?? e?.message ?? (typeof erro === 'string' ? erro : JSON.stringify(erro) ?? String(erro));
  return {
    mensagem: cortar(extra.mensagem && e ? `${extra.mensagem}: ${e.message}` : bruta, MAX_MENSAGEM),
    pilha: cortar(e?.stack ?? '', MAX_PILHA),
    // Sem query nem hash: a query pode ter parâmetros de teste e o hash, a rota.
    url: cortar(`${location.origin}${location.pathname}`, 300),
    navegador: cortar(navigator.userAgent, 300),
    versaoJogo: VERSAO_JOGO,
    tela: cortar(extra.tela ?? telaAtual, 60),
  };
}

/** Registra um erro: console sempre; PocketBase quando houver endereço e a cota da sessão permitir. */
export function registrarErro(erro: unknown, extra: { mensagem?: string; tela?: string } = {}): void {
  const r = montarRegistro(erro, extra);
  console.error(`[erro] ${r.mensagem}`, erro);
  const base = urlPocketBase();
  if (!base || enviados >= LIMITE_POR_SESSAO) return;
  enviados++;
  try {
    void fetch(`${base.replace(/\/+$/, '')}/api/collections/erros/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => { /* sem rede: fica só no console */ });
  } catch { /* fetch indisponível */ }
}

/** Quantos erros já foram enviados nesta sessão (para os testes). */
export const errosEnviados = (): number => enviados;
