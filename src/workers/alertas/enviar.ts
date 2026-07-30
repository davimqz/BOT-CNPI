import 'dotenv/config';
import { prisma } from '@/lib/db';
import { agruparAlertas, type DespachoPendente, type GrupoAlerta } from '@/lib/alertas';
import { gerarAlertaDespacho } from '@/lib/relatorio/alerta-despacho';
import { DEFINICOES_PRAZO, type TipoPrazo } from '@/lib/prazos';
import { carregarConfigEmail, descreverConfig, enviarEmail } from '@/lib/email';
import { canalEmailLiberado } from '@/lib/configuracao-alertas';

/**
 * Envio dos alertas de movimentação (Fase 6).
 *
 *   npm run alertas:enviar              → esvazia a fila
 *   npm run alertas:enviar -- --dry-run → imprime os e-mails, não envia, não zera nada
 *
 * A fila é `despachos.alerta_pendente`, preenchida pelo cruzamento das Fases 3/4
 * (ingest:rpi e monitor:pepi). Rodar este worker duas vezes seguidas não manda o
 * mesmo alerta duas vezes: a flag só é zerada depois do envio dar certo.
 *
 * O contrário também vale, e é deliberado: **falha de envio mantém o despacho na
 * fila**. Um alerta perdido é um prazo perdido, então a rodada seguinte tenta de
 * novo em vez de seguir em frente. Por isso também cada marca é enviada e
 * confirmada isoladamente — uma marca com destinatário inválido não pode
 * derrubar o alerta das outras.
 */

const INCLUDE = {
  marca: {
    select: {
      id: true,
      nome: true,
      processo: true,
      classeNcl: true,
      cliente: { select: { email: true } },
      usuario: { select: { email: true } },
    },
  },
  edicaoRpi: { select: { numero: true } },
  prazos: {
    where: { status: { not: 'cumprido' as const } },
    select: { tipo: true, dataLimite: true },
  },
} as const;

async function carregarFila(): Promise<DespachoPendente[]> {
  const linhas = await prisma.despacho.findMany({
    where: { alertaPendente: true, marcaId: { not: null } },
    include: INCLUDE,
    // Mais recente primeiro dentro de cada marca — o template reordena, mas o
    // teto de exibição precisa cortar as antigas, não as novas.
    orderBy: { dataPublicacao: 'desc' },
  });

  return linhas.map((d) => ({
    id: d.id,
    processo: d.processo,
    nomeMarca: d.nomeMarca,
    titular: d.titular,
    classeNcl: d.classeNcl,
    codigo: d.codigo,
    textoDespacho: d.textoDespacho,
    textoComplementar: d.textoComplementar,
    dataPublicacao: d.dataPublicacao,
    edicaoRpi: d.edicaoRpi?.numero ?? null,
    prazos: d.prazos.map((p) => {
      const def = DEFINICOES_PRAZO[p.tipo as TipoPrazo];
      return {
        rotulo: def?.rotulo ?? p.tipo,
        dataLimite: p.dataLimite,
        fundamento: def?.fundamento ?? '—',
        consequencia: def?.consequencia,
      };
    }),
    marca: {
      id: d.marca!.id,
      nome: d.marca!.nome,
      processo: d.marca!.processo,
      classeNcl: d.marca!.classeNcl,
      // O cliente vinculado é quem tem interesse na marca; sem cliente
      // (uso pessoal, que é o caso desta versão) vai para o dono da conta.
      destinatario: d.marca!.cliente?.email ?? d.marca!.usuario.email ?? null,
    },
  }));
}

