import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compararSnapshots,
  descreverDiff,
  despachosDeMudanca,
  houveMovimentacao,
  lerSnapshot,
  mesclarSnapshotTruncado,
  snapshotDeResultados,
} from './monitor-pepi';
import { CODIGO_DESPACHO_PEPI } from './verificacao';

test('snapshotDeResultados: processo → situação, com espaços normalizados', () => {
  assert.deepEqual(
    snapshotDeResultados([
      { processo: '912345678', marca: 'NATURA', situacao: '  Registro   de marca em vigor ' },
      { processo: '923456789', marca: 'NATURA', situacao: null },
      { processo: '  ', marca: 'sem processo', situacao: 'x' },
    ]),
    { '912345678': 'Registro de marca em vigor', '923456789': '(sem situação)' },
  );
});

test('lerSnapshot: aceita objeto de strings, rejeita o resto', () => {
  assert.deepEqual(lerSnapshot({ '912345678': 'Deferido' }), { '912345678': 'Deferido' });
  assert.deepEqual(lerSnapshot({ '912345678': 3 }), {});
  assert.equal(lerSnapshot(null), null);
  assert.equal(lerSnapshot([]), null);
  assert.equal(lerSnapshot('Deferido'), null);
});

test('compararSnapshots: separa novo, alterado e sumido', () => {
  const diff = compararSnapshots(
    { '1': 'Em exame', '2': 'Deferido', '3': 'Arquivado' },
    { '1': 'Deferido', '2': 'Deferido', '4': 'Em exame' },
  );
  assert.deepEqual(diff, {
    novos: ['4'],
    alterados: [{ processo: '1', de: 'Em exame', para: 'Deferido' }],
    sumidos: ['3'],
  });
});

test('houveMovimentacao: sumiço sozinho não alerta (instabilidade do pePI)', () => {
  assert.equal(houveMovimentacao({ novos: [], alterados: [], sumidos: ['3'] }), false);
  assert.equal(houveMovimentacao({ novos: ['4'], alterados: [], sumidos: [] }), true);
  assert.equal(
    houveMovimentacao({ novos: [], alterados: [{ processo: '1', de: 'a', para: 'b' }], sumidos: [] }),
    true,
  );
});

test('snapshot idêntico não gera movimentação nenhuma', () => {
  const itens = [{ processo: '912345678', marca: 'NATURA', situacao: 'Deferido' }];
  const diff = compararSnapshots(snapshotDeResultados(itens), snapshotDeResultados(itens));
  assert.equal(houveMovimentacao(diff), false);
  assert.equal(descreverDiff(diff), 'nenhuma mudança');
});

test('mesclarSnapshotTruncado: página faltando não vira "processo sumido" nem "novo" depois', () => {
  const anterior = { '1': 'Em exame', '2': 'Deferido' };
  const lidoParcial = { '1': 'Deferido' };
  const mesclado = mesclarSnapshotTruncado(anterior, lidoParcial);
  assert.deepEqual(mesclado, { '1': 'Deferido', '2': 'Deferido' });

  const diff = compararSnapshots(anterior, mesclado);
  assert.deepEqual(diff.sumidos, []);
  assert.deepEqual(diff.novos, []);
  assert.deepEqual(diff.alterados, [{ processo: '1', de: 'Em exame', para: 'Deferido' }]);
});

test('despachosDeMudanca: uma linha por processo movimentado, com código sintético', () => {
  const itens = [
    { processo: '1', marca: 'NATURA', situacao: 'Deferido' },
    { processo: '4', marca: '  ', situacao: 'Em exame' },
  ];
  const atual = snapshotDeResultados(itens);
  const diff = compararSnapshots({ '1': 'Em exame' }, atual);
  const linhas = despachosDeMudanca(diff, atual, itens);

  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.codigo === CODIGO_DESPACHO_PEPI));
  assert.deepEqual(
    linhas.find((l) => l.processo === '4'),
    {
      processo: '4',
      nomeMarca: null,
      codigo: CODIGO_DESPACHO_PEPI,
      textoDespacho: 'Novo processo encontrado no pePI — situação: Em exame',
    },
  );
  assert.equal(
    linhas.find((l) => l.processo === '1')?.textoDespacho,
    'Situação no pePI mudou de "Em exame" para "Deferido"',
  );
});
