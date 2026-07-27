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
