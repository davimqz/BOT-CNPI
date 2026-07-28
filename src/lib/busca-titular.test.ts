import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretarTermoTitular, nomeTitularConfere } from './busca-titular';

test('CNPJ com pontuação vai para o campo de documento, só dígitos', () => {
  assert.deepEqual(interpretarTermoTitular('71.673.990/0001-77'), {
    campo: 'cpfCnpj',
    valor: '71673990000177',
  });
});

test('CPF sem pontuação também é documento', () => {
  assert.deepEqual(interpretarTermoTitular('12345678901'), {
    campo: 'cpfCnpj',
    valor: '12345678901',
  });
});

test('só dígitos com tamanho errado é erro, não nome', () => {
  const r = interpretarTermoTitular('123456');
  assert.ok('erro' in r && /11 ou 14/.test(r.erro));
});

test('razão social vira busca por nome, com espaços normalizados', () => {
  assert.deepEqual(interpretarTermoTitular('  NATURA   COSMÉTICOS S/A '), {
    campo: 'nome',
    valor: 'NATURA COSMÉTICOS S/A',
  });
});

test('nome com dígitos NÃO é confundido com documento', () => {
  assert.deepEqual(interpretarTermoTitular('100% NATURAL LTDA'), {
    campo: 'nome',
    valor: '100% NATURAL LTDA',
  });
});

test('nome curto demais é erro', () => {
  const r = interpretarTermoTitular('AB');
  assert.ok('erro' in r);
});

test('nomeTitularConfere ignora apóstrofos da lista, espaços e caixa', () => {
  assert.ok(nomeTitularConfere("'J.D. LIFE PRODUTOS NATURAIS LTDA - ME'", 'j.d. life  produtos naturais ltda - me'));
});

test('nomeTitularConfere NÃO ignora acentos (o pePI diferencia)', () => {
  assert.ok(!nomeTitularConfere('NATURA COSMÉTICOS S/A', 'NATURA COSMETICOS S/A'));
});
