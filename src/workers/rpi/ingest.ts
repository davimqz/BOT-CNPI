import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { Cruzamento, DespachoParaCruzamento } from '@/lib/verificacao';
import { cruzarDespachos, motivoDoVinculo } from '@/lib/verificacao';
import { prazosDoDespacho, statusPorData } from '@/lib/prazos';
import { PRIMEIRA_EDICAO_2026, edicoesFaltantes } from '@/lib/revistas';
import { baixarEdicao } from './download';
import { parseRevista } from './parse';

// Fluxo da skill rpi-ingestion-despachos:
// 1. edição alvo = última processada + 1 (estimativa por incremento);
// 2. confirmação por tentativa de download (302/404 = ainda não publicada, estado normal);
// 3. loop de catch-up: se uma semana falhou, a próxima rodada processa as edições atrasadas.
// 4. cruzamento da edição contra as marcas monitoradas de fonte `rpi` (Fase 3) —
//    é aqui que mora o "job de verificação" dessa fonte; não existe job separado.

const LOTE_INSERT = 1000;
const LOTE_UPDATE = 1000;

/**
 * Modo enxuto ligado por variável de ambiente (`RPI_MODO_ENXUTO=1`), para valer
 * também na ingestão semanal do GitHub Actions sem mexer no comando. A flag
 * `--enxuto` / `--completo` sobrepõe por rodada.
 *
 * Padrão desligado: quem já tem histórico completo não deve passar a gravar menos
 * por causa de uma atualização de código. Ligar é decisão explícita de capacidade
 * (ver CLAUDE.md Seção 3.1.1).
 */
const MODO_ENXUTO_PADRAO = process.env.RPI_MODO_ENXUTO === '1';

async function determinarProximaEdicao(): Promise<number> {
  const ultima = await prisma.edicaoRpi.aggregate({ _max: { numero: true } });
  if (ultima._max.numero) return ultima._max.numero + 1;

  // Banco vazio: o sistema começa em janeiro de 2026 (RPI 2870), não na edição
  // da semana. Semente explícita (argumento ou RPI_EDICAO_INICIAL) ainda vence,
  // para o caso de só se querer a edição corrente.
  const argumentoSemente = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const informada = process.env.RPI_EDICAO_INICIAL ?? argumentoSemente;
  if (informada === undefined) {
    console.log(
      `[rpi] banco sem edições — começando pela RPI ${PRIMEIRA_EDICAO_2026} (primeira de 2026).`,
    );
    return PRIMEIRA_EDICAO_2026;
  }

  const semente = Number(informada);
  if (!Number.isInteger(semente) || semente <= 0) {
    throw new Error(`Semente de edição inválida: ${JSON.stringify(informada)}`);
  }
  return semente;
}

interface ResumoCruzamento {
  marcasMonitoradas: number;
  despachosCasados: number;
  alertas: number;
  /** Quantos casaram por semelhança de nome (Fase 4), não pela própria marca. */
  colidencias: number;
  /** Prazos legais derivados dos despachos casados (Fase 5). */
  prazos: number;
}

/**
 * Fase 5: converte os despachos recém-vinculados nos prazos que eles abrem.
 *
 * Só entra despacho que casou com marca monitorada — prazo de processo alheio
 * não é prazo do usuário. O `motivo` vai junto porque numa colidência o único
 * prazo cabível é o de oposição (ver prazosDoDespacho).
 *
 * `skipDuplicates` sobre a única (despacho, tipo) é o que torna seguro re-rodar
 * uma edição ou usar o modo retroativo: um prazo já marcado como `cumprido` pelo
 * usuário não volta para `pendente`.
 */
