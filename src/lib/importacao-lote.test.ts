import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsearImportacao } from './importacao-lote';

test('formato "só número": uma marca por linha, sem nome nem classe', () => {
  const r = parsearImportacao('912345678\n923456789\n');
  assert.equal(r.erros.length, 0);
  assert.deepEqual(r.marcas, [
    { processo: '912345678', nome: null, classeNcl: null },
    { processo: '923456789', nome: null, classeNcl: null },
  ]);
});

test('formato "número+nome" e "número+nome+classe" com ";"', () => {
  const r = parsearImportacao('912345678;NATURA\n923456789;AÇAÍ DO NORTE;30');
  assert.equal(r.erros.length, 0);
  assert.deepEqual(r.marcas, [
    { processo: '912345678', nome: 'NATURA', classeNcl: null },
    { processo: '923456789', nome: 'AÇAÍ DO NORTE', classeNcl: '30' },
  ]);
});

test('aceita vírgula e tab como separadores, decididos linha a linha', () => {
  const r = parsearImportacao('912345678,NATURA,3\n923456789\tKOKA KOLA\t32');
  assert.equal(r.erros.length, 0);
  assert.deepEqual(r.marcas, [
    { processo: '912345678', nome: 'NATURA', classeNcl: '3' },
    { processo: '923456789', nome: 'KOKA KOLA', classeNcl: '32' },
  ]);
});

test('nome contendo o separador não engole a classe (último campo é a classe)', () => {
  const r = parsearImportacao('912345678;CAFÉ; PÃO & CIA;43');
  assert.equal(r.erros.length, 0);
  assert.deepEqual(r.marcas, [
    { processo: '912345678', nome: 'CAFÉ; PÃO & CIA', classeNcl: '43' },
  ]);
});

test('nº de processo formatado é limpo, preservando zeros à esquerda', () => {
  const r = parsearImportacao('006123456;MARCA ANTIGA\n912.345.678;OUTRA');
  assert.equal(r.erros.length, 0);
  assert.equal(r.marcas[0].processo, '006123456');
  assert.equal(r.marcas[1].processo, '912345678');
});

test('linhas em branco são puladas e a numeração de linha do erro é a original', () => {
  const r = parsearImportacao('912345678\n\n\nabc;MARCA\n923456789');
  assert.equal(r.marcas.length, 2);
  assert.equal(r.erros.length, 1);
  assert.equal(r.erros[0].linha, 4);
  assert.match(r.erros[0].motivo, /processo/i);
});

test('cabeçalho de planilha na primeira linha é ignorado sem virar erro', () => {
  const r = parsearImportacao('processo;marca;classe\n912345678;NATURA;3');
  assert.equal(r.erros.length, 0);
  assert.equal(r.marcas.length, 1);
});

test('primeira linha inválida que não parece cabeçalho é erro, não cabeçalho', () => {
  const r = parsearImportacao('xyz;NATURA;3\n912345678;NATURA;3');
  assert.equal(r.erros.length, 1);
  assert.equal(r.erros[0].linha, 1);
  assert.equal(r.marcas.length, 1);
});

test('classe NCL fora de 1-45 é erro na linha, sem derrubar as demais', () => {
  const r = parsearImportacao('912345678;MARCA;46\n923456789;OUTRA;45');
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].motivo, /Classe NCL/);
  assert.equal(r.marcas.length, 1);
  assert.equal(r.marcas[0].classeNcl, '45');
});

test('processo repetido no arquivo: a segunda ocorrência vira erro apontando a primeira', () => {
  const r = parsearImportacao('912345678;NATURA\n912.345.678;NATURA DE NOVO');
  assert.equal(r.marcas.length, 1);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].motivo, /linha 1/);
});

test('nome com menos de 2 caracteres é erro', () => {
  const r = parsearImportacao('912345678;X');
  assert.equal(r.marcas.length, 0);
  assert.match(r.erros[0].motivo, /2 caracteres/);
});

test('BOM do Excel e CRLF não atrapalham a primeira linha', () => {
  const r = parsearImportacao('﻿912345678;NATURA\r\n923456789;OUTRA\r\n');
  assert.equal(r.erros.length, 0);
  assert.equal(r.marcas.length, 2);
  assert.equal(r.marcas[0].processo, '912345678');
});

test('campos vazios no fim da linha não mudam o formato', () => {
  const r = parsearImportacao('912345678;;');
  assert.equal(r.erros.length, 0);
  assert.deepEqual(r.marcas, [{ processo: '912345678', nome: null, classeNcl: null }]);
});
