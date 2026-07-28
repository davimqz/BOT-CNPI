---
name: phonetic-ptbr-matching
description: Use this skill whenever implementing, testing, or tuning the trademark-name similarity engine ("busca por marcas parecidas", "colidência", "similaridade fonética") — the feature that flags brand names that sound alike even when spelled differently (e.g. "KOKA KOLA" vs "COCA COLA"). Trigger for tasks involving Soundex or Metaphone adapted to Portuguese, text-distance comparison, similarity thresholds, or token-based matching for compound brand names, even if the user just says "detecta marca parecida" or "compara fonética" without naming this skill.
---

# Motor de similaridade fonética PT-BR

## Por que isso existe

Este é o algoritmo com mais nuance de todo o projeto — combina várias técnicas em camadas, e é fácil cada implementação nova divergir sutilmente da anterior (por exemplo, mudar a ordem de normalização, ou esquecer um caso de substituição fonética). Esta skill trava a especificação exata observada no software de referência, para que qualquer sessão futura implemente (ou ajuste) o mesmo algoritmo, e não uma variação inconsistente dele.

## As 5 camadas, na ordem

O sistema de referência aplica estas técnicas em conjunto, não isoladamente — cada marca candidata passa por todas elas antes da decisão final de "parecida o suficiente".

### 1. Normalização de texto
Antes de qualquer comparação, o texto passa por:
- Remoção de acentos (á→a, ç→c, etc.)
- Substituições fonéticas de letras: `K → C`, `W → V`, `PH → F`
- Exemplo confirmado: `"KOKA KOLA"` → `"COCA COLA"` após normalização.

Implemente isso como uma função pura e determinística (`normalizar(texto: str) -> str`), testável isoladamente — é a base de tudo que vem depois.

### 2. Comparação de texto (distância/similaridade de string)
Usa um algoritmo de sequência tipo `SequenceMatcher` (equivalente ao `difflib` do Python) para calcular um score de similaridade textual entre os dois nomes já normalizados. Isso captura semelhanças que não são puramente fonéticas (erros de digitação, pequenas variações).

### 3. Soundex adaptado ao português (Soundex-PT)
Codifica grupos de sons em dígitos, conforme a tabela confirmada no software de referência:

| Dígito | Letras |
|---|---|
| 1 | B, P, F, V |
| 2 | C, G, S |
| 3 | D, T |
| 4 | L |
| 5 | M, N |
| 6 | R |

Nomes que soam parecido tendem a colapsar no mesmo código Soundex, mesmo com grafias diferentes.

### 4. Metaphone adaptado ao português (Metaphone-PT)
Regras confirmadas no software de referência:
- `LH → I`
- `NH → N`
- `CH → X`
- `E` inicial mudo (é descartado se for a primeira letra e não pronunciado)
- Remoção de vogais internas (mantém só a "espinha consonantal" da palavra, capturando o padrão sonoro sem o ruído das vogais)

Isso é uma segunda codificação fonética, complementar ao Soundex — rode as duas e considere ambas na decisão final (nomes que batem em qualquer uma delas são candidatos fortes).

### 5. Comparação por tokens
Para marcas compostas por mais de uma palavra (ex: "Trilha Finance" vs "Trilha Financeira"), compare palavra a palavra em vez de tratar a marca inteira como uma string única — isso evita que uma palavra em comum entre marcas de tamanhos diferentes passe despercebida na comparação global.

## Threshold ajustável

A decisão final de "é parecido o suficiente para alertar" usa um score combinado das camadas acima, comparado contra um threshold configurável pelo usuário:

- **65% — Liberal**: mais falsos positivos, mas pega mais casos reais de tentativa de cópia.
- **80% — Padrão**: equilíbrio recomendado como default.
- **90% — Rigoroso**: menos ruído, mas pode deixar passar variações mais sutis.

Ao implementar, exponha o threshold como parâmetro configurável por marca monitorada (não como constante global) — o software de referência permite isso por marca, não só globalmente.

## Como testar esta implementação

