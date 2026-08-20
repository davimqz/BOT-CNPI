import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { dispararWorkflow } from '@/lib/github';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Cria o job de detalhe de processo (clique num processo do resultado da busca)
// e dispara o workflow pepi-detalhe.yml. O frontend recebe o jobId e faz
// polling em GET /api/pepi/detalhe/[jobId].
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    codPedido?: string;
    processo?: string;
  };

  const codPedido = body.codPedido?.trim();
  const processo = body.processo?.trim();
  if (!codPedido || !/^\d+$/.test(codPedido)) {
    return NextResponse.json({ erro: 'codPedido inválido' }, { status: 400 });
  }
  if (!processo || !/^\d{6,12}$/.test(processo)) {
    return NextResponse.json({ erro: 'processo deve ter apenas dígitos (6 a 12)' }, { status: 400 });
  }

  // Reaproveita um job recente bem-sucedido do mesmo processo em vez de
  // martelar o pePI de novo a cada clique (rate limit — ver skill pepi-scraping-playbook).
  const recente = await prisma.pepiDetalheJob.findFirst({
    where: {
      codPedido,
      status: 'sucesso',
      finalizadoEm: { gte: new Date(Date.now() - UM_DIA_MS) },
    },
    orderBy: { finalizadoEm: 'desc' },
  });
  if (recente) {
    return NextResponse.json({ jobId: recente.id }, { status: 200 });
  }

  const job = await prisma.pepiDetalheJob.create({ data: { codPedido, processo } });

  try {
    await dispararWorkflow('pepi-detalhe.yml', {
      job_id: job.id,
      cod_pedido: codPedido,
      processo,
    });
  } catch (e) {
    await prisma.pepiDetalheJob.update({
      where: { id: job.id },
      data: { status: 'erro', erro: (e as Error).message, finalizadoEm: new Date() },
    });
    return NextResponse.json(
      { erro: 'Não foi possível disparar a consulta no GitHub Actions', detalhe: (e as Error).message },
      { status: 502 },
    );
  }

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