async function gerarPrazos(
  cruzamentos: Cruzamento[],
  despachos: DespachoParaCruzamento[],
  dataPublicacao: Date,
): Promise<number> {
  const porId = new Map(despachos.map((d) => [d.id, d]));
  const linhas = [];
  for (const c of cruzamentos) {
    const despacho = porId.get(c.despachoId);
    if (!despacho) continue;
    for (const prazo of prazosDoDespacho({
      codigo: despacho.codigo,
      dataPublicacao,
      motivo: c.motivo,
    })) {
      linhas.push({
        despachoId: despacho.id,
        tipo: prazo.tipo,
        dataLimite: prazo.dataLimite,
        status: statusPorData(prazo.dataLimite),
      });
    }
  }
  if (linhas.length === 0) return 0;

  let gravados = 0;
  for (let i = 0; i < linhas.length; i += LOTE_INSERT) {
    const r = await prisma.prazo.createMany({
      data: linhas.slice(i, i + LOTE_INSERT),
      skipDuplicates: true,
    });
    gravados += r.count;
  }
  return gravados;
}

type MarcaRpi = Awaited<ReturnType<typeof carregarMarcasRpi>>[number];

const RESUMO_VAZIO: ResumoCruzamento = {
  marcasMonitoradas: 0,
  despachosCasados: 0,
  alertas: 0,
  colidencias: 0,
  prazos: 0,
};

async function carregarMarcasRpi() {
  return prisma.marcaMonitorada.findMany({
    where: { ativa: true, fonteDados: 'rpi' },
    // Ordem estável: em caso de empate, a marca cadastrada primeiro fica com o despacho.
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      nome: true,
      processo: true,
      classeNcl: true,
      eventosAlerta: true,
      similaridadeAtiva: true,
      similaridadeThreshold: true,
    },
  });
}

/**
 * Log + prazos, comum aos dois modos de gravação (completo e enxuto). Recebe os
 * cruzamentos já persistidos; não escreve em `despachos`.
 */
async function finalizarCruzamento(
  cruzamentos: Cruzamento[],
  despachos: DespachoParaCruzamento[],
  marcas: MarcaRpi[],
  dataPublicacao: Date,
): Promise<ResumoCruzamento> {
  const alertas = cruzamentos.filter((c) => c.alerta).length;
  const porSimilaridade = cruzamentos.filter((c) => c.motivo === 'similaridade');
  const marcasComMovimentacao = new Set(cruzamentos.map((c) => c.marcaId)).size;
  console.log(
    `[rpi] verificação: ${cruzamentos.length} despacho(s) de ${marcasComMovimentacao} marca(s) ` +
      `monitorada(s); ${alertas} com alerta pendente.`,
  );
  // Colidência é um resultado diferente de movimentação própria — mostrar o
  // score no log é o que permite calibrar o threshold da marca depois.
  for (const c of porSimilaridade) {
    const marca = marcas.find((m) => m.id === c.marcaId);
    const despacho = despachos.find((d) => d.id === c.despachoId);
    console.log(
      `[rpi]   colidência ${c.score}% — "${despacho?.nomeMarca}" (processo ${despacho?.processo}) ` +
        `parecida com "${marca?.nome}"`,
    );
  }
  const prazos = await gerarPrazos(cruzamentos, despachos, dataPublicacao);
  if (prazos > 0) console.log(`[rpi] ${prazos} prazo(s) legal(is) gerado(s) — ver tela /prazos.`);

  return {
    marcasMonitoradas: marcas.length,
    despachosCasados: cruzamentos.length,
    prazos,
    alertas,
    colidencias: porSimilaridade.length,
  };
}

/**
 * Job de verificação da fonte `rpi`: liga cada despacho da edição à marca
 * monitorada correspondente e marca `alertaPendente` nos que caem entre os
 * eventos escolhidos pela marca.
 *
 * Só olha despacho AINDA SEM MARCA: na ingestão normal isso é o total da edição,
 * e no modo retroativo (--recruzar, para marca cadastrada depois da ingestão)
 * garante que um alerta já enviado pela Fase 6 não volte para a fila.
 */
