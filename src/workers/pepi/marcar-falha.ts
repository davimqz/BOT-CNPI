import 'dotenv/config';
import { prisma } from '@/lib/db';

/**
 * Rede de segurança do job de busca ao vivo (Fase 2), chamada pelo
 * `pepi-search.yml` quando o workflow falha ou é cancelado.
 *
 * O `search:pepi` já marca `erro` quando ELE falha. O problema é tudo que pode
 * quebrar **antes** dele: o passo de sanidade (que não conhece o `JOB_ID`), o
 * `npm ci`, o download do navegador, o timeout do runner. Em qualquer um desses
 * casos o job ficava `pendente` para sempre — e o polling da tela mostra
 * "consultando o INPI…" eternamente, que é pior do que dizer "falhou": o
 * usuário fica esperando um resultado que não vem, sem motivo para desconfiar.
 *
 * Descoberto em 01/08/2026, testando o deploy: o pePI estava fora do ar, a
 * sanidade cumpriu o papel dela e falhou alto, e mesmo assim a tela teria
 * ficado girando indefinidamente.
 *
 * Não sobrescreve job já finalizado: se o `search:pepi` chegou a gravar
 * `sucesso` e algum passo posterior falhou, o resultado bom continua valendo.
 */
async function main() {
  const jobId = process.env.JOB_ID;
  if (!jobId) {
    // Sem job não há o que marcar — e não é motivo para falhar de novo um
    // workflow que já está falhando por outra razão.
    console.warn('[falha] JOB_ID não informado — nada a marcar.');
    return;
  }

  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  // Mensagem para o usuário final, não stack trace: o detalhe técnico está no
  // log do run, e o link leva até ele.
  const erro =
    'A consulta ao INPI não pôde ser concluída. O site do pePI pode estar fora do ar ' +
    'ou ter mudado de estrutura. Tente novamente em alguns minutos.' +
    (runUrl ? ` Detalhes técnicos: ${runUrl}` : '');

  const r = await prisma.pepiSearchJob.updateMany({
    where: { id: jobId, status: { in: ['pendente', 'executando'] } },
    data: { status: 'erro', etapa: 'erro', erro, finalizadoEm: new Date() },
  });

  console.log(
    r.count > 0
      ? `[falha] job ${jobId} marcado como erro.`
      : `[falha] job ${jobId} já estava finalizado — mantido como está.`,
  );
}

main()
  .catch((e) => {
    console.error('[falha] não consegui marcar o job:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
