/**
 * Seletores e rotas confirmados do pePI (INPI).
 *
 * Confirmados ao vivo em 28/07/2026 via sessão exploratória (explore.ts).
 * Se o teste de sanidade do workflow falhar, comece a investigação por aqui:
 * este módulo é o único lugar do código que conhece a estrutura do site.
 *
 * Gotcha de 28/07/2026: o host documentado historicamente (gru.inpi.gov.br)
 * passou a responder 404 em todas as rotas do pePI; quem serve o sistema é
 * busca.inpi.gov.br. Se ambos falharem, confira se o INPI publicou novo endereço.
 */

export const PEPI = {
  baseUrl: 'https://busca.inpi.gov.br',

  /** Página de entrada. O acesso anônimo é o link "Continuar...." (estabelece a sessão). */
  entrada: {
    url: '/pePI/',
    linkAcessoAnonimo: 'a[href*="LoginController?action=login"]', // texto visível: "Continuar...."
  },

  /**
   * Busca por NOME de marca (Radical/Exata) — apesar do nome do JSP falar em
   * "classe", esta é a tela de busca por expressão de marca com filtro de classe.
   */
  buscaPorMarca: {
    url: '/pePI/jsp/marcas/Pesquisa_classe_basica.jsp',
    form: 'form[name="F_Pesquisa_Classe_Basica"]', // action: /pePI/servlet/MarcasServletController
    campoMarca: 'input[name="marca"]',
    campoClasseNcl: 'input[name="classeInter"]',
    /** radio: value "sim" = busca Exata, "nao" = Radical. */
    radioBuscaExata: (exata: boolean) => `input[name="buscaExata"][value="${exata ? 'sim' : 'nao'}"]`,
    /** select de resultados por página: 20 (padrão), 40, 60, 80, 100. */
    selectPorPagina: 'select[name="registerPerPage"]',
    botaoPesquisar: 'input[type="submit"][name="botao"]',
  },

  /** Busca por número de processo/GRU/protocolo. */
  buscaPorProcesso: {
    url: '/pePI/jsp/marcas/Pesquisa_num_processo.jsp',
    form: 'form[name="F_Pesquisa_Num_Processo"]',
    campoNumPedido: 'input[name="NumPedido"]',
    botaoPesquisar: 'input[type="submit"][name="botao"]',
  },

  /** Busca por titular/depositante — página existe, formulário ainda NÃO inventariado (Fase 3). */
  buscaPorTitular: {
    url: '/pePI/jsp/marcas/Pesquisa_titular.jsp',
  },

  resultados: {
    /**
     * A página de resultado tem 3 <table>; a de dados é a que contém o header
     * "Número | Prioridade | Marca | Situação | Titular | Classe". Selecionar
     * pela âncora de detalhe é mais resiliente que por posição.
     */
    tabela: 'table:has(a[href*="Action=detail"])',
    /** Cada resultado tem link de detalhe: MarcasServletController?Action=detail&CodPedido=N */
    linkDetalhe: 'a[href*="Action=detail"]',
    colunas: ['numero', 'prioridade', '', 'marca', '', 'situacao', 'titular', 'classe'] as const,
    /**
     * Paginação server-side por sessão: links "?Action=nextPageMarca&page=N".
     * A página N só existe dentro da MESMA sessão que fez a busca — não é URL
     * estável; navegar exige manter o contexto do browser aberto.
     */
    linkPagina: (n: number) => `a[href*="Action=nextPageMarca"][href*="page=${n}"]`,
    linksPaginacao: 'a[href*="Action=nextPageMarca"]',
  },
} as const;
