import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRevista } from './parse';

// Fixture derivada de estruturas reais das edições 2897/2898 + exemplos do manual v1.03
// (inclui os dois layouts: publicação de pedido e publicação de petição).
const xml = readFileSync(join(__dirname, 'fixtures', 'revista-amostra.xml'), 'utf-8');

test('extrai número e data da revista', () => {
  const r = parseRevista(xml);
  assert.equal(r.numero, 2898);
  assert.equal(r.dataPublicacao.toISOString().slice(0, 10), '2026-07-21');
});

test('extrai um despacho por linha, inclusive múltiplos por processo', () => {
  const r = parseRevista(xml);
  assert.equal(r.despachos.length, 4);
  assert.deepEqual(
    r.despachos.map((d) => d.codigo),
    ['IPAS009', 'IPAS270', 'IPAS158', 'IPAS423'],
  );
});

test('preserva acentuação em marca e titular', () => {
  const r = parseRevista(xml);
  const d = r.despachos[0];
  assert.equal(d.nomeMarca, 'AÇAÍTERIA SÃO JOÃO');
  assert.equal(d.titular, 'AÇAÍ & CIA COMÉRCIO LTDA');
});

test('junta múltiplas classes NCL e múltiplos titulares', () => {
  const r = parseRevista(xml);
  assert.equal(r.despachos[0].classeNcl, '43;35');
  assert.equal(r.despachos[2].titular, 'TITULAR UM SA; TITULAR DOIS ME');
  // <classe-nice> direta (formato do manual), sem o wrapper <lista-classe-nice>
  assert.equal(r.despachos[2].classeNcl, '41');
});

test('petição sem bloco <marca> vira despacho sem nome de marca', () => {
  const r = parseRevista(xml);
  const d = r.despachos[1];
  assert.equal(d.processo, '821331698');
  assert.equal(d.nomeMarca, null);
  assert.equal(d.textoComplementar, 'Texto descritivo do despacho');
});

test('número de processo mantém zeros à esquerda como string', () => {
  const r = parseRevista(xml.replace('944030084', '004030084'));
  assert.equal(r.despachos[0].processo, '004030084');
});

test('falha alto se a raiz <revista> mudar', () => {
  assert.throws(() => parseRevista('<foo/>'), /layout mudou/);
});
