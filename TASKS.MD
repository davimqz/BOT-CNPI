# TASKS.md — Plano de Execução

Lista de tarefas detalhada, organizada nas mesmas 10 fases definidas no documento de especificação (`docs/especificacao-vigia-marca.docx`) e no `CLAUDE.md`. Marque cada item (`[x]`) conforme for concluído. Trabalhe as fases em ordem — cada uma depende de peças construídas na anterior. Onde uma tarefa depende de conhecimento de domínio específico, o nome da skill relevante está indicado entre colchetes.

---

## Fase 0 — Fundação

- [x] Inicializar o projeto Next.js (TypeScript, App Router).
- [x] Criar o projeto gratuito no Neon (Postgres) e configurar o Prisma apontando para ele (local pode usar Docker Compose se preferir testar offline).
- [x] Criar o schema inicial do Prisma com as 9 tabelas descritas no `CLAUDE.md` (Seção 4) — sem lógica de negócio ainda, só a estrutura.
- [x] Criar o repositório no GitHub (privado ou público — ver Seção 3.1 do CLAUDE.md sobre o efeito disso nos minutos grátis do Actions) e confirmar que os workflows-base em `.github/workflows/` aparecem na aba Actions.
- [x] Gerar um GitHub Personal Access Token com escopo `actions:write` (ou usar um `GITHUB_TOKEN` de app) para o Next.js conseguir disparar o workflow `pepi-search.yml` via `workflow_dispatch`; guardar como variável de ambiente (`GITHUB_PAT`), nunca hardcoded.
- [x] Autenticação básica de usuário único (login simples; multiusuário fica para a Fase 8).
- [x] Configurar variáveis de ambiente (`.env.example` documentando cada uma, `.env` real fora do git) — incluindo `DATABASE_URL` (Neon) e `GITHUB_PAT`.
- [x] Configurar o mesmo `DATABASE_URL` como secret do repositório no GitHub (Settings → Secrets and variables → Actions), já que os workflows também precisam gravar no Neon.
- [x] Pipeline mínimo de CI (lint + typecheck) rodando em cada commit.

**Critério de pronto**: projeto sobe localmente (`npm run dev`), banco conecta (Neon), login funciona com um usuário fixo, e os dois workflows aparecem (sem rodar ainda) na aba Actions do repositório.

---

## Fase 1 — Motor de dados RPI *(skill: `rpi-ingestion-despachos`)*

- [x] Localizar e salvar em `docs/` a versão vigente do manual oficial de layout XML da RPI Marcas.
- [x] Implementar função para determinar a edição atual/próxima (estimativa por incremento + confirmação por tentativa de download, conforme a skill).
- [x] Implementar download do ZIP de uma edição (`https://revistas.inpi.gov.br/txt/RM[N].zip`), com tratamento de 404 como "ainda não publicada" (não como erro fatal).
- [x] Implementar o parser do XML contra o schema validado no manual — começar por um subconjunto pequeno de campos (processo, marca, titular, classe NCL, código/texto de despacho) e expandir depois.
- [x] Testar o parser contra pelo menos 2 edições reais baixadas, incluindo marcas com acentuação e caracteres especiais.
- [x] Persistir cada edição processada em `edicoes_rpi` e cada despacho em `despachos`.
- [x] Preencher `references/despacho-codes.md` (dentro da skill) com os códigos reais confirmados, à medida que forem aparecendo nos dados de teste.
- [x] Implementar o script `npm run ingest:rpi` chamado pelo workflow `.github/workflows/rpi-ingestion.yml` — este arquivo já existe como esqueleto no repositório; o script é o que falta escrever.
- [x] Testar o workflow rodando manualmente pela aba Actions do GitHub (`workflow_dispatch` já está habilitado nele) antes de confiar no agendamento automático de terça-feira.
- [x] Confirmar que uma edição ainda não publicada (404 no download) faz o workflow terminar com sucesso e sem gravar nada, não falhar — o GitHub Actions vai re-rodar automaticamente na próxima janela agendada.
- [x] Construir a tela "Histórico RPI": filtro por edição, busca por campo (ex: nome da marca), tabela com edição/data/processo/marca/titular/classe/código/despacho.

