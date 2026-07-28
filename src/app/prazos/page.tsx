import Link from 'next/link';
import { prisma } from '@/lib/db';
import { contarPorStatus, listarPrazos, type FiltroStatus } from '@/lib/prazos-consulta';
import { TabelaPrazos, type LinhaPrazo } from './tabela';

export const dynamic = 'force-dynamic';

const STATUS: Record<FiltroStatus, string> = {
  pendente: 'Pendentes',
  vencido: 'Vencidos',
  cumprido: 'Tratados',
  todos: 'Todos',
};

interface Params {
  status?: string;
  marcaId?: string;
}

export default async function PrazosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status: FiltroStatus =
    params.status && params.status in STATUS ? (params.status as FiltroStatus) : 'pendente';

  const [prazos, contagem, marcas] = await Promise.all([
    listarPrazos({ status, marcaId: params.marcaId || undefined }),
    contarPorStatus(),
    prisma.marcaMonitorada.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ]);

  const linhas: LinhaPrazo[] = prazos.map((p) => ({
    id: p.id,
    rotulo: p.rotulo,
    fundamento: p.fundamento,
    consequencia: p.consequencia,
    dataLimite: p.dataLimite.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
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
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prazos INPI</h1>
        <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
          ← voltar
        </Link>
      </header>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <div className="rounded border border-black/10 px-4 py-2 dark:border-white/15">
          <span className="block text-xl font-semibold">{contagem.pendentes}</span>
          <span className="opacity-70">pendentes</span>
        </div>
        <div className="rounded border border-black/10 px-4 py-2 dark:border-white/15">
          <span className="block text-xl font-semibold text-red-700 dark:text-red-400">
            {contagem.vencidos}
          </span>
          <span className="opacity-70">vencidos</span>
        </div>
        <div className="rounded border border-black/10 px-4 py-2 dark:border-white/15">
          <span className="block text-xl font-semibold">{contagem.cumpridos}</span>
          <span className="opacity-70">tratados</span>
        </div>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block opacity-70">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
          >
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block opacity-70">Marca</span>
          <select
            name="marcaId"
            defaultValue={params.marcaId ?? ''}
            className="rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
          >
            <option value="">Todas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-foreground px-4 py-1.5 font-medium text-background"
        >
          Filtrar
        </button>
      </form>

      <TabelaPrazos prazos={linhas} />

      {/*
        O aviso não é decoração: a data é calculada (LPI arts. 221-224), não é uma
        certidão do INPI, e o módulo erra de propósito para o lado "menos tempo".
        Apresentá-la como definitiva seria o pior erro possível desta tela.
      */}
      <section className="mt-6 rounded border border-black/10 p-4 text-sm opacity-80 dark:border-white/15">
        <p className="mb-2">
          <strong>Como a data-limite é calculada.</strong> A contagem começa no primeiro dia útil
          após a publicação na RPI e corre em dias corridos (LPI arts. 221, 222 e 223). Cada linha
          mostra o artigo que fundamenta o prazo.
        </p>
        <p>
          Estas datas são um <strong>piso seguro</strong>, calculado para nunca cair depois do
          vencimento real: prazo que termina em dia não útil não é prorrogado aqui, e ponto
          facultativo do INPI não entra na conta. Confirme sempre no processo antes de praticar o
          ato — esta tela não substitui a consulta oficial.
        </p>
      </section>
    </main>
  );
}
