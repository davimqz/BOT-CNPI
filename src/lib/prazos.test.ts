import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFINICOES_PRAZO,
  REGRAS_PRAZO,
  calcularDataLimite,
  diasRestantes,
  domingoDePascoa,
  ehDiaUtil,
  feriadosNacionais,
  primeiroDiaUtilApos,
  prazosDoDespacho,
  statusPorData,
} from './prazos';

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// --- Contagem: o exemplo trabalhado que valida a fórmula inteira -------------

test('EXEMPLO OFICIAL: publicação terça 10/06 → dia 1 em 11/06 → dia 60 em 09/08', () => {
  // Exemplo publicado de contagem do prazo de oposição (LPI art. 158). É o teste
  // que trava o off-by-one do art. 222: o dia 1 já é o primeiro dia contado.
  const publicacao = dia('2025-06-10');
  assert.equal(iso(primeiroDiaUtilApos(publicacao)), '2025-06-11');
  assert.equal(iso(calcularDataLimite(publicacao, 60, 'dias')), '2025-08-09');
});

test('dia 1 pula fim de semana e feriado emendados (Sexta-feira Santa + Tiradentes)', () => {
  // Quinta 17/04/2025: sexta 18 é Sexta-feira Santa, 19-20 fim de semana,
  // segunda 21 é Tiradentes. O primeiro dia útil só cai na terça 22.
  assert.equal(iso(primeiroDiaUtilApos(dia('2025-04-17'))), '2025-04-22');
});

test('publicação na sexta joga o dia 1 para a segunda', () => {
  assert.equal(iso(primeiroDiaUtilApos(dia('2026-07-24'))), '2026-07-27');
});

test('prazo de 5 dias da exigência formal é curto de verdade', () => {
  // Publicação terça 14/07/2026 → dia 1 quarta 15 → dia 5 domingo 19.
  assert.equal(iso(calcularDataLimite(dia('2026-07-14'), 5, 'dias')), '2026-07-19');
});

test('vencimento em dia não útil NÃO é prorrogado — o piso seguro é intencional', () => {
  // A prorrogação legal existe, mas aplicá-la daria ao usuário dias a mais, que é
  // a direção perigosa. Ver a invariante no topo de prazos.ts.
  const limite = calcularDataLimite(dia('2026-07-14'), 5, 'dias');
  assert.equal(ehDiaUtil(limite), false, 'o teste perde o sentido se cair em dia útil');
  assert.equal(iso(limite), '2026-07-19');
});

// --- Feriados ---------------------------------------------------------------

test('Páscoa calculada bate com anos conhecidos', () => {
  assert.equal(iso(domingoDePascoa(2025)), '2025-04-20');
  assert.equal(iso(domingoDePascoa(2026)), '2026-04-05');
  assert.equal(iso(domingoDePascoa(2027)), '2027-03-28');
});

test('Consciência Negra só é feriado nacional a partir de 2024', () => {
  assert.equal(feriadosNacionais(2023).has('2023-11-20'), false);
  assert.equal(feriadosNacionais(2024).has('2024-11-20'), true);
});

test('ponto facultativo não conta como dia não útil (Carnaval)', () => {
  // Terça de Carnaval de 2026 = 17/02. Incluí-la atrasaria o dia 1 e, com ele, o
  // vencimento — exatamente o erro que a invariante do módulo evita.
  assert.equal(ehDiaUtil(dia('2026-02-17')), true);
});

test('fim de semana nunca é dia útil', () => {
  assert.equal(ehDiaUtil(dia('2026-07-25')), false); // sábado
  assert.equal(ehDiaUtil(dia('2026-07-26')), false); // domingo
});

// --- Regras por código ------------------------------------------------------

test('deferimento abre os dois prazos de pagamento (60 ordinário, 90 extraordinário)', () => {
  const prazos = prazosDoDespacho({ codigo: 'IPAS029', dataPublicacao: dia('2026-07-14') });
  assert.deepEqual(
    prazos.map((p) => p.tipo),
    ['pagamento_concessao_ordinario', 'pagamento_concessao_extraordinario'],
  );
  // dia 1 = quarta 15/07/2026.
  assert.equal(iso(prazos[0].dataLimite), '2026-09-12');
  assert.equal(iso(prazos[1].dataLimite), '2026-10-12');
});

test('indeferimento abre recurso de 60 dias do art. 212', () => {
  const [prazo] = prazosDoDespacho({ codigo: 'IPAS024', dataPublicacao: dia('2026-07-14') });
  assert.equal(prazo.tipo, 'recurso_indeferimento');
  assert.equal(prazo.definicao.fundamento, 'LPI art. 212');
  assert.equal(iso(prazo.dataLimite), '2026-09-12');
});

test('concessão abre prorrogação em ANOS, sem a regra do primeiro dia útil', () => {
  const prazos = prazosDoDespacho({ codigo: 'IPAS158', dataPublicacao: dia('2026-07-14') });
  assert.deepEqual(
    prazos.map((p) => p.tipo),
    ['prorrogacao_ordinaria', 'prorrogacao_extraordinaria'],
  );
  // Vigência de 10 anos contada da concessão (art. 133), + 6 meses (§2º).
  assert.equal(iso(prazos[0].dataLimite), '2036-07-14');
  assert.equal(iso(prazos[1].dataLimite), '2037-01-14');
  assert.equal(iso(prazos[0].inicioContagem), '2026-07-14');
});

