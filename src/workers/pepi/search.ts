/**
 * Busca ao vivo no pePI — executado pelo workflow .github/workflows/pepi-search.yml
 * (nunca dentro do Vercel; ver CLAUDE.md Seções 3.1 e 5).
 *
 * Entrada via env (inputs do workflow_dispatch):
 *   JOB_ID     — id da linha em pepi_search_jobs criada pela API (se não existir,
 *                cria uma a partir de TERMO/TIPO_BUSCA — útil para teste manual).
 *   TERMO      — nome da marca a buscar.
 *   TIPO_BUSCA — "radical" | "exata".
 *   CLASSE_NCL — opcional, filtro de classe.
 *
 * O resultado (linhas da tabela do pePI, todas as páginas) é gravado como JSON
 * no job; cada etapa da automação atualiza job.etapa para o polling do frontend.
 */
import 'dotenv/config';
import { chromium, type Page } from 'playwright';
import { prisma } from '@/lib/db';
import { PEPI } from './selectors';

// Espaçamento entre páginas de resultado — rate limit deliberado (ver skill
// pepi-scraping-playbook: nunca martelar o pePI em paralelo/sequência agressiva).
const INTERVALO_ENTRE_PAGINAS_MS = 1500;
const MAX_PAGINAS = 30;

export interface ResultadoPepi {
  processo: string;
  prioridade: string | null;
  marca: string | null;
  situacao: string | null;
  titular: string | null;
  classe: string | null;
  codPedido: string | null;
}

class SiteMudouError extends Error {
  constructor(etapa: string, detalhe: string) {
    super(
      `Estrutura esperada não encontrada em "${etapa}": ${detalhe}. ` +
        'O pePI provavelmente mudou de layout — reconfirme os seletores (src/workers/pepi/selectors.ts).',
    );
    this.name = 'SiteMudouError';
  }
}

async function extrairResultadosDaPagina(page: Page): Promise<ResultadoPepi[]> {
  const tabela = page.locator(PEPI.resultados.tabela).last();
  if ((await tabela.count()) === 0) return [];
  return tabela.evaluate((t) => {
    const linhas: ResultadoPepi[] = [];
    for (const tr of Array.from((t as HTMLTableElement).rows)) {
      const detalhe = tr.querySelector<HTMLAnchorElement>('a[href*="Action=detail"]');
      if (!detalhe) continue; // header, navegação ou paginação
      const celulas = Array.from(tr.cells).map((c) => c.textContent?.replace(/\s+/g, ' ').trim() || null);
      // Colunas confirmadas em 28/07/2026: Número | Prioridade | (img) | Marca | (img) | Situação | Titular | Classe
      linhas.push({
        processo: celulas[0] ?? '',
        prioridade: celulas[1],
        marca: celulas[3],
        situacao: celulas[5],
        titular: celulas[6],
        classe: celulas[7],
        codPedido: new URLSearchParams(detalhe.href.split('?')[1] ?? '').get('CodPedido'),
      });
    }
    return linhas;
  });
}

