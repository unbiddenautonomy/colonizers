const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, 'desktop');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const selects = await page.evaluate(() => [...document.querySelectorAll('select')].map((s) => ({ label: s.getAttribute('aria-label') || s.closest('label')?.textContent?.trim().slice(0, 20) || s.previousSibling?.textContent, n: s.options.length, options: [...s.options].map((o) => o.textContent + (o.parentElement.tagName === 'OPTGROUP' ? ` [${o.parentElement.label}]` : '')) })));
  for (const s of selects.slice(0, 3)) console.log(JSON.stringify(s));
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button, a')].map((b) => (b.textContent || b.getAttribute('aria-label')).trim().slice(0, 30)));
  console.log(buttons.join(' | '));
  for (const path of ['/me', '/stats', '/crew/nope', '/replay/nope', '/editor', '/r/ZZZZ', '/nothing-here', '/?signin=1', '/?verify=abc', '/?reset=abc', '/?crew=abc']) {
    logs.length = 0;
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const name = path.replace(/[^a-z0-9]+/gi, '_');
    await page.screenshot({ path: `shots/page-desktop${name}.png` });
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
    console.log(`\n== ${path} -> ${page.url().replace(BASE, '')}\n   ${text}`);
    if (logs.length) console.log('   LOGS: ' + [...new Set(logs)].join('\n   '));
  }
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
