import { ASSETS, src, type Genero } from '../core/assets';
import { audio } from '../core/audio';
import { ATRIBUTOS, salvarPersonagem, type Atributo, type MapaAtributos, type Personagem } from '../core/estado';
import {
  CUSTO, MAX, RACAS, atributosFinais, bonusAEscolher, modificadoresRaciais, podeAumentar, podeDiminuir,
  racaPorId, saldo, sinal, zerados,
} from '../core/regras';
import { irPara, type Tela } from '../core/telas';
import { ehToque, fmt, textos } from '../core/textos';
import { botao, h, somHover } from '../core/ui';
import ORIGENS_JSON from '../data/origens.json';
import NOMES from '../data/nomes.json';

const T = textos.criacao;
const ORIGENS = ORIGENS_JSON.origens;
const NOME_MIN = 2;
const NOME_MAX = 24;

interface Rascunho {
  genero: Genero | null;
  raca: string | null;
  variante: string | null;
  origem: string | null;
  nome: string;
  comprados: MapaAtributos;
  bonusArake: Atributo[];
}

const ICONE_CADEADO =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>';

export function telaCriacao(): Tela {
  const r: Rascunho = { genero: null, raca: null, variante: null, origem: null, nome: '', comprados: zerados(), bonusArake: [] };
  let passo = 0;
  let confirmando = false;
  const ULTIMO = T.passos.length - 1; // Revisão

  /* ---------------------------- validação ---------------------------- */

  const nomeValido = () => {
    const n = r.nome.trim();
    return n.length >= NOME_MIN && n.length <= NOME_MAX;
  };
  const bonusCompleto = () => r.bonusArake.length === bonusAEscolher(r.raca);

  /** Mensagem do que falta no passo (ou null se pode avançar). */
  function pendencia(p: number): string | null {
    switch (p) {
      case 0: return r.genero ? null : '';
      case 1:
        if (!r.raca) return '';
        if (racaPorId(r.raca)?.variantes && !r.variante) return T.raca.varianteObrigatoria;
        return null;
      case 2: return r.origem ? null : '';
      case 3: return nomeValido() ? null : T.nome.regra;
      case 4:
        if (saldo(r.comprados) !== 0) return T.atributos.gasteTudo;
        if (!bonusCompleto()) return T.atributos.escolhaBonus;
        return null;
      default: return null;
    }
  }
  const podeIrPara = (alvo: number) => {
    for (let p = 0; p < alvo; p++) if (pendencia(p) !== null) return false;
    return true;
  };

  /* ---------------------------- estrutura ---------------------------- */

  const titulo = h('h1', { class: 'criacao-titulo' });
  const listaPassos = h('ol', { class: 'passos' });
  const conteudo = h('main', { class: 'criacao-conteudo', tabindex: '-1' });
  const retrato = h('img', { class: 'painel-retrato', alt: '', draggable: 'false' });
  const legendaRetrato = h('figcaption', { class: 'painel-legenda' });
  const resumo = h('div', { class: 'painel-resumo' });
  const painel = h('aside', { class: 'criacao-painel', 'aria-label': 'Seu personagem' },
    h('figure', { class: 'painel-figura' }, retrato, legendaRetrato), resumo);
  const aviso = h('p', { class: 'rodape-aviso', 'aria-live': 'polite' });
  const btnVoltar = botao(T.voltar, () => voltar(), { som: 'ui-back' });
  const btnAvancar = botao(T.avancar, () => avancar(), { classe: 'btn-principal', som: null });

  const el = h('div', { class: 'tela-criacao' },
    h('img', { class: 'criacao-fundo', src: src(ASSETS.wallpaperMenu), alt: '', draggable: 'false' }),
    h('div', { class: 'criacao-veu' }),
    h('header', { class: 'criacao-topo' },
      botao(T.menu, () => void irPara('menu'), { classe: 'btn-discreto', som: 'ui-back' }),
      titulo,
      h('nav', { class: 'passos-nav', 'aria-label': 'Passos da criação' }, listaPassos),
    ),
    h('div', { class: 'criacao-corpo' }, conteudo, painel),
    h('footer', { class: 'criacao-rodape' }, btnVoltar, aviso, btnAvancar),
    h('div', { class: 'criacao-cortina' }),
  );

  /* ---------------------------- navegação ---------------------------- */

  function irParaPasso(novo: number, som: 'ui-confirm' | 'ui-back' | null) {
    if (novo === passo || novo < 0 || novo > ULTIMO) return;
    if (som) audio.sfx(som);
    passo = novo;
    renderizar(true);
    conteudo.scrollTop = 0;
    conteudo.focus({ preventScroll: true });
  }
  function avancar() {
    if (confirmando) return;
    if (passo === ULTIMO) return confirmar();
    if (pendencia(passo) !== null) {
      audio.sfx('ui-locked');
      return;
    }
    irParaPasso(passo + 1, 'ui-confirm');
  }
  function voltar() {
    if (passo > 0) irParaPasso(passo - 1, null);
  }

  function confirmar() {
    if (confirmando || !r.genero || !r.raca || !r.origem) return;
    confirmando = true;
    const personagem: Personagem = {
      nome: r.nome.trim(),
      genero: r.genero,
      raca: r.raca,
      variante: r.variante,
      origem: r.origem,
      atributosComprados: { ...r.comprados },
      bonusArake: [...r.bonusArake],
      atributosFinais: atributosFinais(r.comprados, r.raca, r.bonusArake),
      classe: null,
      criadoEm: new Date().toISOString(),
    };
    salvarPersonagem(personagem);
    audio.sfx('hero-confirm');
    audio.pararMusica(3000);
    el.classList.add('confirmando');
    btnAvancar.disabled = true;
    btnVoltar.disabled = true;
    setTimeout(() => void irPara('prologo', undefined, { som: false, duracao: 300 }), 3000);
  }

  /* ---------------------------- render ---------------------------- */

  function renderizar(trocarConteudo: boolean) {
    titulo.textContent = fmt(T.titulo, r.genero);
    renderPassos();
    if (trocarConteudo) {
      const secao = PASSOS[passo]() as HTMLElement;
      // Só anima a entrada quando o passo muda (não a cada card escolhido).
      if (conteudo.dataset.passo !== String(passo)) secao.classList.add('entrando');
      const rolagem = conteudo.scrollTop;
      conteudo.replaceChildren(secao);
      if (conteudo.dataset.passo === String(passo)) conteudo.scrollTop = rolagem;
      conteudo.dataset.passo = String(passo);
    }
    renderPainel();
    renderRodape();
  }

  function renderPassos() {
    listaPassos.replaceChildren(
      ...T.passos.map((nome, i) => {
        const liberado = i <= passo || podeIrPara(i);
        const item = h('button', {
          type: 'button',
          class: `passo ${i === passo ? 'atual' : ''} ${i < passo ? 'feito' : ''}`,
          disabled: !liberado,
          'aria-current': i === passo ? 'step' : undefined,
        }, h('span', { class: 'passo-num' }, i === ULTIMO ? '✦' : String(i + 1)), h('span', { class: 'passo-nome' }, nome));
        item.addEventListener('click', () => irParaPasso(i, i < passo ? 'ui-back' : 'ui-confirm'));
        return h('li', {}, item);
      }),
    );
  }

  function renderRodape() {
    btnVoltar.style.visibility = passo === 0 ? 'hidden' : 'visible';
    const p = pendencia(passo);
    aviso.textContent = p ?? '';
    btnAvancar.textContent = passo === ULTIMO ? fmt(T.revisao.confirmar, r.genero) : T.avancar;
    btnAvancar.classList.toggle('btn-confirmar', passo === ULTIMO);
    btnAvancar.disabled = confirmando || p !== null;
  }

  function renderPainel() {
    const genero = r.genero ?? 'm';
    const raca = r.raca ?? 'arake';
    const novoSrc = src(ASSETS.retrato(raca, genero));
    if (retrato.getAttribute('src') !== novoSrc) {
      retrato.classList.remove('trocou');
      void retrato.offsetWidth;
      retrato.src = novoSrc;
      retrato.classList.add('trocou');
    }
    retrato.classList.toggle('previa', !r.raca);
    retrato.alt = r.raca ? `Retrato: ${racaPorId(r.raca)?.nome}` : '';
    legendaRetrato.textContent = r.nome.trim() || (r.raca ? '' : T.resumo.vazio);

    const racaD = racaPorId(r.raca);
    const variante = racaD?.variantes?.find((v) => v.id === r.variante);
    const origem = ORIGENS.find((o) => o.id === r.origem);
    const finais = atributosFinais(r.comprados, r.raca, r.bonusArake);
    const linha = (rotulo: string, valor: string | null) =>
      h('div', { class: 'resumo-linha' }, h('dt', {}, rotulo), h('dd', {}, valor || T.resumo.vazio));
    resumo.replaceChildren(
      h('dl', { class: 'resumo-lista' },
        linha(T.resumo.genero, r.genero ? T.genero[r.genero] : null),
        linha(T.resumo.raca, racaD ? `${racaD.nome}${variante ? ` · ${variante.nome}` : ''}` : null),
        linha(T.resumo.origem, origem?.nome ?? null),
      ),
      h('div', { class: 'resumo-atributos' },
        ...ATRIBUTOS.map((a) => h('div', { class: `mini-atributo ${finais[a] > 0 ? 'pos' : finais[a] < 0 ? 'neg' : ''}` },
          h('span', { class: 'mini-sigla' }, a), h('span', { class: 'mini-valor' }, sinal(finais[a])))),
      ),
    );
  }

  /* ---------------------------- passos ---------------------------- */

  function cabecalho(tituloPasso: string, texto?: string) {
    return h('div', { class: 'passo-cabecalho' }, h('h2', {}, tituloPasso), texto ? h('p', { class: 'passo-texto' }, texto) : null);
  }

  /** Card selecionável (botão com aria-pressed). */
  function card(classe: string, selecionado: boolean, aoEscolher: () => void, ...filhos: (Node | string | null)[]) {
    const c = h('button', { type: 'button', class: `card ${classe} ${selecionado ? 'selecionado' : ''}`, 'aria-pressed': String(selecionado) }, ...filhos);
    c.addEventListener('click', () => {
      audio.sfx('ui-confirm');
      aoEscolher();
    });
    return somHover(c);
  }

  function passoGenero(): Node {
    const raca = r.raca ?? 'arake';
    const opcao = (g: Genero) =>
      card('card-genero', r.genero === g, () => {
        r.genero = g;
        renderizar(true);
      },
      h('img', { class: 'card-genero-img', src: src(ASSETS.retrato(raca, g)), alt: '', draggable: 'false' }),
      h('span', { class: 'card-titulo' }, T.genero[g]));
    return h('section', { class: 'passo-genero' },
      cabecalho(T.genero.titulo, T.genero.texto),
      h('div', { class: 'grade-genero' }, opcao('m'), opcao('f')),
    );
  }

  function passoRaca(): Node {
    const grade = h('div', { class: 'grade-racas' });
    for (const raca of RACAS) {
      const conteudoCard = [
        h('span', { class: 'card-titulo' }, raca.nome),
        h('span', { class: 'card-sub' }, raca.classico),
        h('span', { class: 'card-meta' }, raca.significado),
      ];
      if (raca.jogavelDemo) {
        grade.append(card('card-raca', r.raca === raca.id, () => {
          if (r.raca !== raca.id) {
            r.raca = raca.id;
            r.variante = null;
            r.bonusArake = [];
          }
          renderizar(true);
          conteudo.querySelector('.detalhe-raca')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, ...conteudoCard));
      } else {
        const aviso = h('span', { class: 'card-aviso', role: 'tooltip' }, T.raca.indisponivel);
        const c = h('button', { type: 'button', class: 'card card-raca bloqueado', 'aria-disabled': 'true', 'aria-label': `${raca.nome}: ${T.raca.indisponivel}` },
          h('span', { class: 'card-cadeado' }), ...conteudoCard, aviso);
        (c.querySelector('.card-cadeado') as HTMLElement).innerHTML = ICONE_CADEADO;
        let timer = 0;
        c.addEventListener('click', () => {
          audio.sfx('ui-locked');
          c.classList.add('mostrar-aviso');
          clearTimeout(timer);
          timer = window.setTimeout(() => c.classList.remove('mostrar-aviso'), 2200);
        });
        grade.append(c);
      }
    }

    const sel = racaPorId(r.raca);
    let detalhe: Node | null = null;
    if (sel) {
      detalhe = h('div', { class: 'detalhe-raca' },
        h('h3', {}, sel.nome, h('span', { class: 'detalhe-sub' }, ` · ${sel.significado}`)),
        h('p', {}, sel.texto),
        sel.naPratica ? h('p', { class: 'na-pratica' }, h('strong', {}, `${T.raca.naPratica}: `), sel.naPratica) : null,
        sel.variantes
          ? h('div', { class: 'variantes' },
              h('h4', {}, T.raca.variante),
              h('div', { class: 'grade-variantes' },
                ...sel.variantes.map((v) =>
                  card(`card-variante variante-${v.id}`, r.variante === v.id, () => {
                    r.variante = v.id;
                    renderizar(true);
                  }, h('span', { class: 'card-titulo' }, v.nome), h('span', { class: 'card-meta' }, v.texto)))))
          : null,
      );
    }
    return h('section', { class: 'passo-raca' }, cabecalho(T.raca.titulo), grade, detalhe);
  }

  function passoOrigem(): Node {
    return h('section', { class: 'passo-origem' },
      cabecalho(T.origem.titulo),
      h('div', { class: 'grade-origens' },
        ...ORIGENS.map((o) =>
          card('card-origem', r.origem === o.id, () => {
            r.origem = o.id;
            renderizar(true);
          },
          h('span', { class: 'card-titulo' }, o.nome),
          h('span', { class: 'card-meta card-ambientacao' }, o.texto),
          h('span', { class: 'card-linha' }, h('strong', {}, `${T.origem.pericia}: `), `${o.pericia} +${o.bonusPericia}`),
          h('span', { class: 'card-linha' }, h('strong', {}, `${T.origem.poder}: `), h('em', {}, o.poder.nome), ` — ${o.poder.descricao}`),
          h('span', { class: 'card-linha' }, h('strong', {}, `${T.origem.itens}: `), o.itens.join('; '))))),
    );
  }

  function passoNome(): Node {
    const input = h('input', {
      type: 'text', class: 'campo-nome', maxlength: NOME_MAX, minlength: NOME_MIN, autocomplete: 'off', spellcheck: 'false',
      placeholder: fmt(T.nome.placeholder, r.genero), 'aria-label': T.nome.titulo, value: r.nome,
    });
    const contador = h('span', { class: 'nome-contador' });
    const atualizarContador = () => (contador.textContent = `${r.nome.trim().length}/${NOME_MAX}`);
    atualizarContador();
    input.addEventListener('input', () => {
      r.nome = input.value.slice(0, NOME_MAX);
      atualizarContador();
      renderPainel();
      renderRodape();
      renderPassos();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') avancar();
    });
    const sugerir = botao(T.nome.sugerir, () => {
      const lista = ((NOMES as Record<string, Record<Genero, string[]>>)[r.raca ?? 'arake'] ?? NOMES.arake)[r.genero ?? 'm'];
      const opcoes = lista.filter((n) => n !== r.nome);
      r.nome = opcoes[Math.floor(Math.random() * opcoes.length)];
      input.value = r.nome;
      atualizarContador();
      renderPainel();
      renderRodape();
      renderPassos();
    }, { classe: 'btn-secundario' });
    // No celular, não abrir o teclado sozinho por cima da tela.
    if (!ehToque()) setTimeout(() => input.focus(), 50);
    return h('section', { class: 'passo-nome' },
      cabecalho(T.nome.titulo, T.nome.regra),
      h('div', { class: 'linha-nome' }, h('div', { class: 'campo-nome-caixa' }, input, contador), sugerir),
    );
  }

  function passoAtributos(): Node {
    const pontos = h('div', { class: 'pontos' });
    const lista = h('div', { class: 'lista-atributos', role: 'list' });
    const qtdBonus = bonusAEscolher(r.raca);
    const notaBonus = qtdBonus ? h('p', { class: 'nota-bonus' }) : null;

    const desenhar = () => {
      const s = saldo(r.comprados);
      pontos.replaceChildren(h('span', { class: 'pontos-rotulo' }, T.atributos.pontos), h('span', { class: `pontos-valor ${s === 0 ? 'zerado' : ''}` }, String(s)));
      if (notaBonus) notaBonus.textContent = `${T.atributos.bonusArake} (${r.bonusArake.length}/${qtdBonus})`;
      const mods = modificadoresRaciais(r.raca, r.bonusArake);
      lista.replaceChildren(...ATRIBUTOS.map((a) => {
        const v = r.comprados[a];
        const menos = h('button', { type: 'button', class: 'btn-ponto', 'aria-label': `Diminuir ${textos.atributos[a]}`, disabled: !podeDiminuir(r.comprados, a) }, '−');
        const mais = h('button', { type: 'button', class: 'btn-ponto', 'aria-label': `Aumentar ${textos.atributos[a]}`, disabled: !podeAumentar(r.comprados, a) }, '+');
        menos.addEventListener('click', () => {
          if (!podeDiminuir(r.comprados, a)) return audio.sfx('ui-locked');
          r.comprados[a] -= 1;
          audio.sfx('point-down');
          desenhar();
        });
        mais.addEventListener('click', () => {
          if (!podeAumentar(r.comprados, a)) return audio.sfx('ui-locked');
          r.comprados[a] += 1;
          audio.sfx('point-up');
          desenhar();
        });
        const proximo = v < MAX ? CUSTO[v + 1] - CUSTO[v] : null;
        let bonusBtn: HTMLElement | null = null;
        if (qtdBonus) {
          const ativo = r.bonusArake.includes(a);
          bonusBtn = h('button', {
            type: 'button', class: `btn-bonus ${ativo ? 'ativo' : ''}`, 'aria-pressed': String(ativo),
            disabled: !ativo && r.bonusArake.length >= qtdBonus,
            title: T.atributos.bonusArake,
          }, '+1');
          bonusBtn.addEventListener('click', () => {
            if (ativo) {
              r.bonusArake = r.bonusArake.filter((x) => x !== a);
              audio.sfx('point-down');
            } else if (r.bonusArake.length < qtdBonus) {
              r.bonusArake = [...r.bonusArake, a];
              audio.sfx('point-up');
            }
            desenhar();
          });
        }
        const mod = mods[a];
        const final = v + mod;
        return h('div', { class: 'atributo', role: 'listitem' },
          h('div', { class: 'atributo-nome' }, h('span', { class: 'atributo-sigla' }, a), h('span', { class: 'atributo-extenso' }, textos.atributos[a])),
          h('div', { class: 'atributo-compra' }, menos, h('span', { class: 'atributo-comprado', 'aria-label': T.atributos.comprado }, sinal(v)), mais),
          h('div', { class: 'atributo-custo' }, proximo !== null ? `+${proximo}` : '—'),
          h('div', { class: 'atributo-racial' }, bonusBtn ?? h('span', { class: `mod ${mod > 0 ? 'pos' : mod < 0 ? 'neg' : ''}` }, mod ? sinal(mod) : '')),
          h('div', { class: `atributo-final ${final > 0 ? 'pos' : final < 0 ? 'neg' : ''}`, 'aria-label': T.atributos.final }, sinal(final)),
        );
      }));
      renderPainel();
      renderRodape();
      renderPassos();
    };
    desenhar();
    return h('section', { class: 'passo-atributos' },
      h('div', { class: 'atributos-topo' }, cabecalho(T.atributos.titulo, T.atributos.custo), pontos),
      notaBonus,
      h('div', { class: 'atributos-cabecalho', 'aria-hidden': 'true' },
        h('span', {}, ''), h('span', {}, T.atributos.comprado), h('span', {}, 'Próx.'), h('span', {}, qtdBonus ? 'Araké' : 'Raça'), h('span', {}, T.atributos.final)),
      lista,
    );
  }

  function passoRevisao(): Node {
    const racaD = racaPorId(r.raca)!;
    const variante = racaD.variantes?.find((v) => v.id === r.variante);
    const origem = ORIGENS.find((o) => o.id === r.origem)!;
    const finais = atributosFinais(r.comprados, r.raca, r.bonusArake);
    const item = (rotulo: string, ...valor: (Node | string)[]) => h('div', { class: 'revisao-item' }, h('dt', {}, rotulo), h('dd', {}, ...valor));
    return h('section', { class: 'passo-revisao' },
      cabecalho(fmt(T.revisao.titulo, r.genero)),
      h('div', { class: 'revisao-ficha' },
        h('h3', { class: 'revisao-nome' }, r.nome.trim()),
        h('dl', { class: 'revisao-lista' },
          item(T.resumo.genero, T.genero[r.genero!]),
          item(T.resumo.raca, `${racaD.nome} (${racaD.classico})${variante ? ` · ${variante.nome}` : ''}`),
          item(T.resumo.origem, `${origem.nome} — ${origem.pericia} +${origem.bonusPericia}`),
          item(T.origem.poder, h('em', {}, origem.poder.nome), ` — ${origem.poder.descricao}`),
          item(T.origem.itens, origem.itens.join('; ')),
        ),
        h('div', { class: 'revisao-atributos' },
          ...ATRIBUTOS.map((a) => h('div', { class: `atributo-grande ${finais[a] > 0 ? 'pos' : finais[a] < 0 ? 'neg' : ''}` },
            h('span', { class: 'ag-sigla' }, a), h('span', { class: 'ag-valor' }, sinal(finais[a])), h('span', { class: 'ag-nome' }, textos.atributos[a])))),
      ),
    );
  }

  const PASSOS = [passoGenero, passoRaca, passoOrigem, passoNome, passoAtributos, passoRevisao];

  renderizar(true);

  return {
    el,
    aoEntrar() {
      // A mesma faixa do menu: se já estiver tocando, continua sem reiniciar.
      audio.tocarMusica(ASSETS.musicaMenu, 2000);
    },
  };
}
