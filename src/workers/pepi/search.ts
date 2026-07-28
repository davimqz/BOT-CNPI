/**
 * Busca ao vivo no pePI — executado pelo workflow .github/workflows/pepi-search.yml
 * (nunca dentro do Vercel; ver CLAUDE.md Seções 3.1 e 5).
 *
 * Entrada via env (inputs do workflow_dispatch):
 *   JOB_ID     — id da linha em pepi_search_jobs criada pela API (se não existir,
 *                cria uma a partir de TERMO/TIPO_BUSCA — útil para teste manual).
 *   TERMO      — nome da marca (radical/exata), nº de processo (processo) ou
 *                nome/razão social/CPF/CNPJ do depositante (titular).
 *   TIPO_BUSCA — "radical" | "exata" | "processo" | "titular".
 *   CLASSE_NCL — opcional, filtro de classe (só radical/exata).
 *
 * O resultado (linhas da tabela do pePI, todas as páginas) é gravado como JSON
 * no job; cada etapa da automação atualiza job.etapa para o polling do frontend.
 *
 * Busca por titular é um fluxo de DUAS etapas no pePI (ver selectors.ts): quando
 * o termo casa com vários titulares e nenhum é igual ao termo, o job devolve a
 * LISTA DE NOMES (tipoResultado: "titulares") para o usuário escolher — a escolha
 * dispara um novo job com o nome exato, que aí abre os processos direto.
 */
import 'dotenv/config';
import { chromium, type Page } from 'playwright';
import { prisma } from '@/lib/db';
import { interpretarTermoTitular, nomeTitularConfere } from '@/lib/busca-titular';
import { PEPI } from './selectors';

// Espaçamento entre páginas de resultado — rate limit deliberado (ver skill
// pepi-scraping-playbook: nunca martelar o pePI em paralelo/sequência agressiva).
const INTERVALO_ENTRE_PAGINAS_MS = 1500;
const MAX_PAGINAS = 30;
// Teto da LISTA DE NOMES da busca por titular (100 nomes/página). Um termo que
// casa com mais de 300 titulares precisa ser refinado, não paginado até o fim.
const MAX_PAGINAS_NOMES = 3;
// A mesma razão social pode ter VÁRIOS cadastros na base do INPI (CNPJs/registros
// distintos — visto ao vivo em 28/07/2026: 3× "NATURAFRIG ALIMENTOS LTDA"). A busca
// abre cada cadastro e soma os processos, até este teto.
const MAX_CADASTROS_TITULAR = 5;
// O pePI pode levar MUITO mais que os 30s padrão para responder a uma consulta:
// 20-40s numa janela tranquila e 150s numa congestionada (ambos vistos ao vivo em
// 28/07/2026 — o mesmo processo, com as páginas estáticas respondendo em ~1s).
// A margem é generosa de propósito: derrubar a consulta por timeout custa uma
// rodada inteira de monitoramento, enquanto esperar custa só tempo de runner.
const TIMEOUT_CONSULTA_MS = 240_000;

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

export type TipoBuscaPepi = 'radical' | 'exata' | 'processo' | 'titular';

export interface BuscaPepiResultado {
  resultados: ResultadoPepi[];
  paginas: number;
  truncado: boolean;
  /** Só na busca por titular: nome efetivamente aberto (casamento único ou exato). */
  titularSelecionado?: string;
  /** Só na busca por titular: nº de cadastros do mesmo nome somados no resultado (quando > 1). */
  cadastrosDoTitular?: number;
  /** Só na busca por titular sem casamento único: nomes para o usuário escolher. */
  titulares?: string[];
  titularesTruncado?: boolean;
}

/** Abre o formulário de busca por titular, preenche (nome OU CPF/CNPJ) e submete. */
async function submeterBuscaTitular(page: Page, termo: string): Promise<void> {
  const alvo = interpretarTermoTitular(termo);
  if ('erro' in alvo) throw new Error(alvo.erro);
  await page.goto(`${PEPI.baseUrl}${PEPI.buscaPorTitular.url}`, { waitUntil: 'domcontentloaded' });
  if ((await page.locator(PEPI.buscaPorTitular.form).count()) === 0) {
    throw new SiteMudouError('preenchendo busca', `formulário ${PEPI.buscaPorTitular.form} ausente`);
  }
  await page.fill(
    alvo.campo === 'cpfCnpj' ? PEPI.buscaPorTitular.campoCpfCnpj : PEPI.buscaPorTitular.campoNome,
    alvo.valor,
  );
  await page.selectOption(PEPI.buscaPorTitular.selectPorPagina, '100');
  await page.click(PEPI.buscaPorTitular.botaoPesquisar, { timeout: TIMEOUT_CONSULTA_MS });
  await page.waitForLoadState('domcontentloaded');
}

