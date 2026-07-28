import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  casaComMarca,
  casaPorSimilaridade,
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
    { despachoId: 'd-deferimento', marcaId: 'so-deferimento', alerta: true, motivo: 'processo' },
    { despachoId: 'd-oposicao', marcaId: 'so-deferimento', alerta: false, motivo: 'processo' },
    { despachoId: 'd-outra-marca', marcaId: 'todos', alerta: true, motivo: 'processo' },
  ]);
});

test('cruzarDespachos: primeiro casamento vence quando duas marcas casam', () => {
  const marcas = [marca({ id: 'antiga' }), marca({ id: 'duplicada' })];
  const cruzamentos = cruzarDespachos(marcas, [despacho()]);
  assert.deepEqual(cruzamentos, [
    { despachoId: 'd1', marcaId: 'antiga', alerta: true, motivo: 'nome' },
  ]);
});

test('cruzarDespachos: sem marcas monitoradas não faz trabalho nenhum', () => {
  assert.deepEqual(cruzarDespachos([], [despacho()]), []);
});

// --- Fase 4: similaridade -------------------------------------------------

test('casaPorSimilaridade: só vale com a similaridade ligada na marca', () => {
  const d = despacho({ nomeMarca: 'NATURAH', classeNcl: null });
  assert.equal(casaPorSimilaridade(marca(), d).casa, false);
  assert.equal(casaPorSimilaridade(marca({ similaridadeAtiva: true }), d).casa, true);
});

test('casaPorSimilaridade: respeita o threshold da própria marca', () => {
  const d = despacho({ nomeMarca: 'HAVAIANAS', classeNcl: null });
  const m = (threshold: number | null) =>
    marca({ nome: 'HAVAYANA', similaridadeAtiva: true, similaridadeThreshold: threshold });
  assert.equal(casaPorSimilaridade(m(65), d).casa, true);
  assert.equal(casaPorSimilaridade(m(null), d).casa, true); // nulo = padrão (80%)
  assert.equal(casaPorSimilaridade(m(90), d).casa, false);
});

test('casaPorSimilaridade: classe NCL diferente é outro ramo, não colidência', () => {
  const m = marca({ similaridadeAtiva: true, classeNcl: '3' });
  assert.equal(casaPorSimilaridade(m, despacho({ nomeMarca: 'NATURAH', classeNcl: '3' })).casa, true);
  assert.equal(casaPorSimilaridade(m, despacho({ nomeMarca: 'NATURAH', classeNcl: '35' })).casa, false);
});

test('cruzarDespachos: colidência vira alerta marcado como similaridade', () => {
  const marcas = [marca({ id: 'natura', similaridadeAtiva: true, classeNcl: '3' })];
  const cruzamentos = cruzarDespachos(marcas, [
    despacho({ id: 'd-copia', processo: '999999999', nomeMarca: 'NATURAH' }),
    despacho({ id: 'd-nada-a-ver', processo: '988888888', nomeMarca: 'BANCO DO BRASIL' }),
  ]);
  assert.equal(cruzamentos.length, 1);
  assert.equal(cruzamentos[0].despachoId, 'd-copia');
  assert.equal(cruzamentos[0].motivo, 'similaridade');
  assert.equal(cruzamentos[0].alerta, true);
  assert.ok((cruzamentos[0].score ?? 0) >= 80);
});

test('cruzarDespachos: casamento exato tem precedência sobre similaridade', () => {
  // A marca "parecida" vem primeiro na lista de propósito: mesmo assim o
  // despacho pertence a quem casa exato.
  const marcas = [
    marca({ id: 'parecida', nome: 'NATURAH', similaridadeAtiva: true }),
    marca({ id: 'dona', nome: 'NATURA', processo: '912345678' }),
  ];
  const cruzamentos = cruzarDespachos(marcas, [despacho({ nomeMarca: 'NATURA' })]);
  assert.deepEqual(cruzamentos, [
    { despachoId: 'd1', marcaId: 'dona', alerta: true, motivo: 'processo' },
  ]);
});

test('cruzarDespachos: entre marcas parecidas, a de maior score leva o despacho', () => {
  const marcas = [
    marca({ id: 'longe', nome: 'NATURAL', similaridadeAtiva: true }),
    marca({ id: 'perto', nome: 'NATURA', similaridadeAtiva: true }),
  ];
  const cruzamentos = cruzarDespachos(marcas, [
    despacho({ processo: '999999999', nomeMarca: 'NATURAH' }),
  ]);
  assert.equal(cruzamentos.length, 1);
  assert.equal(cruzamentos[0].marcaId, 'perto');
});

test('LIMITE CONHECIDO: palavra extra no nome de terceiro derruba o score', () => {
  // "NATURAH COSMETICOS" é uma colidência real contra "NATURA", mas a palavra
  // sem par custa metade da nota da camada de tokens e o score fica ~63% —
  // abaixo até do threshold liberal. Não é bug: é o preço de não alertar sobre
  // todo nome que compartilhe uma palavra genérica ("BANCO", "CASA", "BRASIL").
  // Para cobrir esse caso, use threshold customizado (~60%) na marca ou cadastre
  // também a variação composta.
  const marcas = [marca({ id: 'natura', similaridadeAtiva: true, similaridadeThreshold: 65 })];
  const despachos = [despacho({ processo: '999999999', nomeMarca: 'NATURAH COSMETICOS' })];
  assert.deepEqual(cruzarDespachos(marcas, despachos), []);

  marcas[0].similaridadeThreshold = 60;
  assert.equal(cruzarDespachos(marcas, despachos).length, 1);
});

test('cruzarDespachos: sem similaridade ligada, nome parecido continua sendo ignorado', () => {
  const cruzamentos = cruzarDespachos([marca()], [
    despacho({ processo: '999999999', nomeMarca: 'NATURAH' }),
  ]);
  assert.deepEqual(cruzamentos, []);
});
