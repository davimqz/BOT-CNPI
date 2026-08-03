// Catálogo das edições da RPI desde janeiro de 2026 — alimenta a seção "Revistas
// INPI" (/revistas) e o backfill de `npm run ingest:rpi -- --backfill`.
//
// Lógica pura de propósito: o mapeamento edição↔data e a montagem do catálogo são
// testáveis sem banco e sem rede.

/**
 * Primeira edição publicada em 2026: **RPI 2870, terça 06/01/2026**.
 *
 * Confirmado em 02/08/2026 pelo `last-modified` do próprio servidor do INPI
 * (`HEAD https://revistas.inpi.gov.br/txt/RM2870.zip` → `Tue, 06 Jan 2026`), e a
 * anterior (2869) responde `Tue, 30 Dec 2025` — ou seja, 2870 é de fato a primeira
 * do ano, não a última de 2025.
 */
export const PRIMEIRA_EDICAO_2026 = 2870;

/**
 * Primeira edição que o banco **consome**: RPI 2896 (07/07/2026), a semana em que
 * o pedido do usuário foi depositado.
 *
 * Não confundir com `PRIMEIRA_EDICAO_2026`, que é onde o *catálogo* da tela
 * começa. São coisas diferentes de propósito:
 *
 * - O catálogo lista desde janeiro porque revista é referência, e listar custa
 *   zero — o download aponta para o INPI.
 * - A ingestão começa na 2896 porque **antes do depósito não existe processo para
 *   movimentar**. Cruzar janeiro a junho procuraria uma marca que ainda não tinha
 *   dado entrada: gastaria banco e tempo para, por construção, não achar nada.
 *
 * Se um dia entrar uma marca mais antiga no monitoramento, este é o número a
 * baixar — e `--backfill=<numero>` cobre o intervalo novo.
 */
export const PRIMEIRA_EDICAO_MONITORADA = 2896;

/** 06/01/2026 em UTC. Todas as datas do sistema são UTC-meia-noite (ver `parse.ts`). */
const DATA_PRIMEIRA_EDICAO_2026 = Date.UTC(2026, 0, 6);

const UMA_SEMANA_MS = 7 * 86_400_000;

/** ZIP com o XML da Seção V (Marcas) — a mesma URL que a ingestão consome. */
export function urlXmlZip(numero: number): string {
  return `https://revistas.inpi.gov.br/txt/RM${numero}.zip`;
}

/**
 * PDF oficial da Seção de Marcas. Arquivo grande (~130 MB) e por isso o rótulo do
 * botão avisa o tamanho: baixar sem saber, no celular, é uma surpresa cara.
 */
export function urlPdfMarcas(numero: number): string {
  return `https://revistas.inpi.gov.br/pdf/Marcas${numero}.pdf`;
}

/**
 * Data estimada de publicação, assumindo a cadência semanal de terça.
 *
 * É **estimativa**, não fonte de verdade: a data real vem do XML da edição e é o
 * que o catálogo usa assim que a edição é ingerida. Verificada linear em 10 meses
 * de amostragem (2860 → 28/10/2025 ... 2899 → 28/07/2026) em 02/08/2026, mas o
 * INPI pode deslocar uma publicação por feriado — daí a marcação `dataEstimada`
 * na tela, em vez de apresentar o palpite como fato.
 */
export function dataEstimada(numero: number): Date {
  return new Date(DATA_PRIMEIRA_EDICAO_2026 + (numero - PRIMEIRA_EDICAO_2026) * UMA_SEMANA_MS);
}

/**
 * O mínimo que o catálogo precisa saber de uma edição já processada: o número e a
 * **data oficial**, lida do XML. Conteúdo (quantos despachos, o que casou) não
 * entra aqui de propósito — a tela de revistas é catálogo e download, e estado de
 * processamento nosso não é assunto dela.
 */
export interface EdicaoIngerida {
  numero: number;
  dataPublicacao: Date;
}

export interface RevistaCatalogo {
  numero: number;
  data: Date;
  /** `true` quando a data é o palpite semanal, porque a edição não foi processada. */
  dataEstimada: boolean;
  urlXml: string;
  urlPdf: string;
}

export interface MesRevistas {
  /** Chave estável para âncora/`key` de React: "2026-07". */
  chave: string;
  ano: number;
  /** 1-12 (não o 0-11 do `Date`) — este número é exibido e comparado, não passado a `Date`. */
  mes: number;
  rotulo: string;
  revistas: RevistaCatalogo[];
}

