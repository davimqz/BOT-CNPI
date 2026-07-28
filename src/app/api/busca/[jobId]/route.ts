import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Status de um job de busca — consumido pelo polling da tela de busca.
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await prisma.pepiSearchJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ erro: 'Job não encontrado' }, { status: 404 });
  }
  return NextResponse.json({
    jobId: job.id,
    termo: job.termo,
    tipoBusca: job.tipoBusca,
    classeNcl: job.classeNcl,
    status: job.status,
    etapa: job.etapa,
    resultado: job.resultado,
    erro: job.erro,
    criadoEm: job.criadoEm,
    finalizadoEm: job.finalizadoEm,
  });
}
