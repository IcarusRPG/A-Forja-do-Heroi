/// <reference types="vite/client" />

/** Variáveis de ambiente do build (ver README → Variáveis de ambiente). */
interface ImportMetaEnv {
  /** Endereço do PocketBase (ex.: https://api.icarusrpg.com.br). Nunca fixo no código. */
  readonly VITE_PB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Hash curto do commit do build (vite.config.ts → define). */
declare const __VERSAO_JOGO__: string;
