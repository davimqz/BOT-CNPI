'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EVENTOS_ALERTA, eventoPorSlug } from '@/lib/eventos-alerta';

// CRUD de marcas monitoradas (Fase 3). A fonte de dados padrão é a RPI semanal —
// scraping do pePI é último recurso, só para quem precisa de detecção mais
// frequente que a edição de terça-feira (CLAUDE.md Seção 2).

interface Cliente {
  id: string;
  nome: string;
}

interface Marca {
  id: string;
  nome: string;
  processo: string | null;
  classeNcl: string | null;
  tipoBusca: 'radical' | 'exata' | 'processo';
  fonteDados: 'rpi' | 'scraping';
  clienteId: string | null;
  cliente: Cliente | null;
  eventosAlerta: string[];
  ativa: boolean;
}

interface FormMarca {
  nome: string;
  processo: string;
  classeNcl: string;
  tipoBusca: 'radical' | 'exata';
  fonteDados: 'rpi' | 'scraping';
  clienteId: string;
  eventosAlerta: string[];
}

interface ResultadoImportacao {
  importadas: number;
  jaMonitoradas: number;
  erros: { linha: number; conteudo: string; motivo: string }[];
}

const FORM_VAZIO: FormMarca = {
  nome: '',
  processo: '',
  classeNcl: '',
  tipoBusca: 'radical',
  fonteDados: 'rpi',
  clienteId: '',
  eventosAlerta: [],
};

function resumoEventos(eventosAlerta: string[]): string {
  if (eventosAlerta.length === 0) return 'todos';
  return eventosAlerta
    .map((slug) => eventoPorSlug(slug)?.rotulo ?? slug)
    .join(', ');
}

