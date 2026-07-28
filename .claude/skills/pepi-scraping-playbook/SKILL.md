---
name: pepi-scraping-playbook
description: Use this skill whenever implementing, debugging, or discussing live/on-demand searches against the INPI's pePI system (busca.inpi.gov.br/pePI) — the "Radical/Exata" instant brand search, "busca por depositante/titular", or any feature that opens a real browser to query INPI in real time. Trigger for tasks involving Playwright/Selenium browser automation against a government site, session handling, pagination scraping, or when the user asks to "consultar o pePI", "buscar marca em tempo real", "buscar por titular/CNPJ", even without naming this skill.
---

# Playbook de automação do pePI

## Por que isso existe — leia antes de escrever qualquer código de scraping

Diferente da ingestão da RPI (veja a skill `rpi-ingestion-despachos`), **não existe API pública documentada do INPI para consulta de processo por processo em tempo real**. O único caminho oficial de acesso é a busca logada da base de marcas em `https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_num_processo.jsp`, feita por navegador. (Atenção: o host `gru.inpi.gov.br`, documentado em versões antigas deste playbook, passou a responder 404 em todas as rotas do pePI — confirmado em 28/07/2026; quem serve o sistema é `busca.inpi.gov.br`.) Isso significa que qualquer funcionalidade de consulta instantânea (busca por nome/processo, busca por depositante/titular) depende de automação de interface — não de uma chamada de API estável.

**Trate esse componente como o elo mais frágil do sistema, não como a base dele.** Sempre que uma funcionalidade puder ser resolvida com os dados já ingeridos da RPI (ver skill `rpi-ingestion-despachos`) em vez de uma consulta ao vivo, prefira a RPI — é mais lenta para refletir mudanças (só atualiza semanalmente) mas muito mais estável e não depende de simular um navegador.

## Riscos a ter em mente durante o design (não só na implementação)

- **Fragilidade de layout**: o site pode mudar HTML/seletores sem aviso. Escreva seletores resilientes (por texto visível, `role`, `aria-label`, ou atributos estáveis) em vez de seletores posicionais/CSS frágeis, e centralize os seletores em um único módulo para que uma mudança no site exija editar um lugar só.
- **Bloqueio por uso automatizado**: volumes altos de consulta em pouco tempo são o padrão mais fácil de detectar e bloquear. Nunca rode consultas em paralelo agressivo contra o pePI — use uma fila serializada com espaçamento entre requisições (rate limiting), mesmo que isso deixe o monitoramento mais lento.
- **Considerações de termos de uso**: consultar esse sistema de forma automatizada e em volume pode não estar alinhado com os termos de uso do site do INPI. Isso não é um bloqueio técnico, mas é algo que quem for operar o produto comercialmente deve avaliar conscientemente — não trate como um detalhe a ignorar.
- **Sessão e possíveis mecanismos anti-bot**: a "busca logada" pode envolver sessão/cookies e, potencialmente, captcha ou outras barreiras. Não assuma que um fluxo simples de "abrir página → preencher campo → clicar" sempre funciona sem verificação humana ocasional.

## Arquitetura recomendada

- Use **Playwright** (não Selenium) — mais moderno, mais estável para esse tipo de automação, e com melhor suporte a espera implícita por elementos.
- Rode o worker de scraping como **processo isolado**, nunca dentro do mesmo processo da API principal — um Chrome headless travando ou consumindo memória não pode derrubar o resto do sistema.
- Enfileire as consultas (BullMQ/Redis ou equivalente) com **um único worker consumindo por vez** (concorrência = 1 ou muito baixa) para naturalmente respeitar o rate limit.
- Registre um log estruturado de cada etapa da automação (acessando site → preenchendo busca → extraindo resultados → concluído/erro) — o software de referência faz exatamente isso, e é o que dá visibilidade de que a automação não travou silenciosamente.
- Trate timeout e falha de elemento não encontrado como sinal de "o site provavelmente mudou" — não como erro genérico a ser silenciosamente re-tentado para sempre. Alerte um humano depois de N falhas consecutivas.

## Antes de escrever os seletores de verdade

Não invente seletores de memória — a estrutura real da página só pode ser confirmada inspecionando o site ao vivo (ex: com o Playwright em modo não-headless, ou via `page.content()` salvo para análise). Ao implementar:

1. Rode uma sessão exploratória manual (ou com `codegen` do Playwright) contra `busca.inpi.gov.br/pePI` para mapear os seletores reais de: campo de busca, tipo de busca (Radical/Exata), paginação de resultados, e estrutura da tabela de resultados. **Feito em 28/07/2026** — resultado consolidado em `src/workers/pepi/selectors.ts` (busca por nome fica em `Pesquisa_classe_basica.jsp`, radio `buscaExata` sim/não, resultados com paginação server-side por sessão via `Action=nextPageMarca`; a sessão anônima é criada pelo link "Continuar...." da página de entrada).
2. Documente os seletores encontrados em um módulo próprio (ex: `pepi-selectors.ts`), com comentário da data em que foram confirmados — isso ajuda a saber rapidamente se algo quebrou por mudança recente do site.
3. Escreva um teste de "sanidade" que roda a consulta mais simples possível (uma marca conhecida, tipo Exata) e falha alto e claro se a estrutura esperada não for encontrada — isso vira seu alarme de "o site mudou". **Feito em 28/07/2026** — `npm run sanity:pepi` (`src/workers/pepi/sanity.ts`), roda como passo do workflow `pepi-search.yml` antes de cada busca real.

### Gotchas confirmados ao vivo (28/07/2026)

