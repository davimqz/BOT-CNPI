import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirNovidades, type DespachoNovo, type MarcaComEventos } from './novidades';

const marca = (over: Partial<MarcaComEventos> = {}): MarcaComEventos => ({
  id: 'm1',
  nome: 'TRILHA FINANCE',
  processo: '900123456',
  classeNcl: '36',
  destinatario: null,
  eventosAlerta: [],
  ...over,
});

const novo = (over: Partial<DespachoNovo> = {}): DespachoNovo => ({
  id: 'd1',
  processo: '900123456',
  nomeMarca: 'TRILHA FINANCE',
  classeNcl: '36',
  codigo: 'IPAS136',
  textoDespacho: 'Exigência de mérito',
  dataPublicacao: new Date('2026-07-14T00:00:00.000Z'),
  edicaoRpi: 2897,
  marca: marca(),
  ...over,
});

test('vários despachos da mesma marca viram um aviso só, com a contagem', () => {
  const r = resumirNovidades([novo({ id: 'a' }), novo({ id: 'b', codigo: 'IPAS029' })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].quantidade, 2);
  assert.equal(r[0].marcaNome, 'TRILHA FINANCE');
});

test('o aviso mostra o despacho MAIS RECENTE, não o primeiro da lista', () => {
  const r = resumirNovidades([
    novo({ id: 'a', textoDespacho: 'Exigência de mérito' }),
    novo({
      id: 'b',
      textoDespacho: 'Concessão de registro',
      codigo: 'IPAS158',
      dataPublicacao: new Date('2026-07-28T00:00:00.000Z'),
      edicaoRpi: 2899,
    }),
  ]);
  assert.equal(r[0].status, 'Concessão de registro');
  assert.equal(r[0].edicaoRpi, 2899);
});

test('colidência é separada da movimentação própria, e vem depois', () => {
  const r = resumirNovidades([
    novo({ id: 'a' }),
    novo({ id: 'b', processo: '900999999', nomeMarca: 'TRILHA FINANSE' }),
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].colidencia, false);
  assert.equal(r[1].colidencia, true);
  // O processo mostrado na colidência é o do TERCEIRO — mostrar o do usuário
  // sugeriria que o processo dele se moveu.
  assert.equal(r[1].processo, '900999999');
});

test('o pop-up respeita o filtro de eventos da marca, como o e-mail', () => {
  const so_concessao = marca({ eventosAlerta: ['concessao'] });
  const r = resumirNovidades([
    novo({ id: 'a', marca: so_concessao, codigo: 'IPAS136' }),
    novo({
      id: 'b',
      marca: so_concessao,
      codigo: 'IPAS158',
      textoDespacho: 'Concessão de registro',
    }),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].quantidade, 1, 'a exigência de mérito foi desligada pela marca');
  assert.equal(r[0].status, 'Concessão de registro');
});

test('despacho sem texto publicado cai no rótulo do evento, não no código cru', () => {
  const r = resumirNovidades([novo({ textoDespacho: null, codigo: 'IPAS158' })]);
  assert.notEqual(r[0].status, 'IPAS158');
  assert.match(r[0].status, /concess/i);
});

test('sem novidade nenhuma o resumo é vazio (o aviso não aparece)', () => {
  assert.deepEqual(resumirNovidades([]), []);
});
