'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FormularioMarca } from '../formulario-marca';
import { ImportacaoLote } from '../importacao-lote';
import type { Cliente } from '../tipos';

// "Cadastrar Processo" — metade do que antes era a página única de Marcas
// (CLAUDE.md pediu a divisão de "Processos" em Cadastrar/Acompanhar). Só
// clientes são carregados aqui: a listagem de marcas já existentes pertence a
// "Acompanhar Processo" (/marcas).

export default function CadastrarMarcaPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimaAdicionada, setUltimaAdicionada] = useState<string | null>(null);

  const carregarClientes = useCallback(() => {
    return fetch('/api/marcas')
      .then(async (resp) => {
        const data = (await resp.json()) as { clientes?: Cliente[]; erro?: string };
        if (!resp.ok) throw new Error(data.erro ?? `HTTP ${resp.status}`);
        setClientes(data.clientes ?? []);
      })
      .catch((e: Error) => setErro(`Falha ao carregar os clientes: ${e.message}`))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    void carregarClientes();
  }, [carregarClientes]);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Cadastrar processo</h1>
        <Link href="/marcas" className="text-sm underline opacity-80 hover:opacity-100">
          Ver processos acompanhados →
        </Link>
      </header>

      {erro && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      {!carregando && (
        <FormularioMarca
          clientes={clientes}
          onSalvo={() => setUltimaAdicionada(new Date().toLocaleTimeString('pt-BR'))}
        />
      )}

      {ultimaAdicionada && (
        <p className="-mt-4 mb-8 text-sm text-green-700 dark:text-green-400">
          Marca adicionada às {ultimaAdicionada}. Pode cadastrar a próxima ou{' '}
          <Link href="/marcas" className="underline">
            ir para Acompanhar Processo
          </Link>
          .
        </p>
      )}

      <ImportacaoLote onImportado={() => setUltimaAdicionada(new Date().toLocaleTimeString('pt-BR'))} />
    </div>
  );
}
