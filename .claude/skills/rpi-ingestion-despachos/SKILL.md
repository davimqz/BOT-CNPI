---
name: rpi-ingestion-despachos
description: Use this skill whenever writing, debugging, or reasoning about the weekly RPI (Revista da Propriedade Industrial) ingestion pipeline, the local RPI history/database, or the "Prazos INPI" deadline engine. Trigger it for tasks like downloading/parsing the RPI XML for marks, determining the current or next issue number, mapping a despacho (dispatch/status event) to a deadline type, or building the "Histórico RPI" search feature — even if the user just says "baixa a RPI", "processa a revista dessa semana", "calcula o prazo desse despacho", or similar, without naming this skill directly.
---

# Ingestão da RPI e cálculo de prazos

## Por que isso existe

A RPI é a fonte de dados mais estável do sistema (ao contrário do scraping ao vivo do pePI — veja a skill `pepi-scraping-playbook`), porque é um arquivo publicado oficialmente, uma vez por semana, em formato estruturado. Quase todo o resto do produto — histórico, prazos, alertas — depende de ingerir essa fonte corretamente. Um erro aqui se propaga para tudo o que consome esses dados, então vale a pena centralizar esse conhecimento em vez de redescobri-lo a cada sessão.

## O que já está confirmado (fonte oficial)

- A RPI é publicada pelo INPI toda **terça-feira**, com número de edição sequencial (ex: 2898, 2899, ...).
- O índice de edições fica em `https://revistas.inpi.gov.br/rpi/` — cada linha da tabela tem número da edição, data de publicação, e um link por seção (a seção de Marcas é a "Seção V").
- O XML/TXT compactado da seção de Marcas de uma edição específica está em uma URL previsível:
  `https://revistas.inpi.gov.br/txt/RM[NÚMERO_DA_EDIÇÃO].zip`
  (ex: edição 2893 → `https://revistas.inpi.gov.br/txt/RM2893.zip`).
- Existe um manual oficial do layout do XML, publicado pelo próprio INPI — procure por "Manual do usuário — layout XML da RPI Marcas" no site gov.br/inpi (o nome do arquivo já mudou de versão para versão, então **busque a versão vigente antes de assumir um link fixo**).

## Antes de implementar o parser: valide contra o manual oficial

Não assuma nomes de campos, códigos de despacho ou estrutura do XML de memória — mesmo que pareçam óbvios. O layout é documento vivo do INPI e já teve pelo menos duas versões (1.02, 1.03) historicamente. Sempre que for implementar ou alterar o parser:

1. Baixe a versão mais recente do manual (busque "layout xml rpi marcas manual" no site gov.br/inpi).
2. Baixe um ZIP real de uma edição recente e confira a estrutura real contra o manual — casos de borda em dados de produção (acentuação, campos vazios, múltiplos titulares) geralmente aparecem primeiro no arquivo real, não no manual.
3. Documente em `references/despacho-codes.md` (neste mesmo diretório da skill) qualquer código de despacho novo que você confirmar, com a fonte. Não adicione códigos "prováveis" sem confirmar — é melhor ter a tabela incompleta e honesta do que completa e errada, porque ela alimenta diretamente o cálculo de prazos.

## Eventos de despacho confirmados (nomes, não códigos numéricos)

Estes nomes de evento são os que o sistema de referência realmente expõe ao usuário como opções de alerta — são um bom ponto de partida para o glossário, mas os *códigos* internos do INPI (o "Cód. Desp." que aparece junto de cada despacho) ainda precisam ser mapeados a partir do manual oficial:

- Deferimento do pedido
- Concessão de registro
- Oposição (Publicação/Notificação)
- Aguardando Exame (Mérito ou Técnico)
- Exigência Formal
- Sobrestamento
- Exigência de Mérito
- Indeferimento do pedido
- Aguardando pagamento da concessão
- Extinção ou Arquivamento
- Registro de Marca Vigente

Veja `references/despacho-codes.md` para a tabela de trabalho (evento → tipo de prazo → contagem de dias → status de confirmação da fonte).

## Determinando a edição atual/próxima

Como a publicação é semanal e sequencial, duas estratégias funcionam e se complementam:

