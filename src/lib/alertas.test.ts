import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparAlertas, ehColidencia, type DespachoPendente, type MarcaDoAlerta } from './alertas';

const marca = (over: Partial<MarcaDoAlerta> = {}): MarcaDoAlerta => ({
  id: 'm1',
  nome: 'TRILHA FINANCE',
  processo: '900123456',
  classeNcl: '36',
  destinatario: 'dono@exemplo.com',
  ...over,
});

const pendente = (over: Partial<DespachoPendente> = {}): DespachoPendente => ({
  id: 'd1',
  processo: '900123456',
  nomeMarca: 'TRILHA FINANCE',
  titular: 'TRILHA FINANCE LTDA',
  classeNcl: '36',
  codigo: 'IPAS136',
  textoDespacho: 'Exigência de mérito',
  textoComplementar: null,
  dataPublicacao: new Date('2026-07-14T00:00:00.000Z'),
  edicaoRpi: 2897,
  prazos: [],
  marca: marca(),
  ...over,
});

test('despacho do processo monitorado é movimentação própria', () => {
  assert.equal(ehColidencia(pendente()), false);
});

test('despacho de outro processo na mesma marca é colidência', () => {
  assert.equal(
    ehColidencia(pendente({ processo: '900999999', nomeMarca: 'TRILHA FINANSE' })),
    true,
  );
});

test('marca monitorada por nome casa pelo nome, mesmo escrito diferente', () => {
  const semProcesso = marca({ processo: null, nome: 'COCA-COLA' });
  assert.equal(
    ehColidencia(pendente({ marca: semProcesso, nomeMarca: 'COCA COLA', classeNcl: '36' })),
    false,
  );
  assert.equal(
    ehColidencia(pendente({ marca: semProcesso, nomeMarca: 'KOKA KOLA', classeNcl: '36' })),
    true,
  );
});

test('vários despachos da mesma marca viram um e-mail só', () => {
  const grupos = agruparAlertas([
    pendente({ id: 'a' }),
    pendente({ id: 'b', codigo: 'IPAS029' }),
  ]);
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].ids, ['a', 'b']);
});

test('colidência não viaja junto com movimentação própria da mesma marca', () => {
  const grupos = agruparAlertas([
    pendente({ id: 'a' }),
    pendente({ id: 'b', processo: '900999999', nomeMarca: 'TRILHA FINANSE' }),
  ]);
  assert.equal(grupos.length, 2);
  // Movimentação própria primeiro: se a rodada falhar no meio, o que fica para
  // trás é o alerta menos urgente.
  assert.equal(grupos[0].colidencia, false);
  assert.deepEqual(grupos[0].ids, ['a']);
  assert.equal(grupos[1].colidencia, true);
  assert.deepEqual(grupos[1].ids, ['b']);
});

test('marcas diferentes recebem e-mails diferentes', () => {
  const grupos = agruparAlertas([
    pendente({ id: 'a' }),
    pendente({
      id: 'b',
      marca: marca({ id: 'm2', nome: 'AURORA', processo: '900777777' }),
      processo: '900777777',
      nomeMarca: 'AURORA',
    }),
  ]);
  assert.equal(grupos.length, 2);
  assert.deepEqual(
    grupos.map((g) => g.marca.nome),
    ['AURORA', 'TRILHA FINANCE'],
  );
});
