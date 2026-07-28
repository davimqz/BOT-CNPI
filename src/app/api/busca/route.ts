import { NextResponse } from 'next/server';
import { interpretarTermoTitular } from '@/lib/busca-titular';
import { prisma } from '@/lib/db';
import { dispararWorkflow } from '@/lib/github';

// Cria o job de busca ao vivo no pePI e dispara o workflow pepi-search.yml.
// O frontend recebe o jobId e faz polling em GET /api/busca/[jobId].
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    termo?: string;
    tipoBusca?: string;
    classeNcl?: string;
  };

  const termo = body.termo?.trim();
  if (!termo || termo.length < 2) {
    return NextResponse.json({ erro: 'Informe um termo com pelo menos 2 caracteres' }, { status: 400 });
  }
  if (
    body.tipoBusca !== 'radical' &&
    body.tipoBusca !== 'exata' &&
    body.tipoBusca !== 'processo' &&
    body.tipoBusca !== 'titular'
  ) {
    return NextResponse.json(
      { erro: 'tipoBusca deve ser "radical", "exata", "processo" ou "titular"' },
      { status: 400 },
    );
  }
  if (body.tipoBusca === 'processo' && !/^\d{6,12}$/.test(termo)) {
    return NextResponse.json(
      { erro: 'Para busca por processo, informe apenas os dígitos do número (6 a 12)' },
      { status: 400 },
    );
  }
  if (body.tipoBusca === 'titular') {
    const alvo = interpretarTermoTitular(termo);
    if ('erro' in alvo) return NextResponse.json({ erro: alvo.erro }, { status: 400 });
  }
  // Classe NCL só se aplica à busca por nome de marca — os formulários de nº de
  // processo e de titular não têm esse filtro.
  const classeNcl =
    body.tipoBusca === 'processo' || body.tipoBusca === 'titular'
      ? null
      : body.classeNcl?.trim() || null;
  if (classeNcl && !/^\d{1,2}$/.test(classeNcl)) {
    return NextResponse.json({ erro: 'Classe NCL deve ser um número de 1 a 45' }, { status: 400 });
  }

  const job = await prisma.pepiSearchJob.create({
    data: { termo, tipoBusca: body.tipoBusca, classeNcl },
  });

  try {
    await dispararWorkflow('pepi-search.yml', {
      job_id: job.id,
      termo,
      tipo_busca: body.tipoBusca,
    });
  } catch (e) {
    await prisma.pepiSearchJob.update({
      where: { id: job.id },
      data: { status: 'erro', erro: (e as Error).message, finalizadoEm: new Date() },
    });
    return NextResponse.json(
      { erro: 'Não foi possível disparar a busca no GitHub Actions', detalhe: (e as Error).message },
      { status: 502 },
    );
  }

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