- **Estimativa por incremento**: guarde a última edição processada com sucesso e assuma `última + 1` na próxima terça. Rápido, não depende de scraping.
- **Confirmação por tentativa de download**: tente baixar o ZIP da edição estimada; um 404 significa que ainda não foi publicada (tente de novo mais tarde no mesmo dia) — não trate isso como erro fatal, é um estado esperado antes da publicação.

Evite depender de scraping do índice HTML (`revistas.inpi.gov.br/rpi/`) como única fonte de verdade do número da edição — é mais frágil que simplesmente tentar o download direto pela URL previsível. (Confirmado em 02/08/2026: aquele índice é montado por JavaScript, então o HTML cru não traz link de edição nenhum — scraping dele exigiria navegador, para obter o que a URL previsível já dá de graça.)

### Mapa edição ↔ data, e o começo de 2026 (confirmado em 02/08/2026)

A cadência é **exatamente semanal**: `data(N) = 06/01/2026 + (N − 2870) × 7 dias`. Verificado por
`HEAD` no `last-modified` do servidor do INPI em 10 pontos ao longo de 10 meses (2860 → 28/10/2025,
2869 → 30/12/2025, 2870 → 06/01/2026, 2871 → 13/01, 2875 → 10/02, 2880 → 17/03, 2890 → 26/05,
2896 → 07/07, 2897 → 14/07, 2899 → 28/07) — nenhum salto.

> **A RPI 2870, de 06/01/2026, é a primeira edição de 2026** (a 2869 é de 30/12/2025). É a
> constante `PRIMEIRA_EDICAO_2026` em `src/lib/revistas.ts`.

**Duas constantes, dois papéis — não as unifique** (`src/lib/revistas.ts`):

| Constante | Valor | Papel |
|---|---|---|
| `PRIMEIRA_EDICAO_2026` | 2870 (06/01/2026) | Onde o **catálogo** da tela `/revistas` começa |
| `PRIMEIRA_EDICAO_MONITORADA` | 2896 (07/07/2026) | Onde a **ingestão** começa |

O catálogo lista desde janeiro porque revista é material de referência e listar custa zero — o
download aponta para o INPI. A ingestão começa na 2896 porque foi a semana do depósito do pedido do
usuário, e **antes do depósito não existe processo para movimentar**: cruzar janeiro a junho
procuraria uma marca que ainda não tinha dado entrada. Unificar as duas ou faz a tela perder meio
ano de revistas, ou faz o banco engolir 26 edições que, por construção, não têm nada.

Ao monitorar uma marca mais antiga, `PRIMEIRA_EDICAO_MONITORADA` é o número a baixar, e
`--backfill=<numero>` cobre o intervalo novo.

Trate a fórmula como **estimativa exibível, nunca como fonte de verdade**: a data que vale é a que
vem no XML da edição. A tela `/revistas` marca "(estimada)" enquanto a edição não foi ingerida,
justamente para não apresentar palpite como fato caso o INPI desloque uma publicação por feriado.

Além do ZIP do XML, existe o **PDF oficial da Seção de Marcas** em
`https://revistas.inpi.gov.br/pdf/Marcas[N].pdf` (`MARCAS` maiúsculo também responde; `RM[N].pdf`
não). É útil como link de download para o usuário, não para ingestão: **~130 MB por edição**,
contra 6-10 MB do ZIP.

### Backfill histórico e o teto de armazenamento (medido em 02/08/2026)

A ingestão normal só anda para a frente (`última + 1`), então o histórico anterior à primeira
rodada precisa de um modo próprio: `npm run ingest:rpi -- --backfill[=EDICAO] [--max=N]` (workflow
`rpi-backfill.yml`, só `workflow_dispatch`). Ele pula o que já está no banco, para na primeira
edição não publicada, e é resumível — cada edição é uma transação própria.

**O número que decide a arquitetura aqui**: uma edição custa **~19 MB no Postgres** (~35-40 mil
despachos). Medido, não estimado — `texto_complementar` sozinho é 37% do heap. Logo:

| | Edições | Espaço |
|---|---|---|
| 2026 inteiro (2870-2899) | 30 | **~570 MB** |
| Neon free | — | 512 MB |
| Janela de 12 edições (~3 meses) | 12 | ~230 MB |

