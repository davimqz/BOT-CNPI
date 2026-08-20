'use client';

import { useState } from 'react';
import { EVENTOS_ALERTA } from '@/lib/eventos-alerta';
import { THRESHOLD_PADRAO, THRESHOLDS } from '@/lib/similaridade';
import type { Cliente, Marca } from './tipos';

// Formulário de cadastro/edição de marca monitorada, compartilhado entre a
// página "Cadastrar Processo" (sem `marca`) e a edição inline dentro de
// "Acompanhar Processo" (com `marca`) — CLAUDE.md pedia a divisão da
// funcionalidade em duas telas, mas o formulário em si é o mesmo.

interface FormMarca {
  nome: string;
  processo: string;
  classeNcl: string;
  tipoBusca: 'radical' | 'exata';
  fonteDados: 'rpi' | 'scraping';
  clienteId: string;
  eventosAlerta: string[];
  similaridadeAtiva: boolean;
  similaridadeThreshold: number;
}

const FORM_VAZIO: FormMarca = {
  nome: '',
  processo: '',
  classeNcl: '',
  tipoBusca: 'radical',
  fonteDados: 'rpi',
  clienteId: '',
  eventosAlerta: [],
  similaridadeAtiva: false,
  similaridadeThreshold: THRESHOLD_PADRAO,
};

function formDaMarca(m: Marca): FormMarca {
  return {
    nome: m.nome,
    processo: m.processo ?? '',
    classeNcl: m.classeNcl ?? '',
    tipoBusca: m.tipoBusca === 'exata' ? 'exata' : 'radical',
    fonteDados: m.fonteDados,
    clienteId: m.clienteId ?? '',
    eventosAlerta: m.eventosAlerta,
    similaridadeAtiva: m.similaridadeAtiva,
    similaridadeThreshold: m.similaridadeThreshold ?? THRESHOLD_PADRAO,
  };
}

interface Props {
  clientes: Cliente[];
  /** Presente = edição; ausente = cadastro de uma marca nova. */
  marca?: Marca | null;
  onSalvo: () => void;
  /** Só faz sentido em edição inline — o cadastro não tem o que cancelar. */
  onCancelar?: () => void;
}

export function FormularioMarca({ clientes, marca, onSalvo, onCancelar }: Props) {
  const editando = !!marca;
  const [form, setForm] = useState<FormMarca>(marca ? formDaMarca(marca) : FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const resp = await fetch(editando ? `/api/marcas/${marca.id}` : '/api/marcas', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await resp.json()) as { erro?: string };
      if (!resp.ok) throw new Error(data.erro ?? `HTTP ${resp.status}`);
      // Cadastro: limpa o formulário para permitir adicionar a próxima marca
      // sem sair da tela. Edição: quem decide o que fazer depois é o pai
      // (normalmente fechar o painel de edição), então não mexe no form aqui.
      if (!editando) setForm(FORM_VAZIO);
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      className="mb-8 rounded border border-black/10 p-4 text-sm dark:border-white/15"
    >
      <p className="mb-3 font-medium">{editando ? 'Editar marca' : 'Adicionar marca ao monitor'}</p>
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
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Adicionar'}
          </button>
          {editando && onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
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
      <fieldset className="mt-4" disabled={salvando}>
        <span className="mb-1 block opacity-70">Marcas parecidas (colidência)</span>
        <div className="rounded border border-black/20 p-3 dark:border-white/20">
          <label className="flex cursor-pointer items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={form.similaridadeAtiva}
              onChange={(e) => setForm({ ...form, similaridadeAtiva: e.target.checked })}
            />
            Alertar também quando um terceiro depositar um nome parecido
          </label>
          <p className="mb-2 mt-1 text-xs opacity-60">
            Compara fonética e grafia (KOKA KOLA ≈ COCA COLA) contra os nomes publicados na RPI,
            dentro da mesma classe NCL quando ela estiver preenchida. Desligado, a marca só recebe
            alerta da própria movimentação.
          </p>
          {form.similaridadeAtiva && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {(
                [
                  [THRESHOLDS.liberal, 'Liberal', 'pega mais cópias, com mais falso positivo'],
                  [THRESHOLDS.padrao, 'Padrão', 'equilíbrio recomendado'],
                  [THRESHOLDS.rigoroso, 'Rigoroso', 'menos ruído, deixa passar variação sutil'],
                ] as const
              ).map(([valor, rotulo, dica]) => (
                <label key={valor} className="flex cursor-pointer items-center gap-1.5" title={dica}>
                  <input
                    type="radio"
                    name="similaridadeThreshold"
                    checked={form.similaridadeThreshold === valor}
                    onChange={() => setForm({ ...form, similaridadeThreshold: valor })}
                  />
                  {rotulo} ({valor}%)
                </label>
              ))}
              <label className="flex items-center gap-1.5">
                Customizado:
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={form.similaridadeThreshold}
                  onChange={(e) =>
                    setForm({ ...form, similaridadeThreshold: Number(e.target.value) })
                  }
                  className="w-20 rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20"
                />
                %
              </label>
            </div>
          )}
        </div>
      </fieldset>
      {form.fonteDados === 'scraping' && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Scraping do pePI é a opção de último recurso (mais frágil e sujeita a bloqueio) — use RPI
          semanal a menos que precise de detecção mais frequente que a edição de terça.
        </p>
      )}
      {erro && (
        <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}
    </form>
  );
}
