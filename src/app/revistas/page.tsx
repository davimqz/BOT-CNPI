import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  PRIMEIRA_EDICAO_2026,
  agruparPorAnoMes,
  anosDoCatalogo,
  filtrarRevistas,
  montarCatalogo,
  rotuloMes,
  type RevistaCatalogo,
} from '@/lib/revistas';

export const dynamic = 'force-dynamic';

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

function Caixa({ revista }: { revista: RevistaCatalogo }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-black/15 p-3 dark:border-white/20">
      <div>
        <span className="block text-lg font-semibold">RPI {revista.numero}</span>
        <span className="block text-sm opacity-70">
          {dataBr(revista.data)}
          {revista.dataEstimada && (
            <span title="Data calculada pela publicação semanal de terça-feira. O sistema não abriu esta edição, então a data não veio do arquivo oficial.">
              {' '}
              (estimada)
            </span>
          )}
        </span>
      </div>

      {/* Esta área é catálogo e download, e só. Estado de processamento nosso
          (edição lida ou não, quantos despachos, se houve movimentação) não
          pertence aqui — é assunto do Histórico RPI e dos alertas. */}
      <div className="mt-auto pt-1 text-xs">
        <a
          href={revista.urlPdf}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded bg-foreground px-2.5 py-1 font-medium text-background"
          title="PDF oficial da Seção de Marcas, direto do INPI"
        >
          Baixar PDF
        </a>
      </div>
    </div>
  );
}

interface Params {
  numero?: string;
  ano?: string;
  mes?: string;
  data?: string;
}

export default async function RevistasPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  // A edição só entra aqui para dar a data oficial de publicação; o conteúdo dela
  // não é assunto desta tela, então nada de contar despachos.
  const edicoes = await prisma.edicaoRpi.findMany({
    orderBy: { numero: 'desc' },
    select: { numero: true, dataPublicacao: true },
  });

  const catalogo = montarCatalogo(edicoes);
  const filtradas = filtrarRevistas(catalogo, params);
  const anos = agruparPorAnoMes(filtradas);
  const anosDisponiveis = anosDoCatalogo(catalogo);
  const temFiltro = Boolean(params.numero || params.ano || params.mes || params.data);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Revistas INPI</h1>
      </header>

      <p className="mb-6 max-w-3xl text-sm opacity-80">
        Todas as edições da RPI (Seção de Marcas) desde a <strong>RPI {PRIMEIRA_EDICAO_2026}</strong>
        , a primeira de 2026, publicada em 06/01/2026. O download vai direto ao servidor do INPI —
        o arquivo é sempre o oficial, não uma cópia nossa.
      </p>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block opacity-70">Número</span>
          <input
            name="numero"
            inputMode="numeric"
            defaultValue={params.numero ?? ''}
            placeholder="ex: 2896"
            className="w-28 rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
          />
        </label>
        <label className="block">
          <span className="mb-1 block opacity-70">Mês</span>
          <select
            name="mes"
            defaultValue={params.mes ?? ''}
            className="rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
          >
            <option value="">Todos</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1} className="capitalize">
                {rotuloMes(i + 1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block opacity-70">Ano</span>
          <select
            name="ano"
            defaultValue={params.ano ?? ''}
            className="rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
          >
            <option value="">Todos</option>
            {anosDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block opacity-70">Data de publicação</span>
          <input
            type="date"
            name="data"
            defaultValue={params.data ?? ''}
            className="rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-foreground px-4 py-1.5 font-medium text-background"
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/revistas" className="py-1.5 underline opacity-70 hover:opacity-100">
            limpar
          </Link>
        )}
      </form>

      {catalogo.length === 0 && (
        <p className="rounded border border-black/10 px-4 py-8 text-center text-sm opacity-70 dark:border-white/15">
          Nenhuma edição processada ainda. Rode <code>npm run ingest:rpi -- --backfill</code> (ou o
          workflow <em>Backfill RPI</em> no GitHub Actions) para puxar o histórico desde janeiro de
          2026.
        </p>
      )}

      {catalogo.length > 0 && filtradas.length === 0 && (
        <p className="rounded border border-black/10 px-4 py-8 text-center text-sm opacity-70 dark:border-white/15">
          Nenhuma revista com esses filtros.{' '}
          <Link href="/revistas" className="underline">
            Limpar
          </Link>
          .
        </p>
      )}

      {temFiltro && filtradas.length > 0 && (
        <p className="mb-4 text-sm opacity-70">
          {filtradas.length} de {catalogo.length} revista(s).
        </p>
      )}

      <div className="space-y-10">
        {anos.map((ano) => (
          <section key={ano.ano}>
            <h2 className="mb-4 border-b border-black/10 pb-2 text-xl font-semibold dark:border-white/15">
              {ano.ano}
              <span className="ml-3 text-sm font-normal opacity-70">{ano.total} revista(s)</span>
            </h2>

            <div className="space-y-6">
              {ano.meses.map((mes) => (
                <div key={mes.chave}>
                  <h3 className="mb-2 text-sm font-medium">
                    <span className="capitalize">{mes.rotulo}</span>
                    <span className="ml-2 font-normal opacity-60">
                      {mes.revistas.length} revista(s)
                    </span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {mes.revistas.map((r) => (
                      <Caixa key={r.numero} revista={r} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
