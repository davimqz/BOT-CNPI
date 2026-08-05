# Glossário de códigos de despacho (IPAS)

**Fonte de confirmação**: atributos `codigo`/`nome` dos despachos publicados nas edições reais
RM2897 (14/07/2026) e RM2898 (21/07/2026) da RPI Marcas — extraídos pelo pipeline de ingestão
deste projeto em 27/07/2026. O `nome` é o texto oficial publicado pelo próprio INPI no XML.

**Regra desta tabela** (ver SKILL.md): só entra código visto em dado real ou no manual oficial.

**Status da validação de prazos: CONCLUÍDA em 28/07/2026** (primeira tarefa da Fase 5). Cada
prazo abaixo foi conferido contra o texto integral da Lei 9.279/96 baixado do Planalto e contra
o Manual de Marcas do INPI. O que não foi confirmado em fonte oficial **não entrou** na tabela
de regras de `src/lib/prazos.ts` — e a ausência é deliberada, não esquecimento.

## Mapeamento código → evento de alerta da interface

Os 11 eventos que a interface expõe (ver SKILL.md) cobrem estes códigos:

| Evento da interface | Códigos IPAS confirmados |
|---|---|
| Deferimento do pedido | IPAS029, IPAS768 (designação), IPAS781 (parcial, designação) |
| Concessão de registro | IPAS158, IPAS770 (designação) |
| Oposição (Publicação/Notificação) | IPAS009, IPAS756 (designação), IPAS423 |
| Exigência Formal | IPAS005 |
| Sobrestamento | IPAS142, IPAS499, IPAS227 (petição), IPAS771 (designação) |
| Exigência de Mérito | IPAS136, IPAS267 (petição), IPAS772 (designação) |
| Indeferimento do pedido | IPAS024, IPAS774 (designação), IPAS658 (retificação) |
| Aguardando pagamento da concessão | IPAS395, IPAS089 (petição) — *exigência de pagamento* |
| Extinção ou Arquivamento | IPAS161, IPAS304, IPAS139, IPAS106, IPAS157, IPAS185, IPAS289, IPAS291, IPAS404, IPAS409, IPAS773, IPAS1016 |
| Aguardando Exame | *(estado, não despacho — não aparece como código próprio nas edições analisadas)* |
| Registro de Marca Vigente | *(estado, não despacho — idem)* |

## A regra de contagem (validada — é onde nasce o erro de prazo)

A contagem **não** começa na data de publicação. Os quatro artigos que a definem, em conjunto:

- **Art. 221** — "Os prazos estabelecidos nesta Lei são **contínuos**" → dias corridos, fim de
  semana e feriado contam *dentro* do prazo.
- **Art. 222** — "No cômputo dos prazos, **exclui-se o dia do começo** e inclui-se o do vencimento."
- **Art. 223** — "Os prazos somente começam a correr a partir do **primeiro dia útil após a
  intimação**, que será feita mediante publicação no órgão oficial do INPI."
- **Art. 224** — "Não havendo expressa estipulação nesta Lei, o prazo para a prática do ato será
  de 60 (sessenta) dias" (regra supletiva).

Disso sai a fórmula implementada em `src/lib/prazos.ts`:

```
dia 1     = primeiro dia útil APÓS a data de publicação na RPI
dataLimite = dia 1 + (N - 1) dias corridos
```

Conferida contra exemplo trabalhado publicado: publicação terça 10/06 → dia 1 = quarta 11/06 →
dia 60 = sábado 09/08. O `-1` é o art. 222: o dia 1 já é o primeiro dia contado.

### Duas divergências deliberadas em relação à letra da lei

Ambas empurram a data calculada para **antes** do vencimento real, nunca depois. Essa é a
invariante do módulo — *a data exibida nunca é mais tarde que a data legal*, porque errar para
o lado "você tem mais tempo" é o único erro que faz o usuário perder o prazo:

1. **Prorrogação de vencimento em dia não útil NÃO é aplicada.** A regra existe (prazo que vence
   em sábado/domingo/feriado corre até o primeiro dia útil seguinte), mas aplicá-la exigiria o
   calendário próprio do INPI e só serviria para dar ao usuário 1-3 dias a mais — exatamente a
   direção perigosa. O prazo real é sempre ≥ o exibido.
2. **Ponto facultativo (Carnaval, Corpus Christi) não entra na lista de dias não úteis**, só
   feriado nacional estatutário + Sexta-feira Santa. Incluí-lo atrasaria o dia 1 e, com ele, o
   vencimento. Excluí-lo antecipa — lado seguro.

> Consequência prática a comunicar ao usuário: a data-limite deste sistema é um **piso seguro**,
> não um substituto da consulta ao processo no INPI. Nenhuma tela deve apresentá-la como
> certidão de prazo.

