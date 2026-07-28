import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listarPrazos, type FiltroStatus } from '@/lib/prazos-consulta';

const STATUS_VALIDOS: FiltroStatus[] = ['pendente', 'vencido', 'cumprido', 'todos'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'pendente';
  if (!STATUS_VALIDOS.includes(status as FiltroStatus)) {
    return NextResponse.json({ erro: 'status inválido' }, { status: 400 });
  }
  const prazos = await listarPrazos({
    status: status as FiltroStatus,
    marcaId: url.searchParams.get('marcaId') ?? undefined,
  });
  return NextResponse.json({ prazos });
}

/**
 * "Limpar selecionado" da tela de prazos: marca como tratado/não relevante.
 *
 * `cumprido` é o único estado que o usuário grava à mão — pendente e vencido saem
 * da data (ver statusEfetivo). Por isso a rota só alterna entre cumprido e
 * pendente, e "desfazer" devolve o prazo ao ciclo automático.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    ids?: unknown;
    cumprido?: unknown;
  };
  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === 'string') : [];
  if (ids.length === 0) {
    return NextResponse.json({ erro: 'Nenhum prazo selecionado' }, { status: 400 });
  }
  const cumprido = body.cumprido !== false;

  const r = await prisma.prazo.updateMany({
    where: { id: { in: ids } },
    data: { status: cumprido ? 'cumprido' : 'pendente' },
  });
  return NextResponse.json({ atualizados: r.count });
}