function descreverGrupo(g: GrupoAlerta): string {
  return `${g.colidencia ? 'colidência' : 'movimentação'} de "${g.marca.nome}" (${g.despachos.length} despacho(s))`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida.');
  }
  const dryRun = process.argv.slice(2).includes('--dry-run');

  // Despacho marcado sem marca vinculada não deveria existir (a flag é setada no
  // mesmo update que grava a marca). Se aparecer, é bug do cruzamento: acusa no
  // log em vez de limpar a flag em silêncio.
  const orfaos = await prisma.despacho.count({
    where: { alertaPendente: true, marcaId: null },
  });
  if (orfaos > 0) {
    console.warn(
      `[alertas] ${orfaos} despacho(s) com alerta pendente e sem marca vinculada — ignorados ` +
        '(investigar: a flag só deveria ser marcada junto do vínculo).',
    );
  }

  const fila = await carregarFila();
  if (fila.length === 0) {
    console.log('[alertas] fila vazia — nada a enviar.');
    return;
  }

  const grupos = agruparAlertas(fila);
  console.log(`[alertas] ${fila.length} despacho(s) pendente(s) em ${grupos.length} e-mail(s).`);

  const geradoEm = new Date();
  const montar = (g: GrupoAlerta) =>
    gerarAlertaDespacho({
      marca: g.marca,
      despachos: g.despachos,
      colidencia: g.colidencia,
      geradoEm,
      // O corte de exibição (TETO_LISTA) é do próprio template — não contar aqui
      // de novo, senão o aviso de "não couberam" dobraria o número.
    });

  if (dryRun) {
    for (const g of grupos) {
      const email = montar(g);
      console.log(`\n=== ${descreverGrupo(g)} → ${g.marca.destinatario ?? '(sem destinatário)'} ===`);
      console.log(`--- assunto ---\n${email.assunto}`);
      console.log(`--- texto ---\n${email.texto}`);
    }
    return;
  }

  // Canal desligado na tela de Configurações de Alertas: mesma conduta de
  // "sem credencial" — a fila FICA cheia. Desligar um canal é escolher não
  // receber agora, não autorizar o descarte de aviso de prazo; e o pop-up
  // continua mostrando tudo, porque não lê esta fila (src/lib/novidades.ts).
  if (!(await canalEmailLiberado())) {
    console.warn(
      `[alertas] canal de e-mail desligado nas Configurações de Alertas — ${fila.length} ` +
        'alerta(s) mantidos na fila (visíveis no aviso da tela).',
    );
    return;
  }

  const config = await carregarConfigEmail();
  if (!config) {
    // Sem canal configurado a fila FICA cheia: quando a chave for cadastrada, o
    // usuário recebe o que perdeu. Zerar aqui seria descartar alerta em silêncio.
    console.warn(
      '[alertas] envio não configurado (RESEND_API_KEY + EMAIL_REMETENTE, ou SMTP) — ' +
        `${fila.length} alerta(s) mantidos na fila para a próxima rodada.`,
    );
    return;
  }

  let enviados = 0;
  let falhas = 0;
  for (const grupo of grupos) {
    const para = grupo.marca.destinatario;
    if (!para) {
      console.error(`[alertas] sem destinatário para ${descreverGrupo(grupo)} — mantido na fila.`);
      falhas++;
      continue;
    }

    const email = montar(grupo);
    try {
      await enviarEmail({ para, assunto: email.assunto, html: email.html, texto: email.texto }, config);
      await prisma.despacho.updateMany({
        where: { id: { in: grupo.ids } },
        data: { alertaPendente: false },
      });
      enviados++;
      console.log(`[alertas] ${descreverGrupo(grupo)} enviado para ${para}.`);
    } catch (e) {
      falhas++;
      console.error(`[alertas] falhou o envio de ${descreverGrupo(grupo)} para ${para}:`, e);
    }
  }

  console.log(
    `[alertas] ${enviados} e-mail(s) enviado(s) via ${descreverConfig(config)}` +
      (falhas ? `; ${falhas} falha(s) mantida(s) na fila.` : '.'),
  );
  // Alerta não entregue é o modo de falha que este sistema existe para evitar —
  // o workflow precisa ficar vermelho para alguém olhar.
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('[alertas] falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
