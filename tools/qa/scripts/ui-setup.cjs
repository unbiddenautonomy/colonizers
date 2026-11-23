const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  for (const vp of (process.argv[2] || 'phone,small,land,tablet,desktop').split(',')) {
    const { ctx, page, logs } = await open(browser, vp);
    const touch = !!VIEWPORTS[vp].hasTouch;
    const shot = async (name, full = true) => {
      await page.screenshot({ path: `shots/setup-${vp}-${name}.png`, fullPage: full });
      const rep = fmtLayout(await layoutReport(page, { touch }));
      console.log(`[${vp}] ${name}${rep ? '\n' + rep : ' ok'}`);
    };
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await shot('1-players');
    await page.getByRole('button', { name: '8', exact: true }).click();
    await shot('1-players-8');
    await page.getByRole('button', { name: /Play against bots/ }).click();
    await shot('1-players-8-bots');
    await page.getByRole('button', { name: '4', exact: true }).click();
    await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /Map/ }).click();
    await shot('2-map');
    await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /Expansions/ }).click();
    await shot('3-expansions');
    // Open a "Why?" on a blocked expansion.
    const why = page.getByRole('button', { name: /^Why\?/ }).first();
    if (await why.count()) { await why.click(); await shot('3-expansions-why'); }
    await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /House rules/ }).click();
    await shot('4-rules');
    await page.getByRole('button', { name: /Rulebook/ }).click();
    await page.waitForTimeout(300);
    await shot('rulebook', false);
    if (logs.length) console.log(`[${vp}] LOGS:\n` + [...new Set(logs)].join('\n'));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
