import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENTOS_ALERTA, despachoDisparaAlerta, eventoPorSlug } from './eventos-alerta';

test('lista vazia (padrão) dispara para qualquer código', () => {
  assert.equal(despachoDisparaAlerta([], 'IPAS158'), true);
  assert.equal(despachoDisparaAlerta([], 'IPAS999'), true);
});

test('evento selecionado dispara só para os códigos mapeados nele', () => {
  assert.equal(despachoDisparaAlerta(['concessao'], 'IPAS158'), true);
  assert.equal(despachoDisparaAlerta(['concessao'], 'IPAS770'), true);
  assert.equal(despachoDisparaAlerta(['concessao'], 'IPAS024'), false);
});

test('mais de um evento selecionado: qualquer um deles dispara', () => {
  const selecao = ['oposicao', 'indeferimento'];
  assert.equal(despachoDisparaAlerta(selecao, 'IPAS423'), true);
  assert.equal(despachoDisparaAlerta(selecao, 'IPAS024'), true);
  assert.equal(despachoDisparaAlerta(selecao, 'IPAS158'), false);
});

test('slug desconhecido na seleção não dispara nada (nem quebra)', () => {
  assert.equal(despachoDisparaAlerta(['nao-existe'], 'IPAS158'), false);
});

test('eventos de estado (sem código IPAS) nunca disparam via despacho', () => {
  assert.equal(despachoDisparaAlerta(['aguardando-exame', 'registro-vigente'], 'IPAS158'), false);
});

test('catálogo: 11 eventos, slugs únicos, e nenhum código IPAS em dois eventos', () => {
  assert.equal(EVENTOS_ALERTA.length, 11);
  const slugs = new Set(EVENTOS_ALERTA.map((e) => e.slug));
  assert.equal(slugs.size, EVENTOS_ALERTA.length);
  const vistos = new Set<string>();
  for (const e of EVENTOS_ALERTA) {
    for (const c of e.codigos) {
      assert.equal(vistos.has(c), false, `código ${c} aparece em mais de um evento`);
      vistos.add(c);
    }
  }
});

test('eventoPorSlug resolve slug conhecido e devolve undefined para desconhecido', () => {
  assert.equal(eventoPorSlug('deferimento')?.rotulo, 'Deferimento do pedido');
  assert.equal(eventoPorSlug('xyz'), undefined);
});
