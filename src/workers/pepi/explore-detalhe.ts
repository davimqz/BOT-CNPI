/**
 * Exploração pontual (não faz parte do produto) para mapear a página de
 * detalhe de processo (Action=detail&CodPedido=N) e o link de imagem do
 * protocolo na tabela de Petições, antes de escrever o scraper de verdade.
 * Uso: npx tsx src/workers/pepi/explore-detalhe.ts <numero-do-processo>
 */
import { chromium, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PEPI } from './selectors';

const OUT = process.env.PEPI_EXPLORE_OUT ?? path.join(process.cwd(), 'pepi-out-detalhe');
fs.mkdirSync(OUT, { recursive: true });

async function salvar(page: Page, etapa: string) {
  fs.writeFileSync(path.join(OUT, `${etapa}.html`), await page.content());
  await page.screenshot({ path: path.join(OUT, `${etapa}.png`), fullPage: true });
  console.log(`[explore-detalhe] ${etapa}: url=${page.url()}`);
}

async function main() {
  const processo = process.argv[2];
  if (!processo) throw new Error('Uso: npx tsx src/workers/pepi/explore-detalhe.ts <numero-do-processo>');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  let page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  try {
    console.log('[explore-detalhe] acessando site do INPI...');
    await page.goto(`${PEPI.baseUrl}${PEPI.entrada.url}`, { waitUntil: 'domcontentloaded' });
    const linkAnonimo = page.locator(PEPI.entrada.linkAcessoAnonimo);
    const [abaLogin] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15_000 }).catch(() => null),
      linkAnonimo.first().click(),
    ]);
    if (abaLogin) {
      page = abaLogin;
      page.setDefaultTimeout(30_000);
    }
    await page.waitForLoadState('domcontentloaded');

    console.log(`[explore-detalhe] buscando processo ${processo}...`);
    await page.goto(`${PEPI.baseUrl}${PEPI.buscaPorProcesso.url}`, { waitUntil: 'domcontentloaded' });
    await page.fill(PEPI.buscaPorProcesso.campoNumPedido, processo);
    await page.click(PEPI.buscaPorProcesso.botaoPesquisar, { timeout: 240_000 });
    await page.waitForLoadState('domcontentloaded');
    await salvar(page, '01-resultado-busca');

    const detalheLink = page.locator(PEPI.resultados.linkDetalhe).first();
    if ((await detalheLink.count()) === 0) throw new Error('Nenhum link de detalhe encontrado no resultado');
    const href = await detalheLink.getAttribute('href');
    console.log(`[explore-detalhe] link de detalhe: ${href}`);

    console.log('[explore-detalhe] abrindo página de detalhe...');
    await detalheLink.click();
    await page.waitForLoadState('domcontentloaded');
    await salvar(page, '02-detalhe');

    // Inventariar TODAS as tabelas da página de detalhe (Classificações, Titulares,
    // Representante, Datas, Petições, Publicações) com header + primeiras linhas.
    const tabelas = await page.$$eval('table', (ts) =>
      ts.map((t, idx) => ({
        idx,
        linhas: t.rows.length,
        amostra: Array.from(t.rows)
          .slice(0, 4)
          .map((r) => Array.from(r.cells).map((c) => c.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60))),
      })),
    );
    fs.writeFileSync(path.join(OUT, '02-tabelas.json'), JSON.stringify(tabelas, null, 2));
    console.log(`[explore-detalhe] ${tabelas.length} tabelas na página de detalhe salvas em 02-tabelas.json`);

    // Todos os links/imagens da página — para achar o link/ícone do protocolo
    // na coluna "Img" de Petições.
    const links = await page.$$eval('a', (as) =>
      as.map((a) => ({
        text: a.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60),
        href: a.getAttribute('href'),
        onclick: a.getAttribute('onclick'),
        temImg: !!a.querySelector('img'),
        imgSrc: a.querySelector('img')?.getAttribute('src') ?? null,
      })),
    );
    fs.writeFileSync(path.join(OUT, '02-links.json'), JSON.stringify(links, null, 2));

    const imgs = await page.$$eval('img', (is) =>
      is.map((i) => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt'), title: i.getAttribute('title') })),
    );
    fs.writeFileSync(path.join(OUT, '02-imgs.json'), JSON.stringify(imgs, null, 2));
    console.log(`[explore-detalhe] ${links.length} links e ${imgs.length} imgs salvos`);

    // Se houver um link/ícone plausível de protocolo (pdf/img no texto/href),
    // tentar abrir e ver o que acontece (nova aba? PDF inline? download forçado?).
    const candidato = links.find(
      (l) => l.temImg && (/protocolo|pdf|peticao|petição/i.test(l.href ?? '') || /pdf|img/i.test(l.imgSrc ?? '')),
    );
    if (candidato) {
      console.log(`[explore-detalhe] candidato a link de protocolo: ${JSON.stringify(candidato)}`);
      const loc = page.locator(`a[href="${candidato.href}"]`).first();
      if ((await loc.count()) > 0) {
        const [popup] = await Promise.all([
          ctx.waitForEvent('page', { timeout: 10_000 }).catch(() => null),
          loc.click().catch((e) => console.log('[explore-detalhe] clique falhou:', e.message)),
        ]);
        if (popup) {
          await popup.waitForLoadState('domcontentloaded').catch(() => {});
          console.log(`[explore-detalhe] abriu nova aba: ${popup.url()}`);
          const resp = await ctx.request.get(popup.url());
          console.log(
            `[explore-detalhe] GET direto na mesma sessão: status=${resp.status()} content-type=${resp.headers()['content-type']} bytes=${(await resp.body()).length}`,
          );
          fs.writeFileSync(path.join(OUT, '03-protocolo-url.txt'), popup.url());
          await popup.close();
        } else {
          console.log('[explore-detalhe] clique não abriu aba nova — pode ser download direto ou mudança na mesma aba');
          await salvar(page, '03-pos-clique-protocolo');
        }
      }
    } else {
      console.log('[explore-detalhe] nenhum candidato óbvio a link de protocolo encontrado — inspecionar 02-links.json/02-imgs.json manualmente');
    }

    console.log('[explore-detalhe] concluído');
  } catch (e) {
    await salvar(page, '99-erro').catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('[explore-detalhe] ERRO:', e);
  process.exit(1);
});
