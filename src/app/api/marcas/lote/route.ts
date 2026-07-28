import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUsuarioUnico } from '@/lib/usuario';
import { validarItensLote } from '@/lib/monitor-lote';

// Ação em lote sobre processos encontrados na busca por titular (Fase 3).
// GET diz quais processos já estão no monitor (para a tela marcar as linhas);
// POST adiciona ou remove os selecionados de uma vez.

export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get('processos') ?? '';
  const processos = param
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^\d{6,12}$/.test(p));
  if (processos.length === 0) return NextResponse.json({ monitoradas: [] });

  const monitoradas = await prisma.marcaMonitorada.findMany({
    where: { processo: { in: processos } },
    select: { processo: true, ativa: true },
  });
  return NextResponse.json({ monitoradas });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.acao !== 'adicionar' && body.acao !== 'remover') {
    return NextResponse.json({ erro: 'acao deve ser "adicionar" ou "remover"' }, { status: 400 });
  }
  const v = validarItensLote(body.itens);
  if ('erro' in v) return NextResponse.json({ erro: v.erro }, { status: 400 });

  const existentes = await prisma.marcaMonitorada.findMany({
    where: { processo: { in: v.itens.map((i) => i.processo) } },
    select: { id: true, processo: true, _count: { select: { despachos: true } } },
  });

  if (body.acao === 'adicionar') {
    const jaMonitorados = new Set(existentes.map((e) => e.processo));
    const novas = v.itens.filter((i) => !jaMonitorados.has(i.processo));
    if (novas.length > 0) {
      const usuario = await getUsuarioUnico();
      await prisma.marcaMonitorada.createMany({
        data: novas.map((i) => ({
          usuarioId: usuario.id,
          // Mesma convenção da importação em lote: sem nome de marca no
          // resultado (marca figurativa), nome-placeholder e busca pelo nº.
          nome: i.nome ?? `Processo ${i.processo}`,
          processo: i.processo,
          classeNcl: i.classeNcl,
          tipoBusca: i.nome ? ('radical' as const) : ('processo' as const),
        })),
      });
    }
    return NextResponse.json(
      { adicionadas: novas.length, jaMonitoradas: jaMonitorados.size },
      { status: 201 },
    );
  }

  // Remover segue o mesmo critério do DELETE individual (/api/marcas/[id]):
  // marca com despacho vinculado é desativada para preservar o histórico;
  // sem despacho, excluída de verdade.
  const excluir = existentes.filter((e) => e._count.despachos === 0).map((e) => e.id);
  const desativar = existentes.filter((e) => e._count.despachos > 0).map((e) => e.id);
  await prisma.$transaction([
    prisma.marcaMonitorada.deleteMany({ where: { id: { in: excluir } } }),
    prisma.marcaMonitorada.updateMany({ where: { id: { in: desativar } }, data: { ativa: false } }),
  ]);
  return NextResponse.json({
    removidas: excluir.length,
    desativadas: desativar.length,
    naoMonitoradas: v.itens.length - new Set(existentes.map((e) => e.processo)).size,
  });
}
