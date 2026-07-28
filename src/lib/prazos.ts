// Motor de prazos (Fase 5): converte um despacho publicado na RPI na data-limite
// do ato que ele abre. Lógica pura, sem banco — quem persiste é
// src/workers/rpi/ingest.ts, logo depois do cruzamento da Fase 3.
//
// TODA regra daqui foi conferida contra o texto da Lei 9.279/96 e o Manual de
// Marcas do INPI; a tabela com o fundamento de cada uma, o que ficou de fora e
// por quê, está em .claude/skills/rpi-ingestion-despachos/references/despacho-codes.md.
// Não adicione código nem mude quantidade de dias aqui sem atualizar aquela
// tabela junto — é o que separa "prazo calculado" de "prazo chutado", e o custo
// de errar é o usuário perder o direito de praticar o ato (LPI art. 221).
//
// A CONTAGEM (LPI arts. 221/222/223):
//   dia 1      = primeiro dia útil APÓS a publicação na RPI (art. 223)
//   dataLimite = dia 1 + (N - 1) dias corridos (art. 221 contínuos, art. 222 inclui o vencimento)
//
// INVARIANTE DE SEGURANÇA: a data calculada nunca é MAIS TARDE que a data legal.
// Duas simplificações conscientes garantem isso (detalhe no doc de referência):
// não prorrogamos vencimento que cai em dia não útil, e ponto facultativo não
// conta como dia não útil. Errar para "você tem menos tempo" faz o usuário agir
// cedo; errar para o outro lado faz ele perder o prazo.

import type { MotivoCruzamento } from './verificacao';

export type UnidadePrazo = 'dias' | 'anos';

/**
 * Slug estável gravado em `prazos.tipo`. Slug e não rótulo pelo mesmo motivo dos
 * eventos de alerta (src/lib/eventos-alerta.ts): o texto exibido pode ser
 * reescrito sem migrar as linhas já gravadas.
 */
export type TipoPrazo =
  | 'oposicao_terceiros'
  | 'oposicao_a_marca_de_terceiro'
  | 'manifestacao_oposicao'
  | 'exigencia_merito'
  | 'exigencia_formal'
  | 'exigencia_pagamento'
  | 'pagamento_concessao_ordinario'
  | 'pagamento_concessao_extraordinario'
  | 'recurso_indeferimento'
  | 'contrarrazoes_recurso'
  | 'manifestacao_caducidade'
  | 'manifestacao_nulidade'
  | 'prorrogacao_ordinaria'
  | 'prorrogacao_extraordinaria';

export interface DefinicaoPrazo {
  tipo: TipoPrazo;
  rotulo: string;
  quantidade: number;
  unidade: UnidadePrazo;
  /** Artigo da LPI conferido; vai para a tela para o prazo ser auditável. */
  fundamento: string;
  /** O que acontece se o prazo passar em branco — o que dá urgência ao alerta. */
  consequencia?: string;
}