async function buscar(
  termo: string,
  exata: boolean,
  classeNcl: string | null,
  aoMudarEtapa: (etapa: string) => Promise<void>,
): Promise<{ resultados: ResultadoPepi[]; paginas: number; truncado: boolean }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);

    await aoMudarEtapa('acessando site do INPI');
    await page.goto(`${PEPI.baseUrl}${PEPI.entrada.url}`, { waitUntil: 'domcontentloaded' });
    const linkAnonimo = page.locator(PEPI.entrada.linkAcessoAnonimo);
    if ((await linkAnonimo.count()) === 0) {
      throw new SiteMudouError('acessando site', 'link de acesso anônimo ("Continuar....") ausente');
    }
    await linkAnonimo.first().click();
    await page.waitForLoadState('domcontentloaded');

    await aoMudarEtapa('preenchendo busca');
    await page.goto(`${PEPI.baseUrl}${PEPI.buscaPorMarca.url}`, { waitUntil: 'domcontentloaded' });
    if ((await page.locator(PEPI.buscaPorMarca.form).count()) === 0) {
      throw new SiteMudouError('preenchendo busca', `formulário ${PEPI.buscaPorMarca.form} ausente`);
    }
    await page.fill(PEPI.buscaPorMarca.campoMarca, termo);
    await page.check(PEPI.buscaPorMarca.radioBuscaExata(exata));
    if (classeNcl) await page.fill(PEPI.buscaPorMarca.campoClasseNcl, classeNcl);
    await page.selectOption(PEPI.buscaPorMarca.selectPorPagina, '100');
    await page.click(PEPI.buscaPorMarca.botaoPesquisar);
    await page.waitForLoadState('domcontentloaded');

    await aoMudarEtapa('extraindo resultados');
    // Sanidade: a página de resposta deve ser reconhecível mesmo sem resultados.
    const paginaValida = await page
      .locator('text=Consulta à Base de Dados do INPI')
      .count()
      .then((n) => n > 0);
    if (!paginaValida && (await page.locator(PEPI.resultados.linkDetalhe).count()) === 0) {
      throw new SiteMudouError('extraindo resultados', 'página de resposta não reconhecida');
    }

    const resultados = await extrairResultadosDaPagina(page);
    let pagina = 1;
    while (pagina < MAX_PAGINAS) {
      const proxima = page.locator(PEPI.resultados.linkPagina(pagina + 1));
      if ((await proxima.count()) === 0) break;
      pagina++;
      await aoMudarEtapa(`extraindo resultados (página ${pagina})`);
      await page.waitForTimeout(INTERVALO_ENTRE_PAGINAS_MS);
      // Paginação é estado de sessão no servidor — precisa navegar na mesma sessão.
      await proxima.first().click();
      await page.waitForLoadState('domcontentloaded');
      resultados.push(...(await extrairResultadosDaPagina(page)));
    }

    // Ainda há próxima página após o teto de MAX_PAGINAS → resultado incompleto.
    const truncado = (await page.locator(PEPI.resultados.linkPagina(pagina + 1)).count()) > 0;
    return { resultados, paginas: pagina, truncado };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definida. No GitHub Actions, confira o Repository secret DATABASE_URL.',
    );
  }

  const jobId = process.env.JOB_ID;
  if (!jobId) throw new Error('JOB_ID não definido (input obrigatório do workflow_dispatch).');

  let job = await prisma.pepiSearchJob.findUnique({ where: { id: jobId } });
  if (!job) {
    // Dispatch manual de teste pela aba Actions: cria o job a partir dos inputs.
    const termo = process.env.TERMO;
    const tipo = process.env.TIPO_BUSCA;
    if (!termo || (tipo !== 'radical' && tipo !== 'exata')) {
      throw new Error(`Job ${jobId} não existe e TERMO/TIPO_BUSCA não permitem criá-lo.`);
    }
    job = await prisma.pepiSearchJob.create({
      data: { id: jobId, termo, tipoBusca: tipo, classeNcl: process.env.CLASSE_NCL || null },
    });
    console.log(`[pepi] job ${jobId} não existia — criado a partir dos inputs do workflow.`);
  }

  const aoMudarEtapa = async (etapa: string) => {
    console.log(`[pepi] ${etapa}`);
    await prisma.pepiSearchJob.update({
      where: { id: job.id },
      data: { status: 'executando', etapa },
    });
  };

  try {
    const { resultados, paginas, truncado } = await buscar(
      job.termo,
      job.tipoBusca === 'exata',
      job.classeNcl,
      aoMudarEtapa,
    );
    await prisma.pepiSearchJob.update({
      where: { id: job.id },
      data: {
        status: 'sucesso',
        etapa: 'concluído',
        resultado: { total: resultados.length, paginas, truncado, itens: resultados } as object,
        finalizadoEm: new Date(),
      },
    });
    console.log(
      `[pepi] concluído: ${resultados.length} resultados em ${paginas} página(s)${truncado ? ' (TRUNCADO no teto de páginas)' : ''}.`,
    );
  } catch (e) {
    const erro = e as Error;
    await prisma.pepiSearchJob.update({
      where: { id: job.id },
      data: { status: 'erro', etapa: 'erro', erro: `${erro.name}: ${erro.message}`, finalizadoEm: new Date() },
    });
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[pepi] ERRO:', e);
  process.exit(1);
});
