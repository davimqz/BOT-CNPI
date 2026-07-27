import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;
const CAMPOS = {
  marca: 'Nome da marca',
  processo: 'Nº do processo',
  titular: 'Titular',
  codigo: 'Código do despacho',
} as const;
type Campo = keyof typeof CAMPOS;

interface Params {
  edicao?: string;
  q?: string;
  campo?: string;
  pagina?: string;
}

function montarFiltro(params: Params): Prisma.DespachoWhereInput {
  const where: Prisma.DespachoWhereInput = {};
  const edicao = Number(params.edicao);
  if (Number.isInteger(edicao) && edicao > 0) {
    where.edicaoRpi = { numero: edicao };
  }
  const q = params.q?.trim();
  if (q) {
    const campo: Campo = params.campo && params.campo in CAMPOS ? (params.campo as Campo) : 'marca';
    if (campo === 'marca') where.nomeMarca = { contains: q, mode: 'insensitive' };
    if (campo === 'processo') where.processo = { contains: q };
    if (campo === 'titular') where.titular = { contains: q, mode: 'insensitive' };
    if (campo === 'codigo') where.codigo = { equals: q.toUpperCase() };
  }
  return where;
}

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const where = montarFiltro(params);

  const [total, despachos, edicoes] = await Promise.all([
    prisma.despacho.count({ where }),
    prisma.despacho.findMany({
      where,
      include: { edicaoRpi: { select: { numero: true } } },
      orderBy: [{ dataPublicacao: 'desc' }, { processo: 'asc' }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.edicaoRpi.findMany({ orderBy: { numero: 'desc' }, select: { numero: true } }),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const linkPagina = (p: number) => {
    const sp = new URLSearchParams();
    if (params.edicao) sp.set('edicao', params.edicao);
    if (params.q) sp.set('q', params.q);
    if (params.campo) sp.set('campo', params.campo);
    sp.set('pagina', String(p));
    return `/historico?${sp.toString()}`;
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Histórico RPI</h1>
        <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
          ← voltar
        </Link>
      </header>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block opacity-70">Edição</span>
          <select
            name="edicao"
            defaultValue={params.edicao ?? ''}
            className="rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
          >
            <option value="">Todas</option>
            {edicoes.map((e) => (
              <option key={e.numero} value={e.numero}>
                RPI {e.numero}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block opacity-70">Buscar por</span>
          <select
            name="campo"
            defaultValue={params.campo ?? 'marca'}
            className="rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
          >
            {Object.entries(CAMPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 basis-52">
          <span className="mb-1 block opacity-70">Termo</span>
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="ex: NATURA"
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
        {total.toLocaleString('pt-BR')} despacho(s) — página {pagina} de {totalPaginas}
      </p>

      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-3 py-2 font-medium">Edição</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Processo</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 font-medium">Titular</th>
              <th className="px-3 py-2 font-medium">Classe</th>
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Despacho</th>
            </tr>
          </thead>
          <tbody>
            {despachos.map((d) => (
              <tr key={d.id} className="border-t border-black/5 align-top dark:border-white/10">
                <td className="px-3 py-2">{d.edicaoRpi?.numero ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {d.dataPublicacao.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                </td>
                <td className="px-3 py-2 font-mono">{d.processo}</td>
                <td className="px-3 py-2">{d.nomeMarca ?? '—'}</td>
                <td className="max-w-64 truncate px-3 py-2" title={d.titular ?? undefined}>
                  {d.titular ?? '—'}
                </td>
                <td className="px-3 py-2">{d.classeNcl ?? '—'}</td>
                <td className="px-3 py-2 font-mono">{d.codigo}</td>
                <td className="max-w-96 px-3 py-2" title={d.textoComplementar ?? undefined}>
                  {d.textoDespacho ?? '—'}
                </td>
              </tr>
            ))}
            {despachos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center opacity-60">
                  Nenhum despacho encontrado com esses filtros.
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
    </main>
  );
}
