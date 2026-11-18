/// <reference types="vite/client" />

/** Variáveis de ambiente do build (ver README → Variáveis de ambiente). */
interface ImportMetaEnv {
  /** Endereço do PocketBase (ex.: https://api.icarusrpg.com.br). Nunca fixo no código. */
  readonly VITE_PB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