export interface AnoRevistas {
  ano: number;
  /** Quantidade de revistas do ano — o "quantidade" pedido, somado dos meses. */
  total: number;
  meses: MesRevistas[];
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Monta o catálogo de `PRIMEIRA_EDICAO_2026` até a última edição conhecida.
 *
 * O intervalo é contínuo de propósito: uma edição que existe no INPI mas não está
 * no banco aparece na tela como "não ingerida" em vez de simplesmente sumir. Buraco
 * silencioso no histórico é o modo de falha a evitar aqui — o usuário confiaria num
 * mês que na verdade não foi processado.
 */
export function montarCatalogo(
  ingeridas: EdicaoIngerida[],
  opcoes: { desde?: number; ate?: number } = {},
): RevistaCatalogo[] {
  const desde = opcoes.desde ?? PRIMEIRA_EDICAO_2026;
  const porNumero = new Map(ingeridas.map((e) => [e.numero, e]));
  const maiorIngerida = ingeridas.reduce((max, e) => Math.max(max, e.numero), 0);
  const ate = opcoes.ate ?? maiorIngerida;
  if (ate < desde) return [];

  const catalogo: RevistaCatalogo[] = [];
  for (let numero = ate; numero >= desde; numero--) {
    const e = porNumero.get(numero);
    catalogo.push({
      numero,
      data: e?.dataPublicacao ?? dataEstimada(numero),
      dataEstimada: !e,
      urlXml: urlXmlZip(numero),
      urlPdf: urlPdfMarcas(numero),
    });
  }
  return catalogo;
}

/**
 * Agrupa em ano → mês, do mais recente para o mais antigo (é a ordem em que quem
 * monitora prazo procura: a revista de agora, não a de janeiro).
 *
 * Usa os getters **UTC**: as datas são UTC-meia-noite, e ler `getMonth()` no fuso
 * de Brasília (UTC-3) jogaria a edição do dia 1º para o mês anterior.
 */
export function agruparPorAnoMes(revistas: RevistaCatalogo[]): AnoRevistas[] {
  const anos = new Map<number, Map<number, RevistaCatalogo[]>>();
  for (const r of revistas) {
    const ano = r.data.getUTCFullYear();
    const mes = r.data.getUTCMonth() + 1;
    let meses = anos.get(ano);
    if (!meses) anos.set(ano, (meses = new Map()));
    const lista = meses.get(mes);
    if (lista) lista.push(r);
    else meses.set(mes, [r]);
  }

  return [...anos.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ano, meses]) => {
      const blocos = [...meses.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([mes, lista]) => ({
          chave: `${ano}-${String(mes).padStart(2, '0')}`,
          ano,
          mes,
          rotulo: MESES[mes - 1],
          revistas: [...lista].sort((a, b) => b.numero - a.numero),
        }));
      return {
        ano,
        total: blocos.reduce((s, m) => s + m.revistas.length, 0),
        meses: blocos,
      };
    });
}

export interface FiltroRevistas {
  /** Trecho do número da edição: "2896" acha uma, "289" acha a década inteira. */
  numero?: string;
  /** Ano de publicação (4 dígitos). */
  ano?: string;
  /** Mês de publicação, 1-12. */
  mes?: string;
  /** Data exata de publicação, no formato `YYYY-MM-DD` do `<input type="date">`. */
  data?: string;
}

/** `YYYY-MM-DD` da data de publicação, sempre em UTC (ver `agruparPorAnoMes`). */
function isoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Filtra o catálogo. Os critérios se somam (E, não OU): número + mês devolve as
 * edições que satisfazem os dois. Critério vazio ou ilegível é ignorado, nunca
 * zera o resultado — filtro que esvazia a tela por causa de um espaço em branco
 * parece sistema quebrado.
 */
export function filtrarRevistas(
  revistas: RevistaCatalogo[],
  filtro: FiltroRevistas,
): RevistaCatalogo[] {
  const numero = (filtro.numero ?? '').replace(/\D/g, '');
  const ano = Number(filtro.ano);
  const mes = Number(filtro.mes);
  const data = (filtro.data ?? '').trim();

  return revistas.filter((r) => {
    if (numero && !String(r.numero).includes(numero)) return false;
    if (Number.isInteger(ano) && ano > 0 && r.data.getUTCFullYear() !== ano) return false;
    if (Number.isInteger(mes) && mes >= 1 && mes <= 12 && r.data.getUTCMonth() + 1 !== mes) {
      return false;
    }
    if (data && isoUtc(r.data) !== data) return false;
    return true;
  });
}

/** Anos presentes no catálogo, do mais recente ao mais antigo — opções do filtro. */
export function anosDoCatalogo(revistas: RevistaCatalogo[]): number[] {
  return [...new Set(revistas.map((r) => r.data.getUTCFullYear()))].sort((a, b) => b - a);
}

/** Rótulo do mês 1-12 ("janeiro"…). Fora do intervalo devolve string vazia. */
export function rotuloMes(mes: number): string {
  return MESES[mes - 1] ?? '';
}

/**
 * Edições que faltam ingerir no intervalo — o que o `--backfill` percorre.
 * Devolve em ordem crescente: processar do mais antigo para o mais novo mantém o
 * histórico coerente se a rodada for interrompida no meio.
 */
export function edicoesFaltantes(
  ingeridas: number[],
  desde: number,
  ate: number,
): number[] {
  const existe = new Set(ingeridas);
  const faltam: number[] = [];
  for (let n = desde; n <= ate; n++) if (!existe.has(n)) faltam.push(n);
  return faltam;
}
