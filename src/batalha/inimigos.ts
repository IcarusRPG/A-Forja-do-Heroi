/**
 * Inimigos de batalha: um JSON por inimigo em src/data/inimigos/. Um combate novo precisa só de um
 * arquivo aqui, da folha de sprites (npm run sprites) e de uma região (src/data/regioes.json).
 */

export interface AtaqueDados {
  nome: string;
  bonus?: number;
  /** Ex.: "1d4+1". */
  dano?: string;
  tipoDano?: string;
  /** Ação sem ataque: "provocar" (só fala) ou "defender" (+bonusDefesa até o próximo turno dele). */
  acao?: 'provocar' | 'defender';
  bonusDefesa?: number;
  /** Pose (nome lógico em `poses`) usada no golpe. */
  pose?: string;
  som?: string;
  /** "{nome}" vira o nome do inimigo. */
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
  /** Bônus de Fortitude (teste oposto da Rasteira). */
  fortitude?: number;
  /** Foge com esses PV ou menos (vitória do herói). */
  fogeComPv: number;
  /** Com os PV de fuga, fica assustado e só foge no próprio turno (ratazana). */
  fogeNoProprioTurno?: boolean;
  /** Sem os comandos Intimidar e Acalmar na lista (nem desabilitados). */
  semConversa?: boolean;
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
    tipo: 'sempre' | 'investida' | 'padrao';
    ataque?: string;
    primeiro?: string;
    seCaido?: string;
    senao?: [string, number][];
  };
}

const arquivos = import.meta.glob<DadosInimigo>('../data/inimigos/*.json', { eager: true, import: 'default' });

export const INIMIGOS: Record<string, DadosInimigo> = Object.fromEntries(Object.values(arquivos).map((d) => [d.id, d]));

/** Uma batalha: quais inimigos, a região (fundo e música) e as regras especiais. */
export interface DadosBatalha {
  id: string;
  inimigos: string[];
  regiao: string;
  musica?: string;
  /** Treino: PV cheios dos dois lados, acaba na metade dos PV; o herói volta aos PV de antes. */
  treino?: boolean;
  /** Sem a vinheta de vitória (a música da batalha só faz fade-out). */
  semVinheta?: boolean;
  comandosExtras?: string[];
  /** Criaturas que entram no Bestiário ao começar. */
  bestiario?: string[];
  /** Flag marcada se o herói causar dano (ex.: machucou_mirtilo). */
  flagDano?: string;
  dicas?: { quando: string; texto: string }[];
  /** Ao errar a Bicuda: mensagem, contador e ícone (abóboras). */
  aoErrar?: { mensagem: string; contador: string; icone: string; som?: string };
  /** Efeitos por desfecho (rasteira, vitoria, derrota): flags e relações. */
  fins?: Record<string, { flag?: string | string[]; relacao?: Record<string, number> }>;
}

const arquivosBatalha = import.meta.glob<DadosBatalha>('../data/batalhas/*.json', { eager: true, import: 'default' });
export const BATALHAS: Record<string, DadosBatalha> = Object.fromEntries(Object.values(arquivosBatalha).map((d) => [d.id, d]));

/** Uma batalha pelo id; um id de inimigo sozinho vira uma batalha de um inimigo na região dele. */
export function batalhaPorId(id: string): DadosBatalha {
  if (BATALHAS[id]) return BATALHAS[id];
  const i = INIMIGOS[id];
  if (!i) throw new Error(`Batalha desconhecida: ${id}`);
  return { id, inimigos: [id], regiao: i.regiao };
}
