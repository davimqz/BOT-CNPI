# Glossário de códigos de despacho (IPAS)

**Fonte de confirmação**: atributos `codigo`/`nome` dos despachos publicados nas edições reais
RM2897 (14/07/2026) e RM2898 (21/07/2026) da RPI Marcas — extraídos pelo pipeline de ingestão
deste projeto em 27/07/2026. O `nome` é o texto oficial publicado pelo próprio INPI no XML.

**Regra desta tabela** (ver SKILL.md): só entra código visto em dado real ou no manual oficial.
As colunas de prazo são hipóteses de trabalho baseadas na LPI (Lei 9.279/96) e **NÃO estão
validadas** — a validação contra fonte oficial é a primeira tarefa da Fase 5 do TASKS.md.
Nenhuma contagem de dias daqui pode ir para produção antes disso.

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

## Prazos candidatos (NÃO validados — Fase 5)

| Código | Despacho | Tipo de prazo candidato | Contagem candidata | Status |
|---|---|---|---|---|
| IPAS009 | Publicação de pedido para oposição | Terceiros podem opor | 60 dias da publicação (LPI art. 158) | ⚠️ a validar |
| IPAS423 | Notificação de oposição | Manifestação do titular | 60 dias da notificação (LPI art. 158 §1º) | ⚠️ a validar |
| IPAS029 | Deferimento do pedido | Pagamento da concessão | 60 dias ordinário + 30 extraordinário (LPI art. 162) | ⚠️ a validar |
| IPAS136 / IPAS267 | Exigência de mérito | Cumprimento de exigência | 60 dias (LPI art. 159 §1º… conferir) | ⚠️ a validar |
| IPAS005 | Exigência formal | Cumprimento de exigência formal | 5 dias (LPI art. 157) | ⚠️ a validar |
| IPAS024 | Indeferimento do pedido | Recurso | 60 dias (LPI art. 212) | ⚠️ a validar |
| IPAS338 | Notificação de caducidade | Defesa/contestação | 60 dias (LPI art. 143 §…) | ⚠️ a validar |
| IPAS400 / IPAS437 | Instauração de nulidade | Manifestação | 60 dias (LPI art. 170) | ⚠️ a validar |
| IPAS158 | Concessão de registro | Vigência/renovação | 10 anos; renovação no último ano (LPI art. 133) | ⚠️ a validar |

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