async function cruzarComMonitoradas(
  edicaoId: string,
  dataPublicacao: Date,
): Promise<ResumoCruzamento> {
  const marcas = await carregarMarcasRpi();
  if (marcas.length === 0) {
    console.log('[rpi] nenhuma marca monitorada de fonte rpi — nada a cruzar.');
    return { ...RESUMO_VAZIO };
  }

  const despachos = await prisma.despacho.findMany({
    where: { edicaoRpiId: edicaoId, marcaId: null },
    select: { id: true, processo: true, nomeMarca: true, classeNcl: true, codigo: true },
  });
  const cruzamentos = cruzarDespachos(marcas, despachos);

  // Um UPDATE por combinação (marca, gera alerta ou não), em lotes — evita um
  // round-trip por despacho quando uma marca movimenta muito numa edição só.
  const grupos = new Map<string, string[]>();
  for (const c of cruzamentos) {
    const chave = `${c.marcaId}|${c.alerta}`;
    const lista = grupos.get(chave);
    if (lista) lista.push(c.despachoId);
    else grupos.set(chave, [c.despachoId]);
  }
  for (const [chave, ids] of grupos) {
    const [marcaId, alerta] = chave.split('|');
    for (let i = 0; i < ids.length; i += LOTE_UPDATE) {
      await prisma.despacho.updateMany({
        where: { id: { in: ids.slice(i, i + LOTE_UPDATE) } },
        data: { marcaId, alertaPendente: alerta === 'true' },
      });
    }
  }

  return finalizarCruzamento(cruzamentos, despachos, marcas, dataPublicacao);
}

/**
 * Recria a linha da edição, apagando o que houver dela. Idempotência da ingestão:
 * re-rodar uma edição regrava do zero em vez de duplicar.
 */
async function recriarEdicao(
  numero: number,
  dataPublicacao: Date,
  enxuta: boolean,
): Promise<string> {
  const existente = await prisma.edicaoRpi.findUnique({ where: { numero } });
  if (existente) {
    await prisma.despacho.deleteMany({ where: { edicaoRpiId: existente.id } });
    await prisma.edicaoRpi.delete({ where: { id: existente.id } });
    console.log(`[rpi] edição ${numero} já existia — regravando do zero.`);
  }
  const edicao = await prisma.edicaoRpi.create({
    data: { numero, dataPublicacao, enxuta },
  });
  return edicao.id;
}

/**
 * MODO ENXUTO — grava só os despachos que casaram com marca monitorada.
 *
 * A revista inteira é baixada, parseada e **cruzada por completo** (inclusive o
 * motor de similaridade, que precisa ver todos os nomes da edição para achar
 * colidência). O que muda é só o que sobra no banco: em vez das ~35 mil linhas da
 * edição, ficam as poucas que são suas.
 *
 * Isso é o que torna possível consumir 2026 inteiro de graça: alerta, prazo e
 * colidência saem com a mesma fidelidade do modo completo, a ~0 byte por edição.
 * O que se abre mão é do Histórico RPI navegável para despacho de terceiro naquela
 * edição — que continua no PDF oficial, linkado em /revistas.
 */
async function ingerirEdicaoEnxuta(
  numero: number,
  revista: { dataPublicacao: Date; despachos: ReturnType<typeof parseRevista>['despachos'] },
): Promise<ResumoCruzamento> {
  const marcas = await carregarMarcasRpi();
  const edicaoId = await recriarEdicao(numero, revista.dataPublicacao, true);

  if (marcas.length === 0) {
    console.log('[rpi] nenhuma marca monitorada de fonte rpi — nada a gravar no modo enxuto.');
    return { ...RESUMO_VAZIO };
  }

  // Ids gerados aqui, não pelo banco: são a chave que liga o cruzamento em memória
  // à linha que será inserida. Deixar o banco gerar exigiria confiar na ordem de
  // retorno de um createMany, que não é garantia que valha a pena assumir.
  const candidatos = revista.despachos.map((d) => ({ id: randomUUID() as string, origem: d }));
  const paraCruzar: DespachoParaCruzamento[] = candidatos.map((c) => ({
    id: c.id,
    processo: c.origem.processo,
    nomeMarca: c.origem.nomeMarca,
    classeNcl: c.origem.classeNcl,
    codigo: c.origem.codigo,
  }));
  const cruzamentos = cruzarDespachos(marcas, paraCruzar);

  const porId = new Map(candidatos.map((c) => [c.id, c.origem]));
  const linhas = cruzamentos.map((c) => {
    const d = porId.get(c.despachoId)!;
    return {
      id: c.despachoId,
      edicaoRpiId: edicaoId,
      marcaId: c.marcaId,
      alertaPendente: c.alerta,
      processo: d.processo,
      codigo: d.codigo,
      textoDespacho: d.nomeDespacho || null,
      textoComplementar: d.textoComplementar,
      nomeMarca: d.nomeMarca,
      titular: d.titular,
      classeNcl: d.classeNcl,
      dataPublicacao: revista.dataPublicacao,
    };
  });
  for (let i = 0; i < linhas.length; i += LOTE_INSERT) {
    await prisma.despacho.createMany({ data: linhas.slice(i, i + LOTE_INSERT) });
  }
  console.log(
    `[rpi] modo enxuto: ${linhas.length} de ${revista.despachos.length} despacho(s) gravado(s) ` +
      `(só os das suas marcas).`,
  );

  return finalizarCruzamento(cruzamentos, paraCruzar, marcas, revista.dataPublicacao);
}

