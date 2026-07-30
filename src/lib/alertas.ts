/**
 * Fila de alertas (Fase 6): transforma os despachos com `alerta_pendente = true`
 * — enfileirados pelo cruzamento das Fases 3/4 — nos e-mails que serão enviados.
 *
 * Lógica pura, sem banco, para ser testável; quem lê e quem grava é
 * src/workers/alertas/enviar.ts.
 *
 * Duas decisões de agrupamento, ambas sobre o que o usuário lê no assunto:
 *
 * 1. UM E-MAIL POR MARCA, não por despacho. Uma edição da RPI publica vários
 *    despachos do mesmo processo; um e-mail por linha transforma o alerta em
 *    ruído, e ruído é ignorado.
 * 2. COLIDÊNCIA NUNCA VIAJA JUNTO com movimentação própria, mesmo sendo a mesma
 *    marca monitorada. São fatos de natureza diferente (o processo do usuário
 *    andou / apareceu marca de terceiro parecida) e o assunto do e-mail só pode
 *    afirmar um dos dois — misturar faria o assunto mentir sobre metade do
 *    conteúdo.
 */

import { motivoDoVinculo } from './verificacao';
import type { DespachoDoAlerta } from './relatorio/alerta-despacho';

export interface MarcaDoAlerta {
  id: string;
  nome: string;
  processo: string | null;
  classeNcl: string | null;
  /** Cliente vinculado, se houver; senão o dono da conta. */
  destinatario: string | null;
}

/**
 * O mínimo para decidir a que marca um despacho pertence e se é colidência.
 * Existe separado de `DespachoPendente` para o pop-up (src/lib/novidades.ts)
 * reusar este agrupamento sem carregar prazos e textos que ele não mostra — os
 * dois canais precisam concordar sobre o que conta como UM alerta.
 */
export interface DespachoVinculado {
  id: string;
  processo: string;
  nomeMarca: string | null;
  classeNcl: string | null;
  codigo: string;
  marca: MarcaDoAlerta;
}

export interface DespachoPendente extends DespachoVinculado, DespachoDoAlerta {}

export interface GrupoAlerta<T extends DespachoVinculado = DespachoPendente> {
  marca: MarcaDoAlerta;
  colidencia: boolean;
  despachos: T[];
  /** Ids da fila cobertos por este grupo — zerados só após o envio dar certo. */
  ids: string[];
}

/**
 * Colidência = o vínculo despacho→marca veio da segunda passada do cruzamento
 * (similaridade). O motivo não é persistido — é resultado do cruzamento, não
 * estado —, então é reconstruído pelo mesmo critério, como já faz a geração
 * retroativa de prazos.
 */
export function ehColidencia(despacho: DespachoVinculado): boolean {
  return (
    motivoDoVinculo(
      {
        id: despacho.marca.id,
        nome: despacho.marca.nome,
        processo: despacho.marca.processo,
        classeNcl: despacho.marca.classeNcl,
        eventosAlerta: [], // irrelevante para o motivo do vínculo.
      },
      {
        id: despacho.id,
        processo: despacho.processo,
        nomeMarca: despacho.nomeMarca,
        classeNcl: despacho.classeNcl,
        codigo: despacho.codigo,
      },
    ) === 'similaridade'
  );
}

export function agruparAlertas<T extends DespachoVinculado>(pendentes: T[]): GrupoAlerta<T>[] {
  const grupos = new Map<string, GrupoAlerta<T>>();
  for (const despacho of pendentes) {
    const colidencia = ehColidencia(despacho);
    const chave = `${despacho.marca.id}|${colidencia}`;
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.despachos.push(despacho);
      grupo.ids.push(despacho.id);
    } else {
      grupos.set(chave, {
        marca: despacho.marca,
        colidencia,
        despachos: [despacho],
        ids: [despacho.id],
      });
    }
  }
  // Movimentação própria antes de colidência: se algo falhar no meio da rodada,
  // o que ficou para trás é o alerta menos urgente.
  return [...grupos.values()].sort(
    (a, b) => Number(a.colidencia) - Number(b.colidencia) || a.marca.nome.localeCompare(b.marca.nome),
  );
}
