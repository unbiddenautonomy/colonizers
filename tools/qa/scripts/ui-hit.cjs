// Hit-testing: for every glowing target, does a click on its middle reach it?
const { chromium, VIEWPORTS, BASE, open } = require('./uilib.cjs');
const { Driver, inject } = require('./driver.cjs');
(async () => {
  const vp = process.argv[2] || 'desktop';
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, vp);
  await page.clock.install();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Play against bots/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  const probe = async (label) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.target')) {
        const b = el.getBoundingClientRect();
        let x = b.left + b.width / 2, y = b.top + b.height / 2;
        const top = document.elementFromPoint(x, y);
        const cls = el.getAttribute('class');
        const s = getComputedStyle(el);
        out.push({ cls, w: Math.round(b.width), h: Math.round(b.height), hit: top === el, topEl: top ? `${top.tagName}.${top.getAttribute('class') || ''}` : null, pe: s.pointerEvents, sw: s.strokeWidth });
      }
      return out;
    });
    const miss = r.filter((x) => !x.hit);
    console.log(`[${vp}] ${label}: ${r.length} targets, ${miss.length} not hit at centre. sample=${JSON.stringify(r[0])}`);
    const by = {};
    for (const m of miss) by[m.topEl] = (by[m.topEl] || 0) + 1;
    if (miss.length) console.log('   blocked by:', JSON.stringify(by));
  };
  await probe('setup settlement');
  // Place the first settlement by clicking a middle corner.
  const first = page.locator('.target-corner');
  await first.nth(Math.floor((await first.count()) / 2)).click();
  await page.waitForTimeout(100);
  await probe('setup road');
  await page.screenshot({ path: `shots/hit-${vp}-setup-road.png` });
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
