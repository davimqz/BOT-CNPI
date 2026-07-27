import 'dotenv/config';
import { prisma } from '@/lib/db';
import { baixarEdicao } from './download';
import { parseRevista } from './parse';

// Fluxo da skill rpi-ingestion-despachos:
// 1. edição alvo = última processada + 1 (estimativa por incremento);
// 2. confirmação por tentativa de download (302/404 = ainda não publicada, estado normal);
// 3. loop de catch-up: se uma semana falhou, a próxima rodada processa as edições atrasadas.

const LOTE_INSERT = 1000;

async function determinarProximaEdicao(): Promise<number> {
  const ultima = await prisma.edicaoRpi.aggregate({ _max: { numero: true } });
  if (ultima._max.numero) return ultima._max.numero + 1;

  const semente = Number(process.env.RPI_EDICAO_INICIAL ?? process.argv[2]);
  if (!Number.isInteger(semente) || semente <= 0) {
    throw new Error(
      'Banco sem edições e nenhuma semente informada. Use: npm run ingest:rpi -- <numero> ' +
        'ou defina RPI_EDICAO_INICIAL.',
    );
  }
  return semente;
}

async function ingerirEdicao(numero: number): Promise<'ok' | 'nao-publicada'> {
  const resultado = await baixarEdicao(numero);
  if (resultado.status === 'nao-publicada') {
    console.log(`[rpi] edição ${numero} ainda não publicada — nada a fazer.`);
    return 'nao-publicada';
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
  await prisma.$transaction(
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
    },
    { timeout: 300_000 },
  );

  return 'ok';
}

async function main() {
  const log = await prisma.logExecucao.create({
    data: { tipo: 'ingest_rpi', status: 'executando' },
  });
  const processadas: number[] = [];

  try {
    let alvo = await determinarProximaEdicao();
    // Catch-up limitado para nunca entrar em loop infinito por erro de lógica.
    for (let i = 0; i < 10; i++, alvo++) {
      const r = await ingerirEdicao(alvo);
      if (r === 'nao-publicada') break;
      processadas.push(alvo);
    }

    await prisma.logExecucao.update({
      where: { id: log.id },
      data: {
        status: 'sucesso',
        mensagem: processadas.length
          ? `Edições processadas: ${processadas.join(', ')}`
          : 'Nenhuma edição nova publicada',
        detalhes: { processadas },
        finalizadoEm: new Date(),
      },
    });
    console.log(`[rpi] concluído. Edições novas: ${processadas.length ? processadas.join(', ') : 'nenhuma'}`);
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
