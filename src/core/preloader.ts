import { jaCarregado, registrarBlob, urlAsset } from './assets';

export interface ItemPreload {
  caminho: string;
  /** Tamanho estimado em bytes, usado enquanto o servidor não informa o real. */
  estimativa: number;
}

/**
 * Baixa um arquivo inteiro acompanhando os bytes recebidos e guarda uma URL blob: para ele.
 * Nunca rejeita: se falhar, o jogo segue com a URL pública (e cada tela trata o erro).
 */
async function baixar(item: ItemPreload, aoProgredir: (recebidos: number, total: number) => void): Promise<boolean> {
  try {
    const resp = await fetch(urlAsset(item.caminho));
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
    aoProgredir(item.estimativa, item.estimativa);
    return false;
  }
}

/** Pré-carrega em paralelo, informando o progresso real (0 a 1) pela soma dos bytes. */
export async function preCarregar(itens: ItemPreload[], aoProgresso: (fracao: number) => void): Promise<void> {
  const estado = itens.map((i) => ({ recebidos: 0, total: i.estimativa }));
  const atualizar = () => {
    const recebidos = estado.reduce((s, e) => s + e.recebidos, 0);
    const total = estado.reduce((s, e) => s + e.total, 0);
    aoProgresso(total ? Math.min(1, recebidos / total) : 1);
  };
  await Promise.all(
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
}

/** Carrega o restante sem pressa, um por vez, sem bloquear nada. */
export async function preCarregarEmSegundoPlano(itens: ItemPreload[]): Promise<void> {
  for (const item of itens) {
    if (!jaCarregado(item.caminho)) await baixar(item, () => {});
  }
}
