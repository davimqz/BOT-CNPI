# CLAUDE.md — Sistema de Monitoramento de Marcas (INPI)

Este arquivo é o contexto permanente do projeto para qualquer sessão do Claude Code trabalhando neste repositório. Leia-o antes de tocar em qualquer módulo. Para o passo a passo de execução, veja `TASKS.md`. Para conhecimento de domínio especializado (fonética, scraping do pePI, ingestão da RPI, relatórios), consulte as skills em `.claude/skills/` — cada uma é carregada automaticamente quando relevante, mas vale saber que elas existem:

- `.claude/skills/rpi-ingestion-despachos/` — ingestão semanal da RPI, glossário de despachos, cálculo de prazos.
- `.claude/skills/phonetic-ptbr-matching/` — algoritmo de similaridade fonética entre nomes de marca.
- `.claude/skills/pepi-scraping-playbook/` — automação de navegador contra o pePI do INPI (consulta ao vivo).
- `.claude/skills/branded-report-builder/` — relatório "Consultor de Marca" e sistema de personalização (white-label).

## 1. O que este projeto é

Um sistema web de monitoramento de marcas registradas/depositadas no INPI, inspirado na análise funcional completa de um software comercial de referência ("Vigia Marca"). Referência completa do escopo original: `docs/especificacao-vigia-marca.docx` (na raiz deste projeto, se presente) — esse documento tem o inventário das ~30 telas originais e a análise que deu origem a este CLAUDE.md e ao TASKS.md.

**Uso pretendido nesta primeira versão**: uso próprio, para uma marca (não multiusuário/white-label de escritório). As fases de personalização visual e licenciamento (ver TASKS.md, Fases 7 e 8) são opcionais e só devem ser priorizadas se o objetivo mudar para revenda como produto.

## 2. Duas fontes de dados — regra de ouro do projeto

O sistema combina duas formas de obter dados do INPI, e **a escolha entre elas não é um detalhe de implementação, é uma decisão de arquitetura**:

1. **RPI semanal (preferencial)**: leitura do XML oficial publicado toda terça-feira. Estável, mas atualiza uma vez por semana. Use esta fonte sempre que a funcionalidade permitir.
2. **Scraping ao vivo do pePI (só quando necessário)**: automação de navegador para consulta instantânea. Rápido, mas frágil (pode quebrar com mudança de layout do site) e potencialmente sensível a bloqueio por uso automatizado. Use apenas para as funcionalidades que exigem resultado em tempo real (busca manual do usuário, busca por depositante).

Sempre que estiver em dúvida sobre qual fonte usar para uma nova funcionalidade, prefira a RPI. Ver skills `rpi-ingestion-despachos` e `pepi-scraping-playbook` para os detalhes de cada uma.

## 3. Stack técnica

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | Next.js (TypeScript, React), hospedado no Vercel (plano Hobby) | Dashboard, formulários, tabelas e editor de template no mesmo framework do backend. Gratuito dentro dos limites do Hobby (ver Seção 3.1). |
| Backend/API | Rotas do próprio Next.js (App Router) | Só regras de negócio leves (CRUD, leitura) — nada de Playwright aqui, ver Seção 3.1. |
| Worker de scraping + ingestão RPI | **GitHub Actions**, não um processo Node separado | Roda em runner Ubuntu completo, sem o limite de 60s do Vercel Hobby. Ingestão da RPI via workflow agendado (`schedule`); busca ao vivo via workflow sob demanda (`workflow_dispatch`, disparado pela API do Next.js). Ver Seção 3.1 e skills `rpi-ingestion-despachos` / `pepi-scraping-playbook`. |
| Banco de dados | PostgreSQL via Neon (free tier) + Prisma | Tipagem forte do modelo de dados (Seção 4) direto no TypeScript. Neon suspende sozinho quando ocioso — sem custo parado. |
| Fila/agendamento | **Dispensada na variante gratuita** — opcional (BullMQ + Upstash Redis) só na Fase 8 (multiusuário) | O GitHub Actions já cumpre o papel de "fila": o agendamento roda o job da RPI, e o `workflow_dispatch` roda a busca sob demanda. Não adicione Redis/BullMQ antes de precisar de concorrência real entre vários usuários. |
| E-mail | Nodemailer (SMTP configurável pelo usuário, ex: Gmail) | Espelha o comportamento do software de referência (cada usuário usa seu próprio SMTP) — grátis, sem serviço adicional. |
| WhatsApp | Cloud API oficial da Meta (1.000 conversas de serviço grátis/mês) | **Não** usar automação de WhatsApp Web — ver justificativa na Seção 5. |
| Armazenamento de arquivos | Bucket compatível com S3 | Logos e templates enviados pelo usuário (módulo de personalização) — só necessário a partir da Fase 7. |

### 3.1 Variante $0/mês — por que existe e o que ela muda