Construa um conjunto de pares de teste com o resultado esperado (parecido / não parecido), incluindo pelo menos:
- Um caso de substituição fonética clássica (`"KOKA KOLA"` vs `"COCA COLA"` → deve bater)
- Um caso de grafia alternativa comum em português (`"NATURAH"` vs `"NATURA"`, `"HAVAYANA"` vs `"HAVAIANAS"` — exemplos citados no próprio software de referência como casos que a análise fonética deve capturar)
- Um caso de marca composta com uma palavra em comum (`"Trilha Finance"` vs `"Trilha Financeira"`)
- Um caso claramente negativo (duas marcas sem nenhuma relação fonética ou textual), para garantir que o threshold não gera falsos positivos triviais

Trate esses pares como testes de regressão permanentes — qualquer ajuste no algoritmo ou no threshold default deve rodar contra eles antes de ser aceito.

---

## Implementação confirmada (Fase 4, 28/07/2026)

Código em `src/lib/similaridade.ts`, regressão em `src/lib/similaridade.test.ts`, integração
com o job de verificação em `src/lib/verificacao.ts` (`casaPorSimilaridade` / `cruzarDespachos`).

### Como as camadas se combinam

O score final é `max(direta, tokens)`, onde `direta = (textual + fonetico) / 2` e
`fonetico = max(razão entre os Soundex, razão entre os Metaphone)`.

Três decisões que valem mais que o código, porque foram testadas contra alternativas:

1. **Comparar os códigos fonéticos por razão de sequência, não por igualdade.** Soundex-PT tem
   só 3 dígitos: exigir igualdade exata joga fora quase-acertos como `HAVAYANA` (H150) vs
   `HAVAIANAS` (H152), que é justamente o caso que a skill manda capturar.
2. **Metade textual, metade fonética.** Só fonética casa demais (a espinha consonantal é
   grosseira: `AVIVANSE` e `HAVAIANAS` colapsam no mesmo `AVNS`); só texto perde `KOKA`/`COCA`.
   Trocar a média por `max()` foi testado e derruba a precisão sem ganhar recall relevante.
3. **Tokens só sobem o score, nunca descem** — a camada 5 existe para resgatar marca composta
   que a comparação global perde, não para vetar casamento que a global já viu.

### Calibração contra dados reais

Sobre 16.668 nomes distintos publicados em edições reais da RPI (RM2897-2899), quantos nomes
cada threshold acusa como "parecido" com uma marca monitorada:

| Marca monitorada | 65% (liberal) | 80% (padrão) | 90% (rigoroso) |
|---|---|---|---|
| NATURA | 62 | 3 | 0 |
| COCA COLA | 53 | 0 | 0 |
| HAVAIANAS | 12 | 2 | 0 |
| ITAU | 13 | 0 | 0 |
| TRILHA FINANCE | 9 | 0 | 0 |

Leitura prática: **80% é um default honesto** (0-3 alertas por edição, revisáveis à mão); 65%
gera dezenas de itens por edição e só faz sentido para quem vai triar ativamente; 90% não
encontrou nada numa base de 16 mil nomes, ou seja, na prática ele só pega grafia quase idêntica.

Custo: ~800ms para comparar uma marca contra 16 mil nomes. `cruzarDespachos` guarda cache por
`nomeMarca|classeNcl` porque o mesmo nome se repete muito dentro de uma edição.

### Limite conhecido (não é bug)

Marca de uma palavra contra nome de terceiro com palavra extra — `NATURA` vs
`NATURAH COSMETICOS` — pontua ~63%, abaixo até do liberal, porque a palavra sem par vale zero
na média da camada de tokens. Esse é o preço de não alertar sobre todo nome que compartilhe uma
palavra genérica (`BANCO`, `CASA`, `BRASIL`). Para cobrir o caso, use threshold customizado
(~60%) na marca ou cadastre também a variação composta. Há teste de regressão fixando esse
comportamento (`LIMITE CONHECIDO:` em `verificacao.test.ts`) — se ele mudar, foi decisão, não acidente.

### Falsos positivos que a fonética produz de propósito

`ZUNATRA`/`VENTURA`/`NURA` contra NATURA (81%), `AVIVANSE` contra HAVAIANAS (85%). Todos têm
espinha consonantal e/ou Soundex próximos. Não tente eliminá-los com regra ad-hoc: o volume é
baixo (3 em 16 mil) e a mesma sensibilidade é o que captura uma cópia deliberada.