**Critério de pronto**: disparar o workflow manualmente pelo GitHub processa uma edição real e ela aparece pesquisável no Histórico RPI.

---

## Fase 2 — Consulta manual *(skill: `pepi-scraping-playbook` + `branded-report-builder`)*

- [x] Sessão exploratória no pePI com Playwright para mapear os seletores reais de busca, tipo de busca (Radical/Exata) e tabela de resultados — **atenção: o host mudou de `gru.inpi.gov.br` para `busca.inpi.gov.br`** (confirmado em 28/07/2026; script exploratório em `src/workers/pepi/explore.ts`).
- [x] Documentar os seletores confirmados em um módulo próprio, com data de confirmação (`src/workers/pepi/selectors.ts`).
- [x] Implementar o script `npm run search:pepi` chamado pelo workflow `.github/workflows/pepi-search.yml` (esqueleto já no repositório) — recebe `job_id`/`termo`/`tipo_busca` como inputs do `workflow_dispatch` e grava o resultado no Postgres associado ao `job_id` (tabela nova `pepi_search_jobs`, com coluna `etapa` atualizada em tempo real para o polling; teto de 30 páginas com flag `truncado`).
- [x] Implementar, no lado do Next.js, a rota de API que: cria uma linha de "job" pendente no banco, chama a API do GitHub para disparar `pepi-search.yml` passando esse `job_id`, e retorna o `job_id` pro frontend (`POST /api/busca` + `GET /api/busca/[jobId]`; helper de dispatch em `src/lib/github.ts`).
- [x] Implementar o polling no frontend: a tela de busca consulta o status do `job_id` a cada poucos segundos até o workflow terminar e o resultado aparecer (nunca deixe o usuário sem feedback nesse intervalo — mostrar algo como "consultando o INPI..." usando o mesmo espírito do log em tempo real do software de referência).
- [ ] Implementar a tela de busca: campo nome/processo, Radical/Exata, filtro de classe NCL opcional — *parcial: `/busca` já tem nome + Radical/Exata + classe NCL; falta a busca por nº de processo (worker usaria `Pesquisa_num_processo.jsp`, já mapeado em `selectors.ts`).*
- [ ] Implementar geração do relatório "Consultor de Marca" em HTML, seguindo a estrutura confirmada na skill `branded-report-builder` (veredito, 4 contadores, tabela, disclaimer).
- [ ] Adicionar exportação para PDF do mesmo template (não duplicar o template).
- [ ] Escrever o teste de "sanidade" da skill de scraping (consulta simples, tipo Exata, marca conhecida) que falha alto e claro se a estrutura da página mudou — rodar esse teste dentro do próprio workflow antes de assumir que ele está saudável.

**Critério de pronto**: buscar uma marca real pela tela dispara o workflow, o polling mostra o resultado assim que ele termina, e o relatório sai correto em HTML e PDF.

---

## Fase 3 — Cadastro e monitoramento

- [ ] CRUD de `marcas_monitoradas`: nome, processo, classe NCL, tipo de busca, cliente vinculado (se aplicável), fonte de dados (`rpi` ou `scraping`).
- [ ] Tela de seleção de eventos que disparam alerta (lista de despachos da skill `rpi-ingestion-despachos`; "todos os eventos" como padrão se nada for marcado).
- [ ] Importação em lote: aceitar colar texto ou upload de `.txt`/`.csv`, nos 3 formatos (só número; número+nome; número+nome+classe NCL).
- [ ] Busca por depositante/titular: nome/razão social ou CPF/CNPJ, com coleta multi-página automática *(reaproveita o worker da Fase 2 — skill `pepi-scraping-playbook`)*.
- [ ] Ação de adicionar/remover em lote processos encontrados na busca por titular para o monitor.
- [ ] Job de verificação: para cada marca com fonte `rpi`, o próprio workflow `rpi-ingestion.yml` (Fase 1) já cruza contra os despachos da edição recém-processada — não precisa de um job separado. Para fonte `scraping`, criar um segundo workflow agendado (`.github/workflows/pepi-monitor.yml`, ex: diário) que roda a mesma lógica do `pepi-search.yml` para cada marca marcada como `scraping`, em vez de um "intervalo em minutos" livre.
- [ ] Definir a frequência do `pepi-monitor.yml` diretamente no `cron` do workflow (ex: uma vez ao dia) — o GitHub Actions não garante execução no segundo exato, então não prometa ao usuário um intervalo fino tipo "a cada 15 minutos" na variante gratuita; isso é uma limitação real, não um detalhe de UI a esconder.

