// Interpretação do termo da busca por depositante/titular (Fase 3), compartilhada
// entre a validação da API (POST /api/busca) e o worker (src/workers/pepi/search.ts):
// o formulário do pePI tem DOIS campos (CPF/CNPJ só-dígitos OU nome/razão social),
// e a decisão de qual preencher precisa ser a mesma nos dois lados.

export type TermoTitular =
  | { campo: 'cpfCnpj'; valor: string }
  | { campo: 'nome'; valor: string }
  | { erro: string };

/**
 * Um termo "só documento" (dígitos com pontuação usual de CPF/CNPJ) vai para o
 * campo cpf_cgc_numINPI, com exatamente 11 (CPF) ou 14 (CNPJ) dígitos.
 * Qualquer outro termo é tratado como nome/razão social (mínimo 3 caracteres).
 * Nome pode conter dígitos ("100% NATURAL..."), então só cai no ramo de documento
 * quando NÃO sobra nenhuma letra após remover a pontuação.
 */
export function interpretarTermoTitular(termoBruto: string): TermoTitular {
  const termo = termoBruto.trim().replace(/\s+/g, ' ');
  const soDigitos = termo.replace(/[.\-/\s]/g, '');
  if (/^\d+$/.test(soDigitos)) {
    if (soDigitos.length !== 11 && soDigitos.length !== 14) {
      return {
        erro: `CPF/CNPJ deve ter 11 ou 14 dígitos (recebido: ${soDigitos.length}). Para razão social com números, inclua alguma letra do nome.`,
      };
    }
    return { campo: 'cpfCnpj', valor: soDigitos };
  }
  if (termo.length < 3) {
    return { erro: 'Informe pelo menos 3 caracteres do nome/razão social do titular' };
  }
  return { campo: 'nome', valor: termo };
}

/**
 * Compara um nome de titular vindo da lista do pePI com o termo buscado, para
 * decidir se dá para abrir os processos direto sem pedir escolha ao usuário.
 * A lista do pePI exibe alguns nomes entre apóstrofos e com espaçamento irregular;
 * a comparação ignora isso e diferenças de caixa — mas NÃO ignora acentos, porque
 * o próprio pePI é sensível a acento e dois titulares podem diferir só nisso.
 */
export function nomeTitularConfere(nomeDaLista: string, termo: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').toUpperCase();
  return norm(nomeDaLista) === norm(termo);
}