Todo o stack acima cabe em tiers gratuitos para uso pessoal (um usuário, uma marca), com um ajuste de arquitetura que não é opcional: **o Vercel Hobby limita funções serverless a 60 segundos de execução**, o que é curto demais para abrir um Chrome headless via Playwright de forma confiável (consulta ao pePI, download+parse do ZIP da RPI). Por isso, todo processamento com Playwright roda fora do Vercel, no GitHub Actions:

- **Ingestão semanal da RPI**: workflow agendado (`.github/workflows/rpi-ingestion.yml`), dispara toda terça, roda em runner Ubuntu (sem limite de 60s — o limite de job do GitHub Actions é de horas, não segundos), grava direto no Neon.
- **Consulta ao vivo / busca manual**: quando o usuário busca algo pela interface, o Next.js dispara um workflow via `workflow_dispatch` (chamada à API REST do GitHub, usando um token com permissão de `actions: write` no repositório), passando o termo buscado; o workflow roda a busca no pePI e grava o resultado no Postgres; o frontend faz polling curto até o resultado aparecer. Isso adiciona uma latência de alguns segundos a dezenas de segundos (tempo de fila do runner) comparado a uma função serverless tradicional — aceitável para uso pessoal, não para um produto que promete resposta instantânea.
- Limites de referência (confirmados em julho de 2026, reconferir periodicamente pois tiers gratuitos mudam): Vercel Hobby (1M invocações/mês, função de até 60s), Neon free (0,5GB armazenamento, 100h de computação/mês, auto-suspende após 5 min ocioso), GitHub Actions (2.000 min grátis/mês em repositório privado, ilimitado em repositório público), Meta Cloud API (1.000 conversas de serviço grátis/mês).
- **Monitoramento diário das marcas de fonte `scraping`**: workflow agendado (`.github/workflows/pepi-monitor.yml`), roda `npm run monitor:pepi` uma vez ao dia. As marcas de fonte `rpi` não passam por aqui — elas são cruzadas dentro do próprio `rpi-ingestion.yml`. Frequência fina ("a cada 15 minutos") não é possível nesta variante: `schedule` do GitHub é best-effort e cada marca abre um navegador contra o pePI.
- Os três workflows (`rpi-ingestion.yml`, `pepi-search.yml`, `pepi-monitor.yml`) vivem em `.github/workflows/` — ver `TASKS.md` para o estado de cada fase.

## 4. Modelo de dados

| Tabela | Papel |
|---|---|
| `usuarios` | Conta/dono da configuração (escritório ou usuário único). |
| `clientes` | Pessoas/empresas para quem uma marca é monitorada; e-mail e WhatsApp próprios. Pode ser descartada se o uso for só pessoal. |
| `marcas_monitoradas` | Nome, processo, classe NCL, tipo de busca, similaridade on/off + threshold, fonte de dados (`rpi` ou `scraping`), cliente vinculado, eventos que disparam alerta. Só na fonte `scraping`: `ultimo_snapshot_pepi` (retrato "processo → situação" da última consulta) e `verificado_em` — é a diferença entre retratos que caracteriza movimentação nova nessa fonte. |
| `despachos` | Movimentação capturada: marca relacionada, edição da RPI, data de publicação, código e texto do despacho. `alerta_pendente` é a fila de notificação preenchida pelo job de verificação (Fase 3) e consumida pelo envio (Fase 6). Despacho vindo do pePI tem `edicao_rpi_id` nulo e o código sintético `PEPI-SITUACAO` (que não existe na tabela do INPI, e por isso nunca alimenta o cálculo de prazos da Fase 5). |
| `prazos` | Derivado de um despacho: tipo de prazo (slug de `src/lib/prazos.ts`), data-limite, status. Único por `(despacho, tipo)` — re-rodar a ingestão recalcula em vez de duplicar. Só `cumprido` é gravado pelo usuário; `pendente`/`vencido` saem da data na leitura, sem job diário. Regras validadas contra a LPI e o Manual de Marcas — ver `references/despacho-codes.md` na skill `rpi-ingestion-despachos`. |
| `edicoes_rpi` | Cache local de cada edição já processada — número, data de publicação, timestamp de processamento. |
| `templates` | Configuração de marca própria por usuário: cores, logo, textos de relatório e e-mail, assinatura. |
| `configuracoes_alerta` | Canais habilitados por usuário e parâmetros de delay/intervalo de envio. |
| `logs_execucao` | Registro de cada rodada de busca/monitoramento, para auditoria e depuração. |
| `pepi_search_jobs` | Job de busca ao vivo no pePI: criado `pendente` pela API, executado pelo workflow `pepi-search.yml`, consumido por polling do frontend (termo, tipo, status, etapa, resultado JSON). |

Ao criar/alterar migrations, mantenha este quadro atualizado — ele é a referência rápida antes de abrir o schema do Prisma.

## 5. Regras fixas de arquitetura (não reabrir esta discussão sem motivo novo)