test('código sem regra validada não inventa prazo', () => {
  // Sobrestamento suspende o exame, não abre prazo; despacho do pePI idem.
  assert.deepEqual(prazosDoDespacho({ codigo: 'IPAS142', dataPublicacao: dia('2026-07-14') }), []);
  assert.deepEqual(
    prazosDoDespacho({ codigo: 'PEPI-SITUACAO', dataPublicacao: dia('2026-07-14') }),
    [],
  );
});

// --- Colidência (Fase 4) ----------------------------------------------------

test('colidência só gera o prazo de opor-se, e com rótulo próprio', () => {
  const prazos = prazosDoDespacho({
    codigo: 'IPAS009',
    dataPublicacao: dia('2026-07-14'),
    motivo: 'similaridade',
  });
  assert.equal(prazos.length, 1);
  assert.equal(prazos[0].tipo, 'oposicao_a_marca_de_terceiro');
  assert.match(prazos[0].definicao.rotulo, /VOCÊ/);
});

test('colidência NÃO herda prazo do processo do terceiro', () => {
  // O deferimento é do pedido alheio: pagar a concessão dele não é ato do usuário.
  for (const codigo of ['IPAS029', 'IPAS024', 'IPAS136', 'IPAS158']) {
    assert.deepEqual(
      prazosDoDespacho({ codigo, dataPublicacao: dia('2026-07-14'), motivo: 'similaridade' }),
      [],
      `${codigo} não deveria gerar prazo numa colidência`,
    );
  }
});

test('o mesmo despacho na marca própria continua gerando o prazo de oposição normal', () => {
  const [prazo] = prazosDoDespacho({
    codigo: 'IPAS009',
    dataPublicacao: dia('2026-07-14'),
    motivo: 'processo',
  });
  assert.equal(prazo.tipo, 'oposicao_terceiros');
});

// --- Invariante de segurança ------------------------------------------------

/**
 * Referência "generosa": a leitura mais favorável ao usuário da lei — pula todo
 * dia potencialmente não útil no início (incluindo ponto facultativo) e ainda
 * prorroga o vencimento que cai em dia não útil. A data real do INPI fica entre
 * a nossa e esta; nunca depois desta.
 */
function limiteGeneroso(publicacao: Date, dias: number): Date {
  const naoUtil = (d: Date) => {
    if (!ehDiaUtil(d)) return true;
    const pascoa = domingoDePascoa(d.getUTCFullYear()).getTime();
    const delta = (d.getTime() - pascoa) / 86_400_000;
    return delta === -48 || delta === -47 || delta === 60; // Carnaval e Corpus Christi
  };
  let d = new Date(publicacao.getTime() + 86_400_000);
  while (naoUtil(d)) d = new Date(d.getTime() + 86_400_000);
  let limite = new Date(d.getTime() + (dias - 1) * 86_400_000);
  while (naoUtil(limite)) limite = new Date(limite.getTime() + 86_400_000);
  return limite;
}

test('INVARIANTE: a data calculada nunca passa da leitura mais generosa da lei', () => {
  // Varre dois anos de publicações possíveis contra todas as regras em dias.
  const emDias = Object.values(DEFINICOES_PRAZO).filter((d) => d.unidade === 'dias');
  let publicacao = dia('2026-01-01');
  const fim = dia('2027-12-31');
  let conferidos = 0;
  while (publicacao <= fim) {
    for (const def of emDias) {
      const nosso = calcularDataLimite(publicacao, def.quantidade, 'dias');
      const generoso = limiteGeneroso(publicacao, def.quantidade);
      assert.ok(
        nosso <= generoso,
        `${iso(publicacao)} / ${def.tipo}: ${iso(nosso)} passou de ${iso(generoso)}`,
      );
      conferidos++;
    }
    publicacao = new Date(publicacao.getTime() + 86_400_000);
  }
  assert.ok(conferidos > 5000, `esperava varredura ampla, conferi ${conferidos}`);
});

// --- Coerência da tabela ----------------------------------------------------

test('toda regra aponta para uma definição existente e fundamentada', () => {
  for (const [codigo, tipos] of Object.entries(REGRAS_PRAZO)) {
    assert.match(codigo, /^IPAS\d+$/, `código fora do padrão: ${codigo}`);
    for (const tipo of tipos) {
      const def = DEFINICOES_PRAZO[tipo];
      assert.ok(def, `${codigo} aponta para tipo inexistente ${tipo}`);
      assert.match(def.fundamento, /^LPI art\./, `${tipo} sem fundamento legal`);
      assert.ok(def.quantidade > 0);
    }
  }
});

// --- Status e dias restantes ------------------------------------------------

test('dias restantes e status viram no dia certo', () => {
  const limite = dia('2026-08-10');
  assert.equal(diasRestantes(limite, dia('2026-08-01')), 9);
  assert.equal(diasRestantes(limite, dia('2026-08-10')), 0);
  assert.equal(diasRestantes(limite, dia('2026-08-11')), -1);

  // Vence HOJE ainda é pendente — o usuário tem o dia inteiro (art. 222 inclui o vencimento).
  assert.equal(statusPorData(limite, dia('2026-08-10')), 'pendente');
  assert.equal(statusPorData(limite, dia('2026-08-11')), 'vencido');
});

test('hora do dia não muda a contagem', () => {
  const limite = dia('2026-08-10');
  assert.equal(diasRestantes(limite, new Date('2026-08-09T23:59:00.000Z')), 1);
  assert.equal(diasRestantes(limite, new Date('2026-08-10T00:01:00.000Z')), 0);
});