/** Extrai a página de processos corrente e todas as seguintes (até MAX_PAGINAS). */
async function extrairTodasPaginas(
  page: Page,
  aoMudarEtapa: (etapa: string) => Promise<void>,
): Promise<{ resultados: ResultadoPepi[]; paginas: number; truncado: boolean }> {
  await aoMudarEtapa('extraindo resultados');
  const resultados = await extrairResultadosDaPagina(page);
  let pagina = 1;
  while (pagina < MAX_PAGINAS) {
    const proxima = page.locator(PEPI.resultados.linkPagina(pagina + 1));
    if ((await proxima.count()) === 0) break;
    pagina++;
    await aoMudarEtapa(`extraindo resultados (página ${pagina})`);
    await page.waitForTimeout(INTERVALO_ENTRE_PAGINAS_MS);
    // Paginação é estado de sessão no servidor — precisa navegar na mesma sessão.
    await proxima.first().click({ timeout: TIMEOUT_CONSULTA_MS });
    await page.waitForLoadState('domcontentloaded');
    resultados.push(...(await extrairResultadosDaPagina(page)));
  }
  // Ainda há próxima página após o teto de MAX_PAGINAS → resultado incompleto.
  const truncado = (await page.locator(PEPI.resultados.linkPagina(pagina + 1)).count()) > 0;
  return { resultados, paginas: pagina, truncado };
}

/**
 * Etapa 1 da busca por titular: na página de nomes retornada pelo Action=searchNome,
 * abre direto os processos quando há um único titular ou um cujo nome é IGUAL ao
 * termo; caso contrário coleta a lista de nomes (até MAX_PAGINAS_NOMES páginas)
 * para o usuário escolher. A mesma razão social pode aparecer várias vezes na base
 * (cadastros/CNPJs distintos) — `totalExatos`/`paginaNomes` permitem a buscar()
 * voltar e abrir os demais cadastros. `pos=N` dos links é estado de sessão, então
 * só clicamos em links da página em que estamos — nunca guardamos href para depois.
 */
async function escolherTitular(
  page: Page,
  termo: string,
  aoMudarEtapa: (etapa: string) => Promise<void>,
): Promise<
  | { abriu: true; titularSelecionado: string; paginaNomes: number; totalExatos: number }
  | { abriu: false; titulares: string[]; titularesTruncado: boolean }