- **O login anônimo abre uma ABA NOVA**: o link "Continuar...." tem `target="_blank"`. O `LoginController?action=login` roda na aba nova (mesmos cookies de contexto) — a automação precisa capturar essa aba (`context.waitForEvent('page')`) e continuar a navegação NELA. Se continuar na aba original, a sessão não está autenticada e qualquer JSP devolve a tela de login (`F_LoginCliente`) em vez do formulário de busca.
- **Consultas podem passar de 30s — e MUITO**: a primeira busca de uma sessão levou 20-40s pela manhã e **150s** à tarde do mesmo dia, para o mesmo processo, com as páginas estáticas respondendo em ~1s o tempo todo. Ou seja: página abrir rápido não diz nada sobre a consulta responder rápido, e um timeout de 120s dá falso "o site caiu". `TIMEOUT_CONSULTA_MS` está em 240s na submissão do formulário e nos cliques de paginação — esperar custa tempo de runner, desistir cedo custa a rodada inteira de monitoramento.

### Busca por titular/depositante — fluxo confirmado ao vivo (28/07/2026)

A busca por titular (`Pesquisa_titular.jsp`, form `F_Pesquisa_Titular`) é um fluxo de **duas etapas**, diferente da busca por marca:

1. O submit (`Action=searchNome`, `tipoPesquisa=BY_CNPJ_NOME`) devolve uma lista de **NOMES de titular** que contêm o termo — um link por nome (`Action=searchMarca&pos=N`), paginada por `Action=nextPageNome&page=N` (até 100/página).
2. Clicar num nome devolve a lista de **PROCESSOS** daquele titular, na mesma estrutura de tabela e paginação (`Action=nextPageMarca`) da busca por marca — a extração é reaproveitada.

Gotchas específicos:

- **O casamento do nome é por substring mas SENSÍVEL A ACENTO**: "NATURA COSMETICOS" NÃO encontra "NATURA COSMÉTICOS S/A". Oriente o usuário a buscar um pedaço sem palavras acentuadas, ou pelo CPF/CNPJ.
- **`pos=N` é estado de sessão**, não identificador estável: só vale dentro da busca de nomes corrente. Nunca guarde o href para usar depois — para abrir outro nome da mesma busca, refaça a busca e clique de novo.
- **A mesma razão social pode ter VÁRIOS cadastros na base** (visto: 3× "NATURAFRIG ALIMENTOS LTDA", alguns exibidos entre apóstrofos). Cada cadastro pode ter processos próprios — colete a UNIÃO dos processos de todos os cadastros com o nome exato (deduplicando por nº de processo), senão o resultado fica silenciosamente incompleto.
- **O campo de CPF/CNPJ (`cpf_cgc_numINPI`) aceita só dígitos** (um `onkeyup` remove o resto) — envie 11 ou 14 dígitos, sem pontuação.
- Quando nada casa, a resposta é a frase "Nenhum Nome de Titular foi encontrado" (sem tabela) — trate como zero resultados, não como mudança de layout.

Implementação de referência: `src/workers/pepi/search.ts` (tipo `titular`) + `src/workers/pepi/selectors.ts` (`PEPI.buscaPorTitular`); exploração em `src/workers/pepi/explore-titular.ts`.

### Monitoramento recorrente por scraping (não é o mesmo problema que a busca sob demanda)

A busca sob demanda responde "como está agora"; o monitoramento precisa responder "o que MUDOU desde a última vez" — e o pePI não publica eventos, só estado. Por isso o monitor (`src/workers/pepi/monitor.ts`, workflow `pepi-monitor.yml`) guarda um retrato `processo → situação` por marca (`marcas_monitoradas.ultimo_snapshot_pepi`) e trata a diferença entre retratos como movimentação. Armadilhas que esse desenho precisa cobrir — todas viram alerta falso se ignoradas:

- **Primeira verificação nunca alerta**: sem retrato anterior, todo o estado atual do INPI viraria "novidade" no primeiro dia. A primeira rodada só grava a linha de base.
- **Resultado truncado no teto de páginas não é "processo sumiu"**: mescle o retrato lido por cima do anterior, senão o que faltou volta como "processo novo" na rodada seguinte.
- **Zero resultados onde antes havia processos é resposta suspeita, não mudança**: sessão perdida ou resposta parcial do pePI se parecem com "a marca sumiu". O monitor trata isso como erro e preserva o retrato bom.
- **Sumiço de processo não gera alerta** (só processo novo ou situação alterada) — é o sintoma mais comum de instabilidade, e alertar sobre ele produz ruído recorrente.
- **Uma consulta pode levar minutos**: o teto de marcas por rodada não basta para a rodada terminar; use também um orçamento de tempo, processando da marca mais desatualizada para a mais recente, para a fila girar entre os dias em vez de a rodada morrer no timeout do runner.
- O despacho gerado usa o código sintético `PEPI-SITUACAO` (`src/lib/verificacao.ts`), que **não existe na tabela de códigos do INPI** — isso é de propósito: mantém esses registros fora do cálculo de prazos legais (Fase 5), que só pode se basear em código oficial confirmado.

## Funcionalidades que dependem deste playbook

- Consulta instantânea por nome/processo (Radical/Exata, com filtro de classe NCL)
- Geração do relatório "Consultor de Marca" a partir do resultado ao vivo
- Busca por depositante/titular (nome/razão social ou CPF/CNPJ), incluindo paginação multi-página
- Monitoramento configurado para "com scraping no site" (em vez de "apenas Revista RPI")
