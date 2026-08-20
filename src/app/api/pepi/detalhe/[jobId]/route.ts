import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Status de um job de detalhe de processo — consumido pelo polling da tela.
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await prisma.pepiDetalheJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ erro: 'Job não encontrado' }, { status: 404 });
  }
  return NextResponse.json({
    jobId: job.id,
    codPedido: job.codPedido,
    processo: job.processo,
    status: job.status,
    etapa: job.etapa,
    resultado: job.resultado,
    erro: job.erro,
    criadoEm: job.criadoEm,
    finalizadoEm: job.finalizadoEm,
  });
}
