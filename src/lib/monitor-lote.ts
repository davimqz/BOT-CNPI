// Ação em lote da busca por titular (Fase 3): adicionar/remover do monitor os
// processos selecionados na tela. Validação e normalização puras, separadas da
// rota (/api/marcas/lote) para serem testáveis sem banco.

export interface ItemLote {
  processo: string;
  nome: string | null;
  classeNcl: string | null;
}

/**
 * Extrai a classe NCL (1-45) da célula "Classe" da tabela do pePI.
 * O formato usual é "NCL(12) 35" — o número entre parênteses é a EDIÇÃO da
 * classificação de Nice, não a classe; a classe vem depois. Registros antigos
 * podem trazer só o número ("35" / "03"). Célula vazia ou irreconhecível vira
 * null (a classe é opcional na marca monitorada).
 */
export function extrairClasseNcl(celula: string | null | undefined): string | null {
  if (!celula) return null;
  const ncl = /NCL\s*\(\s*\d+\s*\)\s*:?\s*(\d{1,2})/i.exec(celula);
  const solto = ncl ?? /(?<!\d)(\d{1,2})(?!\d)/.exec(celula);
  if (!solto) return null;
  const n = Number(solto[1]);
  return n >= 1 && n <= 45 ? String(n) : null;
}

/**
 * Valida a lista de linhas selecionadas enviada pela tela de busca — cada uma
 * no formato do resultado do pePI (`processo`, `marca`, `classe`). Duplicatas
 * de processo são colapsadas; processo mal formado invalida o lote inteiro
 * (indica bug na tela, não erro de digitação do usuário).
 */
export function validarItensLote(bruto: unknown): { erro: string } | { itens: ItemLote[] } {
  if (!Array.isArray(bruto) || bruto.length === 0) {
    return { erro: 'Selecione ao menos um processo' };
  }
  if (bruto.length > 1000) {
    return { erro: 'Máximo de 1000 processos por lote' };
  }
  const itens: ItemLote[] = [];
  const vistos = new Set<string>();
  for (const b of bruto) {
    const o = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>;
    const processo = typeof o.processo === 'string' ? o.processo.trim() : '';
    if (!/^\d{6,12}$/.test(processo)) {
      return { erro: `Nº de processo inválido no lote: "${String(o.processo ?? '')}"` };
    }
    if (vistos.has(processo)) continue;
    vistos.add(processo);
    const nome = typeof o.marca === 'string' && o.marca.trim() ? o.marca.trim() : null;
    itens.push({
      processo,
      nome,
      classeNcl: extrairClasseNcl(typeof o.classe === 'string' ? o.classe : null),
    });
  }
  return { itens };
}
