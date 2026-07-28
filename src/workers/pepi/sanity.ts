/**
 * Teste de sanidade do scraping do pePI (skill pepi-scraping-playbook).
 *
 * Faz uma busca Exata por uma marca notoriamente registrada e estável e falha
 * alto e claro se a estrutura da página mudou — roda no workflow pepi-search.yml
 * ANTES da busca real, para nunca confiar em resultados de um site que mudou.
 * Não toca no banco: só navegação + extração.
 */
import 'dotenv/config';
import { buscar } from './search';

// Marca com dezenas de registros em vigor há décadas — se a busca exata por ela
// retornar vazio, o problema é nosso (seletores/layout), não do termo.
const MARCA_CONHECIDA = 'NATURA';

async function main() {
  const { resultados } = await buscar(MARCA_CONHECIDA, 'exata', null, async (etapa) => {
    console.log(`[sanidade] ${etapa}`);
  });

  const falhas: string[] = [];

  if (resultados.length === 0) {
    falhas.push(
      `busca exata por "${MARCA_CONHECIDA}" retornou 0 resultados — a extração da tabela quebrou ou o pePI mudou`,
    );
  }
  const processoInvalido = resultados.find((r) => !/^\d{6,}$/.test(r.processo));
  if (processoInvalido) {
    falhas.push(
      `coluna de processo com valor inesperado ("${processoInvalido.processo}") — as colunas da tabela provavelmente mudaram de posição`,
    );
  }
  if (resultados.length > 0) {
    if (!resultados.some((r) => r.marca?.toUpperCase().includes(MARCA_CONHECIDA))) {
      falhas.push(
        `nenhum resultado tem "${MARCA_CONHECIDA}" na coluna de marca — mapeamento de colunas suspeito`,
      );
    }
    if (!resultados.some((r) => r.situacao)) {
      falhas.push('coluna de situação vazia em todos os resultados — mapeamento de colunas suspeito');
    }
    if (!resultados.some((r) => r.titular)) {
      falhas.push('coluna de titular vazia em todos os resultados — mapeamento de colunas suspeito');
    }
  }

  if (falhas.length > 0) {
    console.error('\n[sanidade] FALHOU — o pePI provavelmente mudou de layout:');
    for (const f of falhas) console.error(`[sanidade]  - ${f}`);
    console.error(
      '[sanidade] Reconfirme os seletores em src/workers/pepi/selectors.ts antes de confiar em qualquer busca.',
    );
    process.exit(1);
  }

  console.log(
    `[sanidade] OK — ${resultados.length} resultado(s) para "${MARCA_CONHECIDA}" com colunas íntegras.`,
  );
}

main().catch((e) => {
  console.error('[sanidade] ERRO:', e);
  process.exit(1);
});
