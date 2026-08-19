import 'dotenv/config';
import { prisma } from '@/lib/db';

/**
 * Rede de segurança do job de detalhe de processo (mesmo motivo de
 * marcar-falha.ts para a busca): tudo que quebra ANTES de detalhe.ts rodar
 * (npm ci, download do navegador, timeout do runner) deixava o job em
 * `pendente` para sempre — e o polling da tela ficaria "consultando o
 * INPI…" eternamente. Chamado pelo passo `if: failure() || cancelled()` de
 * pepi-detalhe.yml.
 */
async function main() {
  const jobId = process.env.JOB_ID;
  if (!jobId) {
    console.warn('[falha-detalhe] JOB_ID não informado — nada a marcar.');
    return;
  }

  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const erro =
    'A consulta ao INPI não pôde ser concluída. O site do pePI pode estar fora do ar ' +
    'ou ter mudado de estrutura. Tente novamente em alguns minutos.' +
    (runUrl ? ` Detalhes técnicos: ${runUrl}` : '');

  const r = await prisma.pepiDetalheJob.updateMany({
    where: { id: jobId, status: { in: ['pendente', 'executando'] } },
    data: { status: 'erro', etapa: 'erro', erro, finalizadoEm: new Date() },
  });

  console.log(
    r.count > 0
      ? `[falha-detalhe] job ${jobId} marcado como erro.`
      : `[falha-detalhe] job ${jobId} já estava finalizado — mantido como está.`,
  );
}

main()
  .catch((e) => {
    console.error('[falha-detalhe] não consegui marcar o job:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
