/**
 * Relatório "Consultor de Marca" — fonte única do template (skill branded-report-builder).
 *
 * Gera o documento HTML completo e autocontido (CSS inline, sem assets externos)
 * a partir do resultado de uma busca no pePI. A exportação em PDF deve renderizar
 * ESTE mesmo HTML (via impressão/print CSS), nunca um segundo template.
 *
 * A identidade visual é parametrizada desde já (nome, cor, rodapé) para a Fase 7
 * (white-label) plugar aqui sem reescrever o template — por ora usa o padrão.
 */

export interface ItemRelatorio {
  processo: string;
  marca: string | null;
  situacao: string | null;
  titular: string | null;
  classe: string | null;
}

export interface DadosRelatorio {
  termo: string;
  tipoBusca: 'radical' | 'exata' | 'processo';
  classeNcl: string | null;
  consultadoEm: Date;
  itens: ItemRelatorio[];
  /** Resultado cortado no teto de páginas do worker — o relatório avisa que está incompleto. */
  truncado?: boolean;
}

export interface IdentidadeRelatorio {
  nome: string;
  corDestaque: string;
  /** Complementa o disclaimer padrão do rodapé (nunca o substitui — proteção jurídica). */
  rodapeExtra?: string | null;
}

export const IDENTIDADE_PADRAO: IdentidadeRelatorio = {
  nome: 'Consultor de Marca',
  corDestaque: '#1e40af',
};

export type SituacaoClassificada = 'ativa' | 'inativa' | 'verificar';

const DISCLAIMER =
  'Este relatório é informativo e não substitui uma busca oficial. Consulte um advogado ' +
  'especialista em propriedade intelectual antes de depositar o pedido de registro.';

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Situações terminais no pePI — o processo não representa mais obstáculo.
const INATIVA = /arquivad|extint|indeferid|anulad|cancelad|renunci/;
// Registro em vigor ou pedido claramente em andamento — obstáculo real a um novo depósito.
const ATIVA = /em vigor|vigente|deferid|exame|oposi|publicad|aguardando|sobrestad|notificad|prorroga/;

/**
 * Classifica o texto de situação do pePI. Ordem importa: "indeferido" contém
 * "deferido", então as situações terminais são testadas primeiro. Qualquer texto
 * não reconhecido (ou ausente) cai em "verificar" — nunca assuma que uma situação
 * desconhecida é inofensiva.
 */
export function classificarSituacao(situacao: string | null): SituacaoClassificada {
  if (!situacao?.trim()) return 'verificar';
  const s = normalizar(situacao);
  if (INATIVA.test(s)) return 'inativa';
  if (ATIVA.test(s)) return 'ativa';
  return 'verificar';
}

