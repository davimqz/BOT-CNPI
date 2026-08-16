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
| E-mail | **Resend** (API HTTP) como padrão; Nodemailer/SMTP como fallback | Ver Seção 3.2 — decisão revista em 28/07/2026. O usuário final não configura envio; a credencial é do operador. |
| WhatsApp | Cloud API oficial da Meta | **Não** usar automação de WhatsApp Web — ver justificativa na Seção 5. Sobre a franquia grátis, ver a ressalva na Seção 3.3. |
| Armazenamento de arquivos | Bucket compatível com S3 | Logos e templates enviados pelo usuário (módulo de personalização) — só necessário a partir da Fase 7. |

### 3.1 Variante $0/mês — por que existe e o que ela muda

Todo o stack acima cabe em tiers gratuitos para uso pessoal (um usuário, uma marca), com um ajuste de arquitetura que não é opcional: **o Vercel Hobby limita funções serverless a 60 segundos de execução**, o que é curto demais para abrir um Chrome headless via Playwright de forma confiável (consulta ao pePI, download+parse do ZIP da RPI). Por isso, todo processamento com Playwright roda fora do Vercel, no GitHub Actions:

- **Ingestão semanal da RPI**: workflow agendado (`.github/workflows/rpi-ingestion.yml`), dispara toda terça, roda em runner Ubuntu (sem limite de 60s — o limite de job do GitHub Actions é de horas, não segundos), grava direto no Neon.
- **Consulta ao vivo / busca manual**: quando o usuário busca algo pela interface, o Next.js dispara um workflow via `workflow_dispatch` (chamada à API REST do GitHub, usando um token com permissão de `actions: write` no repositório), passando o termo buscado; o workflow roda a busca no pePI e grava o resultado no Postgres; o frontend faz polling curto até o resultado aparecer. Isso adiciona uma latência de alguns segundos a dezenas de segundos (tempo de fila do runner) comparado a uma função serverless tradicional — aceitável para uso pessoal, não para um produto que promete resposta instantânea.
- Limites de referência (confirmados em julho de 2026, reconferir periodicamente pois tiers gratuitos mudam): Vercel Hobby (1M invocações/mês, função de até 60s), Neon free (0,5GB armazenamento, 100h de computação/mês, auto-suspende após 5 min ocioso), GitHub Actions (2.000 min grátis/mês em repositório privado, ilimitado em repositório público). Para a Meta Cloud API, ver a ressalva da Seção 3.3 — a franquia citada aqui antes não cobria o nosso tipo de mensagem.
- **Monitoramento diário das marcas de fonte `scraping`**: workflow agendado (`.github/workflows/pepi-monitor.yml`), roda `npm run monitor:pepi` uma vez ao dia. As marcas de fonte `rpi` não passam por aqui — elas são cruzadas dentro do próprio `rpi-ingestion.yml`. Frequência fina ("a cada 15 minutos") não é possível nesta variante: `schedule` do GitHub é best-effort e cada marca abre um navegador contra o pePI.
- Os três workflows (`rpi-ingestion.yml`, `pepi-search.yml`, `pepi-monitor.yml`) vivem em `.github/workflows/` — ver `TASKS.md` para o estado de cada fase.

### 3.1.1 O teto de armazenamento é a restrição que molda o histórico (medido em 02/08/2026)

O limite que aperta primeiro na variante gratuita **não é minuto de CPU nem invocação de função —
é disco**. Uma edição da RPI custa **~19 MB no Postgres** (~35-40 mil despachos; `texto_complementar`
sozinho é 37% do heap). O Neon free tem 0,5 GB. Logo:

- **2026 inteiro (RPI 2870-2899, 30 edições) = ~570 MB** — não cabe.
- A cada terça, +19 MB. Qualquer configuração que só acumule estoura, é questão de quando.
- Banco cheio = escrita bloqueada = ingestão semanal parada. **O modo de falha do disco cheio
  atinge exatamente a função central do sistema**, e por isso ele não pode ser deixado para
  "quando acontecer".

