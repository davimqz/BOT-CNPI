// Motor de similaridade fonética PT-BR (Fase 4) — especificação travada na skill
// `phonetic-ptbr-matching`. Módulo puro e determinístico, sem banco: é o que
// permite os testes de regressão de `similaridade.test.ts` valerem como contrato.
//
// As 5 camadas da skill, na ordem: normalização → comparação textual →
// Soundex-PT → Metaphone-PT → comparação por tokens. Nenhuma delas decide
// sozinha; o score final combina todas (ver `compararMarcas`).

/** Thresholds oferecidos ao usuário (percentual), conforme a skill. */
export const THRESHOLDS = { liberal: 65, padrao: 80, rigoroso: 90 } as const;
export const THRESHOLD_PADRAO = THRESHOLDS.padrao;

// ---------------------------------------------------------------------------
// Camada 1 — normalização
// ---------------------------------------------------------------------------

/**
 * Base de todas as camadas seguintes: maiúsculas, sem acento, com as três
 * substituições fonéticas confirmadas na skill (PH→F, K→C, W→V). Ex.:
 * "KOKA KOLA" → "COCA COLA".
 *
 * Diferente de `normalizarNomeMarca` (verificacao.ts), o espaço é PRESERVADO —
 * a camada de tokens precisa saber onde uma palavra termina. Pontuação vira
 * separador ("COCA-COLA" → "COCA COLA"), e dígitos são mantidos porque existem
 * marcas com número no nome.
 */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/PH/g, 'F')
    .replace(/K/g, 'C')
    .replace(/W/g, 'V')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Só as letras, sem espaço — entrada das codificações fonéticas, que são por palavra. */
function letrasDe(texto: string): string {
  return normalizar(texto).replace(/[^A-Z]/g, '');
}

// ---------------------------------------------------------------------------
// Camada 2 — comparação textual (equivalente ao SequenceMatcher do difflib)
// ---------------------------------------------------------------------------

/**
 * Soma dos blocos coincidentes, como o `difflib.SequenceMatcher`: acha o maior
 * bloco contíguo em comum e recursa à esquerda e à direita dele. Não implementa
 * o "autojunk" do Python (heurística que ignora elementos muito frequentes em
 * sequências com mais de 200 itens) — nome de marca nunca chega perto disso.
 */
function totalCoincidente(a: string, b: string): number {
  if (!a || !b) return 0;

  // DP do maior substring comum, mantendo só a linha anterior.
  let inicioA = 0;
  let inicioB = 0;
  let maior = 0;
  let anterior = new Array<number>(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    const atual = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) {
      if (a[i] !== b[j]) continue;
      const tamanho = anterior[j] + 1;
      atual[j + 1] = tamanho;
      // `>` (e não `>=`) mantém o primeiro bloco em caso de empate, como o difflib.
      if (tamanho > maior) {
        maior = tamanho;
        inicioA = i - tamanho + 1;
        inicioB = j - tamanho + 1;
      }
    }
    anterior = atual;
  }
  if (maior === 0) return 0;

  return (
    maior +
    totalCoincidente(a.slice(0, inicioA), b.slice(0, inicioB)) +
    totalCoincidente(a.slice(inicioA + maior), b.slice(inicioB + maior))
  );
}

/** Similaridade textual 0-1 — a mesma fórmula do `ratio()` do difflib: 2·M / T. */
export function razaoSequencia(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  return (2 * totalCoincidente(a, b)) / total;
}

// ---------------------------------------------------------------------------
// Camada 3 — Soundex-PT
// ---------------------------------------------------------------------------

/**
 * Tabela de dígitos confirmada na skill. É menor que a do Soundex clássico
 * justamente porque a normalização já resolveu K→C e W→V; as demais letras
 * (vogais, H, J, Q, X, Z) não recebem dígito e funcionam como separador.
 */
const DIGITOS_SOUNDEX: Record<string, string> = {
  B: '1', P: '1', F: '1', V: '1',
  C: '2', G: '2', S: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
};

/** Código no formato clássico: inicial + 3 dígitos ("NATURA" → "N360"). */
export function soundexPt(texto: string | null | undefined): string {
  const letras = letrasDe(texto ?? '');
  if (!letras) return '';

  let codigo = letras[0];
  let anteriorDigito = DIGITOS_SOUNDEX[letras[0]] ?? '';
  for (let i = 1; i < letras.length && codigo.length < 4; i++) {
    const letra = letras[i];
    const digito = DIGITOS_SOUNDEX[letra] ?? '';
    if (digito && digito !== anteriorDigito) codigo += digito;
    // O H mudo não separa dois sons iguais ("MAHMUD" continua com um M só);
    // vogal separa, e por isso zera o dígito anterior.
    if (letra !== 'H') anteriorDigito = digito;
  }
  return codigo.padEnd(4, '0');
}

// ---------------------------------------------------------------------------
// Camada 4 — Metaphone-PT
// ---------------------------------------------------------------------------

