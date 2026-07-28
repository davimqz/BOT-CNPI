// Job de verificação (Fase 3): cruza despachos recém-ingeridos contra as marcas
// monitoradas e decide quais geram alerta. Lógica pura, sem banco, para ser
// testável — quem persiste é src/workers/rpi/ingest.ts (fonte rpi) e
// src/workers/pepi/monitor.ts (fonte scraping).
//
// Duas formas de casar, nesta ordem de precedência (Fase 4):
// 1. EXATO — nº de processo, ou nome normalizado + classe NCL. É a movimentação
//    da própria marca do usuário.
// 2. SIMILARIDADE — só para marcas com `similaridadeAtiva`: nome de TERCEIRO
//    parecido o suficiente com o da marca monitorada (colidência). É o motor da
//    skill phonetic-ptbr-matching, e nunca rouba um despacho que já casou exato.

import { despachoDisparaAlerta } from './eventos-alerta';
import { compararMarcas, thresholdDaMarca } from './similaridade';

/** Código sintético dos despachos criados a partir do pePI (não é código do INPI). */
export const CODIGO_DESPACHO_PEPI = 'PEPI-SITUACAO';

export interface MarcaParaCruzamento {
  id: string;
  nome: string;
  processo: string | null;
  classeNcl: string | null;
  eventosAlerta: string[];
  /** Fase 4 — quando falso (padrão), só há casamento exato para esta marca. */
  similaridadeAtiva?: boolean;
  /** Percentual 0-100; nulo cai no padrão de `similaridade.ts`. */
  similaridadeThreshold?: number | null;
}

export interface DespachoParaCruzamento {
  id: string;
  processo: string;
  nomeMarca: string | null;
  classeNcl: string | null;
  codigo: string;
}

export interface Cruzamento {
  despachoId: string;
  marcaId: string;
  alerta: boolean;
  /**
   * Como o despacho chegou até esta marca. `similaridade` significa marca de
   * TERCEIRO parecida com a monitorada — a notificação da Fase 6 precisa dizer
   * isso ao usuário, senão ele lê uma colidência como movimentação própria.
   */
  motivo: MotivoCruzamento;
  /** Percentual de similaridade; só presente quando `motivo` é `similaridade`. */
  score?: number;
}

export type MotivoCruzamento = 'processo' | 'nome' | 'similaridade';

/** Só dígitos, sem zeros à esquerda — o pePI e a RPI formatam o nº de formas diferentes. */
export function normalizarProcesso(valor: string | null | undefined): string {
  const digitos = (valor ?? '').replace(/\D/g, '');
  return digitos.replace(/^0+/, '');
}

/**
 * Maiúsculas, sem acento e SEM espaço/pontuação: o mesmo nome aparece escrito de
 * formas diferentes no cadastro do usuário e na RPI ("COCA-COLA" / "COCA COLA",
 * "MC DONALD'S" / "MCDONALDS"), e essas diferenças de formatação não podem fazer
 * o monitoramento perder uma publicação. Nomes só *parecidos* continuam de fora —
 * isso é o motor de similaridade da Fase 4.
 */