export default function MarcasPage() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<FormMarca>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [importTexto, setImportTexto] = useState('');
  const [importando, setImportando] = useState(false);
  const [importResultado, setImportResultado] = useState<ResultadoImportacao | null>(null);

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

  function editar(m: Marca) {
    setEditandoId(m.id);
    setForm({
      nome: m.nome,
      processo: m.processo ?? '',
      classeNcl: m.classeNcl ?? '',
      tipoBusca: m.tipoBusca === 'exata' ? 'exata' : 'radical',
      fonteDados: m.fonteDados,
      clienteId: m.clienteId ?? '',
      eventosAlerta: m.eventosAlerta,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const resp = await fetch(editandoId ? `/api/marcas/${editandoId}` : '/api/marcas', {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await resp.json()) as { erro?: string };
      if (!resp.ok) throw new Error(data.erro ?? `HTTP ${resp.status}`);
      cancelarEdicao();
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

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
        await carregar();
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setImportando(false);
    }
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

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Marcas monitoradas</h1>
        <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
          ← voltar
        </Link>
      </header>

      <form
        onSubmit={salvar}
        className="mb-8 rounded border border-black/10 p-4 text-sm dark:border-white/15"
      >
        <p className="mb-3 font-medium">
          {editandoId ? 'Editar marca' : 'Adicionar marca ao monitor'}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 basis-48">
            <span className="mb-1 block opacity-70">Nome da marca</span>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="ex: NATURA"
              required
              minLength={2}
              disabled={salvando}
              className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
            />
          </label>
          <label className="block w-40">
            <span className="mb-1 block opacity-70">Nº do processo</span>
            <input
              value={form.processo}
              onChange={(e) => setForm({ ...form, processo: e.target.value })}
              placeholder="opcional"
              pattern="\d{6,12}"
              title="Apenas os dígitos do número do processo (6 a 12)"
              disabled={salvando}
              className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
            />
          </label>
          <label className="block w-28">
            <span className="mb-1 block opacity-70">Classe NCL</span>
            <input
              value={form.classeNcl}
              onChange={(e) => setForm({ ...form, classeNcl: e.target.value })}
              placeholder="opcional"
              pattern="\d{1,2}"
              disabled={salvando}
              className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
            />
          </label>
          <fieldset className="block" disabled={salvando}>
            <span className="mb-1 block opacity-70">Tipo de busca</span>
            <div className="flex gap-3 rounded border border-black/20 px-3 py-1.5 dark:border-white/20">
              {(
                [
                  ['radical', 'Radical'],
                  ['exata', 'Exata'],
                ] as const
              ).map(([t, rotulo]) => (
                <label key={t} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="tipoBusca"
                    checked={form.tipoBusca === t}
                    onChange={() => setForm({ ...form, tipoBusca: t })}
                  />
                  {rotulo}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="block" disabled={salvando}>
            <span className="mb-1 block opacity-70">Fonte de dados</span>
            <div className="flex gap-3 rounded border border-black/20 px-3 py-1.5 dark:border-white/20">
              {(
                [
                  ['rpi', 'RPI semanal'],
                  ['scraping', 'pePI (scraping)'],
                ] as const
              ).map(([f, rotulo]) => (
                <label key={f} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="fonteDados"
                    checked={form.fonteDados === f}
                    onChange={() => setForm({ ...form, fonteDados: f })}
                  />
                  {rotulo}
                </label>
              ))}
            </div>
          </fieldset>
          {clientes.length > 0 && (
            <label className="block w-44">
              <span className="mb-1 block opacity-70">Cliente</span>
              <select
                value={form.clienteId}
                onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
                disabled={salvando}
                className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20 dark:bg-black"
              >
                <option value="">— nenhum —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="flex gap-2">
            <button
              type="submit"
              disabled={salvando}
              className="rounded bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Adicionar'}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={cancelarEdicao}
                disabled={salvando}
                className="rounded border border-black/20 px-4 py-1.5 dark:border-white/20"
              >
                Cancelar
              </button>
            )}
          </span>
        </div>
        <fieldset className="mt-4" disabled={salvando}>
          <span className="mb-1 block opacity-70">Eventos que disparam alerta</span>
          <div className="rounded border border-black/20 p-3 dark:border-white/20">
            <label className="flex cursor-pointer items-center gap-1.5 font-medium">
              <input
                type="checkbox"
                checked={form.eventosAlerta.length === 0}
                onChange={() => setForm({ ...form, eventosAlerta: [] })}
              />
              Todos os eventos (padrão)
            </label>
            <p className="mb-2 mt-1 text-xs opacity-60">
              Marque eventos específicos abaixo para alertar só sobre eles; desmarcar tudo volta ao
              padrão de alertar sobre qualquer movimentação.
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {EVENTOS_ALERTA.map((ev) => {
                const semDespacho = ev.codigos.length === 0;
                return (
                  <label
                    key={ev.slug}
                    className={
                      semDespacho
                        ? 'flex items-center gap-1.5 opacity-40'
                        : 'flex cursor-pointer items-center gap-1.5'
                    }
                    title={
                      semDespacho
                        ? 'Situação do processo, não um despacho publicado na RPI — não gera alerta na ingestão semanal.'
                        : ev.codigos.join(', ')
                    }
                  >
                    <input
                      type="checkbox"
                      disabled={semDespacho}
                      checked={form.eventosAlerta.includes(ev.slug)}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          eventosAlerta: f.eventosAlerta.includes(ev.slug)
                            ? f.eventosAlerta.filter((s) => s !== ev.slug)
                            : [...f.eventosAlerta, ev.slug],
                        }))
                      }
                    />
                    {ev.rotulo}
                    {semDespacho && <span className="text-xs">(estado, sem alerta)</span>}
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>
        {form.fonteDados === 'scraping' && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Scraping do pePI é a opção de último recurso (mais frágil e sujeita a bloqueio) — use
            RPI semanal a menos que precise de detecção mais frequente que a edição de terça.
          </p>
        )}
      </form>

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
        {importResultado && (
          <div className="mt-3">
            <p>
              {importResultado.importadas} marca(s) importada(s)
              {importResultado.jaMonitoradas > 0 &&
                `, ${importResultado.jaMonitoradas} já estava(m) no monitor`}
              {importResultado.erros.length > 0 &&
                `, ${importResultado.erros.length} linha(s) com erro`}
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
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Fonte</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Alertas</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {marcas.map((m) => (
              <tr key={m.id} className="border-t border-black/5 align-top dark:border-white/10">
                <td className="px-3 py-2 font-medium">{m.nome}</td>
                <td className="px-3 py-2 font-mono">{m.processo ?? '—'}</td>
                <td className="px-3 py-2">{m.classeNcl ?? '—'}</td>
                <td className="px-3 py-2 capitalize">{m.tipoBusca}</td>
                <td className="px-3 py-2">{m.fonteDados === 'rpi' ? 'RPI semanal' : 'pePI'}</td>
                <td className="px-3 py-2">{m.cliente?.nome ?? '—'}</td>
                <td className="max-w-56 px-3 py-2" title={resumoEventos(m.eventosAlerta)}>
                  {m.eventosAlerta.length === 0 ? (
                    'todos os eventos'
                  ) : (
                    <span className="line-clamp-2">{resumoEventos(m.eventosAlerta)}</span>
                  )}
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
                  <button onClick={() => editar(m)} className="underline opacity-80 hover:opacity-100">
                    editar
                  </button>
                  <button
                    onClick={() => alternarAtiva(m)}
                    className="ml-3 underline opacity-80 hover:opacity-100"
                  >
                    {m.ativa ? 'desativar' : 'reativar'}
                  </button>
                  <button
                    onClick={() => excluir(m)}
                    className="ml-3 text-red-600 underline opacity-80 hover:opacity-100 dark:text-red-400"
                  >
                    excluir
                  </button>
                </td>
              </tr>
            ))}
            {!carregando && marcas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center opacity-60">
                  Nenhuma marca cadastrada ainda — adicione a primeira no formulário acima.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
