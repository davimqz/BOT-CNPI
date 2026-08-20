'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Detalhe de um processo pePI, aberto ao clicar num processo no resultado da
// busca (src/app/busca/marca/page.tsx). Mesmo modelo assíncrono da busca: a
// API cria um job e dispara o workflow pepi-detalhe.yml (nunca Playwright no
// Vercel — CLAUDE.md Seção 3.1/5); aqui fazemos polling até o resultado
// aparecer. Layout replica a tela de detalhe do pePI (ver print de referência
// no processo 944289240) e as convenções visuais de src/app/marcas/[id]/page.tsx.
//
// Tipo local em vez de importar de src/workers/pepi/detalhe.ts: aquele módulo
// importa 'playwright', que não pode entrar no bundle do cliente (mesmo
// motivo pelo qual busca/marca/page.tsx já duplica seus próprios tipos em vez
// de importar de search.ts).

const POLL_MS = 3000;
const TIMEOUT_MS = 8 * 60 * 1000;

interface DetalheProcessoPepi {
  processo: string;
  marca: string | null;
  situacao: string | null;
  apresentacao: string | null;
  natureza: string | null;
  classificacaoNice: { classe: string | null; situacaoClasse: string | null; especificacao: string | null }[];
  classificacaoViena: { edicao: string | null; codigo: string | null; descricao: string | null }[];
  titulares: string[];
  representantes: string[];
  dataDeposito: string | null;
  dataConcessao: string | null;
  dataVigencia: string | null;
  peticoes: {
    pgo: string | null;
    protocolo: string | null;
    data: string | null;
    servico: string | null;
    cliente: string | null;
    delivery: string | null;
    dataDelivery: string | null;
  }[];
  publicacoes: {
    rpi: string | null;
    dataRpi: string | null;
    despacho: string | null;
    certificado: string | null;
    inteiroTeor: string | null;
    complemento: string | null;
  }[];
  dadosAtualizadosAte: string | null;
  numeroRevista: string | null;
}

interface JobStatus {
  jobId: string;
  processo: string;
  status: 'pendente' | 'executando' | 'sucesso' | 'erro';
  etapa: string | null;
  resultado: DetalheProcessoPepi | null;
  erro: string | null;
}

function celula(v: string | null | undefined): string {
  return v && v.trim() ? v : '—';
}

