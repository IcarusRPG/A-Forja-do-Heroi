import { jaCarregado, registrarBlob, urlAsset } from './assets';

export interface ItemPreload {
  caminho: string;
  /** Tamanho estimado em bytes, usado enquanto o servidor não informa o real. */
  estimativa: number;
  /** Se faltar, o jogo segue sem ele (ex.: expressão de busto, que cai no busto normal). */
  opcional?: boolean;
}

/** Novas tentativas de cada arquivo (depois da primeira), com estas esperas. */
const ESPERAS = [500, 1500];
const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Baixa um arquivo inteiro acompanhando os bytes recebidos e guarda uma URL blob: para ele.
 * Tenta de novo até 2 vezes. Nunca rejeita: devolve false se não conseguiu.
 */
async function baixar(item: ItemPreload, aoProgredir: (recebidos: number, total: number) => void, prioridade: 'auto' | 'low' = 'auto'): Promise<boolean> {
  for (let tentativa = 0; tentativa <= ESPERAS.length; tentativa++) {
    if (tentativa) await esperar(ESPERAS[tentativa - 1]);
    if (jaCarregado(item.caminho)) return true;
    if (await baixarUmaVez(item, aoProgredir, prioridade)) return true;
  }
  aoProgredir(item.estimativa, item.estimativa);
  return false;
}

async function baixarUmaVez(item: ItemPreload, aoProgredir: (recebidos: number, total: number) => void, prioridade: 'auto' | 'low'): Promise<boolean> {
  try {
    const resp = await fetch(urlAsset(item.caminho), { priority: prioridade } as RequestInit);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const total = Number(resp.headers.get('content-length')) || item.estimativa;
    const tipo = resp.headers.get('content-type') ?? '';
    if (!resp.body) {
      const blob = await resp.blob();
      aoProgredir(blob.size, blob.size);
      registrarBlob(item.caminho, URL.createObjectURL(blob));
      return true;
    }
    const leitor = resp.body.getReader();
    const partes: BlobPart[] = [];
    let recebidos = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value as BlobPart);
      recebidos += value.byteLength;
      aoProgredir(recebidos, Math.max(total, recebidos));
    }
    aoProgredir(recebidos, recebidos);
    registrarBlob(item.caminho, URL.createObjectURL(new Blob(partes, { type: tipo })));
    return true;
  } catch (erro) {
    console.warn(`Pré-carregamento falhou: ${item.caminho}`, erro);
    return false;
  }
}

/**
 * Pré-carrega em paralelo, informando o progresso real (0 a 1) pela soma dos bytes.
 * Devolve os itens que não vieram mesmo com as novas tentativas (vazio quando deu tudo certo).
 */
export async function preCarregar(itens: ItemPreload[], aoProgresso: (fracao: number) => void): Promise<ItemPreload[]> {
  const estado = itens.map((i) => ({ recebidos: 0, total: i.estimativa }));
  const atualizar = () => {
    const recebidos = estado.reduce((s, e) => s + e.recebidos, 0);
    const total = estado.reduce((s, e) => s + e.total, 0);
    aoProgresso(total ? Math.min(1, recebidos / total) : 1);
  };
  const ok = await Promise.all(
    itens.map((item, i) =>
      jaCarregado(item.caminho)
        ? Promise.resolve(true)
        : baixar(item, (r, t) => {
            estado[i] = { recebidos: r, total: t };
            atualizar();
          }),
    ),
  );
  aoProgresso(1);
  return itens.filter((_, i) => !ok[i]);
}

/** Carrega o restante sem pressa, um por vez, com prioridade baixa, sem bloquear nada. */
export async function preCarregarEmSegundoPlano(itens: ItemPreload[]): Promise<void> {
  for (const item of itens) {
    if (!jaCarregado(item.caminho)) await baixar(item, () => {}, 'low');
  }
}