- **WhatsApp via Cloud API oficial da Meta, nunca automação de WhatsApp Web.** O software de referência usa QR code + sessão de WhatsApp Web, o que é frágil e tecnicamente contra os termos de uso do WhatsApp, com risco real de banimento do número. A Cloud API exige processo de aprovação mais burocrático, mas é o único caminho sustentável para uso continuado.
- **Scraping do pePI é sempre a opção de último recurso**, nunca a fonte primária de uma funcionalidade que também poderia ser resolvida via RPI.
- **Nenhuma automação de Playwright roda dentro de uma função serverless do Vercel.** O limite de 60s do plano Hobby não é confiável para isso — todo o trabalho de scraping/ingestão vai para o GitHub Actions (ver Seção 3.1). Se um dia o projeto migrar para hospedagem paga com função de execução mais longa, reavalie esta regra explicitamente em vez de simplesmente ignorá-la.
- **Multiusuário e white-label (Fases 7-8 do TASKS.md) são opcionais**, não centrais — não adicione complexidade de multi-tenant a estruturas de dados do núcleo (Fases 0-5) só porque "pode ser útil depois". Adicione quando a Fase 7/8 for de fato priorizada.
- **Prazos legais (Seção `despachos`/`prazos`) exigem validação contra fonte oficial** antes de qualquer contagem de dias ir para produção — ver `references/despacho-codes.md` dentro da skill `rpi-ingestion-despachos`. Nunca trate um prazo como "provavelmente certo".

## 6. Convenções de código

- TypeScript em todo o projeto (frontend, API routes, workers) — evita fricção de tipos entre camadas.
- Migrations do Prisma versionadas no repositório; nunca alterar o schema de produção manualmente fora de uma migration.
- Toda automação de browser (Playwright) deve logar cada etapa (seguindo o padrão de log do software de referência: "acessando site → preenchendo busca → extraindo resultados → concluído/erro") — isso é o que permite diagnosticar rapidamente quando o pePI mudar de layout.
- Nenhum código deve hardcodar credenciais de SMTP ou tokens da Cloud API — usar variáveis de ambiente (`.env`, nunca commitado).

## 7. Onde olhar primeiro em cada situação

- "Preciso mexer no cálculo de prazo ou no glossário de despachos" → skill `rpi-ingestion-despachos` + `references/despacho-codes.md`.
- "Preciso implementar/ajustar a detecção de marcas parecidas" → skill `phonetic-ptbr-matching`.
- "Preciso mexer na busca manual ou na busca por titular/CNPJ" → skill `pepi-scraping-playbook`.
- "Preciso mexer no relatório de consulta ou no e-mail de alerta" → skill `branded-report-builder`.
- "Não sei em que fase estou ou o que vem a seguir" → `TASKS.md`.

## 8. Permissões e commit/push automáticos

Este projeto roda com `.claude/settings.json` configurando `permissions.defaultMode: "bypassPermissions"` — o Claude Code não pede confirmação para nenhuma ação (edição de arquivo, comando de shell, git) sempre que for aberto nesta pasta. Isso é intencional e foi pedido explicitamente, mas **anule a única rede de segurança que normalmente existe entre "o agente decidiu fazer algo" e "aconteceu de verdade"** — não é um modo "mais seguro com automação", é "sem prompts". A única exceção que continua bloqueada mesmo assim é um circuito de segurança fixo do próprio Claude Code contra `rm -rf /` e `rm -rf ~`.

Junto disso, há um hook `Stop` (`.claude/hooks/auto-commit-tasks.sh`) que roda ao final de cada turno do agente: se o diff de `TASKS.md` mostrar uma tarefa recém-marcada (`- [ ]` → `- [x]`), ele faz `git add -A`, commita com uma mensagem derivada do item concluído, e dá `git push` — sem pedir confirmação, por causa do bypass acima. Qualquer edição no `TASKS.md` que não seja marcar uma caixa (reescrever texto, reordenar) não dispara commit.

**Antes disso funcionar, é preciso, uma vez só, fora do Claude Code:**
1. `git init` na raiz do projeto (se ainda não for um repositório).
2. `git remote add origin <url-do-seu-repositório>`.
3. Garantir que o push não peça senha/token interativamente neste ambiente — chave SSH carregada no agente, ou um credential helper configurado para HTTPS. Se o push exigir digitação manual de credencial, o hook vai falhar silenciosamente (ele captura o erro e só avisa no log, não trava o agente) e os commits ficarão só locais até isso ser resolvido.

**Recomendação, não imposição**: com push automático e sem prompts de confirmação, um commit ruim (código quebrado, ou até um segredo commitado por engano) vai parar no remoto sem ninguém revisar antes. Uma forma simples de manter uma rede de segurança sem abrir mão da automação é trabalhar numa branch própria (não `main`) enquanto os hooks empurram sozinhos, e manter a `main` protegida no GitHub/GitLab exigindo revisão de PR antes do merge — assim o automatismo nunca corrompe a branch principal diretamente, mesmo rodando sem supervisão turno a turno.
