'use client';

import { useState } from 'react';

// Importação em lote de marcas — parte do cadastro (Fase 3), extraída para
// ficar só na página "Cadastrar Processo" e não em "Acompanhar Processo".

interface ResultadoImportacao {
  importadas: number;
  jaMonitoradas: number;
  erros: { linha: number; conteudo: string; motivo: string }[];
}

interface Props {
  onImportado: () => void;
}

export function ImportacaoLote({ onImportado }: Props) {
  const [importTexto, setImportTexto] = useState('');
  const [importando, setImportando] = useState(false);
  const [importResultado, setImportResultado] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setImportTexto(await arquivo.text());
    setImportResultado(null);
    e.target.value = ''; // permite re-selecionar o mesmo arquivo depois de corrigi-lo
  }

  async function importar() {
    setErro(null);
    setImportResultado(null);
    setImportando(true);
    try {
      const resp = await fetch('/api/marcas/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: importTexto }),
      });
      const data = (await resp.json()) as Partial<ResultadoImportacao> & { erro?: string };
      if (!resp.ok && !data.erros?.length) throw new Error(data.erro ?? `HTTP ${resp.status}`);
      setImportResultado({
        importadas: data.importadas ?? 0,
        jaMonitoradas: data.jaMonitoradas ?? 0,
        erros: data.erros ?? [],
      });
      if ((data.importadas ?? 0) > 0) {
        // Deixa no textarea só as linhas com problema, prontas para corrigir.
        setImportTexto(data.erros?.map((e) => e.conteudo).join('\n') ?? '');
        onImportado();
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <details className="mb-8 rounded border border-black/10 p-4 text-sm dark:border-white/15">
      <summary className="cursor-pointer font-medium">Importação em lote</summary>
      <p className="mb-2 mt-3 text-xs opacity-60">
        Cole abaixo (ou envie um arquivo .txt/.csv) uma marca por linha, em qualquer um dos 3
        formatos: só o nº do processo; nº + nome; nº + nome + classe NCL. Separadores aceitos:
        ponto e vírgula, vírgula ou tab. Linhas sem nome entram como busca por processo.
      </p>
      <textarea
        value={importTexto}
        onChange={(e) => setImportTexto(e.target.value)}
        placeholder={'912345678\n923456789;NATURA\n934567890;AÇAÍ DO NORTE;30'}
        rows={6}
        disabled={importando}
        className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 font-mono text-xs dark:border-white/20"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={importar}
          disabled={importando || !importTexto.trim()}
          className="rounded bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-50"
        >
          {importando ? 'Importando…' : 'Importar'}
        </button>
        <label className="cursor-pointer underline opacity-80 hover:opacity-100">
          carregar arquivo .txt/.csv
          <input
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={carregarArquivo}
            disabled={importando}
            className="hidden"
          />
        </label>
      </div>
      {erro && (
        <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}
      {importResultado && (
        <div className="mt-3">
          <p>
            {importResultado.importadas} marca(s) importada(s)
            {importResultado.jaMonitoradas > 0 &&
              `, ${importResultado.jaMonitoradas} já estava(m) no monitor`}
            {importResultado.erros.length > 0 && `, ${importResultado.erros.length} linha(s) com erro`}
            .
          </p>
          {importResultado.erros.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-red-700 dark:text-red-400">
              {importResultado.erros.map((e) => (
                <li key={`${e.linha}-${e.conteudo}`}>
                  linha {e.linha} (<span className="font-mono">{e.conteudo}</span>): {e.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
