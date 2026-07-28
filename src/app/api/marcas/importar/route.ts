import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUsuarioUnico } from '@/lib/usuario';
import { parsearImportacao } from '@/lib/importacao-lote';

// Importação em lote (Fase 3): recebe o texto colado/carregado na tela e cria
// as marcas válidas de uma vez. Linhas inválidas voltam como `erros` para o
// usuário corrigir — a importação é parcial de propósito, não tudo-ou-nada,
// para um arquivo grande não travar por causa de uma linha torta.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const texto = typeof body.texto === 'string' ? body.texto : '';
  if (!texto.trim()) {
    return NextResponse.json({ erro: 'Cole ou envie o conteúdo a importar' }, { status: 400 });
  }
  // ~10k linhas de folga; acima disso é quase certo ser um arquivo errado.
  if (texto.length > 1_000_000) {
    return NextResponse.json({ erro: 'Conteúdo grande demais (máx. 1MB)' }, { status: 400 });
  }

  const { marcas, erros } = parsearImportacao(texto);
  if (marcas.length === 0) {
    return NextResponse.json(
      { erro: 'Nenhuma linha válida encontrada', erros },
      { status: 400 },
    );
  }

  const existentes = await prisma.marcaMonitorada.findMany({
    where: { processo: { in: marcas.map((m) => m.processo) } },
    select: { processo: true },
  });
  const jaMonitorados = new Set(existentes.map((e) => e.processo));
  const novas = marcas.filter((m) => !jaMonitorados.has(m.processo));

  const usuario = await getUsuarioUnico();
  if (novas.length > 0) {
    await prisma.marcaMonitorada.createMany({
      data: novas.map((m) => ({
        usuarioId: usuario.id,
        // Sem nome no arquivo, só dá para acompanhar pelo nº — nome-placeholder
        // editável depois, e tipoBusca "processo" em vez de radical/exata.
        nome: m.nome ?? `Processo ${m.processo}`,
        processo: m.processo,
        classeNcl: m.classeNcl,
        tipoBusca: m.nome ? ('radical' as const) : ('processo' as const),
        // fonteDados rpi e eventosAlerta [] (= todos) vêm do default do schema.
      })),
    });
  }

  return NextResponse.json(
    {
      importadas: novas.length,
      jaMonitoradas: marcas.length - novas.length,
      erros,
    },
    { status: 201 },
  );
}
