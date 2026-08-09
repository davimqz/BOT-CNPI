import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { eventoPorSlug } from '@/lib/eventos-alerta';
import { listarPrazos } from '@/lib/prazos-consulta';
import { roadmapDaMarca, type DespachoParaRoadmap } from '@/lib/roadmap-marca';
import { TabelaPrazos, type LinhaPrazo } from '@/app/prazos/tabela';

export const dynamic = 'force-dynamic';

function fmtData(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function resumoEventos(eventosAlerta: string[]): string {
  if (eventosAlerta.length === 0) return 'todos os eventos';
  return eventosAlerta.map((slug) => eventoPorSlug(slug)?.rotulo ?? slug).join(', ');
}

export default async function MarcaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const marca = await prisma.marcaMonitorada.findUnique({
    where: { id },
    include: { cliente: { select: { id: true, nome: true } } },
  });
  if (!marca) notFound();

  const [despachos, prazos] = await Promise.all([
    prisma.despacho.findMany({
      where: { marcaId: id },
      include: { edicaoRpi: { select: { numero: true } } },
      orderBy: { dataPublicacao: 'desc' },
    }),
    listarPrazos({ marcaId: id, status: 'todos' }),
  ]);

  const paraRoadmap: DespachoParaRoadmap[] = despachos.map((d) => ({
    id: d.id,
    codigo: d.codigo,
    dataPublicacao: d.dataPublicacao,
  }));
  const roadmap = roadmapDaMarca(paraRoadmap);

  const linhasPrazo: LinhaPrazo[] = prazos.map((p) => ({
    id: p.id,
    rotulo: p.rotulo,
    fundamento: p.fundamento,
    consequencia: p.consequencia,
    dataLimite: fmtData(p.dataLimite),
    dias: p.dias,
    status: p.status,
    processo: p.processo,
    nomeMarca: p.nomeMarca,
    codigoDespacho: p.codigoDespacho,
    edicaoRpi: p.edicaoRpi,
    marcaNome: p.marcaNome,
    colidencia: p.colidencia,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Link href="/marcas" className="mb-4 inline-block text-sm underline opacity-70 hover:opacity-100">
        ← Marcas monitoradas
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{marca.nome}</h1>
          <p className="mt-1 text-sm opacity-70">
            {marca.processo ? (
              <span className="font-mono">Processo {marca.processo}</span>
            ) : (
              'Sem número de processo cadastrado'
            )}
            {marca.classeNcl && ` · Classe ${marca.classeNcl}`}
            {marca.cliente && ` · ${marca.cliente.nome}`}
          </p>
        </div>
        <span
          className={
            marca.ativa
              ? 'rounded bg-green-500/15 px-2 py-1 text-sm text-green-700 dark:text-green-400'
              : 'rounded bg-black/10 px-2 py-1 text-sm opacity-60 dark:bg-white/10'
          }
        >
          {marca.ativa ? 'monitoramento ativo' : 'pausada'}
        </span>
      </header>

      {!marca.processo && (
        <p className="mb-6 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Sem número de processo, esta marca casa por nome na ingestão da RPI — mas a maioria dos
          despachos que abrem prazo (deferimento, indeferimento, exigências) publica o processo{' '}
          <strong>sem o nome da marca</strong>, então eles nunca são vinculados aqui. Cadastre o
          número do processo em &quot;editar&quot; para não perder essas movimentações.
        </p>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
          <span className="block opacity-60">Tipo de busca</span>
          <span className="capitalize">{marca.tipoBusca}</span>
        </div>
        <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
          <span className="block opacity-60">Fonte de dados</span>
          <span>{marca.fonteDados === 'rpi' ? 'RPI semanal' : 'pePI (scraping)'}</span>
        </div>
        <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
          <span className="block opacity-60">Alertas em</span>
          <span>{resumoEventos(marca.eventosAlerta)}</span>
        </div>
        <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
          <span className="block opacity-60">Marcas parecidas</span>
          <span>
            {marca.similaridadeAtiva ? `ativo, ≥ ${marca.similaridadeThreshold ?? 80}%` : 'desativado'}
          </span>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Roadmap do processo</h2>
        <p className="mb-4 text-sm opacity-70">
          Fases oficiais do Índice Geral publicado em toda edição da RPI (página 3). A fase em
          destaque é o último marco visto nas movimentações desta marca — não é um status
          certificado do INPI, só o que este sistema capturou até agora.
        </p>
        <ol className="space-y-2">
          {roadmap.fases.map((fase) => (
            <li
              key={fase.slug}
              className={`rounded border px-3 py-2 text-sm ${
                fase.atual
                  ? 'border-foreground bg-foreground/5'
                  : fase.alcancada
                    ? 'border-black/10 dark:border-white/15'
                    : 'border-black/5 opacity-45 dark:border-white/10'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-block size-2 shrink-0 rounded-full ${
                    fase.alcancada ? 'bg-green-600 dark:bg-green-400' : 'bg-black/20 dark:bg-white/20'
                  }`}
                />
                <span className={fase.atual ? 'font-medium' : ''}>{fase.titulo}</span>
                {fase.atual && (
                  <span className="rounded bg-foreground px-1.5 py-0.5 text-xs text-background">
                    atual
                  </span>
                )}
                {fase.codigos.length === 0 && (
                  <span
                    className="text-xs opacity-60"
                    title="O Índice Geral separa esta fase por seção do PDF, não por código — este sistema ainda não grava essa seção, então a fase nunca é marcada como alcançada automaticamente."
                  >
                    (sem código próprio)
                  </span>
                )}
              </div>
              {fase.despachos.length > 0 && (
                <ul className="mt-2 space-y-1 pl-4 text-xs opacity-80">
                  {fase.despachos.map((d) => (
                    <li key={d.id}>
                      {fmtData(d.dataPublicacao)} — <span className="font-mono">{d.codigo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        {roadmap.semFase.length > 0 && (
          <p className="mt-3 text-xs opacity-60">
            {roadmap.semFase.length} despacho(s) sem fase reconhecida no roadmap (decisões de
            petição de tipo genérico — ver histórico completo abaixo).
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Prazos</h2>
        <TabelaPrazos prazos={linhasPrazo} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Histórico de despachos</h2>
        <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/10">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Edição</th>
                <th className="px-3 py-2 font-medium">Cód.</th>
                <th className="px-3 py-2 font-medium">Despacho</th>
              </tr>
            </thead>
            <tbody>
              {despachos.map((d) => (
                <tr key={d.id} className="border-t border-black/5 align-top dark:border-white/10">
                  <td className="whitespace-nowrap px-3 py-2">{fmtData(d.dataPublicacao)}</td>
                  <td className="px-3 py-2">{d.edicaoRpi?.numero ?? '—'}</td>
                  <td className="px-3 py-2 font-mono">{d.codigo}</td>
                  <td className="max-w-96 px-3 py-2" title={d.textoComplementar ?? undefined}>
                    {d.textoDespacho ?? '—'}
                  </td>
                </tr>
              ))}
              {despachos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center opacity-60">
                    Nenhum despacho capturado ainda para esta marca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
