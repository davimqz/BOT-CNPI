// Detecção de movimentação nova na fonte `scraping` (Fase 3), usada pelo worker
// src/workers/pepi/monitor.ts. Lógica pura, sem banco e sem Playwright.
//
// Na fonte `rpi` o sinal de movimentação é o despacho publicado na edição. No pePI
// não existe esse "evento": a consulta ao vivo devolve o ESTADO atual de cada
// processo. Então guardamos um retrato (`marcas_monitoradas.ultimo_snapshot_pepi`)
// e movimentação = diferença entre o retrato anterior e o atual.

import { CODIGO_DESPACHO_PEPI } from './verificacao';

/** processo → situação, como o pePI exibe na coluna "Situação". */
export type SnapshotPepi = Record<string, string>;

export interface ItemPepi {
  processo: string;
  marca?: string | null;
  situacao?: string | null;
}

export interface DiffSnapshot {
  novos: string[];
  alterados: { processo: string; de: string; para: string }[];
  /** Processos que sumiram do resultado — registrados, mas não geram alerta (ver houveMovimentacao). */
  sumidos: string[];
}

const SEM_SITUACAO = '(sem situação)';

export function snapshotDeResultados(itens: ItemPepi[]): SnapshotPepi {
  const snapshot: SnapshotPepi = {};
  for (const item of itens) {
    const processo = (item.processo ?? '').trim();
    if (!processo) continue;
    snapshot[processo] = (item.situacao ?? '').replace(/\s+/g, ' ').trim() || SEM_SITUACAO;
  }
  return snapshot;
}

/** A coluna é `Json` e pode ter sido gravada por uma versão anterior — valida antes de usar. */
export function lerSnapshot(valor: unknown): SnapshotPepi | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const entradas = Object.entries(valor).filter(([, v]) => typeof v === 'string');
  return Object.fromEntries(entradas) as SnapshotPepi;
}

export function compararSnapshots(anterior: SnapshotPepi, atual: SnapshotPepi): DiffSnapshot {
  const novos: string[] = [];
  const alterados: DiffSnapshot['alterados'] = [];
  for (const [processo, situacao] of Object.entries(atual)) {
    if (!(processo in anterior)) novos.push(processo);
    else if (anterior[processo] !== situacao) {
      alterados.push({ processo, de: anterior[processo], para: situacao });
    }
  }
  const sumidos = Object.keys(anterior).filter((p) => !(p in atual));
  return { novos, alterados, sumidos };
}

/**
 * Só processo novo ou mudança de situação contam como movimentação. Um processo
 * que simplesmente sumiu do resultado costuma ser instabilidade do pePI (resposta
 * parcial, paginação truncada) e não uma alteração real — alertar nesse caso
 * geraria falso positivo recorrente. O sumiço é registrado no log, não no alerta.
 */
/**
 * Quando a consulta bateu no teto de páginas (`truncado`), o que veio é um
 * PEDAÇO do resultado: processos ausentes não desapareceram, só não foram lidos.
 * Sobrescrever o retrato com esse pedaço faria eles voltarem como "novos" na
 * rodada seguinte, gerando alerta falso — então o retrato antigo é preservado
 * para tudo que não apareceu desta vez.
 */
export function mesclarSnapshotTruncado(anterior: SnapshotPepi, atual: SnapshotPepi): SnapshotPepi {
  return { ...anterior, ...atual };
}

export function houveMovimentacao(diff: DiffSnapshot): boolean {
  return diff.novos.length > 0 || diff.alterados.length > 0;
}

export function descreverDiff(diff: DiffSnapshot): string {
  const partes: string[] = [];
  if (diff.novos.length) partes.push(`${diff.novos.length} processo(s) novo(s)`);
  if (diff.alterados.length) partes.push(`${diff.alterados.length} com situação alterada`);
  if (diff.sumidos.length) partes.push(`${diff.sumidos.length} fora do resultado`);
  return partes.length ? partes.join(', ') : 'nenhuma mudança';
}

export interface DespachoDeMudanca {
  processo: string;
  nomeMarca: string | null;
  codigo: string;
  textoDespacho: string;
}

/**
 * Uma linha de `despachos` por processo movimentado — mesma granularidade da
 * fonte RPI, para a Fase 6 poder notificar item a item. O código é sintético
 * (não existe na tabela do INPI), o que também impede que esses registros
 * alimentem por engano o cálculo de prazos legais da Fase 5.
 */
export function despachosDeMudanca(
  diff: DiffSnapshot,
  atual: SnapshotPepi,
  itens: ItemPepi[],
): DespachoDeMudanca[] {
  const nomePorProcesso = new Map(itens.map((i) => [i.processo, i.marca?.trim() || null]));
  const linha = (processo: string, texto: string): DespachoDeMudanca => ({
    processo,
    nomeMarca: nomePorProcesso.get(processo) ?? null,
    codigo: CODIGO_DESPACHO_PEPI,
    textoDespacho: texto,
  });

  return [
    ...diff.novos.map((p) => linha(p, `Novo processo encontrado no pePI — situação: ${atual[p]}`)),
    ...diff.alterados.map((a) => linha(a.processo, `Situação no pePI mudou de "${a.de}" para "${a.para}"`)),
  ];
}
