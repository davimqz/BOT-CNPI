'use client';

/**
 * Aviso de novidades — o "pop-up visual" da Fase 6, montado no layout para
 * aparecer em qualquer tela.
 *
 * NÃO desaparece sozinho. Um toast que some depois de alguns segundos serve
 * para confirmar uma ação do usuário, não para avisar de um prazo que ele ainda
 * não viu: quem estava olhando outra aba perderia o aviso, e o sistema teria
 * "notificado" ninguém. Some só quando o usuário clica em "Já vi" — que é
 * exatamente o gesto que grava `alertas_vistos_em` (ver src/lib/novidades.ts).
 *
 * O primeiro estado vem renderizado do servidor, e o efeito só cuida do
 * polling: assim não há piscada de tela vazia em cada navegação, e uma
 * movimentação detectada com a aba aberta aparece sozinha.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { NovidadesUI } from '@/lib/novidades';

const INTERVALO_MS = 60_000;

function data(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function AvisoNovidades({ inicial }: { inicial: NovidadesUI | null }) {
  const [novidades, setNovidades] = useState(inicial);
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const r = await fetch('/api/alertas/novidades');
      // 401 quando a sessão expira com a aba aberta: o aviso some em vez de
      // insistir num erro que o usuário não pode resolver dali.
      setNovidades(r.ok ? ((await r.json()) as NovidadesUI) : null);
    } catch {
      // Rede caída não é motivo para derrubar a tela em que o usuário está;
      // o próximo ciclo tenta de novo.
    }
  }, []);

  useEffect(() => {
    // Sem sessão (tela de login) não há o que acompanhar.
    if (inicial === null) return;
    const t = setInterval(() => void recarregar(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [inicial, recarregar]);

  async function marcarVisto() {
    setSalvando(true);
    try {
      await fetch('/api/alertas/novidades', { method: 'POST' });
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  if (!novidades?.habilitado || novidades.total === 0) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-black/15 bg-background shadow-lg dark:border-white/20"
    >
      <header className="flex items-start justify-between gap-2 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <h2 className="text-sm font-semibold">
          {novidades.total}
          {novidades.truncado ? '+' : ''} nova(s) publicação(ões) no INPI
        </h2>
        <button
          type="button"
          onClick={() => void marcarVisto()}
          disabled={salvando}
          className="shrink-0 rounded border border-black/20 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {salvando ? 'salvando…' : 'Já vi'}
        </button>
      </header>

      <ul className="max-h-72 divide-y divide-black/10 overflow-y-auto text-sm dark:divide-white/10">
        {novidades.marcas.map((m) => (
          <li key={`${m.marcaId}-${m.colidencia}`} className="px-4 py-2.5">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.marcaNome}</span>
              {/* Colidência é fato de outra natureza: marca de terceiro, não
                  movimentação do processo do usuário. */}
              {m.colidencia && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  marca de terceiro
                </span>
              )}
              {m.quantidade > 1 && (
                <span className="text-xs opacity-60">{m.quantidade} despachos</span>
              )}
            </p>
            <p className="mt-0.5 text-xs opacity-80">{m.status}</p>
            <p className="mt-0.5 text-[11px] opacity-60">
              processo {m.processo} · {data(m.dataPublicacao)}
              {m.edicaoRpi ? ` · RPI ${m.edicaoRpi}` : ' · pePI'}
            </p>
          </li>
        ))}
        {novidades.outrasMarcas > 0 && (
          <li className="px-4 py-2 text-xs opacity-70">
            e mais {novidades.outrasMarcas} marca(s) com movimentação.
          </li>
        )}
      </ul>

      <footer className="flex gap-3 border-t border-black/10 px-4 py-2 text-xs dark:border-white/15">
        <Link href="/prazos" className="underline opacity-80 hover:opacity-100">
          Ver prazos
        </Link>
        <Link href="/caixa-de-mensagens" className="underline opacity-80 hover:opacity-100">
          Ver caixa de mensagem
        </Link>
      </footer>
    </aside>
  );
}
