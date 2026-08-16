'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CaixaMensagensUI } from '@/lib/novidades';

// Caixa de Mensagem — inbox persistente das notificações dos processos
// acompanhados (pedido do usuário, 16/08/2026). Reaproveita a infraestrutura
// do pop-up de novidades (src/lib/novidades.ts): mesma fonte de dados, mesmo
// marco de "lido" — só muda a apresentação (lista completa, não só o que é
// novo desde a última vez).

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default function CaixaDeMensagensPage() {
  const [caixa, setCaixa] = useState<CaixaMensagensUI | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [marcando, setMarcando] = useState(false);

  const carregar = useCallback(() => {
    return fetch('/api/caixa-de-mensagens')
      .then(async (resp) => {
        const data = (await resp.json()) as CaixaMensagensUI & { erro?: string };
        if (!resp.ok) throw new Error((data as { erro?: string }).erro ?? `HTTP ${resp.status}`);
        setCaixa(data);
      })
      .catch((e: Error) => setErro(`Falha ao carregar a caixa de mensagens: ${e.message}`))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcarTodasComoLidas() {
    setMarcando(true);
    try {
      await fetch('/api/alertas/novidades', { method: 'POST' });
      await carregar();
    } finally {
      setMarcando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Caixa de mensagem</h1>
          <p className="mt-1 text-sm opacity-70">
            Notificações dos processos acompanhados que chegaram no sistema.
          </p>
        </div>
        {caixa && caixa.totalNaoLidas > 0 && (
          <button
            type="button"
            onClick={marcarTodasComoLidas}
            disabled={marcando}
            className="shrink-0 rounded border border-black/20 px-4 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            {marcando ? 'Marcando…' : 'Marcar todas como lidas'}
          </button>
        )}
      </header>

      {erro && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      <p className="mb-3 text-sm opacity-70">
        {carregando
          ? 'Carregando…'
          : caixa
            ? `${caixa.total} notificação(ões) — ${caixa.totalNaoLidas} não lida(s)`
            : ''}
      </p>

      <ul className="divide-y divide-black/10 rounded border border-black/10 dark:divide-white/10 dark:border-white/15">
        {caixa?.itens.map((item) => (
          <li
            key={item.chave}
            className={
              item.lida
                ? 'px-4 py-3'
                : 'bg-black/[0.025] px-4 py-3 dark:bg-white/[0.04]'
            }
          >
            <Link href={`/marcas/${item.marcaId}`} className="block hover:underline">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                {!item.lida && (
                  <span
                    aria-label="não lida"
                    className="size-2 shrink-0 rounded-full bg-blue-500"
                  />
                )}
                <span className="font-medium">{item.marcaNome}</span>
                {item.colidencia && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    marca de terceiro
                  </span>
                )}
                {item.quantidade > 1 && (
                  <span className="text-xs opacity-60">{item.quantidade} despachos</span>
                )}
              </p>
              <p className="mt-0.5 text-xs opacity-80">{item.status}</p>
              <p className="mt-0.5 text-[11px] opacity-60">
                processo {item.processo} · {fmtData(item.dataPublicacao)}
                {item.edicaoRpi ? ` · RPI ${item.edicaoRpi}` : ' · pePI'}
              </p>
            </Link>
          </li>
        ))}
        {!carregando && caixa?.itens.length === 0 && (
          <li className="px-4 py-8 text-center text-sm opacity-60">
            Nenhuma notificação ainda — ela aparece aqui assim que um processo acompanhado tiver
            movimentação.
          </li>
        )}
      </ul>
    </div>
  );
}
