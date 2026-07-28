/**
 * Sessão exploratória do pePI (Fase 2, tarefa 1 do TASKS.md).
 * Salva HTML + screenshot de cada etapa em PEPI_EXPLORE_OUT (ou ./pepi-out)
 * para mapear os seletores reais antes de escrever o scraper de produção.
 * Uso: npx tsx src/workers/pepi/explore.ts
 */
import { chromium, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = process.env.PEPI_EXPLORE_OUT ?? path.join(process.cwd(), 'pepi-out');
fs.mkdirSync(OUT, { recursive: true });

async function salvar(page: Page, etapa: string) {
  fs.writeFileSync(path.join(OUT, `${etapa}.html`), await page.content());
  await page.screenshot({ path: path.join(OUT, `${etapa}.png`), fullPage: true });
  console.log(`[explore] ${etapa}: url=${page.url()}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  try {
    console.log('[explore] acessando portal pePI...');
    // gru.inpi.gov.br/pePI passou a responder 404 (visto em 28/07/2026); o host
    // que serve o sistema é busca.inpi.gov.br.
    const resp = await page.goto('https://busca.inpi.gov.br/pePI/', { waitUntil: 'domcontentloaded' });
    console.log(`[explore] status inicial: ${resp?.status()}`);
    await salvar(page, '01-entrada');

    // O pePI historicamente oferece acesso anônimo via link "Continuar...." na tela de login.
    const candidatosLogin = [
      page.getByRole('link', { name: /continuar/i }),
      page.locator('a', { hasText: /continuar/i }),
      page.locator('a[href*="LoginController"]'),
    ];
    for (const loc of candidatosLogin) {
      const n = await loc.count();
      if (n > 0) {
        console.log(
          `[explore] link de acesso encontrado (${n}): "${(await loc.first().textContent())?.trim()}" href=${await loc.first().getAttribute('href')}`,
        );
        await loc.first().click();
        await page.waitForLoadState('domcontentloaded');
        break;
      }
    }
    await salvar(page, '02-pos-login');

    const links = await page.$$eval('a', (as) =>
      as
        .map((a) => ({ text: a.textContent?.trim().slice(0, 60), href: a.getAttribute('href') }))
        .filter((l) => l.text),
    );
    fs.writeFileSync(path.join(OUT, 'links-02.json'), JSON.stringify(links, null, 2));
    console.log(`[explore] ${links.length} links salvos em links-02.json`);

    const marcaLink = page.locator('a', { hasText: /marca/i }).first();
    if ((await marcaLink.count()) > 0) {
      console.log(`[explore] clicando em link de marcas: "${(await marcaLink.textContent())?.trim()}"`);
      await marcaLink.click();
      await page.waitForLoadState('domcontentloaded');
      await salvar(page, '03-menu-marcas');
    } else {
      console.log('[explore] sem link de marcas visível; tentando URL direta da pesquisa');
      await page.goto('https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_num_processo.jsp', {
        waitUntil: 'domcontentloaded',
      });
      await salvar(page, '03-pesquisa-direta');
    }

    const inventariarForms = async (arquivo: string) => {
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
      console.log(`[explore] ${forms.length} formulários inventariados em ${arquivo}`);
      return forms;
    };
    await inventariarForms('forms-num-processo.json');

    // Busca por NOME de marca (Radical/Exata) — candidatos históricos de JSP.
    const candidatosJsp = [
      '/pePI/jsp/marcas/Pesquisa_marca.jsp',
      '/pePI/jsp/marcas/Pesquisa_radical.jsp',
      '/pePI/jsp/marcas/Pesquisa_classe_basica.jsp',
    ];
    for (const jsp of candidatosJsp) {
      const r = await page.goto(`https://busca.inpi.gov.br${jsp}`, { waitUntil: 'domcontentloaded' });
      console.log(`[explore] ${jsp}: ${r?.status()}`);
      if (r && r.status() === 200 && (await page.locator('form').count()) > 0) {
        const etapa = `04-${jsp.split('/').pop()!.replace('.jsp', '')}`;
        await salvar(page, etapa);
        const forms = await inventariarForms(`${etapa}-forms.json`);
        // Se este formulário tem campo de texto de marca, submeter UMA busca Exata
        // de teste (rate limit: uma única consulta nesta sessão exploratória).
        const temCampoMarca = forms.some((f) =>
          f.campos.some((c) => /marca|expressao|texto/i.test(c.name ?? '')),
        );
        if (temCampoMarca) {
          const campo = forms
            .flatMap((f) => f.campos)
            .find((c) => c.tag === 'input' && c.type === 'text' && /marca|expressao|texto/i.test(c.name ?? ''));
          console.log(`[explore] submetendo busca de teste no campo "${campo?.name}"...`);
          await page.fill(`input[name="${campo!.name}"]`, 'NATURA');
          // Selecionar tipo "exata" se houver radio/select para isso.
          const radioExata = page.locator('input[type="radio"][value*="xata" i], input[type="radio"][value="E"]');
          if ((await radioExata.count()) > 0) await radioExata.first().check();
          await page.locator('input[type="submit"]').first().click();
          await page.waitForLoadState('domcontentloaded');
          await salvar(page, '05-resultado-busca');
          const tabelas = await page.$$eval('table', (ts) =>
            ts.map((t) => ({
              linhas: t.rows.length,
              primeiraLinha: Array.from(t.rows[0]?.cells ?? []).map((c) => c.textContent?.trim().slice(0, 40)),
            })),
          );
          fs.writeFileSync(path.join(OUT, '05-tabelas.json'), JSON.stringify(tabelas, null, 2));
          console.log(`[explore] ${tabelas.length} tabelas na página de resultado`);
          break;
        }
      }
    }
    console.log('[explore] concluído');
  } catch (e) {
    await salvar(page, '99-erro').catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('[explore] ERRO:', e);
  process.exit(1);
});
