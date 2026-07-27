---
name: pepi-scraping-playbook
description: Use this skill whenever implementing, debugging, or discussing live/on-demand searches against the INPI's pePI system (gru.inpi.gov.br/pePI) — the "Radical/Exata" instant brand search, "busca por depositante/titular", or any feature that opens a real browser to query INPI in real time. Trigger for tasks involving Playwright/Selenium browser automation against a government site, session handling, pagination scraping, or when the user asks to "consultar o pePI", "buscar marca em tempo real", "buscar por titular/CNPJ", even without naming this skill.
---

# Playbook de automação do pePI

## Por que isso existe — leia antes de escrever qualquer código de scraping

Diferente da ingestão da RPI (veja a skill `rpi-ingestion-despachos`), **não existe API pública documentada do INPI para consulta de processo por processo em tempo real**. O único caminho oficial de acesso é a busca logada da base de marcas em `https://gru.inpi.gov.br/pePI/jsp/marcas/Pesquisa_num_processo.jsp`, feita por navegador. Isso significa que qualquer funcionalidade de consulta instantânea (busca por nome/processo, busca por depositante/titular) depende de automação de interface — não de uma chamada de API estável.

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

1. Rode uma sessão exploratória manual (ou com `codegen` do Playwright) contra `gru.inpi.gov.br/pePI` para mapear os seletores reais de: campo de busca, tipo de busca (Radical/Exata), paginação de resultados, e estrutura da tabela de resultados.
2. Documente os seletores encontrados em um módulo próprio (ex: `pepi-selectors.ts`), com comentário da data em que foram confirmados — isso ajuda a saber rapidamente se algo quebrou por mudança recente do site.
3. Escreva um teste de "sanidade" que roda a consulta mais simples possível (uma marca conhecida, tipo Exata) e falha alto e claro se a estrutura esperada não for encontrada — isso vira seu alarme de "o site mudou".

## Funcionalidades que dependem deste playbook

- Consulta instantânea por nome/processo (Radical/Exata, com filtro de classe NCL)
- Geração do relatório "Consultor de Marca" a partir do resultado ao vivo
- Busca por depositante/titular (nome/razão social ou CPF/CNPJ), incluindo paginação multi-página
- Monitoramento configurado para "com scraping no site" (em vez de "apenas Revista RPI")