async function ingerirEdicao(
  numero: number,
  enxuto = MODO_ENXUTO_PADRAO,
): Promise<{ status: 'nao-publicada' } | ({ status: 'ok' } & ResumoCruzamento)> {
  const resultado = await baixarEdicao(numero);
  if (resultado.status === 'nao-publicada') {
    console.log(`[rpi] edição ${numero} ainda não publicada — nada a fazer.`);
    return { status: 'nao-publicada' };
  }
  if (resultado.status === 'erro') {
    throw new Error(`download da edição ${numero}: ${resultado.detalhe}`);
  }

  const revista = parseRevista(resultado.xml);
  if (revista.numero !== numero) {
    throw new Error(`XML diz edição ${revista.numero}, esperava ${numero}`);
  }
  console.log(
    `[rpi] edição ${numero} (${revista.dataPublicacao.toISOString().slice(0, 10)}): ` +
      `${revista.despachos.length} despachos parseados`,
  );

  if (enxuto) {
    return { status: 'ok', ...(await ingerirEdicaoEnxuta(numero, revista)) };
  }

  const edicaoId = await prisma.$transaction(
    async (tx) => {
      const existente = await tx.edicaoRpi.findUnique({ where: { numero } });
      if (existente) {
        await tx.despacho.deleteMany({ where: { edicaoRpiId: existente.id } });
        await tx.edicaoRpi.delete({ where: { id: existente.id } });
        console.log(`[rpi] edição ${numero} já existia — regravando do zero.`);
      }

      const edicao = await tx.edicaoRpi.create({
        data: { numero, dataPublicacao: revista.dataPublicacao, enxuta: false },
      });

      for (let i = 0; i < revista.despachos.length; i += LOTE_INSERT) {
        const lote = revista.despachos.slice(i, i + LOTE_INSERT).map((d) => ({
          edicaoRpiId: edicao.id,
          processo: d.processo,
          codigo: d.codigo,
          textoDespacho: d.nomeDespacho || null,
          textoComplementar: d.textoComplementar,
          nomeMarca: d.nomeMarca,
          titular: d.titular,
          classeNcl: d.classeNcl,
          dataPublicacao: revista.dataPublicacao,
        }));
        await tx.despacho.createMany({ data: lote });
        console.log(`[rpi]   gravados ${Math.min(i + LOTE_INSERT, revista.despachos.length)}/${revista.despachos.length}`);
      }
      return edicao.id;
    },
    { timeout: 300_000 },
  );

  // Fora da transação de propósito: se o cruzamento falhar, a edição continua
  // gravada e pesquisável no Histórico RPI; basta re-rodar para refazer o vínculo.
  return { status: 'ok', ...(await cruzarComMonitoradas(edicaoId, revista.dataPublicacao)) };
}

/**
 * Modo retroativo: `npm run ingest:rpi -- --recruzar[=N]` roda só a verificação,
 * sobre as N edições já ingeridas mais recentes (padrão 4, ~um mês de RPI), sem
 * baixar nada. É o caminho para uma marca cadastrada DEPOIS da ingestão descobrir
 * movimentação que já estava publicada.
 */
