import 'dotenv/config';
import { prisma } from '@/lib/db';
import {
  carregarConfigEmail,
  descreverConfig,
  destinatarioPadrao,
  enviarEmail,
} from '@/lib/email';

/**
 * "Enviar e-mail de teste" (Fase 6) em linha de comando.
 *
 *   npm run email:teste                    → manda para o destinatário padrão
 *   npm run email:teste -- voce@dominio    → manda para um endereço específico
 *
 * Existe para separar dois problemas que, quando aparecem juntos, são difíceis
 * de distinguir: "a configuração de envio está errada" e "nenhum prazo entrou no
 * resumo". Aqui, se chegou, o canal está de pé.
 */
async function main() {
  const config = await carregarConfigEmail();
  if (!config) {
    throw new Error(
      'Nenhum provedor configurado. Defina RESEND_API_KEY + EMAIL_REMETENTE (recomendado) ' +
        'ou as variáveis SMTP_* — ver .env.example.',
    );
  }

  const para = process.argv.slice(2).find((a) => a.includes('@')) ?? (await destinatarioPadrao());
  if (!para) {
    throw new Error(
      'Nenhum destinatário. Passe um e-mail como argumento, defina RESUMO_PRAZOS_PARA, ' +
        'ou cadastre o usuário.',
    );
  }

  console.log(`[email] enviando teste para ${para} via ${descreverConfig(config)}...`);
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  await enviarEmail(
    {
      para,
      assunto: 'Monitor de Marcas — e-mail de teste',
      html:
        '<p>Se você está lendo isto, o canal de e-mail do Monitor de Marcas está funcionando.</p>' +
        `<p style="color:#6b7280;font-size:12px">Enviado em ${agora} via ${descreverConfig(config)}.</p>`,
      texto:
        'Se você está lendo isto, o canal de e-mail do Monitor de Marcas está funcionando.\n' +
        `Enviado em ${agora} via ${descreverConfig(config)}.`,
    },
    config,
  );
  console.log('[email] enviado. Confira a caixa de entrada E a pasta de spam.');
  // Cair em spam é falha real neste sistema: alerta de prazo que o usuário não vê
  // equivale a alerta não enviado.
}

main()
  .catch((e) => {
    console.error('[email] falhou:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