Ou seja: **guardar 2026 inteiro não cabe no plano free**, e banco cheio significa escrita
bloqueada — ingestão semanal parada, que é o oposto do que o sistema existe para fazer. Não tente
resolver com normalização: mesmo eliminando `texto_despacho` inteiro (que é redundante com o
código) a economia é ~13%, não muda a ordem de grandeza.

### Modo enxuto: cruzar a revista inteira, guardar só o que é do usuário

A saída que torna 2026 inteiro gratuito. Volume e valor estão em lugares opostos: os ~35 mil
despachos de uma edição são lidos **uma vez**, no cruzamento, e depois praticamente nenhum é lido de
novo — são processos de terceiros. O `--enxuto` (ou `RPI_MODO_ENXUTO=1`) baixa e parseia a revista
completa, **cruza completa** e só então grava o que casou.

A ordem importa e é onde se erra: **cruzar primeiro, filtrar depois**. Filtrar antes de cruzar
quebraria o motor de similaridade, que precisa comparar o nome da marca monitorada contra *todos*
os nomes da edição — colidência é justamente com processo de terceiro. Em `ingest.ts` isso aparece
como ids gerados no cliente (`randomUUID`) antes do cruzamento, usados depois como PK das linhas
inseridas: é a chave que liga o cruzamento em memória à linha gravada, sem depender da ordem de
retorno de um `createMany`.

Medido em 03/08/2026 sobre a RPI 2870 (25.392 despachos), com marcas semeadas e o banco restaurado
depois:

| | Completo | Enxuto |
|---|---|---|
| Linhas gravadas | 25.392 | 2 (as que casaram) |
| Tempo | 29 s | **8,7 s** |
| Despachos casados / alertas / prazos | 2 / 2 / 2 | **2 / 2 / 2 (idênticos)** |
| Colidência KAEF·CAEF a 94,4% | acha | **acha** |

O que se perde é só navegar despacho de terceiro daquela edição no Histórico RPI — e ele continua
no PDF oficial, linkado em `/revistas`.

**Cuidado ao recruzar**: `--recruzar` lê do banco, então numa edição enxuta ele encontraria "nada" e
uma marca nova concluiria que não houve movimentação — resposta errada disfarçada de resposta. Por
isso `edicoes_rpi.enxuta` existe e o `--recruzar` avisa alto, mandando usar
`--backfill=N --forcar`, que rebaixa a revista do INPI e cruza de novo.

### Janela móvel

Complementar ao enxuto, para quem quer Histórico RPI navegável nas edições recentes:
`npm run ingest:rpi -- --limpar[=N] [--dry-run]`. Duas coisas ele **nunca** apaga, e é isso que
torna a janela aceitável:

- `edicoes_rpi` inteiro — o catálogo continua completo em `/revistas`, com download apontando para
  o INPI. Nenhuma revista some da tela, e `--backfill` traz qualquer uma de volta.
- **Todo despacho vinculado a marca monitorada**, de qualquer idade. É o histórico que é do
  usuário, e é dele que penduram os `prazos` (que cairiam junto, por `ON DELETE CASCADE`).

## Fluxo de ingestão recomendado

1. Determinar a edição alvo (ver acima).
2. Baixar o ZIP; se 404, aguardar e tentar novamente (não falhar o job inteiro).
3. Descompactar e fazer o parse do XML contra o schema validado no manual.
4. Para cada despacho novo: gravar em `despachos` (ver modelo de dados no CLAUDE.md do projeto), e cruzar contra `marcas_monitoradas` para saber se algum processo cadastrado teve movimentação. **Este cruzamento É o job de verificação da fonte `rpi`** — não existe um job agendado separado para isso, e criar um seria trabalho duplicado. Implementado em `src/workers/rpi/ingest.ts` sobre a lógica pura de `src/lib/verificacao.ts`; ver "Cruzamento contra marcas monitoradas" abaixo.
5. Quando houver correspondência, gerar o registro de prazo (`prazos`) usando a tabela de `references/despacho-codes.md` — implementado em `src/lib/prazos.ts` e chamado no fim do cruzamento. A regra de contagem (LPI arts. 221-224) e a invariante "a data calculada nunca passa do vencimento real" estão documentadas naquele arquivo; leia antes de mexer em qualquer data. Depois, disparar o pipeline de notificação (fora do escopo desta skill — ver módulo de notificações no CLAUDE.md).
6. Gravar a edição inteira em `edicoes_rpi` / histórico local, mesmo os despachos que não bateram com nenhuma marca monitorada — isso é o que alimenta a busca do "Histórico RPI" depois.

