/**
 * "Resumo por e-mail" dos prazos pendentes (Fase 5) — fonte única do template,
 * no mesmo espírito do relatório Consultor de Marca (skill branded-report-builder):
 * HTML autocontido, sem asset externo, identidade parametrizada para a Fase 7
 * plugar sem reescrever nada.
 *
 * Gera as duas partes de um e-mail (HTML e texto puro). O texto puro não é
 * opcional: cliente de e-mail que bloqueia HTML mostraria uma mensagem vazia, e
 * uma notificação de prazo vazia é pior que nenhuma.
 */

import type { IdentidadeRelatorio } from './consultor-marca';
import { IDENTIDADE_PADRAO } from './consultor-marca';
import type { PrazoDetalhado } from '../prazos-consulta';

export interface DadosResumoPrazos {
  prazos: PrazoDetalhado[];
  geradoEm: Date;
  /** Janela considerada, só para o texto explicar o recorte ("próximos 30 dias"). */
  janelaDias?: number;
}

export interface ResumoPrazosEmail {
  assunto: string;
  html: string;
  texto: string;
}

const DISCLAIMER =
  'As datas deste resumo são calculadas a partir da publicação na RPI (LPI arts. 221 a 224) e ' +
  'representam um piso seguro: prazo que vence em dia não útil não é prorrogado aqui. Confirme ' +
  'no processo antes de praticar o ato — este e-mail não substitui a consulta oficial ao INPI.';

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function data(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function prazoEmTexto(dias: number): string {
  if (dias < 0) return `VENCIDO há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return 'VENCE HOJE';
  return `faltam ${dias} dia(s)`;
}

/**
 * Monta o assunto a partir do que há de mais urgente. Um assunto genérico
 * ("Resumo de prazos") faz o e-mail ser adiado; o número de dias no assunto é o
 * que faz o usuário abrir hoje.
 */
export function montarAssunto(prazos: PrazoDetalhado[]): string {
  if (prazos.length === 0) return 'Prazos INPI — nenhum prazo pendente';
  const vencidos = prazos.filter((p) => p.status === 'vencido').length;
  const maisUrgente = prazos.reduce((a, b) => (a.dias <= b.dias ? a : b));
  const partes: string[] = [];
  if (vencidos > 0) partes.push(`${vencidos} vencido(s)`);
  if (maisUrgente.dias >= 0) {
    partes.push(
      maisUrgente.dias === 0
        ? '1 vence HOJE'
        : `mais urgente em ${maisUrgente.dias} dia(s)`,
    );
  }
  return `Prazos INPI — ${prazos.length} prazo(s): ${partes.join(', ')}`;
}

export function gerarResumoPrazos(
  dados: DadosResumoPrazos,
  identidade: IdentidadeRelatorio = IDENTIDADE_PADRAO,
): ResumoPrazosEmail {
  const { prazos } = dados;
  const vencidos = prazos.filter((p) => p.status === 'vencido');
  const urgentes = prazos.filter((p) => p.status !== 'vencido' && p.dias <= 15);
  const demais = prazos.filter((p) => p.status !== 'vencido' && p.dias > 15);

  const recorte = dados.janelaDias
    ? `Prazos com vencimento nos próximos ${dados.janelaDias} dias, mais os já vencidos.`
    : 'Todos os prazos pendentes.';

  const linhas = (lista: PrazoDetalhado[]) =>
    lista
      .map(
        (p) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-weight:600${
            p.dias <= 5 ? ';color:#b91c1c' : ''
          }">${esc(prazoEmTexto(p.dias))}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${esc(data(p.dataLimite))}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">
            ${esc(p.marcaNome ?? '—')}
            ${p.colidencia ? '<span style="background:#fef3c7;padding:1px 5px;border-radius:3px;font-size:11px">colidência</span>' : ''}
          </td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;white-space:nowrap">${esc(p.processo)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">
            ${esc(p.rotulo)}
            <span style="display:block;color:#6b7280;font-size:11px">${esc(p.fundamento)}</span>
          </td>
        </tr>`,
      )
      .join('');

  const secao = (titulo: string, lista: PrazoDetalhado[], cor: string) =>
    lista.length === 0
      ? ''
      : `
      <h2 style="margin:24px 0 8px;font-size:15px;color:${cor}">${esc(titulo)} (${lista.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="text-align:left;background:#f3f4f6">
            <th style="padding:8px">Prazo</th>
            <th style="padding:8px">Data-limite</th>
            <th style="padding:8px">Marca</th>
            <th style="padding:8px">Processo</th>
            <th style="padding:8px">Tipo</th>
          </tr>
        </thead>
        <tbody>${linhas(lista)}</tbody>
      </table>`;

  const corpo =
    prazos.length === 0
      ? '<p style="margin:16px 0">Nenhum prazo pendente no momento.</p>'
      : secao('Vencidos', vencidos, '#b91c1c') +
        secao('Vencem em até 15 dias', urgentes, '#b45309') +
        secao('Demais prazos', demais, '#374151');

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${esc(montarAssunto(prazos))}</title></head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:760px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
    <h1 style="margin:0 0 4px;font-size:19px;border-bottom:3px solid ${esc(identidade.corDestaque)};padding-bottom:8px">
      ${esc(identidade.nome)} — Prazos INPI
    </h1>
    <p style="margin:12px 0;color:#6b7280;font-size:13px">
      Gerado em ${esc(data(dados.geradoEm))}. ${esc(recorte)}
    </p>
    ${corpo}
    <p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px">
      ${esc(DISCLAIMER)}
    </p>
    ${
      identidade.rodapeExtra
        ? `<p style="margin:8px 0 0;color:#6b7280;font-size:11px">${esc(identidade.rodapeExtra)}</p>`
        : ''
    }
  </div>
</body>
</html>`;

  const texto = [
    `${identidade.nome} — Prazos INPI`,
    `Gerado em ${data(dados.geradoEm)}. ${recorte}`,
    '',
    ...(prazos.length === 0
      ? ['Nenhum prazo pendente no momento.']
      : prazos.map(
          (p) =>
            `- [${prazoEmTexto(p.dias)}] ${data(p.dataLimite)} — ${p.marcaNome ?? '—'} ` +
            `(processo ${p.processo}): ${p.rotulo} [${p.fundamento}]` +
            (p.colidencia ? ' (colidência com marca de terceiro)' : ''),
        )),
    '',
    DISCLAIMER,
  ].join('\n');

  return { assunto: montarAssunto(prazos), html, texto };
}
