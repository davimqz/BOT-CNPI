import 'dotenv/config';
import { prisma } from '@/lib/db';
import { listarPrazos } from '@/lib/prazos-consulta';
import { gerarResumoPrazos } from '@/lib/relatorio/resumo-prazos';
import { carregarConfigEmail, descreverConfig, destinatarioPadrao, enviarEmail } from '@/lib/email';
import { canalEmailLiberado } from '@/lib/configuracao-alertas';

/**
 * "Resumo por e-mail" dos prazos pendentes (Fase 5).
 *
 *   npm run resumo:prazos                → janela padrão de 30 dias, envia
 *   npm run resumo:prazos -- --dias=60   → outra janela
 *   npm run resumo:prazos -- --dry-run   → imprime o texto, não envia
 *
 * A janela existe para o e-mail ser acionável: mandar toda semana um prazo de
 * prorrogação que vence daqui a 9 anos treina o usuário a ignorar o aviso. Os
 * já vencidos entram sempre, independentemente da janela.
 */

const JANELA_PADRAO = 30;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida.');
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const janelaDias = Number(args.find((a) => a.startsWith('--dias='))?.split('=')[1]) || JANELA_PADRAO;

  // Duas consultas em vez de um OR: "vencido" e "vence em N dias" são recortes
  // diferentes, e o vencido não pode ser filtrado pela janela futura.
  const [pendentes, vencidos] = await Promise.all([
    listarPrazos({ status: 'pendente', dentroDeDias: janelaDias }),
    listarPrazos({ status: 'vencido' }),
  ]);
  const prazos = [...vencidos, ...pendentes].sort(
    (a, b) => a.dataLimite.getTime() - b.dataLimite.getTime(),
  );

  const resumo = gerarResumoPrazos({ prazos, geradoEm: new Date(), janelaDias });
  console.log(`[prazos] ${prazos.length} prazo(s) no resumo (${vencidos.length} vencido(s)).`);

  if (dryRun) {
    console.log('\n--- assunto ---\n' + resumo.assunto);
    console.log('\n--- texto ---\n' + resumo.texto);
    return;
  }

  // Nada a dizer não é motivo para e-mail: caixa de entrada com aviso vazio
  // semanal é a forma mais rápida de o usuário criar uma regra de arquivamento.
  if (prazos.length === 0) {
    console.log('[prazos] nenhum prazo na janela — resumo não enviado.');
    return;
  }

  // O interruptor da tela é do canal inteiro, não só do alerta de movimentação:
  // "desliguei o e-mail" e continuar recebendo o resumo semanal seria o tipo de
  // surpresa que faz o usuário criar uma regra de arquivamento — e a partir daí
  // ele não lê mais nem o alerta que importa.
  if (!(await canalEmailLiberado())) {
    console.warn('[prazos] canal de e-mail desligado nas Configurações de Alertas — resumo não enviado.');
    return;
  }

  const config = await carregarConfigEmail();
  if (!config) {
    console.warn(
      '[prazos] envio de e-mail não configurado (RESEND_API_KEY + EMAIL_REMETENTE, ou SMTP) — ' +
        'resumo gerado mas não enviado.',
    );
    return;
  }
  const para = await destinatarioPadrao();
  if (!para) {
    console.warn('[prazos] nenhum destinatário (RESUMO_PRAZOS_PARA ou usuário cadastrado).');
    return;
  }

  await enviarEmail({ para, assunto: resumo.assunto, html: resumo.html, texto: resumo.texto }, config);
  console.log(`[prazos] resumo enviado para ${para} via ${descreverConfig(config)}.`);
}

main()
  .catch((e) => {
    console.error('[prazos] falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