/**
 * Espinha consonantal da palavra, com as regras da skill: LH→I, NH→N, CH→X,
 * E inicial mudo, vogais internas removidas. O H solto (fora desses dígrafos)
 * também cai — em português ele não tem som próprio. Ex.: "NATURAH" e "NATURA"
 * colapsam no mesmo "NTR".
 */
export function metaphonePt(texto: string | null | undefined): string {
  let s = letrasDe(texto ?? '');
  if (!s) return '';

  s = s.replace(/LH/g, 'I').replace(/NH/g, 'N').replace(/CH/g, 'X').replace(/H/g, '');
  if (s.startsWith('E')) s = s.slice(1);
  if (!s) return '';

  // A primeira letra fica mesmo sendo vogal (é o que distingue "AMORA" de "MORA").
  const codigo = s[0] + s.slice(1).replace(/[AEIOUY]/g, '');
  return codigo.replace(/(.)\1+/g, '$1');
}

// ---------------------------------------------------------------------------
// Combinação das camadas
// ---------------------------------------------------------------------------

export interface ResultadoSimilaridade {
  /** Percentual 0-100 já arredondado para exibição. */
  score: number;
  /** Camada 2, 0-1. */
  textual: number;
  /** Melhor entre Soundex-PT e Metaphone-PT, 0-1. */
  fonetico: number;
  /** Camada 5, 0-1. */
  tokens: number;
  parecidas: boolean;
}

/**
 * Score de um par SEM a camada de tokens — usado tanto na comparação global
 * quanto, dentro dela, palavra a palavra (por isso não pode chamar a camada 5,
 * senão a recursão não termina).
 *
 * Metade textual, metade fonético: só fonética casaria nomes de grafia muito
 * diferente demais (o Soundex tem apenas 3 dígitos), e só texto perderia
 * exatamente o caso que motiva esta fase ("KOKA" vs "COCA").
 */
function pontuarDireto(a: string, b: string): { textual: number; fonetico: number; direta: number } {
  const textual = razaoSequencia(letrasDeOuTexto(a), letrasDeOuTexto(b));
  const fonetico = Math.max(
    razaoSequencia(soundexPt(a), soundexPt(b)),
    razaoSequencia(metaphonePt(a), metaphonePt(b)),
  );
  return { textual, fonetico, direta: (textual + fonetico) / 2 };
}

/** Sem espaço: "COCA COLA" e "COCACOLA" são a mesma coisa para a comparação global. */
function letrasDeOuTexto(texto: string): string {
  return normalizar(texto).replace(/ /g, '');
}

/**
 * Camada 5 — marcas compostas. Cada palavra da menor busca seu melhor par na
 * maior (uso exclusivo: uma palavra não pareia duas vezes), e a média divide
 * pelo total de palavras da MAIOR — assim "TRILHA" sozinha não pontua 100%
 * contra "TRILHA FINANCE" só por conter uma palavra em comum.
 */
export function compararTokens(a: string, b: string): number {
  const tokensA = normalizar(a).split(' ').filter(Boolean);
  const tokensB = normalizar(b).split(' ').filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const [menor, maior] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const disponiveis = [...maior];
  let soma = 0;
  for (const token of menor) {
    let melhor = 0;
    let indice = -1;
    disponiveis.forEach((outro, i) => {
      const pontuacao = pontuarDireto(token, outro).direta;
      if (pontuacao > melhor) {
        melhor = pontuacao;
        indice = i;
      }
    });
    if (indice >= 0) disponiveis.splice(indice, 1);
    soma += melhor;
  }
  return soma / maior.length;
}

/**
 * Decisão final: o maior entre a comparação global e a por tokens. A camada de
 * tokens existe para RESGATAR casos que a global perde (marca composta com
 * palavra em comum), nunca para derrubar um casamento que a global já viu.
 */
export function compararMarcas(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold: number = THRESHOLD_PADRAO,
): ResultadoSimilaridade {
  const nomeA = normalizar(a);
  const nomeB = normalizar(b);
  if (!nomeA || !nomeB) {
    return { score: 0, textual: 0, fonetico: 0, tokens: 0, parecidas: false };
  }

  const { textual, fonetico, direta } = pontuarDireto(nomeA, nomeB);
  const tokens = compararTokens(nomeA, nomeB);
  const bruto = Math.max(direta, tokens);

  return {
    // Compara o valor cheio contra o threshold e só arredonda para exibir —
    // arredondar antes faria 79,6% virar "80%" e cruzar o limiar por engano.
    score: Math.round(bruto * 1000) / 10,
    textual,
    fonetico,
    tokens,
    parecidas: bruto * 100 >= threshold,
  };
}

export function saoParecidas(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold: number = THRESHOLD_PADRAO,
): boolean {
  return compararMarcas(a, b, threshold).parecidas;
}

/** Threshold efetivo de uma marca monitorada (coluna é nullable; nulo = padrão). */
export function thresholdDaMarca(valor: number | null | undefined): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return THRESHOLD_PADRAO;
  return Math.min(100, Math.max(1, Math.round(valor)));
}
