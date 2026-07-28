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

  /**
   * Página de entrada. O acesso anônimo é o link "Continuar...." (estabelece a
   * sessão). Gotcha (28/07/2026): o link tem target="_blank" — o login acontece
   * numa aba nova; a navegação seguinte deve continuar NESSA aba, senão a sessão
   * não está autenticada e todo JSP devolve a tela de login.
   */
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

  /**
   * Busca por titular/depositante — confirmada ao vivo em 28/07/2026
   * (explore-titular.ts). Fluxo em DUAS etapas:
   *   1. o formulário (Action=searchNome) devolve uma lista de NOMES de titular
   *      que contêm o termo — links "Action=searchMarca&tipoPesquisa=BY_CNPJ_NOME&pos=N";
   *   2. clicar num nome devolve a lista de PROCESSOS daquele titular, na MESMA
   *      estrutura de tabela/paginação da busca por marca (resultados.*).
   * Gotchas confirmados:
   *   - O casamento do nome é por substring, mas SENSÍVEL A ACENTO: "COSMETICOS"
   *     não encontra "COSMÉTICOS". Buscar por um pedaço sem acento do nome.
   *   - `pos=N` é estado de sessão (posição na lista da busca corrente), não um
   *     identificador estável — só vale dentro da mesma sessão/busca.
   *   - O campo de CPF/CNPJ aceita só dígitos (onkeyup remove o resto).
   */
  buscaPorTitular: {
    url: '/pePI/jsp/marcas/Pesquisa_titular.jsp',
    form: 'form[name="F_Pesquisa_Titular"]', // action: /pePI/servlet/MarcasServletController (Action=searchNome)
    campoCpfCnpj: 'input[name="cpf_cgc_numINPI"]',
    campoNome: 'input[name="nomeTitular"]',
    /** select de resultados por página (lista de nomes): 20 (padrão), 40, 60, 80, 100. */
    selectPorPagina: 'select[name="registerPerPage"]',
    botaoPesquisar: 'input[type="submit"][name="botao"]',
    /** Um link por titular encontrado na lista de nomes (etapa 1). */
    linkTitular: 'a[href*="Action=searchMarca"][href*="tipoPesquisa=BY_CNPJ_NOME"]',
    /** Paginação da lista de NOMES (a de processos usa resultados.linkPagina). */
    linkPaginaNomes: (n: number) => `a[href*="Action=nextPageNome"][href*="page=${n}"]`,
    /** Texto exibido quando nenhum titular casa com o termo. */
    textoNenhumTitular: 'text=Nenhum Nome de Titular foi encontrado',
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
