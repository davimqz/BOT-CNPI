import 'dotenv/config';
import { prisma } from '@/lib/db';
import type { Cruzamento, DespachoParaCruzamento } from '@/lib/verificacao';
import { cruzarDespachos, motivoDoVinculo } from '@/lib/verificacao';
import { prazosDoDespacho, statusPorData } from '@/lib/prazos';
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

async function determinarProximaEdicao(): Promise<number> {
  const ultima = await prisma.edicaoRpi.aggregate({ _max: { numero: true } });
  if (ultima._max.numero) return ultima._max.numero + 1;

  const argumentoSemente = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const semente = Number(process.env.RPI_EDICAO_INICIAL ?? argumentoSemente);
  if (!Number.isInteger(semente) || semente <= 0) {
    throw new Error(
      'Banco sem edições e nenhuma semente informada. Use: npm run ingest:rpi -- <numero> ' +
        'ou defina RPI_EDICAO_INICIAL.',
    );
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
  const marcas = await prisma.marcaMonitorada.findMany({
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
  if (marcas.length === 0) {
    console.log('[rpi] nenhuma marca monitorada de fonte rpi — nada a cruzar.');
    return { marcasMonitoradas: 0, despachosCasados: 0, alertas: 0, colidencias: 0, prazos: 0 };
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

async function ingerirEdicao(
  numero: number,
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

  // Idempotência: transação apaga e regrava a edição se ela já existir parcialmente.
  const edicaoId = await prisma.$transaction(
    async (tx) => {
      const existente = await tx.edicaoRpi.findUnique({ where: { numero } });
      if (existente) {
        await tx.despacho.deleteMany({ where: { edicaoRpiId: existente.id } });
        await tx.edicaoRpi.delete({ where: { id: existente.id } });
        console.log(`[rpi] edição ${numero} já existia — regravando do zero.`);
      }

      const edicao = await tx.edicaoRpi.create({
        data: { numero, dataPublicacao: revista.dataPublicacao },
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
    select: { id: true, numero: true, dataPublicacao: true },
  });
  if (edicoes.length === 0) {
    console.log('[rpi] nenhuma edição ingerida ainda — nada a recruzar.');
    return;
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

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definida. No GitHub Actions, confira se o Repository secret ' +
        'DATABASE_URL existe (Settings → Secrets and variables → Actions → aba Secrets).',
    );
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