export function normalizarNomeMarca(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

/**
 * A RPI traz as classes de um processo numa string só ("35" ou "35;41"); a marca
 * monitorada guarda uma classe só. Normaliza os dois lados para comparar.
 */
export function classesDe(valor: string | null | undefined): string[] {
  return (valor ?? '')
    .split(/[;,]/)
    .map((c) => c.replace(/\D/g, '').replace(/^0+/, ''))
    .filter(Boolean);
}

/**
 * A classe NCL da marca, quando preenchida, funciona como filtro — despacho sem
 * classe não é descartado, para não perder movimentação por dado ausente na
 * revista.
 */
function classeCompativel(marca: MarcaParaCruzamento, despacho: DespachoParaCruzamento): boolean {
  if (!marca.classeNcl) return true;
  const doDespacho = classesDe(despacho.classeNcl);
  if (doDespacho.length === 0) return true;
  return doDespacho.includes(classesDe(marca.classeNcl)[0] ?? '');
}

/**
 * Uma marca CADASTRADA COM PROCESSO casa só pelo número — é o critério mais
 * preciso, e o nome publicado na RPI pode divergir do que o usuário digitou.
 * Sem processo, casa pelo nome normalizado, filtrado pela classe NCL.
 */
export function casaComMarca(marca: MarcaParaCruzamento, despacho: DespachoParaCruzamento): boolean {
  if (marca.processo) {
    return normalizarProcesso(marca.processo) === normalizarProcesso(despacho.processo);
  }
  const nome = normalizarNomeMarca(marca.nome);
  if (!nome || nome !== normalizarNomeMarca(despacho.nomeMarca)) return false;
  return classeCompativel(marca, despacho);
}

/**
 * Casamento por similaridade (Fase 4): o nome publicado é parecido o suficiente
 * com o da marca monitorada, no threshold dela. Vale só quando a marca tem
 * similaridade ligada, e a classe NCL continua filtrando — colidência é um
 * conflito dentro do mesmo ramo de atividade, não entre classes distintas.
 */
export function casaPorSimilaridade(
  marca: MarcaParaCruzamento,
  despacho: DespachoParaCruzamento,
): { casa: boolean; score: number } {
  if (!marca.similaridadeAtiva || !despacho.nomeMarca) return { casa: false, score: 0 };
  if (!classeCompativel(marca, despacho)) return { casa: false, score: 0 };
  const r = compararMarcas(marca.nome, despacho.nomeMarca, thresholdDaMarca(marca.similaridadeThreshold));
  return { casa: r.parecidas, score: r.score };
}

/**
 * Cruza a edição inteira contra as marcas monitoradas. Um despacho só pode
 * apontar para uma marca (`despachos.marca_id` é FK única), então o primeiro
 * casamento vence — passe as marcas na ordem de preferência (mais antigas
 * primeiro) para que o resultado seja estável entre execuções.
 *
 * Duas passadas: TODO casamento exato é resolvido antes de qualquer comparação
 * por similaridade. Sem isso, uma marca com similaridade ligada poderia capturar
 * o despacho da marca de outra pessoa (ou o próprio, como se fosse colidência)
 * só por vir antes na lista.
 */
export function cruzarDespachos(
  marcas: MarcaParaCruzamento[],
  despachos: DespachoParaCruzamento[],
): Cruzamento[] {
  if (marcas.length === 0) return [];

  // Índice por processo para não varrer todas as marcas em cada um dos ~50 mil
  // despachos de uma edição; as marcas sem processo sobram para a busca por nome.
  const porProcesso = new Map<string, MarcaParaCruzamento[]>();
  const porNome: MarcaParaCruzamento[] = [];
  for (const marca of marcas) {
    if (marca.processo) {
      const chave = normalizarProcesso(marca.processo);
      const lista = porProcesso.get(chave);
      if (lista) lista.push(marca);
      else porProcesso.set(chave, [marca]);
    } else {
      porNome.push(marca);
    }
  }

  const cruzamentos: Cruzamento[] = [];
  const sobraram: DespachoParaCruzamento[] = [];
  for (const despacho of despachos) {
    const candidatas = [
      ...(porProcesso.get(normalizarProcesso(despacho.processo)) ?? []),
      ...porNome,
    ];
    const marca = candidatas.find((m) => casaComMarca(m, despacho));
    if (!marca) {
      sobraram.push(despacho);
      continue;
    }
    cruzamentos.push({
      despachoId: despacho.id,
      marcaId: marca.id,
      alerta: despachoDisparaAlerta(marca.eventosAlerta, despacho.codigo),
      motivo: marca.processo ? 'processo' : 'nome',
    });
  }

  const comSimilaridade = marcas.filter((m) => m.similaridadeAtiva);
  if (comSimilaridade.length === 0) return cruzamentos;

  // Cache por nome publicado: dentro de uma edição o mesmo nome se repete muito
  // (um processo costuma ter vários despachos), e comparar é bem mais caro que
  // olhar um Map.
  const cache = new Map<string, { marca: MarcaParaCruzamento; score: number } | null>();
  for (const despacho of sobraram) {
    const chave = `${despacho.nomeMarca ?? ''}|${despacho.classeNcl ?? ''}`;
    let achado = cache.get(chave);
    if (achado === undefined) {
      achado = null;
      // Vence a de MAIOR score, não a primeira: com várias marcas parecidas
      // entre si, a mais próxima é a dona legítima do alerta.
      for (const marca of comSimilaridade) {
        const r = casaPorSimilaridade(marca, despacho);
        if (r.casa && (!achado || r.score > achado.score)) achado = { marca, score: r.score };
      }
      cache.set(chave, achado);
    }
    if (!achado) continue;
    cruzamentos.push({
      despachoId: despacho.id,
      marcaId: achado.marca.id,
      alerta: despachoDisparaAlerta(achado.marca.eventosAlerta, despacho.codigo),
      motivo: 'similaridade',
      score: achado.score,
    });
  }
  return cruzamentos;
}