**Critério de pronto**: cadastrar uma marca real e rodar o job de verificação detecta corretamente se há ou não movimentação nova.

---

## Fase 4 — Motor de similaridade *(skill: `phonetic-ptbr-matching`)*

- [ ] Implementar a função de normalização (remoção de acento, K→C, W→V, PH→F) como função pura testável.
- [ ] Implementar comparação de texto tipo `SequenceMatcher`.
- [ ] Implementar Soundex-PT conforme a tabela de dígitos confirmada na skill.
- [ ] Implementar Metaphone-PT (LH→I, NH→N, CH→X, E inicial mudo, remoção de vogais internas).
- [ ] Implementar comparação por tokens para marcas compostas.
- [ ] Construir o conjunto de testes de regressão descrito na skill (KOKA KOLA / COCA COLA, NATURAH / NATURA, HAVAYANA / HAVAIANAS, caso de token comum, caso negativo).
- [ ] Expor o threshold (65/80/90% + customizado) como parâmetro configurável por marca monitorada, não como constante global.
- [ ] Integrar o motor de similaridade ao job de verificação da Fase 3 (rodar contra despachos novos quando a marca tiver similaridade ativada).

**Critério de pronto**: todos os pares de teste da skill retornam o resultado esperado (parecido/não parecido).

---

## Fase 5 — Prazos automáticos *(skill: `rpi-ingestion-despachos`)*

- [ ] Validar a tabela `references/despacho-codes.md` contra fonte oficial (manual do INPI e/ou legislação) antes de codificar qualquer regra de prazo em produção.
- [ ] Implementar a regra de conversão despacho → prazo (tipo de prazo + data-limite) usando a tabela validada.
- [ ] Persistir prazos gerados em `prazos`, vinculados ao despacho de origem.
- [ ] Construir a tela "Prazos INPI": status, marca, processo, tipo de prazo, data-limite, dias restantes.
- [ ] Implementar "Resumo por e-mail" dos prazos pendentes.
- [ ] Implementar "Limpar selecionado" (marcar prazo como tratado/não relevante).

**Critério de pronto**: um despacho de teste gera o prazo certo, com a data-limite calculada corretamente e visível na tela.

---

## Fase 6 — Notificações

- [ ] Implementar configuração de SMTP por usuário (servidor, porta, login, senha, remetente, criptografia) com botão de "enviar e-mail de teste".
- [ ] Implementar envio de e-mail de alerta usando o template da skill `branded-report-builder` (assunto/cabeçalho/texto com variáveis `{marca}`/`{status}`/`{processo}`).
- [ ] Implementar delay configurável antes do envio do e-mail (0 = imediato).
- [ ] Registrar processo de aprovação da Cloud API da Meta (conta comercial, número verificado, template de mensagem aprovado) — este passo tem lead time externo, iniciar cedo.
- [ ] Implementar envio de WhatsApp via Cloud API oficial (não WhatsApp Web) uma vez aprovado.
- [ ] Implementar intervalo entre mensagens WhatsApp (throttle) para reduzir risco de bloqueio.
- [ ] Implementar pop-up visual na interface ao detectar mudança (canal mais simples, útil como fallback caso e-mail/WhatsApp ainda não estejam configurados).
- [ ] Tela central de "Configurações de Alertas": habilitar/desabilitar cada canal independentemente.

**Critério de pronto**: uma mudança de status simulada dispara e-mail e (se configurado) WhatsApp corretamente, respeitando delay e throttle.

