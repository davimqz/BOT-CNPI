import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUsuarioUnico } from '@/lib/usuario';
import { validarMarca } from '@/lib/marcas';

// Códigos IPAS de "publicação de pedido" (roadmap-marca.ts, fase "pedido em
// andamento") — é o despacho que carrega a data de prioridade exibida na
// listagem. IPAS756 é o mesmo evento para designação (Protocolo de Madri).
const CODIGOS_PUBLICACAO_PEDIDO = ['IPAS009', 'IPAS756'];

// Lista as marcas monitoradas + clientes disponíveis para vínculo (Fase 3).
export async function GET() {
  const [marcasBrutas, clientes] = await Promise.all([
    prisma.marcaMonitorada.findMany({
      include: {
        cliente: { select: { id: true, nome: true } },
        despachos: {
          select: { codigo: true, dataPublicacao: true, edicaoRpi: { select: { numero: true } } },
          orderBy: { dataPublicacao: 'asc' },
        },
      },
      orderBy: { criadoEm: 'desc' },
    }),
    prisma.cliente.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ]);

  // "Prioridade" e "RPI Atual" das colunas da listagem são derivadas dos
  // despachos, não persistidas — CLAUDE.md Seção 4 não tem coluna própria
  // para isso em marcas_monitoradas.
  const marcas = marcasBrutas.map(({ despachos, ...marca }) => {
    const publicacaoPedido = despachos.find((d) => CODIGOS_PUBLICACAO_PEDIDO.includes(d.codigo));
    const rpiAtual = despachos.reduce<number | null>((maior, d) => {
      const numero = d.edicaoRpi?.numero;
      return numero != null && (maior === null || numero > maior) ? numero : maior;
    }, null);
    return { ...marca, prioridade: publicacaoPedido?.dataPublicacao ?? null, rpiAtual };
  });

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