Não tente resolver com normalização do schema: eliminar `texto_despacho` (redundante com o código
do despacho) economiza ~13%, não muda a ordem de grandeza.

#### A saída gratuita: modo enxuto (cruzar tudo, guardar só o que é seu)

A observação que destrava o problema é que **o volume e o valor estão em lugares opostos**. Os ~35
mil despachos de uma edição são consumidos uma vez, no cruzamento, e depois 99,99% deles nunca mais
são lidos — são processos de terceiros. O que o sistema realmente precisa guardar é o punhado que
casou com uma marca monitorada.

O **modo enxuto** (`--enxuto`, ou `RPI_MODO_ENXUTO=1` no ambiente) baixa e parseia a revista
inteira, **cruza por completo** — inclusive o motor de similaridade, que precisa ver todos os nomes
da edição para achar colidência — e só então grava. Ficam no banco apenas os despachos que casaram.

- **Fidelidade idêntica** no que importa: alerta, prazo e colidência saem iguais ao modo completo.
  Verificado lado a lado em 03/08/2026 na RPI 2870 com marca semeada (mesmos 2 despachos, mesmos
  alertas, mesmas datas de prazo; e uma colidência KAEF/CAEF a 94,4% achada entre 25.392 despachos
  gravando 8 linhas).
- **Custo por edição: praticamente zero** — 2 linhas em vez de 25.392. E **mais rápido**: 8,7s
  contra 29s, porque gravar as 35 mil linhas era a maior parte do tempo.
- **O que se abre mão**: navegar despacho de *terceiro* daquela edição no Histórico RPI. O
  conteúdo continua disponível no PDF oficial, linkado em `/revistas`.

Com isso, **2026 inteiro cabe de graça**. A configuração recomendada no plano gratuito é mista:
edições recentes completas (Histórico RPI navegável) e as antigas enxutas.

#### As três alavancas, e quando usar cada uma

| | Comando | Efeito |
|---|---|---|
| Consumir tudo de graça | `--backfill --enxuto` | Cruza toda revista, guarda só o que é seu |
| Manter janela navegável | `--limpar[=N]` | Descarta o "resto da revista" fora das N últimas edições |
| Histórico completo | Neon Launch (pay-as-you-go) | ~US$0,35/GB-mês; 2026 inteiro ≈ US$0,20/mês de storage |

Duas invariantes que **qualquer** uma delas preserva, e que devem sobreviver a mexidas futuras:
`edicoes_rpi` nunca é apagada (o catálogo inteiro continua em `/revistas`, com download direto do
INPI) e despacho vinculado a marca monitorada nunca é descartado (é o histórico do usuário, e dele
penduram os `prazos`, que cairiam junto por `ON DELETE CASCADE`).

Correção de um número que circulou aqui antes: o plano Launch do Neon **não é mais US$19 fixos** —
virou pay-as-you-go sem mínimo mensal (US$0,35/GB-mês de storage, US$0,106/CU-hora de compute, com
auto-suspensão). Reconferir antes de decidir, como todo tier citado neste documento.

### 3.2 E-mail: por que Resend e não "cada usuário com seu SMTP" (revisto em 28/07/2026)

A escolha original era Nodemailer com SMTP configurado pelo usuário, herdada do software de
referência. **A herança foi do formato, não do motivo.** O "Vigia Marca" é um app desktop: não
existe servidor dele no ar, então cada escritório *precisa* usar o próprio e-mail — não há
alternativa técnica. Este sistema roda hospedado e tem servidor próprio, então essa restrição
simplesmente não se aplica.

O custo de manter a herança é alto e recai sobre quem menos pode pagá-lo. Para um usuário leigo,
"configure seu SMTP" com Gmail significa: ativar 2FA → encontrar "Senhas de app" (que só aparece
depois do 2FA) → gerar → colar uma string de 16 caracteres — e um erro de porta ou criptografia
devolve `EAUTH`, que não diz nada a ele.

**Decisão**: o envio é responsabilidade do operador, não do usuário final.

