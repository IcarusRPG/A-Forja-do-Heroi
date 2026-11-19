/**
 * Imagens HTML só aparecem prontas (Fase 4F): antes de trocar o `src` visível, a imagem nova é baixada
 * e decodificada fora da tela. Assim nada aparece vazio, pela metade ou piscando.
 */
const prontas = new Map<string, Promise<boolean>>();

/** Resolve true quando a imagem está decodificada (ou false se não carregou). Com cache por URL. */
export function imagemPronta(url: string): Promise<boolean> {
  let p = prontas.get(url);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      try {
        await img.decode();
        return true;
      } catch {
        // Alguns navegadores rejeitam decode() de imagem já em cache; confere o carregamento.
        return img.complete && img.naturalWidth > 0;
      }
    })();
    prontas.set(url, p);
    void p.then((ok) => { if (!ok) prontas.delete(url); });
  }
  return p;
}