const DEF = {
  oposicao_terceiros: {
    tipo: 'oposicao_terceiros',
    rotulo: 'Prazo de oposição de terceiros',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 158, caput',
    consequencia: 'Encerrado o prazo sem oposição, o pedido segue para exame de mérito.',
  },
  oposicao_a_marca_de_terceiro: {
    tipo: 'oposicao_a_marca_de_terceiro',
    rotulo: 'Prazo para VOCÊ se opor a esta marca de terceiro',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 158, caput',
    consequencia: 'Passado o prazo, não cabe mais oposição administrativa a este pedido.',
  },
  manifestacao_oposicao: {
    tipo: 'manifestacao_oposicao',
    rotulo: 'Manifestação sobre oposição recebida',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 158, §1º',
    consequencia: 'Sem manifestação, o exame segue apenas com os argumentos do opoente.',
  },
  exigencia_merito: {
    tipo: 'exigencia_merito',
    rotulo: 'Cumprimento de exigência de mérito',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 159',
    consequencia: 'Exigência não respondida: arquivamento DEFINITIVO do pedido (art. 159, §1º).',
  },
  exigencia_formal: {
    tipo: 'exigencia_formal',
    rotulo: 'Cumprimento de exigência formal',
    quantidade: 5,
    unidade: 'dias',
    fundamento: 'LPI art. 157',
    consequencia: 'Não cumprida, o pedido é considerado INEXISTENTE.',
  },
  exigencia_pagamento: {
    tipo: 'exigencia_pagamento',
    rotulo: 'Cumprimento de exigência de pagamento',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 224 (prazo supletivo)',
    consequencia: 'A LPI não fixa prazo próprio para este ato; confirme no processo.',
  },
  pagamento_concessao_ordinario: {
    tipo: 'pagamento_concessao_ordinario',
    rotulo: 'Pagamento da concessão — prazo ordinário',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 162, caput',
    consequencia: 'Após este prazo o pagamento ainda cabe, com retribuição adicional.',
  },
  pagamento_concessao_extraordinario: {
    tipo: 'pagamento_concessao_extraordinario',
    rotulo: 'Pagamento da concessão — prazo extraordinário',
    quantidade: 90,
    unidade: 'dias',
    fundamento: 'LPI art. 162, parágrafo único (60 + 30)',
    consequencia: 'Sem pagamento até aqui: arquivamento DEFINITIVO do pedido.',
  },
  recurso_indeferimento: {
    tipo: 'recurso_indeferimento',
    rotulo: 'Recurso contra o indeferimento',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 212',
    consequencia: 'Sem recurso, o indeferimento se torna definitivo.',
  },
  contrarrazoes_recurso: {
    tipo: 'contrarrazoes_recurso',
    rotulo: 'Contrarrazões ao recurso',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 213',
    consequencia: 'O recurso é decidido mesmo sem contrarrazões.',
  },
  manifestacao_caducidade: {
    tipo: 'manifestacao_caducidade',
    rotulo: 'Manifestação em processo de caducidade',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 143, §2º',
    consequencia: 'O ônus de provar o uso da marca é do titular; sem prova, o registro caduca.',
  },
  manifestacao_nulidade: {
    tipo: 'manifestacao_nulidade',
    rotulo: 'Manifestação em processo administrativo de nulidade',
    quantidade: 60,
    unidade: 'dias',
    fundamento: 'LPI art. 170',
    consequencia: 'Decorrido o prazo, o processo é decidido mesmo sem manifestação (art. 171).',
  },
  prorrogacao_ordinaria: {
    tipo: 'prorrogacao_ordinaria',
    rotulo: 'Prorrogação do registro — prazo ordinário',
    quantidade: 10,
    unidade: 'anos',
    fundamento: 'LPI art. 133, §1º (vigência de 10 anos; pedido no último ano)',
    consequencia: 'Fim da vigência. Ainda cabem 6 meses com retribuição adicional.',
  },
  prorrogacao_extraordinaria: {
    tipo: 'prorrogacao_extraordinaria',
    rotulo: 'Prorrogação do registro — prazo extraordinário',
    quantidade: 10.5,
    unidade: 'anos',
    fundamento: 'LPI art. 133, §2º (6 meses após o término da vigência)',
    consequencia: 'Sem prorrogação, o registro se extingue (art. 142, I) e a marca fica livre.',
  },
} as const satisfies Record<TipoPrazo, DefinicaoPrazo>;

export const DEFINICOES_PRAZO: Record<TipoPrazo, DefinicaoPrazo> = DEF;

/**
 * Código de despacho → prazos que ele abre. Um despacho pode abrir mais de um
 * (deferimento abre o pagamento ordinário e o extraordinário; concessão abre a
 * prorrogação ordinária e a extraordinária).
 *
 * Código que não está aqui não gera prazo — e isso é intencional, ver a seção
 * "Códigos deliberadamente SEM regra de prazo" no doc de referência.
 */
