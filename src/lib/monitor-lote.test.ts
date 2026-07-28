import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extrairClasseNcl, validarItensLote } from './monitor-lote';

test('extrairClasseNcl: formato "NCL(edição) classe" pega a classe, não a edição', () => {
  assert.equal(extrairClasseNcl('NCL(12) 35'), '35');
  assert.equal(extrairClasseNcl('NCL(11) 03'), '3');
  assert.equal(extrairClasseNcl('NCL( 8 ) : 25'), '25');
});

test('extrairClasseNcl: registro antigo só com o número da classe', () => {
  assert.equal(extrairClasseNcl('35'), '35');
  assert.equal(extrairClasseNcl('03'), '3');
});

test('extrairClasseNcl: vazio, nulo ou fora de 1-45 vira null', () => {
  assert.equal(extrairClasseNcl(null), null);
  assert.equal(extrairClasseNcl(''), null);
  assert.equal(extrairClasseNcl('—'), null);
  assert.equal(extrairClasseNcl('99'), null);
});

test('validarItensLote: mapeia marca/classe do formato do pePI e colapsa duplicatas', () => {
  const v = validarItensLote([
    { processo: '912345678', marca: 'NATURA', classe: 'NCL(12) 03' },
    { processo: '912345678', marca: 'NATURA', classe: 'NCL(12) 03' },
    { processo: '923456789', marca: '  ', classe: null },
  ]);
  assert.ok('itens' in v);
  assert.deepEqual(v.itens, [
    { processo: '912345678', nome: 'NATURA', classeNcl: '3' },
    { processo: '923456789', nome: null, classeNcl: null },
  ]);
});

test('validarItensLote: lote vazio ou processo mal formado é rejeitado', () => {
  assert.ok('erro' in validarItensLote([]));
  assert.ok('erro' in validarItensLote('não é lista'));
  assert.ok('erro' in validarItensLote([{ processo: 'abc', marca: 'X' }]));
  assert.ok('erro' in validarItensLote([{ marca: 'sem processo' }]));
});