## Prazos validados (fonte oficial — 28/07/2026)

Base de contagem de todos: a data de publicação do despacho na RPI (art. 226 — os atos do INPI
só produzem efeito a partir da publicação).

| Código | Despacho | Tipo de prazo | Prazo | Fundamento (texto conferido) |
|---|---|---|---|---|
| IPAS009, IPAS756 | Publicação de pedido para oposição | Oposição de terceiros | 60 dias | art. 158, *caput* — "publicado para apresentação de oposição no prazo de 60 (sessenta) dias" |
| IPAS423 | Notificação de oposição | Manifestação sobre a oposição | 60 dias | art. 158 §1º — "O depositante será intimado da oposição, podendo se manifestar no prazo de 60 (sessenta) dias" |
| IPAS136, IPAS267, IPAS772 | Exigência de mérito | Cumprimento de exigência | 60 dias | art. 159 — "exigências, que deverão ser respondidas no prazo de 60 (sessenta) dias"; §1º: não respondida, arquivamento definitivo |
| IPAS005 | Exigência formal | Cumprimento de exigência formal | **5 dias** | art. 157 — "exigências a serem cumpridas pelo depositante, em 5 (cinco) dias, sob pena de ser considerado inexistente" |
| IPAS029, IPAS768, IPAS781 | Deferimento do pedido | Pagamento da concessão (ordinário) | 60 dias | art. 162 *caput* — "no prazo de 60 (sessenta) dias contados do deferimento" |
| ⇡ mesmo despacho | ⇡ | Pagamento da concessão (extraordinário) | **90 dias** | art. 162 §único — "dentro de 30 (trinta) dias após o prazo previsto neste artigo", com retribuição específica, sob pena de arquivamento definitivo |
| IPAS024, IPAS774 | Indeferimento do pedido | Recurso | 60 dias | art. 212 — "cabe recurso, que será interposto no prazo de 60 (sessenta) dias" |
| IPAS360 | Notificação de recurso | Contrarrazões | 60 dias | art. 213 — "intimados para, no prazo de 60 (sessenta) dias, oferecerem contra-razões ao recurso" |
| IPAS338 | Notificação de caducidade | Manifestação do titular | 60 dias | art. 143 §2º — "O titular será intimado para se manifestar no prazo de 60 (sessenta) dias, cabendo-lhe o ônus de provar o uso" |
| IPAS400, IPAS437 | Instauração de processo de nulidade | Manifestação do titular | 60 dias | art. 170 — "O titular será intimado para se manifestar no prazo de 60 (sessenta) dias" |
| IPAS395, IPAS089 | Exigência de pagamento | Cumprimento da exigência | 60 dias | art. 224 (**supletivo** — a LPI não fixa prazo próprio para este ato) |
| IPAS158, IPAS770 | Concessão de registro | Prorrogação (ordinária) | **10 anos** | art. 133 — vigência de 10 anos da concessão; §1º: pedido "durante o último ano de vigência". Art. 163: concessão se reputa na data da publicação |
| ⇡ mesmo despacho | ⇡ | Prorrogação (extraordinária) | **10 anos + 6 meses** | art. 133 §2º — "poderá fazê-lo nos 6 (seis) meses subseqüentes, mediante o pagamento de retribuição adicional" |

Os prazos em **anos** (prorrogação) não passam pela regra do primeiro dia útil: o art. 133 conta
da data da concessão, não de uma intimação a ser respondida.

### Códigos deliberadamente SEM regra de prazo