---

## Fase 7 — Personalização / white-label *(skill: `branded-report-builder`)* — opcional

> Só priorize esta fase se o objetivo for revenda como produto para múltiplos clientes/escritórios. Para uso pessoal, pule para a Fase 9.

- [ ] Editor de identidade do escritório (nome, telefone, e-mail, site).
- [ ] Upload/URL de logo, com opção de ocultar.
- [ ] Seletor de cor de destaque (hex + paleta de sugestões).
- [ ] Editor de texto de rodapé do relatório.
- [ ] Editor de template de e-mail (assunto, cabeçalho, texto introdutório, rodapé) com suporte às variáveis dinâmicas.
- [ ] Editor de assinatura de e-mail (texto simples, HTML ou imagem).
- [ ] Botões de prévia (HTML e PDF) antes de salvar qualquer alteração de template.

**Critério de pronto**: alterar a identidade visual reflete tanto no relatório quanto no e-mail, sem precisar editar dois lugares.

---

## Fase 8 — Multiusuário e licenciamento — opcional

> Só priorize esta fase se o objetivo for revenda como produto. Não adicione isolamento multi-tenant ao núcleo (Fases 0-5) antecipadamente — adicione aqui, quando for de fato necessário.

- [ ] Modelo de conta multiusuário com isolamento de dados por conta (tenant).
- [ ] Cadastro de clientes por conta, com e-mail/WhatsApp próprios (tabela `clientes`).
- [ ] Sistema de licenciamento/trial, se o modelo for de venda de licença.

**Critério de pronto**: duas contas diferentes não conseguem ver os dados uma da outra.

---

## Fase 9 — Deploy, testes e lançamento

- [ ] Deploy do frontend/backend no Vercel (plano Hobby, gratuito).
- [ ] Confirmar que o projeto Neon usado em produção é o mesmo (ou um separado) do usado em desenvolvimento — não misturar dados de teste com dados reais de monitoramento.
- [ ] Confirmar que os secrets do GitHub Actions (`DATABASE_URL`, credenciais de SMTP, tokens da Cloud API) estão configurados no repositório de produção, não só localmente.
- [ ] Verificar que o agendamento do `rpi-ingestion.yml` está de fato ativo (workflows agendados só disparam automaticamente em repositórios com atividade recente — o GitHub desativa `schedule` em repos inativos por 60+ dias; confira isso periodicamente).
- [ ] Rodar o sistema em paralelo com a marca real do usuário por 2-3 semanas, comparando manualmente contra a RPI publicada.
- [ ] Corrigir divergências encontradas antes de expandir para mais marcas/usuários.
- [ ] Documentar no `CLAUDE.md` qualquer decisão de arquitetura que tenha mudado durante a implementação (mantê-lo vivo, não congelado no dia 1).

**Critério de pronto**: 2-3 semanas de monitoramento real sem nenhuma divergência não explicada contra a RPI oficial.

---

## Notas gerais de execução

- Ao concluir uma tarefa que revela uma decisão nova de arquitetura (ex: um campo do XML que não estava documentado, um comportamento inesperado do pePI), atualize a skill relevante em `.claude/skills/` — elas devem evoluir junto com o projeto, não ficar congeladas na primeira versão.
- **Gotcha confirmado do GitHub Actions**: workflows agendados (`schedule`) são desativados automaticamente pelo GitHub após 60 dias sem nenhuma atividade no repositório (nem precisa ser no workflow — qualquer atividade no repo conta). Se ficar muito tempo sem tocar no projeto, confira a aba Actions antes de assumir que a ingestão semanal continuou rodando sozinha; reativar é manual (aba Actions → workflow → "Enable workflow").
- Nunca pule a validação de prazos legais (Fase 5) para "ir mais rápido" — é a parte do sistema com maior custo de erro.
- Se o escopo mudar de "uso pessoal" para "produto para escritórios" no meio do caminho, revisite o `CLAUDE.md` (Seção 5) antes de retomar as Fases 7-8 — as regras fixas de arquitetura podem precisar de ajuste.
