import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compararMarcas,
  compararTokens,
  metaphonePt,
  normalizar,
  razaoSequencia,
  saoParecidas,
  soundexPt,
  THRESHOLDS,
  thresholdDaMarca,
} from './similaridade';

// ---------------------------------------------------------------------------
// Camadas isoladas
// ---------------------------------------------------------------------------

test('normalizar: acento fora, PH→F, K→C, W→V, pontuação vira separador', () => {
  assert.equal(normalizar('KOKA KOLA'), 'COCA COLA');
  assert.equal(normalizar('Açaí & Cia.'), 'ACAI CIA');
  assert.equal(normalizar('PHILIPE'), 'FILIPE');
  assert.equal(normalizar('WOLKSWAGEN'), 'VOLCSVAGEN');
  assert.equal(normalizar('COCA-COLA'), normalizar('coca cola'));
  assert.equal(normalizar('  99  Táxi '), '99 TAXI');
  assert.equal(normalizar(null), '');
});

test('razaoSequencia: mesma fórmula do ratio() do difflib', () => {
  assert.equal(razaoSequencia('NATURA', 'NATURA'), 1);
  assert.equal(razaoSequencia('ABC', 'XYZ'), 0);
  assert.equal(razaoSequencia('', ''), 1);
  // "NATURA" (6 coincidentes) contra "NATURAH" (7) → 2·6 / 13
  assert.equal(razaoSequencia('NATURA', 'NATURAH').toFixed(4), (12 / 13).toFixed(4));
});

test('soundexPt: inicial + 3 dígitos da tabela da skill', () => {
  assert.equal(soundexPt('NATURA'), 'N360'); // N + T=3, R=6
  assert.equal(soundexPt('NATURAH'), 'N360'); // H mudo não muda o código
  assert.equal(soundexPt('KOKA KOLA'), soundexPt('COCA COLA'));
  assert.equal(soundexPt('FINANCE'), soundexPt('FINANCEIRA')); // trunca em 3 dígitos
  assert.equal(soundexPt(''), '');
});

test('metaphonePt: LH→I, NH→N, CH→X, E inicial mudo, vogais internas fora', () => {
  assert.equal(metaphonePt('NATURA'), 'NTR');
  assert.equal(metaphonePt('NATURAH'), 'NTR'); // H solto é mudo em português
  assert.equal(metaphonePt('CHUCHA'), 'X'); // CH→X duas vezes, adjacentes colapsam
  assert.equal(metaphonePt('CHUCHA'), metaphonePt('XUXA'));
  assert.equal(metaphonePt('MINHA'), 'MN'); // NH→N
  assert.equal(metaphonePt('FILHO'), 'F'); // LH→I, e o I resultante é vogal interna
  assert.equal(metaphonePt('ESCOLA'), 'SCL'); // E inicial mudo
  assert.equal(metaphonePt('AMORA'), 'AMR'); // primeira letra fica mesmo sendo vogal
  assert.equal(metaphonePt(''), '');
});

test('compararTokens: palavra sem par derruba a média (não é "contém")', () => {
  assert.equal(compararTokens('TRILHA FINANCE', 'TRILHA FINANCE'), 1);
  // "TRILHA" contra 2 palavras: 1 casa, 1 fica órfã → teto de 50%.
  assert.equal(compararTokens('TRILHA', 'TRILHA FINANCE'), 0.5);
  assert.equal(compararTokens('', 'NATURA'), 0);
});

// ---------------------------------------------------------------------------
// Regressão — os pares exigidos pela skill phonetic-ptbr-matching.
// Qualquer ajuste no algoritmo ou no threshold padrão passa por aqui antes.
// ---------------------------------------------------------------------------

const REGRESSAO: { a: string; b: string; parecidas: boolean; nota: string }[] = [
  { a: 'KOKA KOLA', b: 'COCA COLA', parecidas: true, nota: 'substituição fonética clássica' },
  { a: 'NATURAH', b: 'NATURA', parecidas: true, nota: 'H final mudo' },
  { a: 'HAVAYANA', b: 'HAVAIANAS', parecidas: true, nota: 'grafia alternativa + plural' },
  { a: 'PHILIPE', b: 'FILIPE', parecidas: true, nota: 'PH→F' },
  { a: 'ELETROLUX', b: 'ELETROLUZ', parecidas: true, nota: 'troca de consoante final' },
  { a: 'Trilha Finance', b: 'Trilha Financeira', parecidas: true, nota: 'composta, palavra em comum' },
  { a: 'NATURA', b: 'AVON', parecidas: false, nota: 'negativo trivial' },
  { a: 'COCA COLA', b: 'BANCO DO BRASIL', parecidas: false, nota: 'negativo, composta' },
];

for (const caso of REGRESSAO) {
  test(`regressão (${caso.nota}): "${caso.a}" ~ "${caso.b}" = ${caso.parecidas}`, () => {
    const r = compararMarcas(caso.a, caso.b);
    assert.equal(
      r.parecidas,
      caso.parecidas,
      `score ${r.score}% no threshold padrão de ${THRESHOLDS.padrao}%`,
    );
    // Simetria: a ordem dos argumentos nunca pode mudar o veredito.
    assert.equal(compararMarcas(caso.b, caso.a).parecidas, caso.parecidas);
  });
}

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

test('threshold muda o veredito dos casos de fronteira', () => {
  // 84% — o rigoroso deixa passar variações sutis, e isso é o comportamento
  // documentado dele na skill, não um defeito do algoritmo.
  assert.equal(saoParecidas('HAVAYANA', 'HAVAIANAS', THRESHOLDS.liberal), true);
  assert.equal(saoParecidas('HAVAYANA', 'HAVAIANAS', THRESHOLDS.padrao), true);
  assert.equal(saoParecidas('HAVAYANA', 'HAVAIANAS', THRESHOLDS.rigoroso), false);

  // 70% — fonética idêntica (metaphone "X" nas duas), grafia bem diferente:
  // só o liberal captura.
  assert.equal(saoParecidas('XUXA', 'CHUCHA', THRESHOLDS.liberal), true);
  assert.equal(saoParecidas('XUXA', 'CHUCHA', THRESHOLDS.padrao), false);
});

test('compararMarcas: nome vazio nunca é parecido com nada', () => {
  assert.equal(compararMarcas('', 'NATURA').parecidas, false);
  assert.equal(compararMarcas(null, null).parecidas, false);
  assert.equal(compararMarcas('NATURA', '   ').score, 0);
});

test('thresholdDaMarca: coluna nula cai no padrão', () => {
  assert.equal(thresholdDaMarca(null), THRESHOLDS.padrao);
  assert.equal(thresholdDaMarca(undefined), THRESHOLDS.padrao);
  assert.equal(thresholdDaMarca(65), 65);
  assert.equal(thresholdDaMarca(0), 1);
  assert.equal(thresholdDaMarca(140), 100);
});
