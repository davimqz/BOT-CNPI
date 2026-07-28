'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Tela de consulta manual ao pePI (Fase 2). A busca roda no GitHub Actions
// (nunca no Vercel — CLAUDE.md Seção 3.1): o POST cria o job e dispara o
// workflow; aqui fazemos polling do status até o resultado aparecer, sempre
// mostrando a etapa atual para o usuário nunca ficar sem feedback.

const POLL_MS = 3000;
const TIMEOUT_MS = 8 * 60 * 1000;

interface ItemResultado {
  processo: string;
  prioridade: string | null;
  marca: string | null;
  situacao: string | null;
  titular: string | null;
  classe: string | null;
  codPedido: string | null;
}

interface Resultado {
  total: number;
  paginas: number;
  truncado?: boolean;
  itens: ItemResultado[];
}

interface JobStatus {
  jobId: string;
  status: 'pendente' | 'executando' | 'sucesso' | 'erro';
  etapa: string | null;
  resultado: Resultado | null;
  erro: string | null;
}

export default function BuscaPage() {
  const [termo, setTermo] = useState('');
  const [tipoBusca, setTipoBusca] = useState<'radical' | 'exata' | 'processo'>('radical');
  const [classeNcl, setClasseNcl] = useState('');
  const porProcesso = tipoBusca === 'processo';
  const [job, setJob] = useState<JobStatus | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const cancelado = useRef(false);

  useEffect(() => {
    return () => {
      cancelado.current = true;
    };
  }, []);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setErroEnvio(null);
    setJob(null);
    setBuscando(true);
    setSegundos(0);
    cancelado.current = false;

    try {
      const resp = await fetch('/api/busca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termo,
          tipoBusca,
          classeNcl: porProcesso ? undefined : classeNcl || undefined,
        }),
      });
      const data = (await resp.json()) as { jobId?: string; erro?: string };
      if (!resp.ok || !data.jobId) {
        setErroEnvio(data.erro ?? `Falha ao iniciar a busca (HTTP ${resp.status})`);
        setBuscando(false);
        return;
      }

      const inicio = Date.now();
      while (!cancelado.current && Date.now() - inicio < TIMEOUT_MS) {
        const st = await fetch(`/api/busca/${data.jobId}`);
        if (st.ok) {
          const s = (await st.json()) as JobStatus;
          setJob(s);
          if (s.status === 'sucesso' || s.status === 'erro') {
            setBuscando(false);
            return;
          }
        }
        setSegundos(Math.round((Date.now() - inicio) / 1000));
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!cancelado.current) {
        setErroEnvio(
          'A busca demorou mais que o esperado. Confira a aba Actions do repositório — o resultado pode ainda aparecer.',
        );
        setBuscando(false);
      }
    } catch {
      setErroEnvio('Erro de rede ao iniciar a busca');
      setBuscando(false);
    }
  }

  const resultado = job?.status === 'sucesso' ? job.resultado : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Consulta ao pePI</h1>
        <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
          ← voltar
        </Link>
      </header>

      <p className="mb-6 max-w-3xl text-sm opacity-70">
        Busca ao vivo na base de marcas do INPI. A consulta roda em um worker remoto e leva de
        alguns segundos a ~2 minutos (fila do runner + navegação no site do INPI).
      </p>

      <form onSubmit={buscar} className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="block flex-1 basis-52">
          <span className="mb-1 block opacity-70">
            {porProcesso ? 'Nº do processo' : 'Nome da marca'}
          </span>
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={porProcesso ? 'ex: 923456789 (só dígitos)' : 'ex: NATURA'}
            required
            minLength={2}
            pattern={porProcesso ? '\\d{6,12}' : undefined}
            title={porProcesso ? 'Apenas os dígitos do número do processo (6 a 12)' : undefined}
            disabled={buscando}
            className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
          />
        </label>
        <fieldset className="block" disabled={buscando}>
          <span className="mb-1 block opacity-70">Tipo de busca</span>
          <div className="flex gap-3 rounded border border-black/20 px-3 py-1.5 dark:border-white/20">
            {(
              [
                ['radical', 'Radical'],
                ['exata', 'Exata'],
                ['processo', 'Nº de processo'],
              ] as const
            ).map(([t, rotulo]) => (
              <label key={t} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="tipoBusca"
                  checked={tipoBusca === t}
                  onChange={() => setTipoBusca(t)}
                />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        {!porProcesso && (
          <label className="block w-28">
            <span className="mb-1 block opacity-70">Classe NCL</span>
            <input
              value={classeNcl}
              onChange={(e) => setClasseNcl(e.target.value)}
              placeholder="opcional"
              pattern="\d{1,2}"
              disabled={buscando}
              className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={buscando}
          className="rounded bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-50"
        >
          {buscando ? 'Consultando…' : 'Consultar INPI'}
        </button>
      </form>

      {erroEnvio && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erroEnvio}
        </p>
      )}

      {buscando && (
        <div className="mb-4 rounded border border-black/10 px-4 py-3 text-sm dark:border-white/15">
          <p className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-500" />
            Consultando o INPI… {segundos > 0 && <span className="opacity-60">({segundos}s)</span>}
          </p>
          <p className="mt-1 pl-5 font-mono text-xs opacity-70">
            {job?.etapa ?? 'aguardando o worker iniciar (fila do GitHub Actions)'}
          </p>
        </div>
      )}

      {job?.status === 'erro' && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          A busca falhou no worker: {job.erro ?? 'erro desconhecido'}
        </p>
      )}

      {resultado && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm opacity-70">
              {resultado.total.toLocaleString('pt-BR')} resultado(s) em {resultado.paginas}{' '}
              página(s) do pePI.
              {resultado.truncado && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  Resultado truncado no limite de páginas — refine a busca (Exata ou classe NCL).
                </span>
              )}
            </p>
            {job && (
              <span className="flex gap-2">
                <a
                  href={`/api/busca/${job.jobId}/relatorio`}
                  target="_blank"
                  rel="noopener"
                  className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Relatório Consultor de Marca ↗
                </a>
                <a
                  href={`/api/busca/${job.jobId}/relatorio?formato=pdf`}
                  target="_blank"
                  rel="noopener"
                  title="Abre o relatório com o diálogo de impressão — escolha 'Salvar como PDF'"
                  className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  PDF ↗
                </a>
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/10">
                <tr>
                  <th className="px-3 py-2 font-medium">Processo</th>
                  <th className="px-3 py-2 font-medium">Marca</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Titular</th>
                  <th className="px-3 py-2 font-medium">Classe</th>
                  <th className="px-3 py-2 font-medium">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {resultado.itens.map((r, i) => (
                  <tr
                    key={`${r.processo}-${i}`}
                    className="border-t border-black/5 align-top dark:border-white/10"
                  >
                    <td className="px-3 py-2 font-mono">{r.processo}</td>
                    <td className="px-3 py-2">{r.marca ?? '—'}</td>
                    <td className="px-3 py-2">{r.situacao ?? '—'}</td>
                    <td className="max-w-64 truncate px-3 py-2" title={r.titular ?? undefined}>
                      {r.titular ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{r.classe ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.prioridade ?? '—'}</td>
                  </tr>
                ))}
                {resultado.itens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center opacity-60">
                      {porProcesso
                        ? 'Nenhum processo encontrado com esse número — confira os dígitos.'
                        : 'Nenhuma marca encontrada — bom sinal para um registro novo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
