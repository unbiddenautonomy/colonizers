const { chromium, VIEWPORTS, BASE, open } = require('./uilib.cjs');
(async () => {
  const vp = process.argv[2] || 'desktop';
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, vp);
  await page.clock.install();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Play against bots/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  const first = page.locator('.target-corner');
  await first.nth(Math.floor((await first.count()) / 2)).click();
  await page.waitForTimeout(100);
  const edges = page.locator('.target-edge');
  const n = await edges.count();
  for (let i = 0; i < n; i++) {
    const info = await edges.nth(i).evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x1: el.getAttribute('x1'), y1: el.getAttribute('y1'), x2: el.getAttribute('x2'), y2: el.getAttribute('y2'), box: [b.left, b.top, b.width, b.height].map(Math.round), anim: getComputedStyle(el).animationName };
    });
    let res = 'ok';
    try { await edges.nth(i).click({ timeout: 1500, trial: true }); } catch (e) { res = e.message.split('\n').slice(0, 14).join('\n      '); }
    console.log(i, JSON.stringify(info), res);
  }
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