## Cruzamento contra marcas monitoradas (confirmado ao vivo em 28/07/2026)

Regras de casamento, na ordem em que importam:

- **Marca cadastrada com nº de processo casa SÓ pelo número** — é o critério preciso, e o nome publicado na RPI frequentemente difere do que o usuário digitou. Compare só os dígitos, sem zeros à esquerda: os dois lados formatam o número de jeitos diferentes.
- **Sem processo, casa por nome normalizado** (maiúsculas, sem acento, sem espaço/pontuação — "COCA-COLA" e "coca cola" precisam casar). Nome apenas *parecido* fica de fora: isso é o motor de similaridade da Fase 4, e misturar as duas coisas aqui esconde qual regra deixou passar o quê.
- **A classe NCL da marca filtra, mas despacho sem classe não é descartado** — perder movimentação por campo vazio na revista é pior que um casamento a mais. Atenção: a RPI junta várias classes de um processo numa string só (`"35;41"`).
- **O filtro de eventos escolhido pela marca decide o alerta, não o vínculo**: despacho que casa mas está fora dos eventos escolhidos é vinculado com `alerta_pendente = false`. O usuário continua vendo a movimentação no histórico; ele só não é notificado.

### O nome da marca só vem em ALGUNS tipos de despacho (confirmado em 28/07/2026)

Medido sobre as edições 2897-2899 (~113 mil despachos): o campo `<marca><nome>` só está
preenchido em **publicação para oposição (IPAS009, 97%)**, **concessão (IPAS158, 89%)** e
parcialmente em deferimento de petição (IPAS270, 37%). Vem **sempre vazio** em deferimento
(IPAS029), indeferimento (IPAS024), exigência de mérito (IPAS136), exigência formal (IPAS005),
notificação de oposição (IPAS423), de recurso (IPAS360), de caducidade (IPAS338), exigência de
pagamento (IPAS395) e extinção (IPAS161) — zero de dezenas de milhares em cada um.

Consequência direta, e ela é grande: **marca cadastrada SEM número de processo (que casa por
nome) nunca vê um deferimento, indeferimento ou exigência.** Ela só enxerga a publicação para
oposição e a concessão. Como quase todo prazo legal da Fase 5 nasce justamente dos despachos
sem nome, na prática:

> Para monitoramento de prazos, cadastrar a marca **com o número do processo** não é uma
> preferência, é requisito. Sem ele o sistema mostra a marca sendo publicada e concedida, mas
> silencia exatamente nos despachos que abrem prazo.

Isso também explica por que o motor de similaridade (Fase 4) só acha colidência em IPAS009 e
IPAS158 — e, para colidência, isso é adequado: a janela de oposição é justamente a do IPAS009.

Duas coisas que só aparecem quando o sistema já está rodando:

- **Marca cadastrada depois da ingestão nunca seria cruzada** contra o que já está no banco. Por isso existe o modo retroativo `npm run ingest:rpi -- --recruzar[=N]` (últimas N edições, sem baixar nada).
- **O cruzamento só olha despacho ainda sem marca vinculada.** É o que impede o modo retroativo de re-enfileirar um alerta que a Fase 6 já enviou — reprocessar não pode significar re-notificar.

## Erros comuns a evitar

- Tratar a ausência de publicação (edição ainda não saiu) como falha em vez de estado normal a ser re-tentado.
- Hardcodar códigos de despacho sem confirmar contra o manual oficial ou contra dados reais de produção.
- Rodar o parser sem lidar com encoding/acentuação — XMLs de sistemas legados do governo brasileiro costumam ter particularidades de charset; teste com marcas que tenham acento e caracteres especiais antes de considerar o parser pronto.
