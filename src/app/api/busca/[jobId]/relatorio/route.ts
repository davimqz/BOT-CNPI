import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { gerarRelatorioConsultorMarca, type ItemRelatorio } from '@/lib/relatorio/consultor-marca';

// Relatório "Consultor de Marca" em HTML de um job de busca concluído.
// Com ?formato=pdf, o mesmo documento abre já com o diálogo de impressão do
// navegador (salvar como PDF) — template único (skill branded-report-builder),
// nunca uma segunda versão; Playwright no Vercel é proibido (CLAUDE.md Seção 5).
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await prisma.pepiSearchJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ erro: 'Job não encontrado' }, { status: 404 });
  }
  if (job.status !== 'sucesso' || !job.resultado) {
    return NextResponse.json(
      { erro: `A busca ainda não terminou com sucesso (status: ${job.status})` },
      { status: 409 },
    );
  }

  const formato = new URL(request.url).searchParams.get('formato');
  const resultado = job.resultado as unknown as { truncado?: boolean; itens: ItemRelatorio[] };
  const html = gerarRelatorioConsultorMarca(
    {
      termo: job.termo,
      tipoBusca: job.tipoBusca,
      classeNcl: job.classeNcl,
      consultadoEm: job.finalizadoEm ?? job.criadoEm,
      itens: resultado.itens ?? [],
      truncado: resultado.truncado,
    },
    undefined,
    { autoImprimir: formato === 'pdf' },
  );

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
