import 'dotenv/config';
import { prisma } from '@/lib/db';
import { cruzarDespachos } from '@/lib/verificacao';
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
async function cruzarComMonitoradas(edicaoId: string): Promise<ResumoCruzamento> {
  const marcas = await prisma.marcaMonitorada.findMany({
    where: { ativa: true, fonteDados: 'rpi' },
    // Ordem estável: em caso de empate, a marca cadastrada primeiro fica com o despacho.
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, processo: true, classeNcl: true, eventosAlerta: true },
  });
  if (marcas.length === 0) {
    console.log('[rpi] nenhuma marca monitorada de fonte rpi — nada a cruzar.');
    return { marcasMonitoradas: 0, despachosCasados: 0, alertas: 0 };
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
  const marcasComMovimentacao = new Set(cruzamentos.map((c) => c.marcaId)).size;
  console.log(
    `[rpi] verificação: ${cruzamentos.length} despacho(s) de ${marcasComMovimentacao} marca(s) ` +
      `monitorada(s); ${alertas} com alerta pendente.`,
  );
  return { marcasMonitoradas: marcas.length, despachosCasados: cruzamentos.length, alertas };
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
  return { status: 'ok', ...(await cruzarComMonitoradas(edicaoId)) };
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
    select: { id: true, numero: true },
  });
  if (edicoes.length === 0) {
    console.log('[rpi] nenhuma edição ingerida ainda — nada a recruzar.');
    return;
  }

  let casados = 0;
  let alertas = 0;
  for (const edicao of edicoes.reverse()) {
    console.log(`[rpi] recruzando edição ${edicao.numero}...`);
    const r = await cruzarComMonitoradas(edicao.id);
    casados += r.despachosCasados;
    alertas += r.alertas;
  }
  console.log(
    `[rpi] recruzamento concluído: ${casados} despacho(s) vinculado(s), ${alertas} com alerta pendente.`,
  );
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

  const log = await prisma.logExecucao.create({
    data: { tipo: 'ingest_rpi', status: 'executando' },
  });
  const processadas: number[] = [];
  let despachosCasados = 0;
  let alertas = 0;

  try {
    let alvo = await determinarProximaEdicao();
    // Catch-up limitado para nunca entrar em loop infinito por erro de lógica.
    for (let i = 0; i < 10; i++, alvo++) {
      const r = await ingerirEdicao(alvo);
      if (r.status === 'nao-publicada') break;
      processadas.push(alvo);
      despachosCasados += r.despachosCasados;
      alertas += r.alertas;
    }

    await prisma.logExecucao.update({
      where: { id: log.id },
      data: {
        status: 'sucesso',
        mensagem: processadas.length
          ? `Edições processadas: ${processadas.join(', ')} — ${despachosCasados} despacho(s) de marcas monitoradas, ${alertas} com alerta`
          : 'Nenhuma edição nova publicada',
        detalhes: { processadas, despachosCasados, alertas },
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
