import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classificarSituacao,
  gerarRelatorioConsultorMarca,
  type ItemRelatorio,
} from './consultor-marca';

// Situações reais observadas no pePI (coluna "Situação" da tabela de resultados).
test('classifica situações terminais como inativa', () => {
  assert.equal(classificarSituacao('Arquivado definitivamente'), 'inativa');
  assert.equal(classificarSituacao('Registro de marca extinto'), 'inativa');
  assert.equal(classificarSituacao('Pedido de registro de marca indeferido'), 'inativa');
  // "indeferido" contém "deferido" — a ordem de teste terminal-primeiro protege este caso.
  assert.equal(classificarSituacao('Indeferido'), 'inativa');
});

test('classifica registros em vigor e pedidos em andamento como ativa', () => {
  assert.equal(classificarSituacao('Registro de marca em vigor'), 'ativa');
  assert.equal(classificarSituacao('Pedido de registro de marca em exame de mérito'), 'ativa');
  assert.equal(classificarSituacao('Aguardando exame de mérito'), 'ativa');
  assert.equal(classificarSituacao('Pedido deferido, aguardando pagamento'), 'ativa');
  assert.equal(classificarSituacao('Publicado para oposição'), 'ativa');
});

test('situação desconhecida ou ausente nunca é assumida como inofensiva', () => {
  assert.equal(classificarSituacao(null), 'verificar');
  assert.equal(classificarSituacao('   '), 'verificar');
  // Recurso provido reverte o indeferimento — não é terminal nem claramente ativa.
  assert.equal(classificarSituacao('Recurso contra o indeferimento provido'), 'verificar');
  assert.equal(classificarSituacao('Situação nova que o pePI inventou'), 'verificar');
});

const base = {
  termo: 'NATURA',
  tipoBusca: 'exata' as const,
  classeNcl: null,
  consultadoEm: new Date('2026-07-28T15:00:00Z'),
};

const item = (situacao: string | null, extra?: Partial<ItemRelatorio>): ItemRelatorio => ({
  processo: '912345678',
  marca: 'NATURA',
  situacao,
  titular: 'NATURA COSMÉTICOS S.A.',
  classe: 'NCL(12) 03',
  ...extra,
});

test('veredito indisponível quando há marca ativa, com os 4 contadores', () => {
  const html = gerarRelatorioConsultorMarca({
    ...base,
    itens: [item('Registro de marca em vigor'), item('Arquivado'), item('Situação estranha')],
  });
  assert.match(html, /Marca Indisponível/);
  assert.match(html, /Existe\(m\) 1 marca\(s\) ativa\(s\)/);
  assert.match(html, /Pesquisa Exata/);
  // Contadores: total 3, 1 ativa, 1 inativa, 1 verificar.
  assert.match(html, /<div class="valor">3<\/div><div class="rotulo">Total encontradas<\/div>/);
  assert.match(html, /<div class="valor">1<\/div><div class="rotulo">Marcas ativas<\/div>/);
  assert.match(html, /<div class="valor">1<\/div><div class="rotulo">Marcas inativas<\/div>/);
  assert.match(html, /<div class="valor">1<\/div><div class="rotulo">Verificar<\/div>/);
  assert.match(html, /merecem revisão manual/);
});

test('veredito disponível sem resultados, sem tabela, com disclaimer sempre presente', () => {
  const html = gerarRelatorioConsultorMarca({ ...base, itens: [] });
  assert.match(html, /Marca Disponível/);
  assert.match(html, /Nenhuma marca registrada com este nome/);
  assert.doesNotMatch(html, /<table>/);
  assert.match(html, /Consulte um advogado especialista em propriedade intelectual/);
});

test('só registros inativos ainda é disponível, mas o resumo diz o porquê', () => {
  const html = gerarRelatorioConsultorMarca({ ...base, itens: [item('Arquivado')] });
  assert.match(html, /Marca Disponível/);
  assert.match(html, /1 registro\(s\) inativo\(s\) ou a verificar/);
});

test('escapa HTML vindo do pePI e do termo buscado', () => {
  const html = gerarRelatorioConsultorMarca({
    ...base,
    termo: '<script>alert(1)</script>',
    itens: [item('Registro de marca em vigor', { titular: 'ACME <b>LTDA</b> & CIA' })],
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /ACME &lt;b&gt;LTDA&lt;\/b&gt; &amp; CIA/);
});

test('modo PDF injeta o auto-print; modo HTML não', () => {
  const semPdf = gerarRelatorioConsultorMarca({ ...base, itens: [] });
  const comPdf = gerarRelatorioConsultorMarca({ ...base, itens: [] }, undefined, {
    autoImprimir: true,
  });
  assert.doesNotMatch(semPdf, /window\.print\(\)\);<\/script>/);
  assert.match(comPdf, /window\.addEventListener\("load", \(\) => window\.print\(\)\)/);
});

test('resultado truncado avisa que o relatório está incompleto', () => {
  const html = gerarRelatorioConsultorMarca({
    ...base,
    itens: [item('Registro de marca em vigor')],
    truncado: true,
  });
  assert.match(html, /incompleto/);
});
