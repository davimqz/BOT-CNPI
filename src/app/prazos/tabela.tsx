'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface LinhaPrazo {
  id: string;
  rotulo: string;
  fundamento: string;
  consequencia?: string;
  dataLimite: string;
  dias: number;
  status: 'pendente' | 'vencido' | 'cumprido';
  processo: string;
  nomeMarca: string | null;
  codigoDespacho: string;
  edicaoRpi: number | null;
  marcaNome: string | null;
  colidencia: boolean;
}

function Urgencia({ dias, status }: { dias: number; status: LinhaPrazo['status'] }) {
  if (status === 'cumprido') {
    return <span className="whitespace-nowrap opacity-60">tratado</span>;
  }
  if (status === 'vencido') {
    return (
      <span className="whitespace-nowrap font-medium text-red-700 dark:text-red-400">
        vencido há {Math.abs(dias)}d
      </span>
    );
  }
  // Faixa curta em destaque: 5 dias é o prazo inteiro de uma exigência formal.
  const cor =
    dias <= 5
      ? 'text-red-700 dark:text-red-400 font-medium'
      : dias <= 15
        ? 'text-amber-700 dark:text-amber-400 font-medium'
        : '';
  return <span className={`whitespace-nowrap ${cor}`}>{dias === 0 ? 'vence hoje' : `${dias}d`}</span>;
}

export function TabelaPrazos({ prazos }: { prazos: LinhaPrazo[] }) {
  const router = useRouter();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alternar = (id: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  async function limpar(cumprido: boolean) {
    if (selecionados.size === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch('/api/prazos', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [...selecionados], cumprido }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.erro ?? 'Falha ao atualizar');
      }
      setSelecionados(new Set());
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao atualizar');
    } finally {
      setSalvando(false);
    }
  }

  if (prazos.length === 0) {
    return (
      <p className="rounded border border-black/10 p-6 text-sm opacity-70 dark:border-white/15">
        Nenhum prazo neste filtro. Prazos aparecem aqui quando uma edição da RPI traz um despacho
        de marca monitorada que abre prazo legal.
      </p>
    );
  }

  const todosMarcados = selecionados.size === prazos.length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="opacity-70">{selecionados.size} selecionado(s)</span>
        <button
          type="button"
          disabled={selecionados.size === 0 || salvando}
          onClick={() => limpar(true)}
          className="rounded bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-40"
        >
          Limpar selecionado
        </button>
        <button
          type="button"
          disabled={selecionados.size === 0 || salvando}
          onClick={() => limpar(false)}
          className="rounded border border-black/20 px-3 py-1.5 disabled:opacity-40 dark:border-white/20"
        >
          Reabrir
        </button>
        {erro && <span className="text-red-700 dark:text-red-400">{erro}</span>}
      </div>

      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={todosMarcados}
                  onChange={() =>
                    setSelecionados(todosMarcados ? new Set() : new Set(prazos.map((p) => p.id)))
                  }
                />
              </th>
              <th className="px-3 py-2 font-medium">Vence em</th>
              <th className="px-3 py-2 font-medium">Data-limite</th>
              <th className="px-3 py-2 font-medium">Marca monitorada</th>
              <th className="px-3 py-2 font-medium">Processo</th>
              <th className="px-3 py-2 font-medium">Tipo de prazo</th>
              <th className="px-3 py-2 font-medium">Origem</th>
            </tr>
          </thead>
          <tbody>
            {prazos.map((p) => (
              <tr
                key={p.id}
                className={`border-t border-black/5 align-top dark:border-white/10 ${
                  p.status === 'cumprido' ? 'opacity-50' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar prazo ${p.rotulo}`}
                    checked={selecionados.has(p.id)}
                    onChange={() => alternar(p.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <Urgencia dias={p.dias} status={p.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">{p.dataLimite}</td>
                <td className="px-3 py-2">
                  {p.marcaNome ?? '—'}
                  {p.colidencia && (
                    <span
                      className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs"
                      title={`Marca de terceiro parecida com a sua: ${p.nomeMarca ?? '—'}`}
                    >
                      colidência
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{p.processo}</td>
                <td className="px-3 py-2">
                  <span title={p.consequencia}>{p.rotulo}</span>
                  <span className="block text-xs opacity-60">{p.fundamento}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs opacity-70">
                  {p.codigoDespacho}
                  {p.edicaoRpi ? ` · RPI ${p.edicaoRpi}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
