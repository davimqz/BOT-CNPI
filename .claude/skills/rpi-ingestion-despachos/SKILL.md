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

Evite depender de scraping do índice HTML (`revistas.inpi.gov.br/rpi/`) como única fonte de verdade do número da edição — é mais frágil que simplesmente tentar o download direto pela URL previsível.

## Fluxo de ingestão recomendado

1. Determinar a edição alvo (ver acima).
2. Baixar o ZIP; se 404, aguardar e tentar novamente (não falhar o job inteiro).
3. Descompactar e fazer o parse do XML contra o schema validado no manual.
4. Para cada despacho novo: gravar em `despachos` (ver modelo de dados no CLAUDE.md do projeto), e cruzar contra `marcas_monitoradas` para saber se algum processo cadastrado teve movimentação. **Este cruzamento É o job de verificação da fonte `rpi`** — não existe um job agendado separado para isso, e criar um seria trabalho duplicado. Implementado em `src/workers/rpi/ingest.ts` sobre a lógica pura de `src/lib/verificacao.ts`; ver "Cruzamento contra marcas monitoradas" abaixo.
5. Quando houver correspondência, gerar o registro de prazo (`prazos`) usando a tabela de `references/despacho-codes.md`, e disparar o pipeline de notificação (fora do escopo desta skill — ver módulo de notificações no CLAUDE.md).
6. Gravar a edição inteira em `edicoes_rpi` / histórico local, mesmo os despachos que não bateram com nenhuma marca monitorada — isso é o que alimenta a busca do "Histórico RPI" depois.

## Cruzamento contra marcas monitoradas (confirmado ao vivo em 28/07/2026)

Regras de casamento, na ordem em que importam:

- **Marca cadastrada com nº de processo casa SÓ pelo número** — é o critério preciso, e o nome publicado na RPI frequentemente difere do que o usuário digitou. Compare só os dígitos, sem zeros à esquerda: os dois lados formatam o número de jeitos diferentes.
- **Sem processo, casa por nome normalizado** (maiúsculas, sem acento, sem espaço/pontuação — "COCA-COLA" e "coca cola" precisam casar). Nome apenas *parecido* fica de fora: isso é o motor de similaridade da Fase 4, e misturar as duas coisas aqui esconde qual regra deixou passar o quê.
- **A classe NCL da marca filtra, mas despacho sem classe não é descartado** — perder movimentação por campo vazio na revista é pior que um casamento a mais. Atenção: a RPI junta várias classes de um processo numa string só (`"35;41"`).
- **O filtro de eventos escolhido pela marca decide o alerta, não o vínculo**: despacho que casa mas está fora dos eventos escolhidos é vinculado com `alerta_pendente = false`. O usuário continua vendo a movimentação no histórico; ele só não é notificado.

Duas coisas que só aparecem quando o sistema já está rodando:

- **Marca cadastrada depois da ingestão nunca seria cruzada** contra o que já está no banco. Por isso existe o modo retroativo `npm run ingest:rpi -- --recruzar[=N]` (últimas N edições, sem baixar nada).
- **O cruzamento só olha despacho ainda sem marca vinculada.** É o que impede o modo retroativo de re-enfileirar um alerta que a Fase 6 já enviou — reprocessar não pode significar re-notificar.

## Erros comuns a evitar

- Tratar a ausência de publicação (edição ainda não saiu) como falha em vez de estado normal a ser re-tentado.
- Hardcodar códigos de despacho sem confirmar contra o manual oficial ou contra dados reais de produção.
- Rodar o parser sem lidar com encoding/acentuação — XMLs de sistemas legados do governo brasileiro costumam ter particularidades de charset; teste com marcas que tenham acento e caracteres especiais antes de considerar o parser pronto.
