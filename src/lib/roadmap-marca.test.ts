import test from 'node:test';
import assert from 'node:assert/strict';
import { FASES_ROADMAP, faseDoCodigo, roadmapDaMarca } from './roadmap-marca';

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

test('cada fase tem slug e ordem únicos', () => {
  const slugs = FASES_ROADMAP.map((f) => f.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const ordens = FASES_ROADMAP.map((f) => f.ordem);
  assert.equal(new Set(ordens).size, ordens.length);
});

test('faseDoCodigo acha a fase certa para códigos confirmados', () => {
  assert.equal(faseDoCodigo('IPAS009')?.slug, 'pedido_em_andamento');
  assert.equal(faseDoCodigo('IPAS158')?.slug, 'concessao');
  assert.equal(faseDoCodigo('IPAS161')?.slug, 'registro_extinto');
});

test('código de decisão de petição genérica fica sem fase (cobertura deliberadamente parcial)', () => {
  assert.equal(faseDoCodigo('IPAS270'), undefined);
  assert.equal(faseDoCodigo('IPAS271'), undefined);
});

test('roadmapDaMarca marca como alcançada só a fase com despacho, e "atual" é a do despacho mais recente', () => {
  const roadmap = roadmapDaMarca([
    { id: '1', codigo: 'IPAS009', dataPublicacao: dia('2026-01-06') }, // pedido_em_andamento
    { id: '2', codigo: 'IPAS158', dataPublicacao: dia('2026-06-02') }, // concessao (mais recente)
  ]);

  const porSlug = new Map(roadmap.fases.map((f) => [f.slug, f]));
  assert.equal(porSlug.get('pedido_em_andamento')?.alcancada, true);
  assert.equal(porSlug.get('pedido_em_andamento')?.atual, false);
  assert.equal(porSlug.get('concessao')?.alcancada, true);
  assert.equal(porSlug.get('concessao')?.atual, true);
  assert.equal(porSlug.get('registro_extinto')?.alcancada, false);
  assert.equal(roadmap.semFase.length, 0);
});

test('roadmapDaMarca separa despachos sem fase reconhecida em vez de descartá-los', () => {
  const roadmap = roadmapDaMarca([
    { id: '1', codigo: 'IPAS270', dataPublicacao: dia('2026-03-01') },
  ]);
  assert.equal(roadmap.semFase.length, 1);
  assert.ok(roadmap.fases.every((f) => !f.atual));
});

test('ordem de chegada fora de ordem cronológica não muda quem é "atual" (usa a data, não a ordem do array)', () => {
  const roadmap = roadmapDaMarca([
    { id: '1', codigo: 'IPAS158', dataPublicacao: dia('2026-06-02') }, // concessao
    { id: '2', codigo: 'IPAS009', dataPublicacao: dia('2026-01-06') }, // pedido_em_andamento, mais antigo
  ]);
  const porSlug = new Map(roadmap.fases.map((f) => [f.slug, f]));
  assert.equal(porSlug.get('concessao')?.atual, true);
  assert.equal(porSlug.get('pedido_em_andamento')?.atual, false);
});
