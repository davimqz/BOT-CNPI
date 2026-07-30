/**
 * E-mail de alerta de movimentação (Fase 6) — fonte única do template, no mesmo
 * padrão do Consultor de Marca e do Resumo de Prazos (skill branded-report-builder):
 * HTML autocontido, sem asset externo, identidade parametrizada para a Fase 7
 * plugar sem reescrever nada.
 *
 * Gera as duas partes do e-mail (HTML e texto puro). O texto puro não é opcional:
 * cliente que bloqueia HTML mostraria um alerta vazio, e alerta vazio equivale a
 * alerta não enviado — que é exatamente o que este sistema existe para evitar.
 *
 * DOIS TEXTOS, NÃO UM. Um despacho chega a uma marca por duas razões diferentes
 * (src/lib/verificacao.ts): movimentação do processo do próprio usuário, ou
 * publicação de marca de TERCEIRO parecida com a dele (colidência, Fase 4). Ler
 * uma colidência como se fosse movimentação própria leva o usuário a agir no
 * processo errado — ou, pior, a não agir no prazo de oposição, que é dele. Por
 * isso o assunto, o cabeçalho e o texto introdutório mudam conforme o caso, e
 * um alerta nunca mistura os dois tipos no mesmo e-mail.
 */

import type { IdentidadeRelatorio } from './consultor-marca';
import { IDENTIDADE_PADRAO } from './consultor-marca';
import { rotuloDoCodigo } from '../eventos-alerta';

export interface PrazoDoAlerta {
  rotulo: string;
  dataLimite: Date;
  fundamento: string;
  consequencia?: string;
}

export interface DespachoDoAlerta {
  processo: string;
  nomeMarca: string | null;
  titular: string | null;
  classeNcl: string | null;
  codigo: string;
  textoDespacho: string | null;
  textoComplementar: string | null;
  dataPublicacao: Date;
  /** Nulo em despacho vindo do pePI (fonte scraping) — não sai de uma edição. */
  edicaoRpi: number | null;
  prazos: PrazoDoAlerta[];
}

export interface DadosAlerta {
  marca: { nome: string; processo: string | null; classeNcl: string | null };
  despachos: DespachoDoAlerta[];
  /** Marca de terceiro parecida com a monitorada, não movimentação própria. */
  colidencia: boolean;
  geradoEm: Date;
  /** Despachos que não couberam na lista (ver TETO_LISTA) — o e-mail avisa. */
  omitidos?: number;
}

export interface AlertaEmail {
  assunto: string;
  html: string;
  texto: string;
}

/**
 * Textos personalizáveis (o que a Fase 7 vai deixar o usuário editar em
 * `templates.email_*`). Aceitam as variáveis `{marca}`, `{status}` e `{processo}`.
 */
export interface TextosAlerta {
  assunto: string;
  cabecalho: string;
  intro: string;
}

export const TEXTOS_ALERTA_PADRAO: TextosAlerta = {
  assunto: '🔔 ALERTA INPI — {marca}: {status}',
  cabecalho: 'Movimentação no INPI',
  intro:
    'O monitoramento detectou uma nova publicação para a marca {marca} (processo {processo}): {status}.',
};

export const TEXTOS_ALERTA_COLIDENCIA: TextosAlerta = {
  assunto: '⚠️ COLIDÊNCIA INPI — marca parecida com {marca}',
  cabecalho: 'Marca de terceiro parecida com a sua',
  intro:
    'Não é movimentação do seu processo: o monitoramento encontrou a publicação de uma marca de ' +
    'TERCEIRO com nome parecido com {marca}. Se ela conflita com a sua, o prazo para se opor ' +
    'corre a partir desta publicação.',
};

/**
 * Lista longa demais vira parede de texto que ninguém lê — e a primeira ingestão
 * de uma marca antiga pode enfileirar dezenas de despachos de uma vez. O corte é
 * só de exibição: a fila é esvaziada inteira, e o e-mail diz quantos ficaram de
 * fora para o usuário abrir a tela.
 */