function esc(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ROTULO_TIPO_BUSCA: Record<DadosRelatorio['tipoBusca'], string> = {
  radical: 'Pesquisa Radical',
  exata: 'Pesquisa Exata',
  processo: 'Consulta por nº de processo',
};

const BADGE_SITUACAO: Record<SituacaoClassificada, { rotulo: string; css: string }> = {
  ativa: { rotulo: 'Ativa', css: 'badge-ativa' },
  inativa: { rotulo: 'Inativa', css: 'badge-inativa' },
  verificar: { rotulo: 'Verificar', css: 'badge-verificar' },
};

export interface OpcoesRelatorio {
  /**
   * Abre o diálogo de impressão do navegador ao carregar — é assim que a
   * exportação em PDF funciona: o mesmo HTML renderizado pelo motor de
   * impressão do navegador (Playwright no Vercel é proibido; CLAUDE.md Seção 5).
   */
  autoImprimir?: boolean;
}

export function gerarRelatorioConsultorMarca(
  dados: DadosRelatorio,
  identidade: IdentidadeRelatorio = IDENTIDADE_PADRAO,
  opcoes: OpcoesRelatorio = {},
): string {
  const contagem = { ativa: 0, inativa: 0, verificar: 0 };
  const itens = dados.itens.map((item) => {
    const classe = classificarSituacao(item.situacao);
    contagem[classe]++;
    return { ...item, classificacao: classe };
  });

  const total = itens.length;
  const disponivel = contagem.ativa === 0;
  const dataHora = dados.consultadoEm.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const resumo = disponivel
    ? total === 0
      ? 'Nenhuma marca registrada com este nome foi encontrada no INPI.'
      : `Nenhuma marca ativa com este nome foi encontrada no INPI (${total} registro(s) inativo(s) ou a verificar).`
    : `Existe(m) ${contagem.ativa} marca(s) ativa(s) com este nome no INPI.`;

  const avisoVerificar =
    contagem.verificar > 0
      ? `<p class="aviso">${contagem.verificar} resultado(s) com situação ambígua merecem revisão manual antes de qualquer decisão.</p>`
      : '';

  const avisoTruncado = dados.truncado
    ? '<p class="aviso">Atenção: a consulta atingiu o limite de páginas do INPI e este relatório está <strong>incompleto</strong>. Refine a busca (Exata ou classe NCL) para um resultado definitivo.</p>'
    : '';

  const linhas = itens
    .map((item) => {
      const badge = BADGE_SITUACAO[item.classificacao];
      return `<tr>
        <td>${esc(item.marca) || '—'}</td>
        <td class="mono">${esc(item.processo) || '—'}</td>
        <td>${esc(item.situacao) || '—'}</td>
        <td class="centro">${esc(item.classe) || '—'}</td>
        <td>${esc(item.titular) || '—'}</td>
        <td class="centro"><span class="badge ${badge.css}">${badge.rotulo}</span></td>
      </tr>`;
    })
    .join('\n');

  const tabela =
    total === 0
      ? ''
      : `<h2>Resultados encontrados</h2>
  <table>
    <thead>
      <tr><th>Marca</th><th>Processo</th><th>Status no INPI</th><th>Classe NCL</th><th>Titular</th><th>Situação</th></tr>
    </thead>
    <tbody>
${linhas}
    </tbody>
  </table>`;

  const filtroClasse = dados.classeNcl
    ? `<span class="badge badge-tipo">Classe NCL ${esc(dados.classeNcl)}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de consulta — ${esc(dados.termo)}</title>
<style>
  :root { --destaque: ${esc(identidade.corDestaque)}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; background: #f3f4f6; line-height: 1.5; padding: 24px;
  }
  .folha { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 8px;
    box-shadow: 0 1px 4px rgba(0,0,0,.12); padding: 32px 40px; }
  header { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 3px solid var(--destaque); padding-bottom: 12px; margin-bottom: 24px; }
  header .titulo { font-size: 20px; font-weight: 700; color: var(--destaque); }
  header .quando { font-size: 13px; color: #6b7280; }
  .veredito { text-align: center; margin: 28px 0; }
  .veredito .marca { font-size: 26px; font-weight: 700; }
  .selo { display: inline-flex; align-items: center; gap: 10px; margin: 16px 0 10px;
    padding: 10px 24px; border-radius: 999px; font-size: 18px; font-weight: 700; color: #fff; }
  .selo-disponivel { background: #15803d; }
  .selo-indisponivel { background: #b91c1c; }
  .selo .icone { font-size: 22px; line-height: 1; }
  .resumo { font-size: 15px; color: #374151; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600; white-space: nowrap; }
  .badge-tipo { background: #e5e7eb; color: #374151; margin: 8px 4px 0; }
  .badge-ativa { background: #dcfce7; color: #166534; }
  .badge-inativa { background: #e5e7eb; color: #4b5563; }
  .badge-verificar { background: #fef3c7; color: #92400e; }
  .aviso { margin: 10px auto 0; max-width: 640px; font-size: 13px; color: #92400e;
    background: #fef3c7; border-radius: 6px; padding: 8px 14px; }
  .contadores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 28px 0; }
  .contador { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; text-align: center; }
  .contador .valor { font-size: 28px; font-weight: 700; color: var(--destaque); }
  .contador .rotulo { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 16px; margin: 24px 0 10px; color: var(--destaque); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #f9fafb; border-bottom: 2px solid #e5e7eb;
    padding: 8px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: #4b5563; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .mono { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
  .centro { text-align: center; }
  footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 14px;
    font-size: 12px; color: #6b7280; }
  footer .disclaimer { font-style: italic; }
  .imprimir { position: fixed; top: 16px; right: 16px; background: var(--destaque); color: #fff;
    border: 0; border-radius: 6px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
  @media print {
    body { background: #fff; padding: 0; }
    .folha { box-shadow: none; border-radius: 0; max-width: none; padding: 0; }
    .imprimir { display: none; }
    tr, .contador { break-inside: avoid; }
  }
  @page { margin: 18mm 14mm; }
</style>
</head>
<body>
<button class="imprimir" onclick="window.print()">Imprimir / salvar PDF</button>
<div class="folha">
  <header>
    <span class="titulo">${esc(identidade.nome)}</span>
    <span class="quando">Consulta realizada em ${esc(dataHora)}</span>
  </header>

  <div class="veredito">
    <div class="marca">&ldquo;${esc(dados.termo)}&rdquo;</div>
    <div>
      <span class="selo ${disponivel ? 'selo-disponivel' : 'selo-indisponivel'}">
        <span class="icone">${disponivel ? '✔' : '⛔'}</span>
        ${disponivel ? 'Marca Disponível' : 'Marca Indisponível'}
      </span>
    </div>
    <p class="resumo">${esc(resumo)}</p>
    <div>
      <span class="badge badge-tipo">${ROTULO_TIPO_BUSCA[dados.tipoBusca]}</span>${filtroClasse}
    </div>
    ${avisoVerificar}
    ${avisoTruncado}
  </div>

  <div class="contadores">
    <div class="contador"><div class="valor">${total}</div><div class="rotulo">Total encontradas</div></div>
    <div class="contador"><div class="valor">${contagem.ativa}</div><div class="rotulo">Marcas ativas</div></div>
    <div class="contador"><div class="valor">${contagem.inativa}</div><div class="rotulo">Marcas inativas</div></div>
    <div class="contador"><div class="valor">${contagem.verificar}</div><div class="rotulo">Verificar</div></div>
  </div>

  ${tabela}

  <footer>
    <p>Consulta realizada em ${esc(dataHora)} na base pública do INPI (pePI).</p>
    <p class="disclaimer">${esc(DISCLAIMER)}</p>
    ${identidade.rodapeExtra ? `<p>${esc(identidade.rodapeExtra)}</p>` : ''}
  </footer>
</div>
${opcoes.autoImprimir ? '<script>window.addEventListener("load", () => window.print());</script>' : ''}
</body>
</html>`;
}
