'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { eventoPorSlug } from '@/lib/eventos-alerta';
import { FormularioMarca } from './formulario-marca';
import type { Cliente, Marca } from './tipos';

// "Acompanhar Processo" — listagem/gestão das marcas já cadastradas (Fase 3).
// Cadastrar uma marca nova é a outra metade da funcionalidade, em /marcas/cadastrar
// (CLAUDE.md pediu a divisão). A edição de uma marca existente continua aqui,
// inline, porque é parte de acompanhar o que já está cadastrado, não de
// cadastrar algo novo.

function resumoEventos(eventosAlerta: string[]): string {
  if (eventosAlerta.length === 0) return 'todos os eventos';
  return eventosAlerta.map((slug) => eventoPorSlug(slug)?.rotulo ?? slug).join(', ');
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default function MarcasPage() {
  const router = useRouter();
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    return fetch('/api/marcas')
      .then(async (resp) => {
        const data = (await resp.json()) as {
          marcas?: Marca[];
          clientes?: Cliente[];
          erro?: string;
        };
        if (!resp.ok) throw new Error(data.erro ?? `HTTP ${resp.status}`);
        setMarcas(data.marcas ?? []);
        setClientes(data.clientes ?? []);
      })
      .catch((e: Error) => setErro(`Falha ao carregar as marcas: ${e.message}`))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvoEdicao() {
    setEditandoId(null);
    await carregar();
  }

  async function alternarAtiva(m: Marca) {
    setErro(null);
    const resp = await fetch(`/api/marcas/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativa: !m.ativa }),
    });
    if (!resp.ok) {
      const data = (await resp.json()) as { erro?: string };
      setErro(data.erro ?? `HTTP ${resp.status}`);
      return;
    }
    await carregar();
  }

  async function excluir(m: Marca) {
    if (!window.confirm(`Excluir a marca "${m.nome}"? Esta ação não pode ser desfeita.`)) return;
    setErro(null);
    const resp = await fetch(`/api/marcas/${m.id}`, { method: 'DELETE' });
    if (!resp.ok) {
      const data = (await resp.json()) as { erro?: string };
      setErro(data.erro ?? `HTTP ${resp.status}`);
      return;
    }
    if (editandoId === m.id) cancelarEdicao();
    await carregar();
  }

  const marcaEmEdicao = marcas.find((m) => m.id === editandoId) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Processos acompanhados</h1>
        <Link
          href="/marcas/cadastrar"
          className="shrink-0 rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        >
          + Cadastrar processo
        </Link>
      </header>

      {editandoId && marcaEmEdicao && (
        <FormularioMarca
          clientes={clientes}
          marca={marcaEmEdicao}
          onSalvo={salvoEdicao}
          onCancelar={cancelarEdicao}
        />
      )}

      {erro && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      <p className="mb-3 text-sm opacity-70">
        {carregando
          ? 'Carregando…'
          : `${marcas.length} marca(s) cadastrada(s) — ${marcas.filter((m) => m.ativa).length} em monitoramento ativo`}
      </p>

      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 font-medium">Processo</th>
              <th className="px-3 py-2 font-medium">Classe</th>
              <th className="px-3 py-2 font-medium">Prioridade</th>
              <th className="px-3 py-2 font-medium">RPI Atual</th>
              <th className="px-3 py-2 font-medium">Alertas</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {marcas.map((m) => (
              <tr
                key={m.id}
                onClick={() => router.push(`/marcas/${m.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') router.push(`/marcas/${m.id}`);
                }}
                className="cursor-pointer border-t border-black/5 align-top hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.05]"
              >
                <td className="px-3 py-2 font-medium">{m.nome}</td>
                <td className="px-3 py-2 font-mono">{m.processo ?? '—'}</td>
                <td className="px-3 py-2">{m.classeNcl ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {m.prioridade ? fmtData(m.prioridade) : '—'}
                </td>
                <td className="px-3 py-2">{m.rpiAtual ?? '—'}</td>
                <td className="px-3 py-2 text-center" title={resumoEventos(m.eventosAlerta)}>
                  {m.eventosAlerta.length === 0 ? 'Todos' : m.eventosAlerta.length}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      m.ativa
                        ? 'rounded bg-green-500/15 px-2 py-0.5 text-green-700 dark:text-green-400'
                        : 'rounded bg-black/10 px-2 py-0.5 opacity-60 dark:bg-white/10'
                    }
                  >
                    {m.ativa ? 'ativa' : 'pausada'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditandoId(m.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      title="Editar"
                      aria-label="Editar"
                      className="opacity-70 hover:opacity-100"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        alternarAtiva(m);
                      }}
                      title={m.ativa ? 'Desativar' : 'Reativar'}
                      aria-label={m.ativa ? 'Desativar' : 'Reativar'}
                      className="opacity-70 hover:opacity-100"
                    >
                      {m.ativa ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        excluir(m);
                      }}
                      title="Excluir"
                      aria-label="Excluir"
                      className="text-red-600 opacity-70 hover:opacity-100 dark:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!carregando && marcas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center opacity-60">
                  Nenhuma marca cadastrada ainda —{' '}
                  <Link href="/marcas/cadastrar" className="underline">
                    cadastre a primeira
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