- Chave do Resend em variável de ambiente / secret do repositório, **nunca no banco e nunca numa
  tela de configuração** — ela autoriza envio pelo domínio inteiro.
- O usuário final configura no máximo *para onde* receber; no uso pessoal, nem isso (sai de
  `usuarios.email`).
- SMTP continua implementado como fallback (`ConfigEmail` em `src/lib/email.ts`) para quem quiser
  servidor próprio e para não ficar refém de um serviço externo.
- Remetente é o **domínio raiz** (`avisos@trilhafinance.com.br`), não um subdomínio dedicado —
  revertido em 11/08/2026 (ver nota abaixo). Se um dia o plano do Resend permitir mais de um
  domínio, reavaliar a volta ao subdomínio pelo motivo original: isolar a reputação de envio do
  domínio principal.

> **Nota (11/08/2026)**: a intenção original era subdomínio dedicado
> (`avisos@avisos.trilhafinance.com.br`), mas o **plano gratuito do Resend só permite 1 domínio por
> conta**, e a única vaga já estava ocupada por `trilhafinance.com.br` (cadastrado em 05/08/2026,
> nunca verificado). Cadastrar o subdomínio como segundo domínio foi recusado pela API
> (`"Your plan includes 1 domain. Upgrade to add more."`). Causa raiz de um alerta que não saiu: o
> `EMAIL_REMETENTE` apontava pro subdomínio, mas nenhum domínio verificado no Resend cobria esse
> endereço — Resend nunca ia aceitar o envio, independente de DNS. Corrigido trocando
> `EMAIL_REMETENTE` para `avisos@trilhafinance.com.br` (secret do GitHub Actions e `.env` locais
> atualizados; **falta atualizar a Environment Variable equivalente no Vercel**, ver Seção 3.3) e
> mantendo o domínio raiz como o único cadastrado. DNS (registros DKIM/SPF que o Resend pede)
> segue como responsabilidade do operador — reconferir status em resend.com/domains antes de
> assumir que está verificado.

Por que isso importa mais aqui que num app comum: **alerta de prazo que cai em spam equivale a
alerta não enviado**, e o sistema inteiro existe para evitar prazo perdido. Deliverability é
requisito funcional, não detalhe de infraestrutura.

Alternativa descartada — **OAuth "Entrar com Google"**, que parece a melhor UX: enviar em nome do
usuário exige o escopo restrito `gmail.send`, cuja publicação depende de auditoria de segurança
(CASA). Em modo "Testing", que dispensa a auditoria, o refresh token **expira em 7 dias** — o job
agendado pararia de enviar sozinho e em silêncio. É o pior modo de falhar para um sistema de
prazos.

Limites de referência (julho/2026, reconferir): Resend free 3.000 e-mails/mês (100/dia, 1
domínio); Brevo free 300/dia. O volume real deste sistema é de dezenas de e-mails por mês.

### 3.3 Deploy: dois ambientes, não um (escrito em 31/07/2026, Fase 9)

A regra que mais importa aqui, e que não é óbvia lendo só o código: **o app e os workers rodam em
ambientes diferentes, com configurações diferentes.**

- O **app no Vercel** lê as *Environment Variables* do projeto Vercel.
- Os **workers** (ingestão da RPI, monitor do pePI, alertas, resumo, e-mail de teste) rodam no
  **GitHub Actions** e leem os *secrets do repositório*.

Os dois precisam das mesmas credenciais de e-mail, pelo mesmo motivo por caminhos opostos: o
worker precisa para *enviar*, e o app precisa para a tela de Configurações de Alertas conseguir
*diagnosticar* o canal. Se saírem de sincronia, a tela e a realidade divergem — e o modo de falha
perigoso é o silencioso: tela dizendo "ativo" enquanto nenhum alerta sai. Por isso o diagnóstico da
tela é redigido como "este app enxerga…", nunca como "o alerta vai sair", e a prova de ponta a
ponta é o workflow `email-teste.yml`, que roda **no mesmo lugar que os alertas**. Ver
`src/lib/configuracao-alertas.ts`.

