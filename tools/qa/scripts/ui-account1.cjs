const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  for (const vp of ['desktop', 'phone']) {
    const { ctx, page, logs } = await open(browser, vp);
    const touch = !!VIEWPORTS[vp].hasTouch;
    const snap = async (name) => {
      await page.screenshot({ path: `shots/acct-${vp}-${name}.png` });
      const rep = fmtLayout(await layoutReport(page, { touch }));
      const txt = await page.evaluate(() => (document.querySelector('[role="dialog"]') || document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 600));
      console.log(`\n[${vp}] ${name}: ${txt}${rep ? '\n' + rep : ''}`);
    };
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.waitForTimeout(300);
    await snap('signin');
    const btns = await page.evaluate(() => [...(document.querySelector('[role="dialog"]') || document.body).querySelectorAll('button, a, input, select')].map((b) => `${b.tagName}:${b.type || ''}:${(b.textContent || b.placeholder || b.getAttribute('aria-label') || '').trim().slice(0, 30)}`));
    console.log(btns.join(' | '));
    if (logs.length) console.log('LOGS', [...new Set(logs)].join('\n'));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
