// Job de verificação (Fase 3): cruza despachos recém-ingeridos contra as marcas
// monitoradas e decide quais geram alerta. Lógica pura, sem banco, para ser
// testável — quem persiste é src/workers/rpi/ingest.ts (fonte rpi) e
// src/workers/pepi/monitor.ts (fonte scraping).
//
// Casamento por SIMILARIDADE (marca parecida) é a Fase 4 e não entra aqui: este
// módulo só faz casamento exato por processo ou por nome normalizado.

import { despachoDisparaAlerta } from './eventos-alerta';

/** Código sintético dos despachos criados a partir do pePI (não é código do INPI). */
export const CODIGO_DESPACHO_PEPI = 'PEPI-SITUACAO';

export interface MarcaParaCruzamento {
  id: string;
  nome: string;
  processo: string | null;
  classeNcl: string | null;
  eventosAlerta: string[];
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
}

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
 * Uma marca CADASTRADA COM PROCESSO casa só pelo número — é o critério mais
 * preciso, e o nome publicado na RPI pode divergir do que o usuário digitou.
 * Sem processo, casa pelo nome normalizado; a classe NCL da marca, quando
 * preenchida, funciona como filtro (despacho sem classe não é descartado, para
 * não perder movimentação por dado ausente na revista).
 */
export function casaComMarca(marca: MarcaParaCruzamento, despacho: DespachoParaCruzamento): boolean {
  if (marca.processo) {
    return normalizarProcesso(marca.processo) === normalizarProcesso(despacho.processo);
  }
  const nome = normalizarNomeMarca(marca.nome);
  if (!nome || nome !== normalizarNomeMarca(despacho.nomeMarca)) return false;
  if (!marca.classeNcl) return true;
  const doDespacho = classesDe(despacho.classeNcl);
  if (doDespacho.length === 0) return true;
  return doDespacho.includes(classesDe(marca.classeNcl)[0] ?? '');
}

/**
 * Cruza a edição inteira contra as marcas monitoradas. Um despacho só pode
 * apontar para uma marca (`despachos.marca_id` é FK única), então o primeiro
 * casamento vence — passe as marcas na ordem de preferência (mais antigas
 * primeiro) para que o resultado seja estável entre execuções.
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
  for (const despacho of despachos) {
    const candidatas = [
      ...(porProcesso.get(normalizarProcesso(despacho.processo)) ?? []),
      ...porNome,
    ];
    const marca = candidatas.find((m) => casaComMarca(m, despacho));
    if (!marca) continue;
    cruzamentos.push({
      despachoId: despacho.id,
      marcaId: marca.id,
      alerta: despachoDisparaAlerta(marca.eventosAlerta, despacho.codigo),
    });
  }
  return cruzamentos;
}