Não porque faltou pesquisar, mas porque não geram prazo para o titular monitorado:
`IPAS270`/`IPAS271` (decisão de petição), `IPAS161`/`IPAS304` e demais extinções/arquivamentos
(o prazo já se esgotou), `IPAS142`/`IPAS499` (sobrestamento suspende, não abre prazo),
`IPAS235`/`IPAS237` e demais decisões de recurso (art. 215: "final e irrecorrível na esfera
administrativa"), anotações da série `IPAS9xx`. Se algum precisar de regra, valide antes de
adicionar — a regra desta tabela vale para prazos tanto quanto para códigos.

### Colidência (marca de terceiro) gera só um prazo

Quando o despacho chega à marca do usuário por **similaridade** (Fase 4), ele é de um processo
de terceiro. O único prazo acionável nesse caso é opor-se: IPAS009/IPAS756 → 60 dias do art. 158.
Gerar "pagamento da concessão" ou "recurso" a partir de um processo alheio seria dar ao usuário
um prazo que não é dele. Ver `prazosDoDespacho` em `src/lib/prazos.ts`.

## Fluxograma oficial de fases (Índice Geral, página 3 de qualquer edição)

**Fonte de confirmação**: página 3 (Índice Geral) da RPI 2900 (04/08/2026), seção de Marcas —
baixada em `https://revistas.inpi.gov.br/pdf/Marcas2900.pdf`, página extraída e lida em
05/08/2026. É o próprio INPI quem agrupa os despachos dessa forma; a numeração de página muda a
cada edição, mas a estrutura de fases é estável (mesmas 10 seções macro, mesma ordem).

As 10 fases macro, na ordem do índice:

1. Pedido de registro de marca em andamento (exigência de pagamento, exigência formal, publicação
   para oposição, notificação de oposição, exame de mérito: exigência/sobrestamento/indeferimento/
   deferimento — e as mesmas variantes "em designação")
2. Pedidos de registro de marca considerados inexistentes (falta de pagamento da retribuição,
   cumprimento insatisfatório de exigência de pagamento ou formal)
3. Pedidos de registro de marca definitivamente arquivados (falta de procuração, de documentos de
   marca de certificação/coletiva, de resposta à exigência de mérito, de pagamento da concessão)
4. Desistências de pedidos de registro de marca
5. Concessões de registros de marca
6. Registros de marca extintos (fim da vigência, caducidade)
7. Registros de marca cancelados de ofício
8. Renúncias a registros de marca
9. Nulidades administrativas de registros de marca
10. Caducidades de registros de marca

Implementado em `src/lib/roadmap-marca.ts` (`FASES_ROADMAP`), consumido pela tela de detalhe da
marca (`/marcas/[id]`). **Cobertura deliberadamente parcial**: um código só entra numa fase quando
o nome oficial do despacho (tabela acima) deixa a fase inequívoca. Um bloco de códigos é genérico
por natureza — `IPAS270`/`IPAS271` ("Deferimento"/"Indeferimento da petição"), `IPAS349`, `IPAS699`,
`IPAS402`, `IPAS403`, `IPAS566`, `IPAS567`, `IPAS337`, `IPAS428`, `IPAS235`, `IPAS237`, `IPAS975` e
afins decidem QUALQUER tipo de petição (desistência, renúncia, retificação, prioridade...), e o
Índice Geral só sabe separar o tipo porque agrupa fisicamente o despacho dentro da seção certa do
PDF — informação que a ingestão não grava hoje (não existe coluna para "seção do índice" em
`despachos`). Por isso as fases "Desistência" e "Renúncia" ficam sem código próprio no roadmap: são
mostradas, mas nunca marcadas como alcançadas a partir do código sozinho. Se um dia isso importar o
bastante para justificar o trabalho, a saída é gravar a seção do índice junto do despacho durante o
parse do XML (o XML já sabe em qual bloco publicou cada um), não adivinhar pelo código.

## Todos os códigos confirmados (83), por frequência nas edições 2897+2898

| Código | Nome oficial publicado | Ocorrências |
|---|---|---|
| IPAS158 | Concessão de registro | 17.713 |
| IPAS009 | Publicação de pedido de registro para oposição (exame formal concluído) | 16.975 |
| IPAS029 | Deferimento do pedido | 14.362 |
| IPAS270 | Deferimento da petição | 7.727 |
| IPAS024 | Indeferimento do pedido | 5.371 |
| IPAS136 | Exigência de mérito | 4.968 |
| IPAS161 | Extinção de registro pela expiração do prazo de vigência | 2.200 |
| IPAS360 | Notificação de recurso | 1.601 |
| IPAS139 | Arquivamento definitivo de pedido de registro por falta de cumprimento de exigência de mérito | 1.313 |
| IPAS423 | Notificação de oposição | 931 |
| IPAS428 | Decisão de não conhecer da petição | 748 |
| IPAS142 | Sobrestamento do exame de mérito | 594 |
| IPAS400 | Notificação de instauração de processo de nulidade a requerimento | 478 |
| IPAS768 | Deferimento de designação | 459 |
| IPAS047 | Decisão de considerar pedido inexistente por falta de pagamento | 376 |
| IPAS770 | Concessão de registro em designação | 357 |
| IPAS756 | Publicação de pedido de registro para oposição (exame formal de designação concluído) | 296 |
| IPAS304 | Extinção de registro pela caducidade | 231 |
| IPAS699 | Ato de prejudicar petição | 208 |
| IPAS395 | Exigência de pagamento | 202 |
| IPAS271 | Indeferimento da petição | 189 |
| IPAS462 | Notificação de procedimento judicial | 183 |
| IPAS235 | Recurso não provido (decisão mantida) | 181 |
| IPAS900 | Anotação de alteração de nome e/ou endereço em designação | 168 |
| IPAS267 | Exigência de mérito (em petição) | 153 |
| IPAS1054 | Petição de trâmite prioritário atendida | 131 |
| IPAS106 | Arquivamento definitivo de pedido de registro por falta de procuração | 119 |
| IPAS579 | Emissão de segunda via de certificado de registro | 118 |
| IPAS005 | Exigência formal | 98 |
| IPAS237 | Recurso provido (decisão reformada para: Deferimento) | 95 |
| IPAS338 | Notificação de caducidade | 80 |
| IPAS774 | Indeferimento de designação | 75 |
| IPAS901 | Anotação de transferência de titularidade em designação | 73 |
| IPAS639 | Publicação de decisão judicial transitada em julgado | 71 |
| IPAS781 | Deferimento parcial de designação | 67 |
| IPAS421 | Republicação de pedido | 67 |
| IPAS1055 | Petição de trâmite prioritário não atendida | 49 |
| IPAS499 | Sobrestamento da instrução técnica | 46 |
| IPAS772 | Exigência de mérito em designação | 41 |
| IPAS1069 | Petição de trâmite prioritário apta (aguardando término de prazo legal) | 38 |
| IPAS403 | Anulação de despacho (em petição) | 37 |
| IPAS905 | Anotação de restrição de especificação em designação | 33 |
| IPAS902 | Anotação de cancelamento parcial de especificação em designação | 33 |
| IPAS669 | Deferimento da petição de caducidade | 32 |
| IPAS185 | Arquivamento de petição por falta de procuração | 31 |
| IPAS773 | Arquivamento definitivo de designação por falta de cumprimento de exigência de mérito | 28 |
| IPAS566 | Petição de retificação atendida | 25 |
| IPAS409 | Cancelamento de ofício de registro de marca | 25 |
| IPAS402 | Anulação de despacho (em processo) | 22 |
| IPAS289 | Arquivamento definitivo de pedido de registro por falta de documentos de marca de certificação | 11 |
| IPAS091 | Decisão de considerar pedido inexistente por exigência de pagamento não cumprida | 10 |
| IPAS349 | Deferimento parcial da petição | 9 |
| IPAS089 | Exigência de pagamento (em petição) | 9 |
| IPAS771 | Sobrestamento do exame de mérito de designação | 8 |
| IPAS530 | Requerimento provido (nulo o registro) | 7 |
| IPAS567 | Petição de retificação não atendida | 6 |
| IPAS532 | Requerimento não provido (mantida a concessão) | 6 |
| IPAS112 | Decisão de considerar pedido inexistente por exigência formal não respondida | 6 |
| IPAS437 | Notificação de instauração de processo de nulidade de ofício | 5 |
| IPAS975 | Recurso provido (decisão reformada com necessidade de devolução dos autos para a primeira instância) | 4 |
| IPAS575 | Emissão de Cópia oficial de registro de marca | 4 |
| IPAS404 | Arquivamento de ofício de pedido de registro de marca | 4 |
| IPAS157 | Arquivamento definitivo de pedido de registro por falta de pagamento da concessão | 4 |
| IPAS337 | Indeferimento da petição por falta de legítimo interesse | 3 |
| IPAS903 | Retificação de dados em designação | 2 |
| IPAS291 | Arquivamento definitivo de pedido de registro por falta de documentos de marca coletiva | 2 |
| IPAS135 | Republicação de pedido (por perda da prioridade) | 2 |
| IPAS972 | Anulação de despacho (em comunicação de Madri) | 1 |
| IPAS965 | Renúncia total a registro de marca em razão de renúncia à Inscrição Internacional que afeta o Brasil | 1 |
| IPAS906 | Indeferimento de anotação de restrição de especificação em designação | 1 |
| IPAS815 | Comunicação ao usuário de irregularidade notificada pela SI | 1 |
| IPAS797 | Pedido Internacional certificado e enviado à Secretaria Internacional | 1 |
| IPAS794 | Decisão de considerar Pedido Internacional inexistente pela não resposta à notif. de inconsistência | 1 |
| IPAS757 | Republicação de designação | 1 |
| IPAS753 | Notificação de obrigatoriedade de apresentação de documentos de marca coletiva ou de certificação | 1 |
| IPAS658 | Indeferimento do pedido (em retificação) | 1 |
| IPAS369 | Recurso provido (decisão reformada para: Indeferimento) | 1 |
| IPAS362 | Exigência sobre alto renome | 1 |
| IPAS227 | Sobrestamento do exame de mérito (em petição) | 1 |
| IPAS113 | Decisão de considerar pedido inexistente por exigência formal não cumprida | 1 |
| IPAS1028 | Notificação de processo decorrente de transferência parcial (Madri) da inscrição internacional | 1 |
| IPAS1016 | Anotação de transferência parcial com efeito de arquivamento de designação ou extinção de registro | 1 |

> Códigos "em designação" / "Madri" referem-se ao Protocolo de Madri (registro internacional
> designando o Brasil) — relevantes só se o usuário monitorar processos internacionais.
