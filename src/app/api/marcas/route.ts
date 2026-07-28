import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUsuarioUnico } from '@/lib/usuario';
import { validarMarca } from '@/lib/marcas';

// Lista as marcas monitoradas + clientes disponíveis para vínculo (Fase 3).
export async function GET() {
  const [marcas, clientes] = await Promise.all([
    prisma.marcaMonitorada.findMany({
      include: { cliente: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: 'desc' },
    }),
    prisma.cliente.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ]);
  return NextResponse.json({ marcas, clientes });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const v = validarMarca(body, { parcial: false });
  if ('erro' in v) return NextResponse.json({ erro: v.erro }, { status: 400 });

  if (v.dados.clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: v.dados.clienteId } });
    if (!cliente) return NextResponse.json({ erro: 'Cliente vinculado não existe' }, { status: 400 });
  }

  const usuario = await getUsuarioUnico();
  const marca = await prisma.marcaMonitorada.create({
    data: { ...v.dados, nome: v.dados.nome!, usuarioId: usuario.id },
    include: { cliente: { select: { id: true, nome: true } } },
  });
  return NextResponse.json({ marca }, { status: 201 });
}
