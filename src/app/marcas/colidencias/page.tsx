import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

// Colidências (Fase 4): marca de TERCEIRO publicada na RPI parecida o
// bastante com uma marca monitorada de similaridade ativa. `motivoVinculo`
// vem persistido no cruzamento (src/lib/verificacao.ts / ingest.ts) desde
// 16/08/2026 — despacho vinculado antes disso só aparece aqui depois de
// `npm run ingest:rpi -- --recalcular-motivo`.
export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;

interface Params {
  marca?: string;
  scoreMinimo?: string;
  pagina?: string;
}

function fmtData(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default async function ColidenciasPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const scoreMinimo = Math.min(100, Math.max(0, Number(params.scoreMinimo) || 0));

  const marcasComSimilaridade = await prisma.marcaMonitorada.findMany({
    where: { similaridadeAtiva: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  });

  const where: Prisma.DespachoWhereInput = {
    motivoVinculo: 'similaridade',
    ...(params.marca ? { marcaId: params.marca } : {}),
    ...(scoreMinimo > 0 ? { similaridadeScore: { gte: scoreMinimo } } : {}),
  };

  const [total, despachos] = await Promise.all([
    prisma.despacho.count({ where }),
    prisma.despacho.findMany({
      where,
      include: {
        marca: { select: { id: true, nome: true } },
        edicaoRpi: { select: { numero: true } },
      },
      orderBy: [{ dataPublicacao: 'desc' }, { similaridadeScore: 'desc' }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const linkPagina = (p: number) => {
    const sp = new URLSearchParams();
    if (params.marca) sp.set('marca', params.marca);
    if (params.scoreMinimo) sp.set('scoreMinimo', params.scoreMinimo);
    sp.set('pagina', String(p));
    return `/marcas/colidencias?${sp.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Colidências</h1>
        <p className="mt-1 text-sm opacity-70">
          Marcas de terceiros publicadas na RPI parecidas com as suas — nome ou grafia próxima o
          bastante para disputar espaço na mesma classe. Não é movimentação do seu processo.
        </p>
      </header>

      {marcasComSimilaridade.length === 0 ? (
        <p className="rounded border border-black/10 p-4 text-sm opacity-70 dark:border-white/15">
          Nenhuma marca monitorada tem &quot;Marcas parecidas (colidência)&quot; ligada ainda. Ative
          essa opção ao{' '}
          <Link href="/marcas/cadastrar" className="underline">
            cadastrar
          </Link>{' '}
          ou editar uma marca em{' '}
          <Link href="/marcas" className="underline">
            Acompanhar Processo
          </Link>{' '}
          para começar a detectar.
        </p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
            <label className="block w-56">
              <span className="mb-1 block opacity-70">Marca monitorada</span>
              <select
                name="marca"
                defaultValue={params.marca ?? ''}
                className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
              >
                <option value="">Todas</option>
                {marcasComSimilaridade.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block w-40">
              <span className="mb-1 block opacity-70">Similaridade mínima</span>
              <input
                type="number"
                name="scoreMinimo"
                min={0}
                max={100}
                defaultValue={params.scoreMinimo ?? ''}
                placeholder="0"
                className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-foreground px-4 py-1.5 font-medium text-background"
            >
              Filtrar
            </button>
          </form>

          <p className="mb-3 text-sm opacity-70">
            {total.toLocaleString('pt-BR')} colidência(s) — página {pagina} de {totalPaginas}
          </p>

          <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/10">
                <tr>
                  <th className="px-3 py-2 font-medium">Sua marca</th>
                  <th className="px-3 py-2 font-medium">Marca de terceiro</th>
                  <th className="px-3 py-2 font-medium">Similaridade</th>
                  <th className="px-3 py-2 font-medium">Processo</th>
                  <th className="px-3 py-2 font-medium">Titular</th>
                  <th className="px-3 py-2 font-medium">Classe</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Edição</th>
                </tr>
              </thead>
              <tbody>
                {despachos.map((d) => (
                  <tr key={d.id} className="border-t border-black/5 align-top dark:border-white/10">
                    <td className="px-3 py-2 font-medium">
                      {d.marca ? (
                        <Link href={`/marcas/${d.marca.id}`} className="underline">
                          {d.marca.nome}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">{d.nomeMarca ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">
                      {d.similaridadeScore != null ? `${d.similaridadeScore}%` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono">{d.processo}</td>
                    <td className="max-w-56 truncate px-3 py-2" title={d.titular ?? undefined}>
                      {d.titular ?? '—'}
                    </td>
                    <td className="px-3 py-2">{d.classeNcl ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtData(d.dataPublicacao)}</td>
                    <td className="px-3 py-2">{d.edicaoRpi?.numero ?? 'pePI'}</td>
                  </tr>
                ))}
                {despachos.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center opacity-60">
                      Nenhuma colidência encontrada com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <nav className="mt-4 flex items-center gap-3 text-sm">
            {pagina > 1 && (
              <Link href={linkPagina(pagina - 1)} className="underline">
                ← anterior
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={linkPagina(pagina + 1)} className="underline">
                próxima →
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
