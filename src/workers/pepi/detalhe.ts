/**
 * Detalhe de um processo pePI — executado pelo workflow
 * .github/workflows/pepi-detalhe.yml (nunca dentro do Vercel; ver CLAUDE.md
 * Seções 3.1 e 5). Disparado ao clicar num processo no resultado da busca
 * (src/app/busca/marca/page.tsx), que já capturou o CodPedido usado aqui.
 *
 * Entrada via env (inputs do workflow_dispatch):
 *   JOB_ID     — id da linha em pepi_detalhe_jobs criada pela API (se não
 *                existir, cria uma a partir de COD_PEDIDO/PROCESSO — útil
 *                para teste manual).
 *   COD_PEDIDO — identificador de sessão do pePI (Action=detail&CodPedido=N).
 *   PROCESSO   — nº do processo, só para o job guardar/exibir; não é usado
 *                na navegação (a URL de detalhe só precisa do CodPedido).
 *
 * Estrutura da página confirmada ao vivo em 17/08/2026 contra o processo
 * 944289240 (CodPedido 6744172) — ver src/workers/pepi/explore-detalhe.ts.
 * Sem campo de imagem do protocolo: a coluna "Img" da tabela de Petições só
 * vem preenchida quando o usuário está autenticado como titular do processo,
 * fora do alcance da sessão anônima usada aqui (ver skill
 * pepi-scraping-playbook, seção de gotchas).
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { prisma } from '@/lib/db';
import { abrirSessaoAnonima, SiteMudouError } from './search';
import { PEPI } from './selectors';

export interface DetalheProcessoPepi {
  processo: string;
  marca: string | null;
  situacao: string | null;
  apresentacao: string | null;
  natureza: string | null;
  classificacaoNice: { classe: string | null; situacaoClasse: string | null; especificacao: string | null }[];
  classificacaoViena: { edicao: string | null; codigo: string | null; descricao: string | null }[];
  titulares: string[];
  representantes: string[];
  dataDeposito: string | null;
  dataConcessao: string | null;
  dataVigencia: string | null;
  peticoes: {
    pgo: string | null;
    protocolo: string | null;
    data: string | null;
    servico: string | null;
    cliente: string | null;
    delivery: string | null;
    dataDelivery: string | null;
  }[];
  publicacoes: {
    rpi: string | null;
    dataRpi: string | null;
    despacho: string | null;
    certificado: string | null;
    inteiroTeor: string | null;
    complemento: string | null;
  }[];
  dadosAtualizadosAte: string | null;
  numeroRevista: string | null;
}

export async function buscarDetalhe(
  processo: string,
  aoMudarEtapa: (etapa: string) => Promise<void>,
): Promise<DetalheProcessoPepi> {
  const browser = await chromium.launch({ headless: true });
  try {
    await aoMudarEtapa('acessando site do INPI');
    const page = await abrirSessaoAnonima(browser);

    // Ir direto para Action=detail&CodPedido=N sem antes buscar NÃO funciona
    // (confirmado ao vivo em 17/08/2026): a página de detalhe só reconhece o
    // CodPedido dentro da MESMA sessão que fez a busca — é estado de sessão,
    // igual à paginação de resultados (ver skill pepi-scraping-playbook).
    // Por isso repetimos a busca por processo aqui e clicamos no link de
    // detalhe do próprio resultado, em vez de montar a URL direto.
    await aoMudarEtapa('buscando o processo');
    await page.goto(`${PEPI.baseUrl}${PEPI.buscaPorProcesso.url}`, { waitUntil: 'domcontentloaded' });
    if ((await page.locator(PEPI.buscaPorProcesso.form).count()) === 0) {
      throw new SiteMudouError('buscando o processo', `formulário ${PEPI.buscaPorProcesso.form} ausente`);
    }
    await page.fill(PEPI.buscaPorProcesso.campoNumPedido, processo);
    await page.click(PEPI.buscaPorProcesso.botaoPesquisar, { timeout: 240_000 });
    await page.waitForLoadState('domcontentloaded');

    const linkDetalhe = page.locator(PEPI.resultados.linkDetalhe).first();
    if ((await linkDetalhe.count()) === 0) {
      throw new SiteMudouError('buscando o processo', 'nenhum resultado encontrado para este processo');
    }

    await aoMudarEtapa('abrindo detalhe do processo');
    await linkDetalhe.click();
    await page.waitForLoadState('domcontentloaded');
    if ((await page.locator(PEPI.detalheProcesso.campoNumeroProcesso).count()) === 0) {
      throw new SiteMudouError(
        'abrindo detalhe do processo',
        `${PEPI.detalheProcesso.campoNumeroProcesso} ausente — layout da página de detalhe mudou`,
      );
    }

    await aoMudarEtapa('extraindo dados do processo');
    // NOTA: nenhuma função nomeada (function ou const = (...) =>) pode viver
    // dentro deste evaluate() — tsx compila com esbuild `keepNames: true`
    // fixo (sem opção de desligar), que injeta chamadas a um helper `__name`
    // no código transpilado; esse helper só existe no bundle Node, não no
    // contexto isolado do navegador para onde o Playwright serializa esta
    // função, e a chamada quebra com "ReferenceError: __name is not
    // defined". Só callbacks 100% anônimos (passados direto pra .map/.find/
    // .filter, nunca atribuídos a um nome) são seguros aqui — por isso a
    // extração abaixo é toda em cadeias inline em vez de funções auxiliares
    // (mesmo padrão que search.ts já usa em extrairResultadosDaPagina).
    return await page.evaluate(() => {
      // Prioriza o texto VISÍVEL de cada célula: a maioria dos campos desta
      // página tem um balão de detalhe escondido (onmouseover="showMe(id)")
      // que o textContent normal misturaria com o texto visível. Ícones
      // (ex: status de pagamento) usam o alt como valor.
      const processo =
        (document.querySelector('#numeroProcesso') as HTMLInputElement | null)?.value?.trim() || '';

      // Todo par rótulo/valor de 2 colunas da página (info principal +
      // Titulares/Representantes) em uma única varredura — mais barato que
      // percorrer document.querySelectorAll('tr') de novo pra cada campo.
      const paresRotulo = Array.from(document.querySelectorAll('tr'))
        .map((tr) => Array.from(tr.cells))
        .filter((tds) => tds.length >= 2)
        .map(
          (tds) =>
            [
              tds[0].textContent?.replace(/\s+/g, ' ').trim() ?? '',
              tds[1].querySelector('img[alt]')?.getAttribute('alt') ??
                (tds[1].querySelector('a')?.textContent?.replace(/\s+/g, ' ').trim() ||
                  tds[1].textContent?.replace(/\s+/g, ' ').trim() ||
                  null),
            ] as [string, string | null],
        );
      const rotulos = new Map(paresRotulo);
      const titulares = paresRotulo
        .filter(([r]) => /^Titular\(\d+\):$/.test(r))
        .map(([, v]) => v)
        .filter((v): v is string => !!v);
      const representantes = paresRotulo
        .filter(([r]) => /^Representante\(\d+\):$/.test(r))
        .map(([, v]) => v)
        .filter((v): v is string => !!v);

      const tabelaNice = Array.from(document.querySelectorAll('table')).find((t) => {
        const ths = Array.from(t.querySelectorAll('thead th')).map((th) =>
          th.textContent?.replace(/\s+/g, ' ').trim(),
        );
        return ths[0] === 'Classe de Nice' && ths[1] === 'Situação da Classe' && ths[2] === 'Especificação';
      });
      const classificacaoNice = (
        tabelaNice ? Array.from(tabelaNice.rows).filter((tr) => tr.parentElement?.tagName === 'TBODY') : []
      ).map((tr) => {
        const v = Array.from(tr.cells).map(
          (td) =>
            td.querySelector('img[alt]')?.getAttribute('alt') ??
            (td.querySelector('a')?.textContent?.replace(/\s+/g, ' ').trim() ||
              td.textContent?.replace(/\s+/g, ' ').trim() ||
              null),
        );
        return { classe: v[0] ?? null, situacaoClasse: v[1] ?? null, especificacao: v[2] ?? null };
      });

      const tabelaViena = Array.from(document.querySelectorAll('table')).find((t) => {
        const ths = Array.from(t.querySelectorAll('thead th')).map((th) =>
          th.textContent?.replace(/\s+/g, ' ').trim(),
        );
        return ths[0] === 'Edição' && ths[1] === 'Código' && ths[2] === 'Descrição';
      });
      const classificacaoViena = (
        tabelaViena ? Array.from(tabelaViena.rows).filter((tr) => tr.parentElement?.tagName === 'TBODY') : []
      ).map((tr) => {
        const v = Array.from(tr.cells).map(
          (td) =>
            td.querySelector('img[alt]')?.getAttribute('alt') ??
            (td.querySelector('a')?.textContent?.replace(/\s+/g, ' ').trim() ||
              td.textContent?.replace(/\s+/g, ' ').trim() ||
              null),
        );
        return { edicao: v[0] ?? null, codigo: v[1] ?? null, descricao: v[2] ?? null };
      });

      const tabelaDatas = Array.from(document.querySelectorAll('table')).find((t) => {
        const ths = Array.from(t.querySelectorAll('thead th')).map((th) =>
          th.textContent?.replace(/\s+/g, ' ').trim(),
        );
        return ths[0] === 'Data de Depósito' && ths[1] === 'Data de Concessão';
      });
      const linhaDatas = tabelaDatas
        ? Array.from(tabelaDatas.rows).find((tr) => tr.parentElement?.tagName === 'TBODY')
        : undefined;
      const valoresDatas = linhaDatas
        ? Array.from(linhaDatas.cells).map(
            (td) =>
              td.querySelector('img[alt]')?.getAttribute('alt') ??
              (td.querySelector('a')?.textContent?.replace(/\s+/g, ' ').trim() ||
                td.textContent?.replace(/\s+/g, ' ').trim() ||
                null),
          )
        : [];

      const tabelaPeticoes = Array.from(document.querySelectorAll('table')).find((t) => {
        const ths = Array.from(t.querySelectorAll('thead th')).map((th) =>
          th.textContent?.replace(/\s+/g, ' ').trim(),
        );
        return ths[0] === 'Pgo' && ths[1] === 'Protocolo' && ths[2] === 'Data' && ths[3] === 'Img';
      });
      const peticoes = (
        tabelaPeticoes ? Array.from(tabelaPeticoes.rows).filter((tr) => tr.parentElement?.tagName === 'TBODY') : []
      ).map((tr) => {
        const v = Array.from(tr.cells).map(
          (td) =>
            td.querySelector('img[alt]')?.getAttribute('alt') ??
            (td.querySelector('a')?.textContent?.replace(/\s+/g, ' ').trim() ||
              td.textContent?.replace(/\s+/g, ' ').trim() ||
              null),
        );
        return {
          pgo: v[0] ?? null,
          protocolo: v[1] ?? null,
          data: v[2] ?? null,
          servico: v[5] ?? null,
          cliente: v[6] ?? null,
          delivery: v[7] ?? null,
          dataDelivery: v[8] ?? null,
        };
      });

      const tabelaPublicacoes = Array.from(document.querySelectorAll('table')).find((t) => {
        const ths = Array.from(t.querySelectorAll('thead th')).map((th) =>
          th.textContent?.replace(/\s+/g, ' ').trim(),
        );
        return (
          ths[0] === 'RPI' &&
          ths[1] === 'Data RPI' &&
          ths[2] === 'Despacho' &&
          ths[3] === 'Certificado' &&
          ths[4] === 'Inteiro Teor' &&
          ths[5] === 'Complemento do Despacho'
        );
      });
      const publicacoes = (
        tabelaPublicacoes ? Array.from(tabelaPublicacoes.rows).filter((tr) => tr.parentElement?.tagName === 'TBODY') : []
      ).map((tr) => {
        const v = Array.from(tr.cells).map(
          (td) =>
            td.querySelector('img[alt]')?.getAttribute('alt') ??
            (td.querySelector('a')?.textContent?.replace(/\s+/g, ' ').trim() ||
              td.textContent?.replace(/\s+/g, ' ').trim() ||
              null),
        );
        return {
          rpi: v[0] ?? null,
          dataRpi: v[1] ?? null,
          despacho: v[2] ?? null,
          certificado: v[3] ?? null,
          inteiroTeor: v[4] ?? null,
          complemento: v[5] ?? null,
        };
      });

      // O HTML real tem espaço duplo/quebras de linha soltas em volta destas
      // palavras (confirmado ao vivo) — \s+ em cada lacuna, não espaço literal.
      const rodape = document.body.textContent?.match(
        /Dados\s+atualizados\s+até\s+(\d{2}\/\d{2}\/\d{4})\s*-\s*N[ºo]\s*da\s*Revista:\s*(\d+)/,
      );

      return {
        processo,
        marca: rotulos.get('Marca:') ?? null,
        situacao: rotulos.get('Situação:') ?? null,
        apresentacao: rotulos.get('Apresentação:') ?? null,
        natureza: rotulos.get('Natureza:') ?? null,
        classificacaoNice,
        classificacaoViena,
        titulares,
        representantes,
        dataDeposito: valoresDatas[0] ?? null,
        dataConcessao: valoresDatas[1] ?? null,
        dataVigencia: valoresDatas[2] ?? null,
        peticoes,
        publicacoes,
        dadosAtualizadosAte: rodape ? rodape[1] : null,
        numeroRevista: rodape ? rodape[2] : null,
      };
    });
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

  let job = await prisma.pepiDetalheJob.findUnique({ where: { id: jobId } });
  if (!job) {
    // Dispatch manual de teste pela aba Actions: cria o job a partir dos inputs.
    const codPedido = process.env.COD_PEDIDO;
    const processo = process.env.PROCESSO;
    if (!codPedido || !processo) {
      throw new Error(`Job ${jobId} não existe e COD_PEDIDO/PROCESSO não permitem criá-lo.`);
    }
    job = await prisma.pepiDetalheJob.create({ data: { id: jobId, codPedido, processo } });
    console.log(`[pepi-detalhe] job ${jobId} não existia — criado a partir dos inputs do workflow.`);
  }

  const aoMudarEtapa = async (etapa: string) => {
    console.log(`[pepi-detalhe] ${etapa}`);
    await prisma.pepiDetalheJob.update({
      where: { id: job.id },
      data: { status: 'executando', etapa },
    });
  };

  try {
    const detalhe = await buscarDetalhe(job.processo, aoMudarEtapa);
    await prisma.pepiDetalheJob.update({
      where: { id: job.id },
      data: {
        status: 'sucesso',
        etapa: 'concluído',
        resultado: detalhe as object,
        finalizadoEm: new Date(),
      },
    });
    console.log(`[pepi-detalhe] concluído: processo ${detalhe.processo || job.processo}.`);
  } catch (e) {
    const erro = e as Error;
    await prisma.pepiDetalheJob.update({
      where: { id: job.id },
      data: { status: 'erro', etapa: 'erro', erro: `${erro.name}: ${erro.message}`, finalizadoEm: new Date() },
    });
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[pepi-detalhe] ERRO:', e);
    process.exit(1);
  });
}
