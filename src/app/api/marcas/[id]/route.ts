import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validarMarca } from '@/lib/marcas';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const v = validarMarca(body, { parcial: true });
  if ('erro' in v) return NextResponse.json({ erro: v.erro }, { status: 400 });
  if (Object.keys(v.dados).length === 0) {
    return NextResponse.json({ erro: 'Nenhum campo para atualizar' }, { status: 400 });
  }

  if (v.dados.clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: v.dados.clienteId } });
    if (!cliente) return NextResponse.json({ erro: 'Cliente vinculado não existe' }, { status: 400 });
  }

  try {
    const marca = await prisma.marcaMonitorada.update({
      where: { id },
      data: v.dados,
      include: { cliente: { select: { id: true, nome: true } } },
    });
    return NextResponse.json({ marca });
  } catch {
    return NextResponse.json({ erro: 'Marca não encontrada' }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;

  // Marca com despachos capturados tem histórico que se perderia no delete —
  // nesse caso o caminho é desativar (ativa = false), não excluir.
  const despachos = await prisma.despacho.count({ where: { marcaId: id } });
  if (despachos > 0) {
    return NextResponse.json(
      {
        erro: `Esta marca tem ${despachos} despacho(s) vinculado(s). Desative-a em vez de excluir, para não perder o histórico.`,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.marcaMonitorada.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ erro: 'Marca não encontrada' }, { status: 404 });
  }
}