async function recruzarEdicoes(quantidade: number): Promise<void> {
  const edicoes = await prisma.edicaoRpi.findMany({
    orderBy: { numero: 'desc' },
    take: quantidade,
    select: { id: true, numero: true, dataPublicacao: true, enxuta: true },
  });
  if (edicoes.length === 0) {
    console.log('[rpi] nenhuma edição ingerida ainda — nada a recruzar.');
    return;
  }

  // Edição enxuta não tem despacho de terceiro no banco: recruzar sobre ela
  // devolveria "nada encontrado" para uma marca nova, que é resposta errada
  // disfarçada de resposta. Avisa alto e manda pelo caminho que funciona.
  const enxutas = edicoes.filter((e) => e.enxuta).map((e) => e.numero);
  if (enxutas.length > 0) {
    console.warn(
      `[rpi] ATENÇÃO: ${enxutas.length} edição(ões) no intervalo foram processadas no modo ` +
        `enxuto (${enxutas.join(', ')}) — elas só guardam os despachos que já eram de alguma ` +
        'marca. Recruzar não vê o resto e diria "sem movimentação" para uma marca nova. ' +
        `Para essas, use: npm run ingest:rpi -- --backfill=${Math.min(...enxutas)} --forcar`,
    );
  }

  let casados = 0;
  let alertas = 0;
  let colidencias = 0;
  let prazos = 0;
  for (const edicao of edicoes.reverse()) {
    console.log(`[rpi] recruzando edição ${edicao.numero}...`);
    const r = await cruzarComMonitoradas(edicao.id, edicao.dataPublicacao);
    casados += r.despachosCasados;
    alertas += r.alertas;
    colidencias += r.colidencias;
    prazos += r.prazos;
  }
  console.log(
    `[rpi] recruzamento concluído: ${casados} despacho(s) vinculado(s), ${alertas} com alerta ` +
      `pendente, ${colidencias} por semelhança de nome, ${prazos} prazo(s) gerado(s).`,
  );
}

/**
 * Backfill de prazos: `npm run ingest:rpi -- --gerar-prazos[=N]`.
 *
 * O cruzamento só olha despacho AINDA SEM MARCA, então despacho vinculado antes
 * da Fase 5 existir nunca passaria pelo gerador de prazos. Este modo percorre os
 * despachos JÁ vinculados das N edições mais recentes e cria o que falta —
 * `skipDuplicates` garante que rodar duas vezes não duplica nem reabre prazo já
 * tratado pelo usuário.
 */
async function gerarPrazosRetroativo(quantidade: number): Promise<void> {
  const edicoes = await prisma.edicaoRpi.findMany({
    orderBy: { numero: 'desc' },
    take: quantidade,
    select: { id: true, numero: true, dataPublicacao: true },
  });
  if (edicoes.length === 0) {
    console.log('[rpi] nenhuma edição ingerida ainda — nada a fazer.');
    return;
  }

  const marcas = await prisma.marcaMonitorada.findMany({
    select: {
      id: true,
      nome: true,
      processo: true,
      classeNcl: true,
      eventosAlerta: true,
      similaridadeAtiva: true,
      similaridadeThreshold: true,
    },
  });
  const porMarcaId = new Map(marcas.map((m) => [m.id, m]));

  let total = 0;
  for (const edicao of edicoes.reverse()) {
    const despachos = await prisma.despacho.findMany({
      where: { edicaoRpiId: edicao.id, marcaId: { not: null } },
      select: {
        id: true,
        processo: true,
        nomeMarca: true,
        classeNcl: true,
        codigo: true,
        marcaId: true,
      },
    });
    if (despachos.length === 0) continue;

    // Reconstrói o motivo de cada vínculo: sem ele, uma colidência viraria prazo
    // de pagamento/recurso de um processo que não é do usuário.
    const cruzamentos: Cruzamento[] = [];
    for (const d of despachos) {
      const marca = porMarcaId.get(d.marcaId!);
      if (!marca) continue;
      cruzamentos.push({
        despachoId: d.id,
        marcaId: marca.id,
        alerta: false, // irrelevante aqui: este modo não mexe na fila de alertas.
        motivo: motivoDoVinculo(marca, d),
      });
    }

    const gerados = await gerarPrazos(cruzamentos, despachos, edicao.dataPublicacao);
    total += gerados;
    console.log(`[rpi] edição ${edicao.numero}: ${gerados} prazo(s) novo(s).`);
  }
  console.log(`[rpi] backfill concluído: ${total} prazo(s) gerado(s).`);
}

