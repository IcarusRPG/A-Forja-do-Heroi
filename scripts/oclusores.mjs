// Gera os recortes de oclusão (copas, telhados, toldos, postes) a partir de retângulos ajustáveis.
// Uso: node scripts/oclusores.mjs [mapa ...]   (padrão: todos os mapas com "oclusores")
//
// No JSON do mapa, cada oclusor é escrito à mão assim (ajuste os números no modo F2, que mostra o id,
// o retângulo e a linha da base de cada um, e as coordenadas do ponto tocado):
//   { "id": "copa-ponte", "retangulo": [x, y, largura, altura], "baseY": 660,
//     "poligono": [[x, y], ...] }        ← opcional: o contorno exato dentro do retângulo
// e o script completa os campos que o motor lê: "base", "contorno", "fixo" e "sementes".
// Quem tem os pés acima de baseY (y menor) fica atrás do recorte; o recorte fica translúcido nessa hora.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(ROOT, 'src', 'data', 'mapas');
const pedidos = process.argv.slice(2);
const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.json') && (!pedidos.length || pedidos.includes(f.replace(/\.json$/, ''))));

const linha = (o) => `  ${JSON.stringify(o).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/\],\[/g, '], [')}`;

for (const arq of arquivos) {
  const caminho = path.join(PASTA, arq);
  const texto = readFileSync(caminho, 'utf8');
  const mapa = JSON.parse(texto);
  if (!mapa.oclusores?.some((o) => o.retangulo)) continue;
  const novos = mapa.oclusores.map((o) => {
    if (!o.retangulo) return o;
    const [x, y, w, h] = o.retangulo;
    const ret = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const contorno = o.poligono ?? ret;
    return { id: o.id, retangulo: o.retangulo, baseY: o.baseY, ...(o.poligono ? { poligono: o.poligono } : {}), base: o.baseY, contorno, fixo: contorno, sementes: [] };
  });
  // Troca só o bloco "oclusores" (o resto do arquivo fica como está).
  const inicio = texto.indexOf('"oclusores": [');
  if (inicio < 0) throw new Error(`${arq}: sem "oclusores"`);
  let i = texto.indexOf('[', inicio), nivel = 0, fim = i;
  for (; fim < texto.length; fim++) {
    if (texto[fim] === '[') nivel++;
    else if (texto[fim] === ']' && --nivel === 0) break;
  }
  const bloco = `"oclusores": [\n${novos.map(linha).join(',\n')}\n ]`;
  writeFileSync(caminho, texto.slice(0, inicio) + bloco + texto.slice(fim + 1));
  console.log(`${arq}: ${novos.length} oclusores`);
}