export const REGRAS_PRAZO: Record<string, readonly TipoPrazo[]> = {
  IPAS009: ['oposicao_terceiros'],
  IPAS756: ['oposicao_terceiros'],
  IPAS423: ['manifestacao_oposicao'],
  IPAS136: ['exigencia_merito'],
  IPAS267: ['exigencia_merito'],
  IPAS772: ['exigencia_merito'],
  IPAS005: ['exigencia_formal'],
  IPAS395: ['exigencia_pagamento'],
  IPAS089: ['exigencia_pagamento'],
  IPAS029: ['pagamento_concessao_ordinario', 'pagamento_concessao_extraordinario'],
  IPAS768: ['pagamento_concessao_ordinario', 'pagamento_concessao_extraordinario'],
  IPAS781: ['pagamento_concessao_ordinario', 'pagamento_concessao_extraordinario'],
  IPAS024: ['recurso_indeferimento'],
  IPAS774: ['recurso_indeferimento'],
  IPAS360: ['contrarrazoes_recurso'],
  IPAS338: ['manifestacao_caducidade'],
  IPAS400: ['manifestacao_nulidade'],
  IPAS437: ['manifestacao_nulidade'],
  IPAS158: ['prorrogacao_ordinaria', 'prorrogacao_extraordinaria'],
  IPAS770: ['prorrogacao_ordinaria', 'prorrogacao_extraordinaria'],
};

/** Publicação de pedido para oposição — os únicos que fazem sentido numa colidência. */
const CODIGOS_OPOSICAO = new Set(['IPAS009', 'IPAS756']);

const DIA_MS = 86_400_000;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Domingo de Páscoa (algoritmo gregoriano anônimo) — só serve para derivar a
 * Sexta-feira Santa, único feriado nacional móvel que entra na conta.
 */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const dias = h + l - 7 * m + 114;
  return new Date(Date.UTC(ano, Math.floor(dias / 31) - 1, (dias % 31) + 1));
}

/**
 * Feriados nacionais ESTATUTÁRIOS do ano + Sexta-feira Santa.
 *
 * Carnaval e Corpus Christi ficam de fora de propósito: são ponto facultativo,
 * não feriado. Incluí-los empurraria o dia 1 (e o vencimento) para frente, que é
 * justamente a direção insegura — ver a invariante no topo do arquivo.
 */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = [
    [0, 1], // Confraternização Universal
    [3, 21], // Tiradentes
    [4, 1], // Dia do Trabalho
    [8, 7], // Independência
    [9, 12], // Nossa Senhora Aparecida
    [10, 2], // Finados
    [10, 15], // Proclamação da República
    [11, 25], // Natal
  ];
  const datas = fixos.map(([mes, dia]) => iso(new Date(Date.UTC(ano, mes, dia))));
  // Consciência Negra virou feriado nacional só a partir de 2024 (Lei 14.759/2023).
  if (ano >= 2024) datas.push(iso(new Date(Date.UTC(ano, 10, 20))));
  // Sexta-feira Santa: dois dias antes do Domingo de Páscoa.
  datas.push(iso(new Date(domingoDePascoa(ano).getTime() - 2 * DIA_MS)));
  return new Set(datas);
}

const cacheFeriados = new Map<number, Set<string>>();

export function ehDiaUtil(data: Date): boolean {
  const diaSemana = data.getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  const ano = data.getUTCFullYear();
  let feriados = cacheFeriados.get(ano);
  if (!feriados) {
    feriados = feriadosNacionais(ano);
    cacheFeriados.set(ano, feriados);
  }
  return !feriados.has(iso(data));
}

/** Dia 1 da contagem: primeiro dia útil DEPOIS da publicação (LPI art. 223). */
export function primeiroDiaUtilApos(data: Date): Date {
  let d = new Date(data.getTime() + DIA_MS);
  // 10 é folga suficiente: nem o maior feriadão emenda tantos dias seguidos.
  for (let i = 0; i < 10 && !ehDiaUtil(d); i++) {
    d = new Date(d.getTime() + DIA_MS);
  }
  return d;
}