> {
  if ((await page.locator(PEPI.buscaPorTitular.textoNenhumTitular).count()) > 0) {
    return { abriu: false, titulares: [], titularesTruncado: false };
  }

  const nomes: string[] = [];
  let paginaNomes = 1;
  for (;;) {
    const links = page.locator(PEPI.buscaPorTitular.linkTitular);
    const textos = (await links.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
    if (textos.length === 0 && nomes.length === 0) {
      throw new SiteMudouError(
        'listando titulares',
        'nem lista de titulares nem aviso de "nenhum titular" na resposta',
      );
    }

    const exatos = textos.filter((t) => nomeTitularConfere(t, termo));
    if (exatos.length > 0) {
      const primeiro = textos.findIndex((t) => nomeTitularConfere(t, termo));
      await aoMudarEtapa(`abrindo processos do titular "${textos[primeiro]}"`);
      await links.nth(primeiro).click({ timeout: TIMEOUT_CONSULTA_MS });
      await page.waitForLoadState('domcontentloaded');
      return {
        abriu: true,
        titularSelecionado: textos[primeiro],
        paginaNomes,
        totalExatos: exatos.length,
      };
    }
    nomes.push(...textos);

    const proxima = page.locator(PEPI.buscaPorTitular.linkPaginaNomes(paginaNomes + 1));
    if (paginaNomes >= MAX_PAGINAS_NOMES || (await proxima.count()) === 0) {
      if (nomes.length === 1 && paginaNomes === 1) {
        // Único titular encontrado — abrir direto, sem forçar o usuário a "escolher" entre 1.
        await aoMudarEtapa(`abrindo processos do titular "${nomes[0]}"`);
        await links.first().click({ timeout: TIMEOUT_CONSULTA_MS });
        await page.waitForLoadState('domcontentloaded');
        return { abriu: true, titularSelecionado: nomes[0], paginaNomes: 1, totalExatos: 1 };
      }
      const titularesTruncado = (await proxima.count()) > 0;
      return { abriu: false, titulares: nomes, titularesTruncado };
    }

    paginaNomes++;
    await aoMudarEtapa(`listando titulares (página ${paginaNomes})`);
    await page.waitForTimeout(INTERVALO_ENTRE_PAGINAS_MS);
    await proxima.first().click({ timeout: TIMEOUT_CONSULTA_MS });
    await page.waitForLoadState('domcontentloaded');
  }
}

export async function buscar(
  termo: string,
  tipo: TipoBuscaPepi,
  classeNcl: string | null,
  aoMudarEtapa: (etapa: string) => Promise<void>,
): Promise<BuscaPepiResultado> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });
    let page = await ctx.newPage();
    page.setDefaultTimeout(30_000);

    await aoMudarEtapa('acessando site do INPI');
    await page.goto(`${PEPI.baseUrl}${PEPI.entrada.url}`, { waitUntil: 'domcontentloaded' });
    const linkAnonimo = page.locator(PEPI.entrada.linkAcessoAnonimo);
    if ((await linkAnonimo.count()) === 0) {
      throw new SiteMudouError('acessando site', 'link de acesso anônimo ("Continuar....") ausente');
    }
    // O link tem target="_blank": o login anônimo acontece numa ABA NOVA (mesmos
    // cookies de sessão). Sem esperar essa aba carregar, a sessão ainda não está
    // autenticada e qualquer JSP devolve a tela de login (visto em 28/07/2026).
    const [abaLogin] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15_000 }).catch(() => null),
      linkAnonimo.first().click(),
    ]);
    if (abaLogin) {
      page = abaLogin;
      page.setDefaultTimeout(30_000);
    }
    await page.waitForLoadState('domcontentloaded');

    await aoMudarEtapa('preenchendo busca');
    if (tipo === 'titular') {
      await submeterBuscaTitular(page, termo);
    } else if (tipo === 'processo') {
      await page.goto(`${PEPI.baseUrl}${PEPI.buscaPorProcesso.url}`, { waitUntil: 'domcontentloaded' });
      if ((await page.locator(PEPI.buscaPorProcesso.form).count()) === 0) {
        throw new SiteMudouError('preenchendo busca', `formulário ${PEPI.buscaPorProcesso.form} ausente`);
      }
      await page.fill(PEPI.buscaPorProcesso.campoNumPedido, termo);
      await page.click(PEPI.buscaPorProcesso.botaoPesquisar, { timeout: TIMEOUT_CONSULTA_MS });
    } else {
      await page.goto(`${PEPI.baseUrl}${PEPI.buscaPorMarca.url}`, { waitUntil: 'domcontentloaded' });
      if ((await page.locator(PEPI.buscaPorMarca.form).count()) === 0) {
        throw new SiteMudouError('preenchendo busca', `formulário ${PEPI.buscaPorMarca.form} ausente`);
      }
      await page.fill(PEPI.buscaPorMarca.campoMarca, termo);
      await page.check(PEPI.buscaPorMarca.radioBuscaExata(tipo === 'exata'));
      if (classeNcl) await page.fill(PEPI.buscaPorMarca.campoClasseNcl, classeNcl);
      await page.selectOption(PEPI.buscaPorMarca.selectPorPagina, '100');
      await page.click(PEPI.buscaPorMarca.botaoPesquisar, { timeout: TIMEOUT_CONSULTA_MS });
    }
    await page.waitForLoadState('domcontentloaded');

    // Sanidade: a página de resposta deve ser reconhecível mesmo sem resultados.
    const paginaValida = await page
      .locator('text=Consulta à Base de Dados do INPI')
      .count()
      .then((n) => n > 0);
    if (!paginaValida && (await page.locator(PEPI.resultados.linkDetalhe).count()) === 0) {
      throw new SiteMudouError('extraindo resultados', 'página de resposta não reconhecida');
    }

    if (tipo === 'titular') {
      await aoMudarEtapa('listando titulares');
      const escolha = await escolherTitular(page, termo, aoMudarEtapa);
      if (!escolha.abriu) {
        return {
          resultados: [],
          paginas: 0,
          truncado: false,
          titulares: escolha.titulares,
          titularesTruncado: escolha.titularesTruncado,
        };
      }

      const primeiro = await extrairTodasPaginas(page, aoMudarEtapa);
      const porProcesso = new Map(primeiro.resultados.map((r) => [r.processo, r]));
      let paginas = primeiro.paginas;
      let truncado = primeiro.truncado;

      // Demais cadastros do mesmo nome: `pos=N` só vale na sessão da busca de
      // nomes corrente, então refazemos a busca inteira para cada cadastro.
      const cadastros = Math.min(escolha.totalExatos, MAX_CADASTROS_TITULAR);
      for (let i = 1; i < cadastros; i++) {
        await aoMudarEtapa(
          `titular tem ${escolha.totalExatos} cadastros na base — abrindo cadastro ${i + 1}`,
        );
        await page.waitForTimeout(INTERVALO_ENTRE_PAGINAS_MS);
        await submeterBuscaTitular(page, termo);
        for (let p = 2; p <= escolha.paginaNomes; p++) {
          await page.waitForTimeout(INTERVALO_ENTRE_PAGINAS_MS);
          await page
            .locator(PEPI.buscaPorTitular.linkPaginaNomes(p))
            .first()
            .click({ timeout: TIMEOUT_CONSULTA_MS });
          await page.waitForLoadState('domcontentloaded');
        }
        const links = page.locator(PEPI.buscaPorTitular.linkTitular);
        const textos = (await links.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
        const exatos = textos
          .map((t, idx) => (nomeTitularConfere(t, termo) ? idx : -1))
          .filter((idx) => idx >= 0);
        if (i >= exatos.length) break; // a lista mudou entre as buscas — não insistir
        await links.nth(exatos[i]).click({ timeout: TIMEOUT_CONSULTA_MS });
        await page.waitForLoadState('domcontentloaded');
        const parcial = await extrairTodasPaginas(page, aoMudarEtapa);
        for (const r of parcial.resultados) {
          if (!porProcesso.has(r.processo)) porProcesso.set(r.processo, r);
        }
        paginas += parcial.paginas;
        truncado = truncado || parcial.truncado;
      }

      return {
        resultados: [...porProcesso.values()],
        paginas,
        // Cadastros além do teto ficam de fora → resultado explicitamente incompleto.
        truncado: truncado || escolha.totalExatos > MAX_CADASTROS_TITULAR,
        titularSelecionado: escolha.titularSelecionado,
        ...(escolha.totalExatos > 1 ? { cadastrosDoTitular: escolha.totalExatos } : {}),
      };
    }

    const { resultados, paginas, truncado } = await extrairTodasPaginas(page, aoMudarEtapa);
    return { resultados, paginas, truncado };
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
    if (!termo || (tipo !== 'radical' && tipo !== 'exata' && tipo !== 'processo' && tipo !== 'titular')) {
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
    const busca = await buscar(job.termo, job.tipoBusca, job.classeNcl, aoMudarEtapa);
    // Busca por titular sem casamento único devolve a lista de nomes para o
    // usuário escolher (a escolha dispara um novo job com o nome exato).
    const resultado = busca.titulares
      ? {
          tipoResultado: 'titulares' as const,
          total: busca.titulares.length,
          titulares: busca.titulares,
          truncado: busca.titularesTruncado ?? false,
        }
      : {
          total: busca.resultados.length,
          paginas: busca.paginas,
          truncado: busca.truncado,
          itens: busca.resultados,
          ...(busca.titularSelecionado ? { titular: busca.titularSelecionado } : {}),
          ...(busca.cadastrosDoTitular ? { cadastrosTitular: busca.cadastrosDoTitular } : {}),
        };
    await prisma.pepiSearchJob.update({
      where: { id: job.id },
      data: { status: 'sucesso', etapa: 'concluído', resultado: resultado as object, finalizadoEm: new Date() },
    });
    console.log(
      busca.titulares
        ? `[pepi] concluído: ${busca.titulares.length} titular(es) encontrados — aguardando escolha do usuário${busca.titularesTruncado ? ' (LISTA TRUNCADA, refinar o termo)' : ''}.`
        : `[pepi] concluído: ${busca.resultados.length} resultados em ${busca.paginas} página(s)${busca.truncado ? ' (TRUNCADO no teto de páginas)' : ''}.`,
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

// Guard para o sanity.ts poder importar buscar() sem disparar uma busca de job.
if (require.main === module) {
  main().catch((e) => {
    console.error('[pepi] ERRO:', e);
    process.exit(1);
  });
}