/**
 * Backfill histórico: `npm run ingest:rpi -- --backfill[=EDICAO_INICIAL] [--max=N]`.
 *
 * A ingestão normal só anda para a frente (última + 1), então o histórico anterior
 * à primeira rodada nunca entraria sozinho. Este modo percorre o intervalo desde a
 * primeira edição de 2026 até a atual, **pulando o que já está no banco**, e para
 * na primeira edição ainda não publicada.
 *
 * Duas propriedades que importam mais que a velocidade:
 * - **Resumível**: cada edição é uma transação própria. Interromper no meio (ou
 *   estourar o timeout do runner) deixa o que já entrou íntegro, e rodar de novo
 *   continua de onde parou em vez de recomeçar.
 * - **Não re-notifica**: cada edição passa pelo mesmo cruzamento da ingestão
 *   normal, que só olha despacho sem marca vinculada. Alerta já enviado pela Fase 6
 *   não volta para a fila.
 *
 * Cuidado de capacidade, medido em 02/08/2026: cada edição ocupa ~15 MB no Postgres
 * (~35 mil despachos). O backfill de 2026 inteiro são ~400 MB — acima do que sobra
 * no plano free do Neon (0,5 GB). Rode sabendo disso.
 */
async function backfill(
  desde: number,
  maximo: number,
  opcoes: { enxuto: boolean; forcar: boolean },
): Promise<void> {
  const ingeridas = (
    await prisma.edicaoRpi.findMany({ select: { numero: true }, orderBy: { numero: 'asc' } })
  ).map((e) => e.numero);
  const maiorIngerida = ingeridas.length ? Math.max(...ingeridas) : desde;

  // Até a última já ingerida saem os buracos conhecidos; daí para a frente o loop
  // continua até o INPI responder "ainda não publicada".
  // Com --forcar, reprocessa também as que já existem: é o caminho para converter
  // edições completas em enxutas (ou o contrário) e para re-cruzar edição enxuta
  // contra uma marca cadastrada depois.
  const alvos = opcoes.forcar
    ? Array.from({ length: maiorIngerida - desde + 1 }, (_, i) => desde + i)
    : edicoesFaltantes(ingeridas, desde, maiorIngerida);
  console.log(
    `[rpi] backfill${opcoes.enxuto ? ' (modo enxuto)' : ''} a partir da RPI ${desde}: ` +
      `${alvos.length} edição(ões) a processar até a ${maiorIngerida}` +
      (maximo < Infinity ? ` (teto de ${maximo} nesta rodada)` : ''),
  );

  const log = await prisma.logExecucao.create({
    data: { tipo: 'backfill_rpi', status: 'executando', detalhes: { desde, faltando: alvos.length } },
  });
  const processadas: number[] = [];
  let despachosCasados = 0;
  let alertas = 0;
  let prazos = 0;
  const inicio = Date.now();

  try {
    let proxima = maiorIngerida + 1;
    for (const numero of alvos) {
      if (processadas.length >= maximo) break;
      const r = await ingerirEdicao(numero, opcoes.enxuto);
      if (r.status === 'nao-publicada') continue; // buraco real no INPI, não erro.
      processadas.push(numero);
      despachosCasados += r.despachosCasados;
      alertas += r.alertas;
      prazos += r.prazos;
      console.log(
        `[rpi] backfill: ${processadas.length}/${Math.min(alvos.length, maximo)} — ` +
          `${((Date.now() - inicio) / 60_000).toFixed(1)} min decorridos`,
      );
    }

    // Depois dos buracos, avança até a edição ainda não publicada.
    while (processadas.length < maximo) {
      const r = await ingerirEdicao(proxima, opcoes.enxuto);
      if (r.status === 'nao-publicada') break;
      processadas.push(proxima);
      despachosCasados += r.despachosCasados;
      alertas += r.alertas;
      prazos += r.prazos;
      proxima++;
    }

    await prisma.logExecucao.update({
      where: { id: log.id },
      data: {
        status: 'sucesso',
        mensagem: `Backfill: ${processadas.length} edição(ões) — ${despachosCasados} despacho(s) de marcas monitoradas, ${alertas} com alerta, ${prazos} prazo(s)`,
        detalhes: { processadas, despachosCasados, alertas, prazos },
        finalizadoEm: new Date(),
      },
    });
    console.log(
      `[rpi] backfill concluído em ${((Date.now() - inicio) / 60_000).toFixed(1)} min: ` +
        `${processadas.length} edição(ões) ingerida(s)` +
        (processadas.length ? ` (${processadas[0]}–${processadas[processadas.length - 1]})` : ''),
    );
  } catch (e) {
    await prisma.logExecucao.update({
      where: { id: log.id },
      data: {
        status: 'erro',
        mensagem: (e as Error).message,
        detalhes: { processadas },
        finalizadoEm: new Date(),
      },
    });
    throw e;
  }
}

