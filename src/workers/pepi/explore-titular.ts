/**
 * Sessão exploratória da busca por TITULAR/depositante do pePI (Fase 3 do TASKS.md).
 * Inventaria o formulário de Pesquisa_titular.jsp e submete UMA busca de teste
 * para mapear a tabela de resultados/paginação antes de escrever o scraper real.
 * Salva HTML + screenshot de cada etapa em PEPI_EXPLORE_OUT (ou ./pepi-out).
 * Uso: npx tsx src/workers/pepi/explore-titular.ts
 */
import { chromium, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PEPI } from './selectors';

const OUT = process.env.PEPI_EXPLORE_OUT ?? path.join(process.cwd(), 'pepi-out');
fs.mkdirSync(OUT, { recursive: true });

async function salvar(page: Page, etapa: string) {
  fs.writeFileSync(path.join(OUT, `${etapa}.html`), await page.content());
  await page.screenshot({ path: path.join(OUT, `${etapa}.png`), fullPage: true });
  console.log(`[explore-titular] ${etapa}: url=${page.url()}`);
}

async function inventariarForms(page: Page, arquivo: string) {
  const forms = await page.$$eval('form', (fs2) =>
    fs2.map((f) => ({
      name: f.getAttribute('name'),
      action: f.getAttribute('action'),
      campos: Array.from(f.querySelectorAll('input,select,textarea,button')).map((c) => ({
        tag: c.tagName.toLowerCase(),
        type: c.getAttribute('type'),
        name: c.getAttribute('name'),
        value: (c as HTMLInputElement).value?.slice(0, 40),
        opcoes:
          c.tagName === 'SELECT'
            ? Array.from((c as HTMLSelectElement).options).map((o) => `${o.value}=${o.text.trim()}`)
            : undefined,
      })),
    })),
  );
  fs.writeFileSync(path.join(OUT, arquivo), JSON.stringify(forms, null, 2));
  console.log(`[explore-titular] ${forms.length} formulários inventariados em ${arquivo}`);
  return forms;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });
  let page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  try {
    console.log('[explore-titular] acessando portal pePI...');
    await page.goto(`${PEPI.baseUrl}${PEPI.entrada.url}`, { waitUntil: 'domcontentloaded' });
    // Gotcha confirmado (28/07/2026): o login anônimo abre uma ABA NOVA.
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
    await salvar(page, 'T01-pos-login');

    const r = await page.goto(`${PEPI.baseUrl}${PEPI.buscaPorTitular.url}`, {
      waitUntil: 'domcontentloaded',
    });
    console.log(`[explore-titular] ${PEPI.buscaPorTitular.url}: ${r?.status()}`);
    await salvar(page, 'T02-form-titular');
    const forms = await inventariarForms(page, 'T02-forms-titular.json');

    // Busca de teste: titular conhecido com muitos processos, para ver paginação.
    // Rate limit deliberado: UMA única submissão nesta sessão exploratória.
    // O formulário tem 2 campos ("CNPJ/CPF OU Nome"); cpf_cgc_numINPI é só-dígitos
    // (onkeyup remove não-numéricos) — a busca de teste usa o campo de NOME.
    const campoTexto = forms
      .flatMap((f) => f.campos)
      .find((c) => c.tag === 'input' && c.type === 'text' && /nomeTitular/i.test(c.name ?? ''));
    if (!campoTexto) {
      console.log('[explore-titular] campo nomeTitular ausente — inspecionar T02-forms-titular.json');
      return;
    }
    console.log(`[explore-titular] submetendo busca de teste no campo "${campoTexto.name}"...`);
    await page.fill(`input[name="${campoTexto.name}"]`, 'NATURA COSMETICOS');
    const porPagina = page.locator('select[name="registerPerPage"]');
    if ((await porPagina.count()) > 0) await porPagina.selectOption('100');
    await page.locator('input[type="submit"]').first().click({ timeout: 120_000 });
    await page.waitForLoadState('domcontentloaded');
    await salvar(page, 'T03-resultado');

    const tabelas = await page.$$eval('table', (ts) =>
      ts.map((t) => ({
        linhas: t.rows.length,
        primeiraLinha: Array.from(t.rows[0]?.cells ?? []).map((c) => c.textContent?.trim().slice(0, 40)),
        segundaLinha: Array.from(t.rows[1]?.cells ?? []).map((c) => c.textContent?.trim().slice(0, 40)),
      })),
    );
    fs.writeFileSync(path.join(OUT, 'T03-tabelas.json'), JSON.stringify(tabelas, null, 2));
    const paginacao = await page.$$eval('a', (as) =>
      as
        .map((a) => ({ text: a.textContent?.trim().slice(0, 30), href: a.getAttribute('href') }))
        .filter((l) => /Page|page=/i.test(l.href ?? '')),
    );
    fs.writeFileSync(path.join(OUT, 'T03-paginacao.json'), JSON.stringify(paginacao, null, 2));
    console.log(
      `[explore-titular] ${tabelas.length} tabelas e ${paginacao.length} links de paginação na página de resultado`,
    );
    console.log('[explore-titular] concluído');
  } catch (e) {
    await salvar(page, 'T99-erro').catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('[explore-titular] ERRO:', e);
  process.exit(1);
});
