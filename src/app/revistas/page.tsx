import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  PRIMEIRA_EDICAO_2026,
  agruparPorAnoMes,
  montarCatalogo,
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
            <span title="Data estimada pela cadência semanal — a edição ainda não foi ingerida, então a data oficial não foi lida do arquivo.">
              {' '}
              (estimada)
            </span>
          )}
        </span>
      </div>

      <p className="text-xs opacity-70">
        {/* Só oferece o link quando há o que ver. Numa edição sem despacho
            guardado, "Ver despachos" levaria a uma tabela vazia que se lê como
            "não houve movimentação nesta revista" — e o que ela significa é
            "nada das suas marcas". Beco sem saída que informa errado. */}
        {revista.ingerida && (revista.despachos ?? 0) > 0 ? (
          <Link href={`/historico?edicao=${revista.numero}`} className="underline">
            Ver despachos
          </Link>
        ) : revista.ingerida ? (
          <span>Sem movimentação das suas marcas</span>
        ) : (
          // Não é erro: a revista existe no INPI e continua baixável aqui. O que
          // falta é ela estar no banco, e esconder isso faria o usuário achar que
          // o Histórico RPI cobre um mês que na verdade não foi processado.
          <span>Não processada — download disponível</span>
        )}
      </p>

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

export default async function RevistasPage() {
  const edicoes = await prisma.edicaoRpi.findMany({
    orderBy: { numero: 'desc' },
    select: {
      numero: true,
      dataPublicacao: true,
      processadoEm: true,
      _count: { select: { despachos: true } },
    },
  });

  const catalogo = montarCatalogo(
    edicoes.map((e) => ({
      numero: e.numero,
      dataPublicacao: e.dataPublicacao,
      processadoEm: e.processadoEm,
      despachos: e._count.despachos,
    })),
  );
  const anos = agruparPorAnoMes(catalogo);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Revistas INPI</h1>
        <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
          ← voltar
        </Link>
      </header>

      <p className="mb-6 max-w-3xl text-sm opacity-80">
        Todas as edições da RPI (Seção de Marcas) desde a <strong>RPI {PRIMEIRA_EDICAO_2026}</strong>
        , a primeira de 2026, publicada em 06/01/2026. O download vai direto ao servidor do INPI —
        o arquivo é sempre o oficial, não uma cópia nossa.
      </p>

      {catalogo.length === 0 && (
        <p className="rounded border border-black/10 px-4 py-8 text-center text-sm opacity-70 dark:border-white/15">
          Nenhuma edição processada ainda. Rode <code>npm run ingest:rpi -- --backfill</code> (ou o
          workflow <em>Backfill RPI</em> no GitHub Actions) para puxar o histórico desde janeiro de
          2026.
        </p>
      )}

      <div className="space-y-10">
        {anos.map((ano) => (
          <section key={ano.ano}>
            <h2 className="mb-4 border-b border-black/10 pb-2 text-xl font-semibold dark:border-white/15">
              {ano.ano}
              <span className="ml-3 text-sm font-normal opacity-70">
                {ano.total} revista(s)
                {ano.ingeridas < ano.total && ` — ${ano.ingeridas} ingerida(s)`}
              </span>
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
    </main>
  );
}