export default function DetalheProcessoPage({
  params,
}: {
  params: Promise<{ codPedido: string }>;
}) {
  const { codPedido } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const processoQuery = searchParams.get('processo') ?? '';

  const [job, setJob] = useState<JobStatus | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const cancelado = useRef(false);

  useEffect(() => {
    cancelado.current = false;
    return () => {
      cancelado.current = true;
    };
  }, []);

  useEffect(() => {
    async function iniciar() {
      setCarregando(true);
      setErro(null);
      setSegundos(0);
      try {
        const resp = await fetch('/api/pepi/detalhe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codPedido, processo: processoQuery }),
        });
        const data = (await resp.json()) as { jobId?: string; erro?: string };
        if (!resp.ok || !data.jobId) {
          setErro(data.erro ?? `Falha ao iniciar a consulta (HTTP ${resp.status})`);
          setCarregando(false);
          return;
        }

        const inicio = Date.now();
        while (!cancelado.current && Date.now() - inicio < TIMEOUT_MS) {
          const st = await fetch(`/api/pepi/detalhe/${data.jobId}`);
          if (st.ok) {
            const s = (await st.json()) as JobStatus;
            setJob(s);
            if (s.status === 'sucesso' || s.status === 'erro') {
              setCarregando(false);
              return;
            }
          }
          setSegundos(Math.round((Date.now() - inicio) / 1000));
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
        if (!cancelado.current) {
          setErro('A consulta demorou mais que o esperado. Tente novamente em alguns instantes.');
          setCarregando(false);
        }
      } catch {
        setErro('Erro de rede ao consultar o processo');
        setCarregando(false);
      }
    }
    void iniciar();
    // codPedido/processoQuery não mudam depois do mount desta página — cada
    // processo tem sua própria URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codPedido]);

  const detalhe = job?.status === 'sucesso' ? job.resultado : null;
  const processoExibido = detalhe?.processo || job?.processo || processoQuery || codPedido;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 inline-block text-sm underline opacity-70 hover:opacity-100"
      >
        ← Voltar à busca
      </button>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Processo <span className="font-mono">{processoExibido}</span>
          </h1>
          {detalhe?.marca && <p className="mt-1 text-sm opacity-70">{detalhe.marca}</p>}
        </div>
        {detalhe?.situacao && (
          <span className="rounded bg-black/10 px-2 py-1 text-sm dark:bg-white/10">{detalhe.situacao}</span>
        )}
      </header>

      {carregando && (
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

      {erro && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      {job?.status === 'erro' && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          A consulta falhou no worker: {job.erro ?? 'erro desconhecido'}
        </p>
      )}

      {detalhe && (
        <>
          <section className="mb-8 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
              <span className="block opacity-60">Apresentação</span>
              <span>{celula(detalhe.apresentacao)}</span>
            </div>
            <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
              <span className="block opacity-60">Natureza</span>
              <span>{celula(detalhe.natureza)}</span>
            </div>
            <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
              <span className="block opacity-60">Data de Depósito</span>
              <span>{celula(detalhe.dataDeposito)}</span>
            </div>
            <div className="rounded border border-black/10 px-3 py-2 dark:border-white/15">
              <span className="block opacity-60">Data de Concessão</span>
              <span>{celula(detalhe.dataConcessao)}</span>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">Classificação de Produtos / Serviços</h2>
            <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
              <table className="w-full text-sm">
                <thead className="bg-black/5 text-left dark:bg-white/10">
                  <tr>
                    <th className="px-3 py-2 font-medium">Classe de Nice</th>
                    <th className="px-3 py-2 font-medium">Situação da Classe</th>
                    <th className="px-3 py-2 font-medium">Especificação</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.classificacaoNice.map((c, i) => (
                    <tr key={i} className="border-t border-black/5 align-top dark:border-white/10">
                      <td className="whitespace-nowrap px-3 py-2">{celula(c.classe)}</td>
                      <td className="px-3 py-2">{celula(c.situacaoClasse)}</td>
                      <td className="px-3 py-2">{celula(c.especificacao)}</td>
                    </tr>
                  ))}
                  {detalhe.classificacaoNice.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center opacity-60">
                        Nenhuma classificação encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {detalhe.classificacaoViena.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">Classificação Internacional de Viena</h2>
              <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/10">
                    <tr>
                      <th className="px-3 py-2 font-medium">Edição</th>
                      <th className="px-3 py-2 font-medium">Código</th>
                      <th className="px-3 py-2 font-medium">Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.classificacaoViena.map((c, i) => (
                      <tr key={i} className="border-t border-black/5 align-top dark:border-white/10">
                        <td className="whitespace-nowrap px-3 py-2">{celula(c.edicao)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{celula(c.codigo)}</td>
                        <td className="px-3 py-2">{celula(c.descricao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mb-8 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="mb-3 text-lg font-semibold">Titulares</h2>
              <ul className="rounded border border-black/10 text-sm dark:border-white/15">
                {detalhe.titulares.map((nome, i) => (
                  <li
                    key={i}
                    className="border-t border-black/5 px-3 py-2 first:border-t-0 dark:border-white/10"
                  >
                    {nome}
                  </li>
                ))}
                {detalhe.titulares.length === 0 && (
                  <li className="px-3 py-8 text-center opacity-60">Nenhum titular encontrado.</li>
                )}
              </ul>
            </div>
            <div>
              <h2 className="mb-3 text-lg font-semibold">Representante Legal</h2>
              <ul className="rounded border border-black/10 text-sm dark:border-white/15">
                {detalhe.representantes.map((nome, i) => (
                  <li
                    key={i}
                    className="border-t border-black/5 px-3 py-2 first:border-t-0 dark:border-white/10"
                  >
                    {nome}
                  </li>
                ))}
                {detalhe.representantes.length === 0 && (
                  <li className="px-3 py-8 text-center opacity-60">—</li>
                )}
              </ul>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">Petições</h2>
            <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
              <table className="w-full text-sm">
                <thead className="bg-black/5 text-left dark:bg-white/10">
                  <tr>
                    <th className="px-3 py-2 font-medium">Pgo</th>
                    <th className="px-3 py-2 font-medium">Protocolo</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Serviço</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.peticoes.map((p, i) => (
                    <tr key={i} className="border-t border-black/5 align-top dark:border-white/10">
                      <td className="px-3 py-2">{celula(p.pgo)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{celula(p.protocolo)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{celula(p.data)}</td>
                      <td className="px-3 py-2">{celula(p.servico)}</td>
                      <td className="max-w-64 px-3 py-2" title={p.cliente ?? undefined}>
                        {celula(p.cliente)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {p.delivery ? `${p.delivery}${p.dataDelivery ? ` — ${p.dataDelivery}` : ''}` : '—'}
                      </td>
                    </tr>
                  ))}
                  {detalhe.peticoes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center opacity-60">
                        Nenhuma petição encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Publicações</h2>
            <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
              <table className="w-full text-sm">
                <thead className="bg-black/5 text-left dark:bg-white/10">
                  <tr>
                    <th className="px-3 py-2 font-medium">RPI</th>
                    <th className="px-3 py-2 font-medium">Data RPI</th>
                    <th className="px-3 py-2 font-medium">Despacho</th>
                    <th className="px-3 py-2 font-medium">Certificado</th>
                    <th className="px-3 py-2 font-medium">Inteiro Teor</th>
                    <th className="px-3 py-2 font-medium">Complemento do Despacho</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.publicacoes.map((p, i) => (
                    <tr key={i} className="border-t border-black/5 align-top dark:border-white/10">
                      <td className="whitespace-nowrap px-3 py-2">{celula(p.rpi)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{celula(p.dataRpi)}</td>
                      <td className="px-3 py-2">{celula(p.despacho)}</td>
                      <td className="px-3 py-2">{celula(p.certificado)}</td>
                      <td className="px-3 py-2">{celula(p.inteiroTeor)}</td>
                      <td className="px-3 py-2">{celula(p.complemento)}</td>
                    </tr>
                  ))}
                  {detalhe.publicacoes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center opacity-60">
                        Nenhuma publicação encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {detalhe.dadosAtualizadosAte && (
              <p className="mt-3 text-xs opacity-60">
                Dados atualizados até {detalhe.dadosAtualizadosAte}
                {detalhe.numeroRevista && ` — Nº da Revista: ${detalhe.numeroRevista}`}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