Variáveis do projeto no Vercel: `DATABASE_URL`, `AUTH_EMAIL`, `AUTH_PASSWORD`, `AUTH_SECRET`,
`GITHUB_PAT`, `GITHUB_REPO`, `RESEND_API_KEY`, `EMAIL_REMETENTE` (e `EMAIL_RESPONDER_PARA` /
`RESUMO_PRAZOS_PARA` se usadas). `DATABASE_URL_DIRECT` é só do Prisma CLI (migrations), não do
runtime.

**`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` no Vercel**: o Vercel instala devDependencies para buildar,
e o pacote `playwright` baixa navegadores na instalação — centenas de MB de build para algo que o
Vercel **nunca** executa (Seção 5: nenhum Playwright em função serverless). Nos workflows do
Actions o download continua acontecendo de propósito, via `npx playwright install --with-deps
chromium`.

**Sobre a franquia grátis do WhatsApp**: a Seção 3 citava "1.000 conversas de serviço grátis/mês"
como parte da justificativa da Cloud API. Conversa *de serviço* é a iniciada pelo usuário; os
alertas deste sistema são templates *utility* iniciados pelo negócio, que não caem nessa franquia
na maioria dos mercados. No volume real (dezenas por mês) a diferença é irrelevante, mas a premissa
estava errada e não deve sustentar nenhuma decisão futura. Reconferir o preço vigente antes de
registrar qualquer número aqui.

## 4. Modelo de dados

| Tabela | Papel |
|---|---|
| `usuarios` | Conta/dono da configuração (escritório ou usuário único). |
| `clientes` | Pessoas/empresas para quem uma marca é monitorada; e-mail e WhatsApp próprios. Pode ser descartada se o uso for só pessoal. |
| `marcas_monitoradas` | Nome, processo, classe NCL, tipo de busca, similaridade on/off + threshold, fonte de dados (`rpi` ou `scraping`), cliente vinculado, eventos que disparam alerta. Só na fonte `scraping`: `ultimo_snapshot_pepi` (retrato "processo → situação" da última consulta) e `verificado_em` — é a diferença entre retratos que caracteriza movimentação nova nessa fonte. |
| `despachos` | Movimentação capturada: marca relacionada, edição da RPI, data de publicação, código e texto do despacho. `alerta_pendente` é a fila de notificação preenchida pelo job de verificação (Fase 3) e consumida pelo envio (Fase 6). Despacho vindo do pePI tem `edicao_rpi_id` nulo e o código sintético `PEPI-SITUACAO` (que não existe na tabela do INPI, e por isso nunca alimenta o cálculo de prazos da Fase 5). `motivo_vinculo`/`similaridade_score` guardam como o despacho casou com a marca (`processo`/`nome`/`similaridade`) — persistido no cruzamento desde 16/08/2026 para a tela **Colidências** (`/marcas/colidencias`, só `motivo_vinculo = similaridade`) não precisar recomputar o cruzamento inteiro a cada carregamento; despacho vinculado antes dessa data tem os dois campos nulos até rodar `npm run ingest:rpi -- --recalcular-motivo`. |
| `prazos` | Derivado de um despacho: tipo de prazo (slug de `src/lib/prazos.ts`), data-limite, status. Único por `(despacho, tipo)` — re-rodar a ingestão recalcula em vez de duplicar. Só `cumprido` é gravado pelo usuário; `pendente`/`vencido` saem da data na leitura, sem job diário. Regras validadas contra a LPI e o Manual de Marcas — ver `references/despacho-codes.md` na skill `rpi-ingestion-despachos`. |
| `edicoes_rpi` | Cache local de cada edição já processada — número, data de publicação, timestamp de processamento. É também o catálogo da seção **Revistas INPI** (`/revistas`), e por isso **nunca** é apagado pela limpeza da janela móvel (Seção 3.1.1): o histórico de revistas desde jan/2026 continua completo e baixável mesmo quando os despachos antigos saem do banco. |
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
