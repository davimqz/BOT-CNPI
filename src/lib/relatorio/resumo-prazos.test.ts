import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarResumoPrazos, montarAssunto } from './resumo-prazos';
import type { PrazoDetalhado } from '../prazos-consulta';

const base: PrazoDetalhado = {
  id: 'p1',
  tipo: 'exigencia_merito',
  rotulo: 'Cumprimento de exigência de mérito',
  fundamento: 'LPI art. 159',
  consequencia: 'Arquivamento definitivo.',
  dataLimite: new Date('2026-08-10T00:00:00.000Z'),
  dias: 9,
  status: 'pendente',
  processo: '900123456',
  nomeMarca: 'TRILHA FINANCE',
  codigoDespacho: 'IPAS136',
  dataPublicacao: new Date('2026-06-09T00:00:00.000Z'),
  edicaoRpi: 2897,
  marcaId: 'm1',
  marcaNome: 'TRILHA FINANCE',
  colidencia: false,
};

const prazo = (over: Partial<PrazoDetalhado>): PrazoDetalhado => ({ ...base, ...over });

test('assunto carrega a urgência, não só a contagem', () => {
  assert.match(montarAssunto([prazo({ dias: 3 })]), /mais urgente em 3 dia/);
  assert.match(montarAssunto([prazo({ dias: 0 })]), /vence HOJE/);
  assert.match(
    montarAssunto([prazo({ dias: -2, status: 'vencido' }), prazo({ id: 'p2', dias: 5 })]),
    /1 vencido/,
  );
});

test('assunto de caixa vazia não finge urgência', () => {
  assert.equal(montarAssunto([]), 'Prazos INPI — nenhum prazo pendente');
});

test('resumo separa vencidos, urgentes e demais', () => {
  const { html } = gerarResumoPrazos({
    prazos: [
      prazo({ id: 'a', dias: -3, status: 'vencido' }),
      prazo({ id: 'b', dias: 7 }),
      prazo({ id: 'c', dias: 40 }),
    ],
    geradoEm: new Date('2026-08-01T00:00:00.000Z'),
  });
  assert.match(html, /Vencidos \(1\)/);
  assert.match(html, /Vencem em até 15 dias \(1\)/);
  assert.match(html, /Demais prazos \(1\)/);
});

test('texto puro acompanha o HTML e traz o fundamento legal', () => {
  const { texto, html } = gerarResumoPrazos({
    prazos: [prazo({})],
    geradoEm: new Date('2026-08-01T00:00:00.000Z'),
    janelaDias: 30,
  });
  assert.match(texto, /TRILHA FINANCE/);
  assert.match(texto, /LPI art\. 159/);
  assert.match(texto, /10\/08\/2026/);
  assert.match(texto, /próximos 30 dias/);
  // O disclaimer é proteção jurídica: precisa estar nas DUAS partes do e-mail.
  assert.match(texto, /piso seguro/);
  assert.match(html, /piso seguro/);
});

test('colidência é identificada como marca de terceiro', () => {
  const { texto, html } = gerarResumoPrazos({
    prazos: [
      prazo({
        tipo: 'oposicao_a_marca_de_terceiro',
        rotulo: 'Prazo para VOCÊ se opor a esta marca de terceiro',
        colidencia: true,
        nomeMarca: 'TRILHA FINANCAS',
      }),
    ],
    geradoEm: new Date('2026-08-01T00:00:00.000Z'),
  });
  assert.match(texto, /colidência com marca de terceiro/);
  assert.match(html, /colidência/);
});

test('HTML escapa conteúdo vindo da RPI', () => {
  const { html } = gerarResumoPrazos({
    prazos: [prazo({ marcaNome: 'A & <script>alert(1)</script>' })],
    geradoEm: new Date('2026-08-01T00:00:00.000Z'),
  });
  assert.ok(!html.includes('<script>'), 'nome da marca não pode injetar tag');
  assert.match(html, /&amp;/);
});

test('resumo vazio não inventa tabela', () => {
  const { html, texto } = gerarResumoPrazos({
    prazos: [],
    geradoEm: new Date('2026-08-01T00:00:00.000Z'),
  });
  assert.match(html, /Nenhum prazo pendente/);
  assert.match(texto, /Nenhum prazo pendente/);
  assert.ok(!html.includes('<table'), 'sem prazos não deveria haver tabela');
});
