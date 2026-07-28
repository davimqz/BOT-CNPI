import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  casaComMarca,
  classesDe,
  cruzarDespachos,
  normalizarNomeMarca,
  normalizarProcesso,
  type DespachoParaCruzamento,
  type MarcaParaCruzamento,
} from './verificacao';

const marca = (over: Partial<MarcaParaCruzamento> = {}): MarcaParaCruzamento => ({
  id: 'm1',
  nome: 'NATURA',
  processo: null,
  classeNcl: null,
  eventosAlerta: [],
  ...over,
});

const despacho = (over: Partial<DespachoParaCruzamento> = {}): DespachoParaCruzamento => ({
  id: 'd1',
  processo: '912345678',
  nomeMarca: 'NATURA',
  classeNcl: '3',
  codigo: 'IPAS029',
  ...over,
});

test('normalizarProcesso: ignora pontuação e zeros à esquerda', () => {
  assert.equal(normalizarProcesso('912.345.678'), '912345678');
  assert.equal(normalizarProcesso('0912345678'), '912345678');
  assert.equal(normalizarProcesso(null), '');
});

test('normalizarNomeMarca: sem acento, sem espaço/pontuação, maiúsculas', () => {
  assert.equal(normalizarNomeMarca('Natura Cosméticos'), 'NATURACOSMETICOS');
  assert.equal(normalizarNomeMarca('AÇAÍ & CIA.'), 'ACAICIA');
  assert.equal(normalizarNomeMarca('COCA-COLA'), normalizarNomeMarca('coca cola'));
  assert.equal(normalizarNomeMarca(null), '');
});

test('classesDe: a RPI junta várias classes numa string só', () => {
  assert.deepEqual(classesDe('35;41'), ['35', '41']);
  assert.deepEqual(classesDe('03'), ['3']);
  assert.deepEqual(classesDe(null), []);
});

test('marca cadastrada com processo casa pelo número, mesmo com nome diferente', () => {
  const m = marca({ processo: '912345678', nome: 'nome antigo digitado pelo usuário' });
  assert.equal(casaComMarca(m, despacho({ nomeMarca: 'NATURA COSMETICOS' })), true);
  assert.equal(casaComMarca(m, despacho({ processo: '999999999' })), false);
});

test('marca sem processo casa pelo nome normalizado (caixa e acento ignorados)', () => {
  assert.equal(casaComMarca(marca({ nome: 'natura' }), despacho({ nomeMarca: ' Naturá ' })), true);
  assert.equal(casaComMarca(marca({ nome: "MC DONALD'S" }), despacho({ nomeMarca: 'MC DONALDS' })), true);
  // Nome só parecido não casa aqui — similaridade é a Fase 4.
  assert.equal(casaComMarca(marca(), despacho({ nomeMarca: 'NATURAL' })), false);
});

test('classe NCL da marca filtra, mas despacho sem classe não é descartado', () => {
  const m = marca({ classeNcl: '3' });
  assert.equal(casaComMarca(m, despacho({ classeNcl: '35;3' })), true);
  assert.equal(casaComMarca(m, despacho({ classeNcl: '35' })), false);
  assert.equal(casaComMarca(m, despacho({ classeNcl: null })), true);
});

test('cruzarDespachos: só marca alerta para os eventos escolhidos', () => {
  const marcas = [
    marca({ id: 'so-deferimento', processo: '912345678', eventosAlerta: ['deferimento'] }),
    marca({ id: 'todos', processo: '923456789', eventosAlerta: [] }),
  ];
  const despachos = [
    despacho({ id: 'd-deferimento', processo: '912345678', codigo: 'IPAS029' }),
    despacho({ id: 'd-oposicao', processo: '912345678', codigo: 'IPAS009' }),
    despacho({ id: 'd-outra-marca', processo: '923456789', codigo: 'IPAS009' }),
    despacho({ id: 'd-ninguem', processo: '999999999', nomeMarca: 'OUTRA', codigo: 'IPAS029' }),
  ];

  assert.deepEqual(cruzarDespachos(marcas, despachos), [
    { despachoId: 'd-deferimento', marcaId: 'so-deferimento', alerta: true },
    { despachoId: 'd-oposicao', marcaId: 'so-deferimento', alerta: false },
    { despachoId: 'd-outra-marca', marcaId: 'todos', alerta: true },
  ]);
});

test('cruzarDespachos: primeiro casamento vence quando duas marcas casam', () => {
  const marcas = [marca({ id: 'antiga' }), marca({ id: 'duplicada' })];
  const cruzamentos = cruzarDespachos(marcas, [despacho()]);
  assert.deepEqual(cruzamentos, [{ despachoId: 'd1', marcaId: 'antiga', alerta: true }]);
});

test('cruzarDespachos: sem marcas monitoradas não faz trabalho nenhum', () => {
  assert.deepEqual(cruzarDespachos([], [despacho()]), []);
});
