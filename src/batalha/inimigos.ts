/**
 * Inimigos de batalha: um JSON por inimigo em src/data/inimigos/. Um combate novo precisa só de um
 * arquivo aqui, da folha de sprites (npm run sprites) e de uma região (src/data/regioes.json).
 */

export interface AtaqueDados {
  nome: string;
  bonus: number;
  /** Ex.: "1d4+1". */
  dano: string;
  tipoDano: string;
  /** Pose (nome lógico em `poses`) usada no golpe. */
  pose?: string;
  som: string;
  mensagem: string;
  /** Se acertar, o herói faz o teste ou fica Caído (perde a próxima ação de movimento). */
  derruba?: { pericia: string; cd: number };
}

export type AtaqueInimigo = AtaqueDados & { id: string };

export interface DadosInimigo {
  id: string;
  nome: string;
  regiao: string;
  /** Nome da folha em public/assets/img/batalha/inimigos/. */
  sprite: string;
  pv: number;
  defesa: number;
  iniciativa: number;
  /** Foge com esses PV ou menos (vitória do herói). */
  fogeComPv: number;
  /** Pose de exausto com esses PV ou menos. */
  exaustoComPv?: number;
  /** Intimidar e Acalmar funcionam? (Contra o enfurecido, não.) */
  aceitaConversa: boolean;
  cdIntimidar?: number;
  cdAcalmar?: number;
  /** Nome lógico → nome da pose na folha. */
  poses: Record<string, string> & { parado: string; ataque: string; atingido: string; fugindo: string };
  ataques: Record<string, AtaqueDados>;
  ia: {
    tipo: 'sempre' | 'investida';
    ataque?: string;
    primeiro?: string;
    seCaido?: string;
    senao?: [string, number][];
  };
}

const arquivos = import.meta.glob<DadosInimigo>('../data/inimigos/*.json', { eager: true, import: 'default' });

export const INIMIGOS: Record<string, DadosInimigo> = Object.fromEntries(Object.values(arquivos).map((d) => [d.id, d]));
