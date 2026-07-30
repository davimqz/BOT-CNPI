'use client';

/**
 * Painel de canais da tela de Configurações de Alertas (Fase 6).
 *
 * Salva a cada clique, sem botão "Salvar": são três interruptores, e um estado
 * intermediário ("marquei mas não salvei") só criaria a chance de o usuário
 * sair achando que desligou — ou ligou — o que não desligou. O diagnóstico
 * volta recalculado do servidor a cada gravação, então o texto embaixo do
 * interruptor sempre descreve o estado real, não o pretendido.
 */

import { useState } from 'react';
import type { ConfiguracoesAlertaUI, SituacaoCanal } from '@/lib/configuracao-alertas';

const BADGE: Record<SituacaoCanal, { rotulo: string; classe: string }> = {
  ativo: {
    rotulo: 'ativo',
    classe: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  desligado: {
    rotulo: 'desligado',
    classe: 'bg-black/10 text-black/70 dark:bg-white/15 dark:text-white/70',
  },
  // Ligado e sem conseguir entregar é o estado perigoso desta tela: parece
  // configurado e não avisa ninguém. Vermelho, nunca cinza.
  incompleto: {
    rotulo: 'não entrega',
    classe: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  },
  indisponivel: {
    rotulo: 'indisponível',
    classe: 'bg-black/10 text-black/60 dark:bg-white/15 dark:text-white/60',
  },
};

function Canal({
  titulo,
  descricao,
  situacao,
  detalhe,
  ligado,
  onChange,
  desabilitado,
  extra,
}: {
  titulo: string;
  descricao: string;
  situacao: SituacaoCanal;
  detalhe: string;
  ligado: boolean;
  onChange?: (v: boolean) => void;
  desabilitado?: boolean;
  extra?: React.ReactNode;
}) {
  const badge = BADGE[situacao];
  return (
    <section className="rounded border border-black/15 p-4 dark:border-white/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            {titulo}
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.classe}`}>
              {badge.rotulo}
            </span>
          </h2>
          <p className="mt-0.5 text-sm opacity-70">{descricao}</p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ligado}
            disabled={desabilitado}
            onChange={(e) => onChange?.(e.target.checked)}
            className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className={desabilitado ? 'opacity-50' : ''}>{ligado ? 'ligado' : 'desligado'}</span>
        </label>
      </div>
      <p
        className={`mt-3 text-sm ${
          situacao === 'incompleto' ? 'text-red-700 dark:text-red-400' : 'opacity-80'
        }`}
      >
        {detalhe}
      </p>
      {extra}
    </section>
  );
}

export function PainelCanais({ inicial }: { inicial: ConfiguracoesAlertaUI }) {
  const [estado, setEstado] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function alterar(campo: 'emailHabilitado' | 'popupHabilitado', valor: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch('/api/alertas/configuracoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEstado((await r.json()) as ConfiguracoesAlertaUI);
    } catch {
      // O estado NÃO é atualizado no erro: um interruptor que se move sem ter
      // gravado faz o usuário acreditar num canal que continua como estava.
      setErro('Não foi possível salvar. O canal continua como estava — tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const semNenhumCanal = !estado.email.habilitado && !estado.popup.habilitado;

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {erro}
        </p>
      )}

      {/* Não é alarmismo: sem nenhum canal, o sistema continua detectando
          movimentação e não conta a ninguém — o prazo corre igual. */}
      {semNenhumCanal && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Nenhum canal de aviso ligado.</strong> O sistema continua monitorando e calculando
          prazos, mas você só vai saber de uma movimentação se abrir as telas de Prazos ou Histórico
          por conta própria. O prazo corre em dias corridos (LPI art. 221).
        </p>
      )}

      <Canal
        titulo="E-mail"
        descricao="Alerta de movimentação (um por marca) e resumo de prazos."
        situacao={estado.email.situacao}
        detalhe={estado.email.detalhe}
        ligado={estado.email.habilitado}
        desabilitado={salvando}
        onChange={(v) => void alterar('emailHabilitado', v)}
        extra={
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs opacity-70">
            <dt>Provedor</dt>
            <dd>
              {estado.email.provedor === 'resend'
                ? 'Resend'
                : estado.email.provedor === 'smtp'
                  ? 'SMTP (fallback)'
                  : '— nenhum configurado'}
            </dd>
            <dt>Remetente</dt>
            <dd>{estado.email.remetente ?? '—'}</dd>
            <dt>Destinatário</dt>
            <dd>{estado.email.destinatario ?? '—'}</dd>
          </dl>
        }
      />

      <Canal
        titulo="Aviso na tela"
        descricao="Pop-up de novidades, visível em qualquer tela do sistema."
        situacao={estado.popup.situacao}
        detalhe={estado.popup.detalhe}
        ligado={estado.popup.habilitado}
        desabilitado={salvando}
        onChange={(v) => void alterar('popupHabilitado', v)}
      />

      <Canal
        titulo="WhatsApp"
        descricao="Mensagem pela Cloud API oficial da Meta."
        situacao={estado.whatsapp.situacao}
        detalhe={estado.whatsapp.detalhe}
        ligado={false}
        // Desabilitado enquanto o canal não existe: oferecer o interruptor
        // deixaria o usuário "ligar" um canal que não manda mensagem nenhuma.
        desabilitado
      />
    </div>
  );
}
