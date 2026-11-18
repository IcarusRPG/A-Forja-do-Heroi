import { audio } from './audio';
import { forcarD20 } from './dados';
import { atualizarCampanha, getEstado, type EstadoMissao } from './estado';
import { avisosRecentes } from './toasts';
import { darItem, definirMissao, somarAtraso } from './progresso';

/**
 * Ganchos de teste (só com ?test=1), comuns a todas as telas do jogo. Cada tela acrescenta os seus
 * (goto, state, avancar…) por cima destes.
 */
export const modoTeste = (): boolean => new URLSearchParams(location.search).has('test');

/** Estado comum do progresso (relações, inventário, atraso…), incluído no state() de cada tela. */
export function estadoProgresso() {
  const c = getEstado().campanha;
  return {
    capitulo: c.capitulo,
    flags: [...c.flags],
    pv: c.pvAtual,
    atraso: c.atraso,
    missoes: { ...c.missoes },
    inventario: { ...c.inventario },
    reais: c.reais,
    relacoes: { ...c.relacoes },
    compendio: JSON.parse(JSON.stringify(c.compendio)),
    contadores: { ...c.contadores },
    local: { ...c.local },
    toasts: avisosRecentes(),
    musica: audio.estadoMusica(),
  };
}

export function registrarGanchos(extra: Record<string, unknown>): void {
  if (!modoTeste()) return;
  (window as unknown as { __fdg: unknown }).__fdg = {
    forceRoll: (v: number[]) => forcarD20(v),
    pularFaixa: () => audio.pularParaOFim(),
    setAtraso: (n: number) => somarAtraso(n - getEstado().campanha.atraso),
    setRelacao: (id: string, n: number) => atualizarCampanha({ relacoes: { ...getEstado().campanha.relacoes, [id]: n } }),
    giveItem: (id: string, qtd = 1) => darItem(id, qtd),
    setFlag: (f: string) => { if (!getEstado().campanha.flags.includes(f)) atualizarCampanha({ flags: [...getEstado().campanha.flags, f] }); },
    setMissao: (id: string, e: EstadoMissao) => definirMissao(id, e),
    ...extra,
  };
}