export const TETO_LISTA = 20;

const DISCLAIMER =
  'Alerta gerado automaticamente a partir da publicação oficial do INPI. As datas de prazo são ' +
  'calculadas conforme a LPI (arts. 221 a 224) e representam um piso seguro. Confirme no processo ' +
  'antes de praticar o ato — este e-mail não substitui a consulta oficial ao INPI.';

const VARIAVEIS = ['marca', 'status', 'processo'] as const;
export type VariavelAlerta = (typeof VARIAVEIS)[number];

/**
 * Substituição explícita das poucas variáveis suportadas (a skill pede um
 * mecanismo simples, não um template engine). Placeholder desconhecido fica
 * INTACTO de propósito: num texto que o usuário edita, `{marcca}` visível na
 * prévia é um erro que ele corrige; virar string vazia seria um erro invisível.
 */
export function aplicarVariaveis(texto: string, valores: Record<VariavelAlerta, string>): string {
  return texto.replace(/\{(\w+)\}/g, (original, nome: string) =>
    (VARIAVEIS as readonly string[]).includes(nome) ? valores[nome as VariavelAlerta] : original,
  );
}

function esc(v: string | null | undefined): string {
  if (!v) return '';
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function data(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/**
 * O "status" legível de um despacho. O texto publicado na RPI é o mais fiel;
 * sem ele (acontece), cai no rótulo do evento correspondente ao código, e só em
 * último caso no código cru — que não diz nada a quem não é da área.
 */
export function statusDoDespacho(d: { textoDespacho: string | null; codigo: string }): string {
  const texto = d.textoDespacho?.trim();
  if (texto) return texto;
  return rotuloDoCodigo(d.codigo);
}

/** O que vai para `{status}`: o despacho mais recente, com a contagem do resto. */
export function resumirStatus(despachos: DespachoDoAlerta[]): string {
  if (despachos.length === 0) return 'sem movimentação';
  const principal = statusDoDespacho(despachos[0]);
  return despachos.length === 1
    ? principal
    : `${principal} (+${despachos.length - 1} outra(s) publicação(ões))`;
}

function prazosDoAlerta(despachos: DespachoDoAlerta[]): PrazoDoAlerta[] {
  return despachos
    .flatMap((d) => d.prazos)
    .sort((a, b) => a.dataLimite.getTime() - b.dataLimite.getTime());
}

export function gerarAlertaDespacho(
  dados: DadosAlerta,
  identidade: IdentidadeRelatorio = IDENTIDADE_PADRAO,
  textos?: TextosAlerta,
): AlertaEmail {
  const modelo =
    textos ?? (dados.colidencia ? TEXTOS_ALERTA_COLIDENCIA : TEXTOS_ALERTA_PADRAO);

  // Mais recente primeiro: é a publicação que motivou o e-mail.
  const despachos = [...dados.despachos].sort(
    (a, b) => b.dataPublicacao.getTime() - a.dataPublicacao.getTime(),
  );
  const exibidos = despachos.slice(0, TETO_LISTA);
  const omitidos = (dados.omitidos ?? 0) + (despachos.length - exibidos.length);

  const valores: Record<VariavelAlerta, string> = {
    marca: dados.marca.nome,
    status: resumirStatus(despachos),
    // Numa colidência o processo relevante é o do terceiro, não o do usuário —
    // pôr o processo dele aqui sugeriria que o despacho é do processo dele.
    processo:
      (dados.colidencia ? despachos[0]?.processo : dados.marca.processo ?? despachos[0]?.processo) ??
      'não informado',
  };
  const assunto = aplicarVariaveis(modelo.assunto, valores);
  const cabecalho = aplicarVariaveis(modelo.cabecalho, valores);
  const intro = aplicarVariaveis(modelo.intro, valores);

  const prazos = prazosDoAlerta(exibidos);
  const cor = dados.colidencia ? '#b45309' : identidade.corDestaque;

  // Mesmos campos estruturados do relatório (skill branded-report-builder):
  // marca, processo, status, classe, titular.
  const linhas = exibidos
    .map(
      (d) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${esc(data(d.dataPublicacao))}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${esc(d.nomeMarca) || '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;white-space:nowrap">${esc(d.processo)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">
            ${esc(statusDoDespacho(d))}
            <span style="display:block;color:#6b7280;font-size:11px">${esc(d.codigo)}${
              d.edicaoRpi ? ` &middot; RPI ${d.edicaoRpi}` : ' &middot; consulta ao pePI'
            }</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(d.classeNcl) || '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${esc(d.titular) || '—'}</td>
        </tr>`,
    )
    .join('');

  const blocoPrazos = prazos.length
    ? `
    <h2 style="margin:24px 0 8px;font-size:15px;color:#b91c1c">Prazos abertos por esta publicação (${prazos.length})</h2>
    <ul style="margin:0;padding-left:18px;font-size:13px">
      ${prazos
        .map(
          (p) => `<li style="margin-bottom:6px">
            <strong>${esc(data(p.dataLimite))}</strong> — ${esc(p.rotulo)}
            <span style="display:block;color:#6b7280;font-size:11px">${esc(p.fundamento)}${
              p.consequencia ? ` &middot; ${esc(p.consequencia)}` : ''
            }</span>
          </li>`,
        )
        .join('')}
    </ul>`
    : '';

  const avisoOmitidos = omitidos
    ? `<p style="margin:12px 0;padding:8px 12px;background:#fef3c7;border-radius:6px;font-size:13px;color:#92400e">
        Mais ${omitidos} publicação(ões) desta marca não couberam neste e-mail — abra a tela de
        histórico para ver a lista completa.
      </p>`
    : '';

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:760px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
    <h1 style="margin:0 0 4px;font-size:19px;border-bottom:3px solid ${esc(cor)};padding-bottom:8px">
      ${esc(identidade.nome)} — ${esc(cabecalho)}
    </h1>
    <p style="margin:12px 0;color:#6b7280;font-size:13px">
      Marca monitorada: <strong style="color:#111827">${esc(dados.marca.nome)}</strong>${
        dados.marca.processo ? ` &middot; processo ${esc(dados.marca.processo)}` : ''
      } &middot; alerta gerado em ${esc(data(dados.geradoEm))}
    </p>
    <p style="margin:16px 0;font-size:14px">${esc(intro)}</p>
    ${avisoOmitidos}
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="text-align:left;background:#f3f4f6">
          <th style="padding:8px">Publicação</th>
          <th style="padding:8px">Marca</th>
          <th style="padding:8px">Processo</th>
          <th style="padding:8px">Despacho</th>
          <th style="padding:8px">Classe</th>
          <th style="padding:8px">Titular</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    ${blocoPrazos}
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
    `${identidade.nome} — ${cabecalho}`,
    `Marca monitorada: ${dados.marca.nome}${
      dados.marca.processo ? ` (processo ${dados.marca.processo})` : ''
    }`,
    `Alerta gerado em ${data(dados.geradoEm)}.`,
    '',
    intro,
    '',
    ...exibidos.map(
      (d) =>
        `- ${data(d.dataPublicacao)} — ${d.nomeMarca ?? '—'} (processo ${d.processo}): ` +
        `${statusDoDespacho(d)} [${d.codigo}${d.edicaoRpi ? `, RPI ${d.edicaoRpi}` : ', pePI'}]`,
    ),
    ...(omitidos ? ['', `Mais ${omitidos} publicação(ões) não listadas neste e-mail.`] : []),
    ...(prazos.length
      ? [
          '',
          `PRAZOS ABERTOS (${prazos.length}):`,
          ...prazos.map(
            (p) =>
              `- ${data(p.dataLimite)} — ${p.rotulo} [${p.fundamento}]` +
              (p.consequencia ? ` — ${p.consequencia}` : ''),
          ),
        ]
      : []),
    '',
    DISCLAIMER,
  ].join('\n');

  return { assunto, html, texto };
}