/**
 * Janela móvel do Histórico RPI: `npm run ingest:rpi -- --limpar[=N] [--dry-run]`.
 *
 * Existe por uma restrição medida, não por elegância: cada edição ocupa ~19 MB e o
 * plano free do Neon tem 0,5 GB. Guardar 2026 inteiro (~570 MB) trava a escrita no
 * banco — e banco travado significa ingestão semanal parada, que é o oposto do que
 * este sistema existe para fazer.
 *
 * O que ele **nunca** apaga, e essa é a parte que importa:
 * - `edicoes_rpi` — o catálogo inteiro continua na seção Revistas INPI, com o
 *   download apontando para o INPI. Nenhuma revista some da tela.
 * - **todo despacho vinculado a uma marca monitorada** (`marca_id` preenchido),
 *   de qualquer edição. É o histórico que é seu, e é dele que penduram os `prazos`
 *   (que cairiam junto, por `ON DELETE CASCADE`).
 *
 * O que sai é só o "resto da revista" antigo: despacho de processo de terceiro que
 * nunca casou com nada seu. Se um dia ele fizer falta, a edição continua baixável
 * e `--backfill` a traz de volta.
 *
 * Nota sobre espaço: o Postgres reaproveita o espaço liberado nas próximas
 * inserções, mas só devolve ao disco com `VACUUM FULL despachos`. Para o objetivo
 * aqui — parar de crescer — o reaproveitamento já basta.
 */
