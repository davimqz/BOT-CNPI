import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRIMEIRA_EDICAO_2026,
  agruparPorAnoMes,
  dataEstimada,
  edicoesFaltantes,
  montarCatalogo,
  urlPdfMarcas,
  urlXmlZip,
  type EdicaoIngerida,
} from './revistas';

const iso = (d: Date) => d.toISOString().slice(0, 10);

const ingerida = (numero: number, data: string, despachos = 100): EdicaoIngerida => ({
  numero,
  dataPublicacao: new Date(`${data}T00:00:00.000Z`),
  processadoEm: new Date('2026-08-01T12:00:00.000Z'),
  despachos,
});

test('edição 2870 é a primeira de 2026 e cai em 06/01', () => {
  assert.equal(PRIMEIRA_EDICAO_2026, 2870);
  assert.equal(iso(dataEstimada(2870)), '2026-01-06');
});

// Datas conferidas uma a uma contra o `last-modified` do servidor do INPI em
// 02/08/2026 — é o que prova que a cadência semanal vale por 10 meses seguidos.
test('estimativa semanal bate com as datas reais amostradas no INPI', () => {
  assert.equal(iso(dataEstimada(2869)), '2025-12-30');
  assert.equal(iso(dataEstimada(2871)), '2026-01-13');
  assert.equal(iso(dataEstimada(2875)), '2026-02-10');
  assert.equal(iso(dataEstimada(2880)), '2026-03-17');
  assert.equal(iso(dataEstimada(2890)), '2026-05-26');
  assert.equal(iso(dataEstimada(2897)), '2026-07-14');
  assert.equal(iso(dataEstimada(2899)), '2026-07-28');
});

test('toda data estimada cai numa terça-feira', () => {
  for (let n = PRIMEIRA_EDICAO_2026; n < PRIMEIRA_EDICAO_2026 + 60; n++) {
    assert.equal(dataEstimada(n).getUTCDay(), 2, `edição ${n} não caiu numa terça`);
  }
});

test('URLs de download seguem o padrão confirmado do INPI', () => {
  assert.equal(urlXmlZip(2897), 'https://revistas.inpi.gov.br/txt/RM2897.zip');
  assert.equal(urlPdfMarcas(2897), 'https://revistas.inpi.gov.br/pdf/Marcas2897.pdf');
});

test('catálogo é contínuo: edição não ingerida aparece marcada, não some', () => {
  const catalogo = montarCatalogo([ingerida(2897, '2026-07-14'), ingerida(2899, '2026-07-28')], {
    desde: 2897,
  });
  assert.deepEqual(
    catalogo.map((r) => [r.numero, r.ingerida]),
    [
      [2899, true],
      [2898, false],
      [2897, true],
    ],
  );
});

test('data real da edição ingerida vence a estimativa', () => {
  // Edição deslocada por feriado: publicada na quarta, não na terça.
  const [r] = montarCatalogo([ingerida(2871, '2026-01-14')], { desde: 2871 });
  assert.equal(iso(r.data), '2026-01-14');
  assert.equal(r.dataEstimada, false);
  assert.equal(iso(dataEstimada(2871)), '2026-01-13');
});

test('catálogo vazio quando não há nenhuma edição ingerida', () => {
  assert.deepEqual(montarCatalogo([]), []);
});

test('agrupamento: ano → mês, do mais recente para o mais antigo, com contagem', () => {
  const catalogo = montarCatalogo(
    [
      ingerida(2870, '2026-01-06'),
      ingerida(2871, '2026-01-13'),
      ingerida(2872, '2026-01-20'),
      ingerida(2873, '2026-01-27'),
      ingerida(2874, '2026-02-03'),
    ],
    { desde: 2870 },
  );
  const anos = agruparPorAnoMes(catalogo);

  assert.equal(anos.length, 1);
  assert.equal(anos[0].ano, 2026);
  assert.equal(anos[0].total, 5);
  assert.equal(anos[0].ingeridas, 5);
  assert.deepEqual(
    anos[0].meses.map((m) => [m.rotulo, m.revistas.length]),
    [
      ['fevereiro', 1],
      ['janeiro', 4],
    ],
  );
  assert.equal(anos[0].meses[1].chave, '2026-01');
  assert.deepEqual(anos[0].meses[1].revistas.map((r) => r.numero), [2873, 2872, 2871, 2870]);
});

// Regressão de fuso: as datas são UTC-meia-noite. Lendo com getMonth() local em
// Brasília (UTC-3), uma edição do dia 1º cairia no mês anterior e o mês inteiro
// apareceria com a contagem errada.
test('edição publicada no dia 1º fica no mês certo, não no anterior', () => {
  const catalogo = montarCatalogo([ingerida(2896, '2026-09-01')], { desde: 2896 });
  const anos = agruparPorAnoMes(catalogo);
  assert.equal(anos[0].meses[0].mes, 9);
  assert.equal(anos[0].meses[0].rotulo, 'setembro');
});

test('anos diferentes viram blocos separados', () => {
  const anos = agruparPorAnoMes(
    montarCatalogo([ingerida(2869, '2025-12-30'), ingerida(2870, '2026-01-06')], { desde: 2869 }),
  );
  assert.deepEqual(anos.map((a) => a.ano), [2026, 2025]);
});

test('faltantes: só os buracos do intervalo, do mais antigo para o mais novo', () => {
  assert.deepEqual(edicoesFaltantes([2870, 2873], 2870, 2874), [2871, 2872, 2874]);
  assert.deepEqual(edicoesFaltantes([2870, 2871], 2870, 2871), []);
  assert.deepEqual(edicoesFaltantes([], 2870, 2872), [2870, 2871, 2872]);
});
