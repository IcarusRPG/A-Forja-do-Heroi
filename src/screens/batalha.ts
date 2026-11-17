import REGIOES from '../data/regioes.json';
import { ASSETS, SFX_CAPITULO, src, type NomeSfx } from '../core/assets';
import { audio } from '../core/audio';
import { forcarD20, lerDado, rolar, rolarD20 } from '../core/dados';
import { atualizarCampanha, getEstado, marcarFlag } from '../core/estado';
import { bonusPericia, defesaDe, pvAntesDaForjaDe, type IdPericia } from '../core/pericias';
import { irPara, type Tela } from '../core/telas';
import { fmt, textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import { carregarFolha, SpriteBatalha } from '../batalha/sprite';
import { INIMIGOS, type AtaqueInimigo, type DadosInimigo } from '../batalha/inimigos';
import { avaliar, mostrarRolagem } from '../narrativa/rolagem';

/**
 * Batalha no estilo Final Fantasy VI: inimigos à esquerda (virados para a direita), heróis à direita,
 * janela de comandos embaixo, linha de mensagem no topo e a ordem dos turnos numa faixa.
 *
 * Regras (sistema Icarus, antes da Forja): iniciativa d20 + DES rolada sozinha e fixa na luta; ataque
 * d20 + Luta (FOR) contra a Defesa (10 + DES); 20 natural acerta e dobra o dano; 1 natural erra.
 * Não existe comando de fugir. Um combate novo precisa só de dados (src/data/inimigos/*.json) e sprites.
 */

export interface ParamsBatalha {
  inimigo: string;
  vitoria: string;
  derrota: string;
}

type Comando = 'bicuda' | 'intimidar' | 'acalmar' | 'aguardar';
type Fim = 'vitoria' | 'derrota' | null;

const T = textos.batalha;
const parametros = () => new URLSearchParams(location.search);

export function telaBatalha(params?: unknown): Tela {
  const prm = params as ParamsBatalha;
  const dados: DadosInimigo = INIMIGOS[prm.inimigo];
  if (!dados) throw new Error(`Inimigo desconhecido: ${prm.inimigo}`);
  const regiao = (REGIOES as Record<string, { fundo: string; musica: string }>)[dados.regiao];
  const p = getEstado().personagem!;
  const pvMax = pvAntesDaForjaDe(p);
  const defesa = defesaDe(p);

  // ---- estado da luta ----
  let pvHeroi = Math.max(1, Math.min(pvMax, getEstado().campanha.pvAtual ?? pvMax));
  let pvInimigo = dados.pv;
  let heroiCaido = false;
  let preparado = false;
  let turnoInimigo = 0;
  let fim: Fim = null;
  let vez: 'heroi' | 'inimigo' | null = null;
  const log: string[] = [];
  let ordem: { id: 'heroi' | 'inimigo'; nome: string; valor: number }[] = [];
  let saiu = false;

  // ---- elementos ----
  const arena = h('div', { class: 'batalha-arena' });
  arena.style.backgroundImage = `url("${src(ASSETS.fundoBatalha(regiao.fundo))}")`;
  const mensagem = h('p', { class: 'batalha-mensagem', 'aria-live': 'polite' });
  const faixaTurnos = h('ol', { class: 'batalha-turnos', 'aria-label': T.ordem });
  const ladoInimigo = h('div', { class: 'batalha-lado inimigos' });
  const ladoHeroi = h('div', { class: 'batalha-lado herois' });
  const efeitos = h('div', { class: 'batalha-efeitos', 'aria-hidden': 'true' });
  const escuro = h('div', { class: 'batalha-escuro' });
  arena.append(ladoInimigo, ladoHeroi, efeitos, h('div', { class: 'batalha-topo' }, mensagem, faixaTurnos), escuro);

  const listaComandos = h('div', { class: 'batalha-comandos', role: 'group', 'aria-label': T.comandos });
  const dica = h('p', { class: 'batalha-dica' });
  const barraPv = h('div', { class: 'pv-barra' }, h('div', { class: 'pv-preenchido' }));
  const numeroPv = h('span', { class: 'pv-numero' });
  const status = h('span', { class: 'batalha-status' });
  const ficha = h('div', { class: 'batalha-ficha' },
    h('p', { class: 'ficha-nome' }, p.nome, status),
    h('div', { class: 'ficha-pv' }, h('span', { class: 'pv-rotulo' }, 'PV'), barraPv, numeroPv),
    h('p', { class: 'ficha-defesa' }, `${T.defesa} ${defesa}`));
  const registro = h('ol', { class: 'batalha-log' });
  const btnRegistro = h('button', { type: 'button', class: 'batalha-btn-log', 'aria-expanded': 'false' }, T.registro);
  const caixaLog = h('div', { class: 'batalha-caixa-log', hidden: true }, registro);
  btnRegistro.addEventListener('click', () => {
    caixaLog.hidden = !caixaLog.hidden;
    btnRegistro.setAttribute('aria-expanded', String(!caixaLog.hidden));
  });
  const janela = h('div', { class: 'batalha-janela' },
    h('div', { class: 'janela-esquerda' }, listaComandos, dica),
    h('div', { class: 'janela-direita' }, ficha, btnRegistro));
  const el = h('div', { class: 'tela-batalha' }, arena, janela, caixaLog);

  let heroi!: SpriteBatalha;
  let inimigo!: SpriteBatalha;

  // ---- utilidades ----
  const nomeInimigo = dados.nome;
  const msg = (t: string) => { mensagem.textContent = t; };
  const registrar = (linha: string) => {
    log.push(linha);
    registro.append(h('li', {}, linha));
    registro.scrollTop = registro.scrollHeight;
  };
  const sfx = (n: string) => audio.sfx(n as NomeSfx);

  function atualizarFicha() {
    const frac = Math.max(0, pvHeroi / pvMax);
    (barraPv.firstElementChild as HTMLElement).style.width = `${frac * 100}%`;
    barraPv.classList.toggle('baixo', frac <= 0.25);
    numeroPv.textContent = `${Math.max(0, pvHeroi)} / ${pvMax}`;
    status.textContent = heroiCaido ? ` · ${T.caido}` : '';
  }

  /** Pose parada do herói: ajoelhado com 25% dos PV ou menos; caído com 0 ou derrubado. */
  function poseHeroiParado() {
    if (pvHeroi <= 0 || heroiCaido) return 'caido';
    return pvHeroi / pvMax <= 0.25 ? 'ferido' : 'parado';
  }
  function heroiEmGuarda() {
    const pose = poseHeroiParado();
    heroi.mudarPose(pose);
    heroi.respirar(pose === 'parado');
  }
  function poseInimigoParado() {
    if (dados.exaustoComPv && pvInimigo <= dados.exaustoComPv && dados.poses.exausto) return dados.poses.exausto;
    return dados.poses.parado;
  }
  function inimigoEmGuarda() {
    inimigo.mudarPose(poseInimigoParado());
    inimigo.respirar(true);
  }

  /** Número de dano que sobe e some sobre o alvo (crítico em dourado e maior); "Errou!" no erro. */
  function numeroSobre(alvo: SpriteBatalha, textoNum: string, classe: string) {
    const r = alvo.el.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    const n = h('span', { class: `batalha-numero ${classe}` }, textoNum);
    n.style.left = `${r.left - a.left + r.width / 2}px`;
    n.style.top = `${r.top - a.top + r.height * 0.25}px`;
    efeitos.append(n);
    setTimeout(() => n.remove(), 1400);
  }

  // ---- iniciativa ----
  async function rolarIniciativa() {
    const dH = rolarD20();
    const bH = bonusPericia(p, 'iniciativa').total;
    const dI = rolarD20();
    const vH = dH + bH;
    const vI = dI + dados.iniciativa;
    ordem = [{ id: 'heroi' as const, nome: p.nome, valor: vH }, { id: 'inimigo' as const, nome: nomeInimigo, valor: vI }]
      // Empate: quem tem o maior bônus age antes; persistindo, o herói.
      .sort((a, b) => b.valor - a.valor || (a.id === 'heroi' ? -1 : 1));
    registrar(fmt(T.logIniciativa, p.genero, { nome: p.nome, d: dH, b: sinal(bH), t: vH }));
    registrar(fmt(T.logIniciativa, p.genero, { nome: nomeInimigo, d: dI, b: sinal(dados.iniciativa), t: vI }));
    faixaTurnos.replaceChildren(...ordem.map((o) => h('li', { 'data-id': o.id }, h('span', { class: 'turno-nome' }, o.nome), h('span', { class: 'turno-valor' }, String(o.valor)))));
    msg(fmt(T.iniciativa, p.genero, { a: `${p.nome} ${vH}`, b: `${nomeInimigo} ${vI}` }));
    el.classList.add('mostrando-iniciativa');
    await esperar(1500);
    el.classList.remove('mostrando-iniciativa');
  }
  const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

  function marcarVez(id: 'heroi' | 'inimigo') {
    vez = id;
    for (const li of faixaTurnos.children) li.classList.toggle('atual', (li as HTMLElement).dataset.id === id);
  }

  // ---- comandos ----
  let escolherComando: ((c: Comando) => void) | null = null;

  function montarComandos() {
    const conversa = dados.aceitaConversa;
    const itens: [Comando, string, boolean][] = [
      ['bicuda', T.cmd.bicuda, true],
      ['intimidar', T.cmd.intimidar, conversa],
      ['acalmar', T.cmd.acalmar, conversa],
      ['aguardar', T.cmd.aguardar, true],
    ];
    listaComandos.replaceChildren(...itens.map(([id, rotulo, ok]) => {
      const b = botao(rotulo, () => escolherComando?.(id), { classe: 'batalha-cmd', som: 'ui-confirm' });
      b.dataset.comando = id;
      b.dataset.liberado = ok ? '1' : '0';
      if (!ok) {
        b.title = T.furiosoDemais;
        b.setAttribute('aria-description', T.furiosoDemais);
      }
      return b;
    }));
    dica.textContent = conversa ? '' : T.furiosoDemais;
  }

  function habilitarComandos(sim: boolean) {
    for (const b of listaComandos.querySelectorAll<HTMLButtonElement>('.batalha-cmd')) b.disabled = !sim || b.dataset.liberado !== '1';
    janela.classList.toggle('esperando', sim);
    if (sim) listaComandos.querySelector<HTMLButtonElement>('.batalha-cmd:not(:disabled)')?.focus({ preventScroll: true });
  }

  // ---- ações do herói ----
  async function bicuda(prefixo = '') {
    const luta = bonusPericia(p, 'luta');
    const d = rolarD20();
    const r = avaliar(d, luta.partes, dados.defesa);
    const acerto = d !== 1 && (d === 20 || r.total >= dados.defesa);
    const critico = d === 20;
    msg(prefixo || fmt(T.bicuda, p.genero, { nome: p.nome }));
    let dano = 0;
    let rolagemDano = '';
    if (acerto) {
      const forca = p.atributosFinais.FOR;
      const [dd] = rolar(1, 4);
      dano = Math.max(1, dd + forca) * (critico ? 2 : 1);
      rolagemDano = `1d4${sinal(forca)} = ${Math.max(1, dd + forca)}${critico ? ` × 2 = ${dano}` : ''}`;
    }
    await heroi.atacar('ataque', 20, async () => {
      if (!acerto) {
        sfx('miss');
        numeroSobre(inimigo, T.errou, 'errou');
        return;
      }
      sfx(critico ? 'crit' : 'kick');
      numeroSobre(inimigo, String(dano), critico ? 'critico' : 'dano');
      pvInimigo -= dano;
      await inimigo.levarDano(dados.poses.atingido);
    });
    registrar(`${T.cmd.bicuda}: ${r.conta} ${T.contra} ${T.defesa} ${dados.defesa} · ${acerto ? (critico ? T.critico : T.acerto) : T.erro}${acerto ? ` · ${rolagemDano}` : ''}`);
    if (acerto && critico && dados.poses.tonto && pvInimigo > dados.fogeComPv) {
      inimigo.mudarPose(dados.poses.tonto);
      await esperar(700);
    }
    heroiEmGuarda();
    inimigoEmGuarda();
    if (pvInimigo <= dados.fogeComPv) await inimigoFoge('fugiu');
  }

  async function conversar(cmd: 'intimidar' | 'acalmar') {
    const pericia: IdPericia = cmd === 'intimidar' ? 'intimidacao' : 'adestramento';
    const cd = cmd === 'intimidar' ? dados.cdIntimidar ?? 12 : dados.cdAcalmar ?? 15;
    msg(fmt(cmd === 'intimidar' ? T.intimidando : T.acalmando, p.genero, { nome: p.nome }));
    const b = bonusPericia(p, pericia);
    const r = await mostrarRolagem(el, { titulo: T.cmd[cmd], d20: rolarD20(), partes: b.partes, alvo: cd, esperarToque: false, giroMs: 800 });
    registrar(`${T.cmd[cmd]}: ${r.conta} · CD ${cd} · ${r.sucesso ? T.sucesso : T.falha}`);
    if (!r.sucesso) {
      msg(cmd === 'intimidar' ? T.intimidarFalhou : T.acalmarFalhou);
      await esperar(1100);
      return;
    }
    marcarFlag(cmd === 'intimidar' ? 'intimidou' : 'acalmou');
    if (dados.poses.recuando) {
      inimigo.respirar(false);
      inimigo.mudarPose(dados.poses.recuando);
    }
    msg(fmt(cmd === 'intimidar' ? T.intimidarDeuCerto : T.acalmarDeuCerto, p.genero, { inimigo: nomeInimigo }));
    await esperar(1000);
    await inimigoFoge(cmd === 'intimidar' ? 'fugiu' : 'acalmou');
  }

  async function inimigoFoge(motivo: 'fugiu' | 'acalmou') {
    sfx('pig-squeal');
    msg(motivo === 'fugiu' ? fmt(T.inimigoFoge, p.genero, { inimigo: nomeInimigo }) : fmt(T.inimigoVolta, p.genero, { inimigo: nomeInimigo }));
    registrar(motivo === 'fugiu' ? fmt(T.inimigoFoge, p.genero, { inimigo: nomeInimigo }) : fmt(T.inimigoVolta, p.genero, { inimigo: nomeInimigo }));
    await inimigo.fugir(dados.poses.fugindo);
    fim = 'vitoria';
  }

  // ---- turno do inimigo ----
  function escolherAtaque(): AtaqueInimigo {
    const ia = dados.ia;
    let id = ia.ataque ?? 'presas';
    if (ia.tipo === 'investida') {
      if (turnoInimigo === 0 && ia.primeiro) id = ia.primeiro;
      else if (heroiCaido && ia.seCaido) id = ia.seCaido;
      else if (ia.senao) {
        let x = Math.random();
        for (const [nome, peso] of ia.senao) { if ((x -= peso) <= 0) { id = nome; break; } }
      }
    }
    return { id, ...dados.ataques[id] };
  }

  async function ataqueDoInimigo() {
    const atq = escolherAtaque();
    turnoInimigo++;
    // Aguardar: a Bicuda preparada sai antes do ataque.
    if (preparado) {
      preparado = false;
      el.classList.remove('heroi-preparado');
      await bicuda(fmt(T.revida, p.genero, { nome: p.nome }));
      if (fim) return;
      await esperar(300);
    }
    msg(atq.mensagem);
    const d = rolarD20();
    const total = d + atq.bonus;
    const acerto = d !== 1 && (d === 20 || total >= defesa);
    const critico = d === 20;
    const dd = lerDado(atq.dano);
    const base = rolar(dd.qtd, dd.lados).reduce((a, b) => a + b, 0) + dd.mod;
    const dano = acerto ? Math.max(1, base) * (critico ? 2 : 1) : 0;
    sfx(atq.som);
    await inimigo.atacar(atq.pose ? dados.poses[atq.pose] ?? atq.pose : dados.poses.ataque, atq.id === 'investida' ? 60 : 30, async () => {
      if (!acerto) {
        sfx('miss');
        numeroSobre(heroi, T.errou, 'errou');
        return;
      }
      sfx(critico ? 'crit' : 'kick');
      numeroSobre(heroi, String(dano), critico ? 'critico' : 'dano');
      pvHeroi = Math.max(0, pvHeroi - dano);
      atualizarFicha();
      await heroi.levarDano('atingido');
    });
    registrar(`${atq.nome}: ${d} ${sinal(atq.bonus)} = ${total} ${T.contra} ${T.defesa} ${defesa} · ${acerto ? (critico ? T.critico : T.acerto) : T.erro}${acerto ? ` · ${atq.dano} = ${Math.max(1, base)}${critico ? ` × 2 = ${dano}` : ''}` : ''}`);
    inimigoEmGuarda();
    if (pvHeroi <= 0) {
      heroiEmGuarda();
      fim = 'derrota';
      return;
    }
    // Investida: se acertou, Fortitude (CON) contra a CD ou o herói fica Caído.
    if (acerto && atq.derruba) {
      const b = bonusPericia(p, atq.derruba.pericia as IdPericia);
      const dF = rolarD20();
      const r = avaliar(dF, b.partes, atq.derruba.cd);
      registrar(`${T.fortitude}: ${r.conta} · CD ${atq.derruba.cd} · ${r.sucesso ? T.sucesso : T.falha}`);
      if (!r.sucesso) {
        heroiCaido = true;
        heroiEmGuarda();
        sfx('fall');
        msg(fmt(T.derrubado, p.genero, { nome: p.nome }));
        atualizarFicha();
        await esperar(900);
      } else {
        msg(fmt(T.resistiu, p.genero, { nome: p.nome }));
        await esperar(800);
      }
    }
    heroiEmGuarda();
  }

  // ---- turno do herói ----
  async function turnoDoHeroi() {
    if (heroiCaido) {
      msg(T.levantando);
      registrar(fmt(T.logLevantando, p.genero, { nome: p.nome }));
      await esperar(1000);
      heroiCaido = false;
      atualizarFicha();
      heroiEmGuarda();
    }
    msg(fmt(T.vezDoHeroi, p.genero, { nome: p.nome }));
    habilitarComandos(true);
    const cmd = await new Promise<Comando>((ok) => { escolherComando = ok; });
    escolherComando = null;
    habilitarComandos(false);
    if (cmd === 'bicuda') await bicuda();
    else if (cmd === 'intimidar' || cmd === 'acalmar') await conversar(cmd);
    else {
      preparado = true;
      el.classList.add('heroi-preparado');
      msg(fmt(T.aguardando, p.genero, { nome: p.nome }));
      registrar(fmt(T.aguardando, p.genero, { nome: p.nome }));
      await esperar(900);
    }
  }

  // ---- fim ----
  async function vitoria() {
    heroi.respirar(false);
    heroi.mudarPose('vitoria');
    audio.tocarVinheta(ASSETS.musica('vitoria'));
    msg(T.vitoria);
    el.classList.add('vitoria');
    atualizarCampanha({ pvAtual: pvHeroi });
    marcarFlag('venceu_' + dados.id.split('-')[0]);
    await esperar(600);
    const b = botao(T.continuar, () => void irPara('capitulo', { cena: prm.vitoria }), { classe: 'btn-principal batalha-continuar' });
    listaComandos.replaceChildren(b);
    dica.textContent = '';
    b.focus({ preventScroll: true });
  }

  async function derrota() {
    heroi.respirar(false);
    heroi.mudarPose('caido');
    sfx('fall');
    msg(fmt(T.derrota, p.genero, { nome: p.nome }));
    atualizarCampanha({ pvAtual: 0 });
    el.classList.add('derrota');
    await esperar(2200);
    if (saiu) return;
    void irPara('capitulo', { cena: prm.derrota }, { duracao: 900 });
  }

  async function lutar() {
    await rolarIniciativa();
    while (!fim && !saiu) {
      for (const o of ordem) {
        if (fim || saiu) break;
        marcarVez(o.id);
        if (o.id === 'heroi') await turnoDoHeroi();
        else await ataqueDoInimigo();
        await esperar(250);
      }
    }
    vez = null;
    if (saiu) return;
    if (fim === 'vitoria') await vitoria();
    else await derrota();
  }

  // ---- escala dos sprites (inteira quando possível) ----
  function escalar() {
    if (!heroi || !inimigo) return;
    const altura = arena.clientHeight;
    // Cabe na altura (herói ~45% da arena) e na largura (os dois lado a lado, com folga no meio).
    const porAltura = altura / (heroi.alturaQuadro * 2.15);
    const porLargura = (arena.clientWidth * 0.86) / (heroi.larguraQuadro + inimigo.larguraQuadro);
    const bruto = Math.min(porAltura, porLargura);
    const k = bruto >= 2 ? Math.min(4, Math.floor(bruto)) : bruto >= 1.5 ? 1.5 : 1;
    heroi.escalar(k);
    inimigo.escalar(k);
    el.style.setProperty('--escala', String(k));
  }
  const observador = new ResizeObserver(() => escalar());

  function ganchosDeTeste() {
    if (!parametros().has('test')) return;
    (window as unknown as { __fdg: unknown }).__fdg = {
      forceRoll: (v: number[]) => forcarD20(v),
      setPv: (n: number) => { pvHeroi = n; atualizarFicha(); heroiEmGuarda(); },
      comando: (c: Comando) => escolherComando?.(c),
      desfazerInimigo: () => inimigo.desfazer(),
      state: () => ({
        tela: 'batalha',
        inimigo: dados.id,
        pvHeroi, pvMax, pvInimigo, defesa,
        ordem: ordem.map((o) => o.id),
        iniciativa: ordem.map((o) => o.valor),
        vez,
        poseHeroi: heroi?.pose ?? null,
        poseInimigo: inimigo?.pose ?? null,
        heroiCaido, preparado, fim,
        comandos: [...listaComandos.querySelectorAll<HTMLButtonElement>('.batalha-cmd')].map((b) => ({ id: b.dataset.comando, habilitado: b.dataset.liberado === '1' })),
        log: [...log],
        musica: audio.estadoMusica(),
      }),
    };
  }

  return {
    el,
    aoEntrar() {
      void (async () => {
        await audio.carregarEfeitos(SFX_CAPITULO);
        audio.tocarMusica(ASSETS.musica(regiao.musica), 1200);
        const [fH, fI] = await Promise.all([
          carregarFolha(ASSETS.spriteBatalhaHeroi(p.raca, p.genero)),
          carregarFolha(ASSETS.spriteBatalhaInimigo(dados.sprite)),
        ]);
        if (saiu) return;
        heroi = new SpriteBatalha(fH, 'heroi', 'direita');
        inimigo = new SpriteBatalha(fI, 'inimigo', 'esquerda');
        ladoHeroi.append(heroi.el);
        ladoInimigo.append(inimigo.el);
        montarComandos();
        habilitarComandos(false);
        atualizarFicha();
        escalar();
        observador.observe(arena);
        heroiEmGuarda();
        inimigoEmGuarda();
        ganchosDeTeste();
        el.classList.add('pronta');
        msg(fmt(T.aparece, p.genero, { inimigo: nomeInimigo }));
        await esperar(1100);
        if (!saiu) await lutar();
      })();
    },
    aoSair() {
      saiu = true;
      observador.disconnect();
      delete (window as unknown as { __fdg?: unknown }).__fdg;
    },
  };
}