async function limparAntigos(manter: number, dryRun: boolean): Promise<void> {
  const edicoes = await prisma.edicaoRpi.findMany({
    orderBy: { numero: 'desc' },
    select: { id: true, numero: true },
  });
  const antigas = edicoes.slice(manter);
  if (antigas.length === 0) {
    console.log(`[rpi] ${edicoes.length} edição(ões) no banco, janela de ${manter} — nada a limpar.`);
    return;
  }

  const alvo = {
    edicaoRpiId: { in: antigas.map((e) => e.id) },
    marcaId: null, // nunca toca no que casou com marca monitorada.
  };
  const aRemover = await prisma.despacho.count({ where: alvo });
  const vinculadosPreservados = await prisma.despacho.count({
    where: { edicaoRpiId: { in: antigas.map((e) => e.id) }, marcaId: { not: null } },
  });

  console.log(
    `[rpi] janela de ${manter} edição(ões): ${antigas.length} edição(ões) fora dela ` +
      `(RPI ${antigas[antigas.length - 1].numero}–${antigas[0].numero}).`,
  );
  console.log(
    `[rpi] ${aRemover.toLocaleString('pt-BR')} despacho(s) de terceiros a remover; ` +
      `${vinculadosPreservados.toLocaleString('pt-BR')} vinculado(s) a marca sua serão mantidos.`,
  );
  if (dryRun) {
    console.log('[rpi] --dry-run: nada foi apagado.');
    return;
  }

  // Uma edição por vez: uma remoção de centenas de milhares de linhas numa
  // transação só estoura o timeout e desfaz o trabalho inteiro.
  let removidos = 0;
  for (const edicao of antigas) {
    const r = await prisma.despacho.deleteMany({
      where: { edicaoRpiId: edicao.id, marcaId: null },
    });
    removidos += r.count;
    console.log(`[rpi]   RPI ${edicao.numero}: ${r.count.toLocaleString('pt-BR')} removido(s)`);
  }
  console.log(
    `[rpi] limpeza concluída: ${removidos.toLocaleString('pt-BR')} despacho(s) removido(s). ` +
      'As revistas continuam listadas e baixáveis em /revistas.',
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definida. No GitHub Actions, confira se o Repository secret ' +
        'DATABASE_URL existe (Settings → Secrets and variables → Actions → aba Secrets).',
    );
  }

  // --enxuto/--completo sobrepõem o padrão de RPI_MODO_ENXUTO por rodada.
  const enxuto = process.argv.includes('--completo')
    ? false
    : process.argv.includes('--enxuto') || MODO_ENXUTO_PADRAO;

  const flagBackfill = process.argv.slice(2).find((a) => a.startsWith('--backfill'));
  if (flagBackfill) {
    const flagMax = process.argv.slice(2).find((a) => a.startsWith('--max='));
    const desde = Number(flagBackfill.split('=')[1]) || PRIMEIRA_EDICAO_2026;
    const maximo = Number(flagMax?.split('=')[1]) || Infinity;
    try {
      await backfill(desde, maximo, { enxuto, forcar: process.argv.includes('--forcar') });
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  const flagLimpar = process.argv.slice(2).find((a) => a.startsWith('--limpar'));
  if (flagLimpar) {
    const dryRun = process.argv.includes('--dry-run');
    try {
      await limparAntigos(Number(flagLimpar.split('=')[1]) || 12, dryRun);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  const flagRecruzar = process.argv.slice(2).find((a) => a.startsWith('--recruzar'));
  if (flagRecruzar) {
    try {
      await recruzarEdicoes(Number(flagRecruzar.split('=')[1]) || 4);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  const flagPrazos = process.argv.slice(2).find((a) => a.startsWith('--gerar-prazos'));
  if (flagPrazos) {
    try {
      await gerarPrazosRetroativo(Number(flagPrazos.split('=')[1]) || 4);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  const log = await prisma.logExecucao.create({
    data: { tipo: 'ingest_rpi', status: 'executando' },
  });
  const processadas: number[] = [];
  let despachosCasados = 0;
  let alertas = 0;
  let colidencias = 0;
  let prazos = 0;

  try {
    let alvo = await determinarProximaEdicao();
    // Catch-up limitado para nunca entrar em loop infinito por erro de lógica.
    for (let i = 0; i < 10; i++, alvo++) {
      const r = await ingerirEdicao(alvo);
      if (r.status === 'nao-publicada') break;
      processadas.push(alvo);
      despachosCasados += r.despachosCasados;
      alertas += r.alertas;
      colidencias += r.colidencias;
      prazos += r.prazos;
    }

    await prisma.logExecucao.update({
      where: { id: log.id },
      data: {
        status: 'sucesso',
        mensagem: processadas.length
          ? `Edições processadas: ${processadas.join(', ')} — ${despachosCasados} despacho(s) de marcas monitoradas, ${alertas} com alerta, ${colidencias} por semelhança de nome, ${prazos} prazo(s) gerado(s)`
          : 'Nenhuma edição nova publicada',
        detalhes: { processadas, despachosCasados, alertas, colidencias, prazos },
        finalizadoEm: new Date(),
      },
    });
    console.log(
      `[rpi] concluído. Edições novas: ${processadas.length ? processadas.join(', ') : 'nenhuma'}` +
        (processadas.length ? ` | movimentação monitorada: ${despachosCasados} (${alertas} com alerta)` : ''),
    );
  } catch (e) {
    await prisma.logExecucao.update({
      where: { id: log.id },
      data: {
        status: 'erro',
        mensagem: (e as Error).message,
        detalhes: { processadas },
        finalizadoEm: new Date(),
      },
    });
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[rpi] ERRO:', e);
  process.exit(1);
});
