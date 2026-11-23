// After a pinch or a drag on the board, is the next tap on a building spot ignored?
const { chromium, VIEWPORTS, BASE, open } = require('./uilib.cjs');
const { inject } = require('./driver.cjs');
(async () => {
  const browser = await chromium.launch();
  for (const scenario of ['tap-only', 'pinch-then-tap', 'pinch-drag-then-tap', 'pinch-then-two-taps']) {
    const { ctx, page, logs } = await open(browser, 'phone');
    const cdp = await ctx.newCDPSession(page);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Play against bots/ }).click();
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.waitForSelector('.game .target-corner');
    const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i, radiusX: 4, radiusY: 4, force: 1 })) });
    const pane = await page.locator('.zoom-pane').boundingBox();
    const cx = pane.x + pane.width / 2, cy = pane.y + pane.height / 2;
    const pinch = async () => {
      await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
      for (let i = 1; i <= 6; i++) { await touch('touchMove', [[cx - 30 - i * 10, cy], [cx + 30 + i * 10, cy]]); await page.waitForTimeout(16); }
      await touch('touchEnd', []);
      await page.waitForTimeout(100);
    };
    const drag = async () => {
      await touch('touchStart', [[cx, cy]]);
      for (let i = 1; i <= 6; i++) { await touch('touchMove', [[cx + i * 10, cy + i * 6]]); await page.waitForTimeout(16); }
      await touch('touchEnd', []);
      await page.waitForTimeout(100);
    };
    const tapTarget = async () => {
      // A corner spot that is on screen and not covered.
      const pt = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        for (const el of document.querySelectorAll('.target-corner')) {
          const b = el.getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          if (x < 5 || y < 5 || x > vw - 5 || y > vh - 5) continue;
          if (document.elementFromPoint(x, y) === el) return { x, y, w: Math.round(b.width) };
        }
        return null;
      });
      if (!pt) return 'no target on screen';
      await touch('touchStart', [[pt.x, pt.y]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(350);
      return `tapped a ${pt.w}px spot`;
    };
    const built = () => page.evaluate(() => JSON.parse(localStorage.getItem('colonizers.localGame') || '{"actions":[]}').actions.length);
    const zoom = () => page.evaluate(() => document.querySelector('.zoom-inner').getAttribute('style'));
    if (scenario !== 'tap-only') await pinch();
    if (scenario === 'pinch-drag-then-tap') await drag();
    const z = await zoom();
    const t1 = await tapTarget();
    const n1 = await built();
    let extra = '';
    if (n1 === 0) {
      const t2 = await tapTarget();
      extra = ` | second tap: ${t2}, moves made ${await built()}`;
    }
    console.log(`${scenario}: zoom "${z}" | first tap: ${t1}, moves made ${n1}${extra}`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
