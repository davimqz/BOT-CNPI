import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarVariaveis,
  gerarAlertaDespacho,
  resumirStatus,
  statusDoDespacho,
  TETO_LISTA,
  type DadosAlerta,
  type DespachoDoAlerta,
} from './alerta-despacho';

const baseDespacho: DespachoDoAlerta = {
  processo: '900123456',
  nomeMarca: 'TRILHA FINANCE',
  titular: 'TRILHA FINANCE LTDA',
  classeNcl: '36',
  codigo: 'IPAS136',
  textoDespacho: 'Exigência de mérito',
  textoComplementar: null,
  dataPublicacao: new Date('2026-07-14T00:00:00.000Z'),
  edicaoRpi: 2897,
  prazos: [
    {
      rotulo: 'Cumprimento de exigência de mérito',
      dataLimite: new Date('2026-09-12T00:00:00.000Z'),
      fundamento: 'LPI art. 159',
      consequencia: 'Arquivamento definitivo.',
    },
  ],
};

const despacho = (over: Partial<DespachoDoAlerta> = {}): DespachoDoAlerta => ({
  ...baseDespacho,
  ...over,
});

const dados = (over: Partial<DadosAlerta> = {}): DadosAlerta => ({
  marca: { nome: 'TRILHA FINANCE', processo: '900123456', classeNcl: '36' },
  despachos: [despacho()],
  colidencia: false,
  geradoEm: new Date('2026-07-15T00:00:00.000Z'),
  ...over,
});

test('substitui só as variáveis conhecidas e preserva o resto', () => {
  const valores = { marca: 'TRILHA', status: 'Deferido', processo: '900123456' };
  assert.equal(
    aplicarVariaveis('{marca}: {status} ({processo})', valores),
    'TRILHA: Deferido (900123456)',
  );
  // Placeholder errado fica visível em vez de virar string vazia — na Fase 7 o
  // usuário edita esses textos, e um erro invisível seria pior.
  assert.equal(aplicarVariaveis('{marcca} e {marca}', valores), '{marcca} e TRILHA');
});

test('status cai no rótulo do evento quando a RPI publica sem texto', () => {
  assert.equal(statusDoDespacho(despacho({ textoDespacho: '   ' })), 'Exigência de Mérito');
  // Código sem evento mapeado não inventa descrição.
  assert.equal(
    statusDoDespacho(despacho({ textoDespacho: null, codigo: 'IPAS999' })),
    'IPAS999',
  );
});

test('vários despachos viram um status só, com a contagem do resto', () => {
  assert.equal(resumirStatus([despacho()]), 'Exigência de mérito');
  assert.match(resumirStatus([despacho(), despacho()]), /\+1 outra\(s\)/);
});

test('alerta de movimentação própria traz assunto, prazo e dados do despacho', () => {
  const { assunto, html, texto } = gerarAlertaDespacho(dados());
  assert.match(assunto, /^🔔 ALERTA INPI — TRILHA FINANCE: Exigência de mérito$/);
  assert.match(html, /Movimentação no INPI/);
  assert.match(html, /12\/09\/2026/); // data-limite do prazo aberto
  assert.match(html, /LPI art\. 159/);
  assert.match(html, /RPI 2897/);
  // Texto puro não é decorativo: cliente que bloqueia HTML depende dele.
  assert.match(texto, /900123456/);
  assert.match(texto, /PRAZOS ABERTOS \(1\)/);
});

test('colidência é anunciada como marca de terceiro, não como movimentação própria', () => {
  const { assunto, html, texto } = gerarAlertaDespacho(
    dados({
      colidencia: true,
      despachos: [despacho({ nomeMarca: 'TRILHA FINANSE', processo: '900999999' })],
    }),
  );
  assert.match(assunto, /COLIDÊNCIA/);
  assert.doesNotMatch(assunto, /🔔 ALERTA INPI/);
  assert.match(html, /TERCEIRO/);
  // O processo citado é o do terceiro — citar o do usuário sugeriria que o
  // despacho é dele.
  assert.match(texto, /900999999/);
});

test('marca sem processo cadastrado não imprime "null" no texto', () => {
  const { assunto, texto } = gerarAlertaDespacho(
    dados({ marca: { nome: 'TRILHA FINANCE', processo: null, classeNcl: null } }),
  );
  assert.doesNotMatch(assunto + texto, /null|undefined/);
  // Sem processo na marca, o do despacho é o melhor disponível.
  assert.match(texto, /900123456/);
});

test('lista longa é cortada, e o e-mail diz quantas ficaram de fora', () => {
  const muitos = Array.from({ length: TETO_LISTA + 3 }, (_, i) =>
    despacho({ processo: `9001234${String(i).padStart(2, '0')}`, prazos: [] }),
  );
  const { html, texto } = gerarAlertaDespacho(dados({ despachos: muitos }));
  assert.match(html, /Mais 3 publicação\(ões\)/);
  assert.match(texto, /Mais 3 publicação\(ões\) não listadas/);
});

test('escapa HTML vindo do nome do titular', () => {
  const { html } = gerarAlertaDespacho(
    dados({ despachos: [despacho({ titular: '<script>alert(1)</script>' })] }),
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