/**
 * Data-limite de um prazo aberto por publicação na RPI.
 *
 * Prazo em DIAS passa pelo art. 223 (dia 1 = primeiro dia útil após a
 * publicação) e o `- 1` do art. 222 (o dia 1 já é o primeiro dia contado).
 * Prazo em ANOS não: o art. 133 conta a vigência da data da concessão, não de
 * uma intimação a ser respondida.
 */
export function calcularDataLimite(
  dataPublicacao: Date,
  quantidade: number,
  unidade: UnidadePrazo,
): Date {
  if (unidade === 'anos') {
    const inteiros = Math.floor(quantidade);
    const meses = Math.round((quantidade - inteiros) * 12);
    return new Date(
      Date.UTC(
        dataPublicacao.getUTCFullYear() + inteiros,
        dataPublicacao.getUTCMonth() + meses,
        dataPublicacao.getUTCDate(),
      ),
    );
  }
  const diaUm = primeiroDiaUtilApos(dataPublicacao);
  return new Date(diaUm.getTime() + (quantidade - 1) * DIA_MS);
}

export interface DespachoParaPrazo {
  codigo: string;
  dataPublicacao: Date;
  /** Como o despacho chegou à marca (Fase 4). `similaridade` = processo de terceiro. */
  motivo?: MotivoCruzamento;
}

export interface PrazoCalculado {
  tipo: TipoPrazo;
  dataLimite: Date;
  /** Dia 1 da contagem — exibido na tela para o cálculo ser conferível. */
  inicioContagem: Date;
  definicao: DefinicaoPrazo;
}

/**
 * Prazos abertos por um despacho. Devolve lista vazia quando o código não tem
 * regra validada — o padrão é NÃO inventar prazo.
 *
 * Colidência (motivo `similaridade`) é um processo de TERCEIRO: o único prazo do
 * usuário ali é opor-se. Gerar "pagamento da concessão" ou "recurso" a partir do
 * processo alheio entregaria ao usuário um prazo que não é dele.
 */
export function prazosDoDespacho(despacho: DespachoParaPrazo): PrazoCalculado[] {
  const colidencia = despacho.motivo === 'similaridade';
  if (colidencia && !CODIGOS_OPOSICAO.has(despacho.codigo)) return [];

  const tipos = REGRAS_PRAZO[despacho.codigo];
  if (!tipos) return [];

  return tipos.map((tipo) => {
    // Na colidência o rótulo precisa dizer que a ação é do usuário contra o
    // terceiro, não que terceiros podem se opor à marca dele.
    const efetivo: TipoPrazo =
      colidencia && tipo === 'oposicao_terceiros' ? 'oposicao_a_marca_de_terceiro' : tipo;
    const definicao = DEFINICOES_PRAZO[efetivo];
    return {
      tipo: efetivo,
      definicao,
      inicioContagem:
        definicao.unidade === 'anos'
          ? despacho.dataPublicacao
          : primeiroDiaUtilApos(despacho.dataPublicacao),
      dataLimite: calcularDataLimite(
        despacho.dataPublicacao,
        definicao.quantidade,
        definicao.unidade,
      ),
    };
  });
}

/**
 * Dias corridos até o vencimento. Zero = vence hoje; negativo = já venceu.
 * Compara só a parte de data (UTC), senão a hora do servidor muda a contagem.
 */
export function diasRestantes(dataLimite: Date, hoje: Date = new Date()): number {
  const limite = Date.UTC(
    dataLimite.getUTCFullYear(),
    dataLimite.getUTCMonth(),
    dataLimite.getUTCDate(),
  );
  const ref = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((limite - ref) / DIA_MS);
}

/**
 * Status derivado da data. `cumprido` nunca sai daqui — é decisão do usuário
 * ("Limpar selecionado" na tela de prazos), e uma vez cumprido o prazo não pode
 * voltar a vencer sozinho.
 */
export function statusPorData(
  dataLimite: Date,
  hoje: Date = new Date(),
): 'pendente' | 'vencido' {
  return diasRestantes(dataLimite, hoje) < 0 ? 'vencido' : 'pendente';
}
