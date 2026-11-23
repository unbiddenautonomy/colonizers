const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const { Driver, inject } = require('./driver.cjs');
(async () => {
  const vp = process.argv[2] || 'desktop';
  const tag = process.argv[3] || 'base';
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, vp);
  const touch = !!VIEWPORTS[vp].hasTouch;
  await page.clock.install();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Play against bots/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  const seen = new Set();
  const shot = async (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    await page.screenshot({ path: `shots/game-${tag}-${vp}-${name}.png` });
    const rep = fmtLayout(await layoutReport(page, { touch }));
    const sizes = await page.evaluate(() => window.__qa?.targetSizes());
    console.log(`[${vp}] ${name} targets=${JSON.stringify(sizes)}${rep ? '\n' + rep : ''}`);
  };
  const driver = new Driver(page, {
    touch,
    failShot: `shots/fail-${tag}-${vp}`,
    onShot: async (info) => {
      const ph = info.phase.id;
      const human = info.waiting.includes(info.humans[0]);
      if (ph === 'setup' && human) await shot(`setup-${info.phase.step}`);
      if (ph === 'roll' && human) await shot('roll');
      if (ph === 'main' && human && info.turn.round >= 1) await shot('main');
      if (ph === 'main' && human && info.turn.round >= 6) await shot('main-late');
      if (ph === 'discard' && human) await shot('discard');
      if (ph === 'moveRobber' && human) await shot('robber');
      if (ph === 'steal' && human) await shot('steal');
      if (info.trade && info.trade.from !== info.humans[0]) await shot('offer-from-bot');
      if (info.trade && info.trade.from === info.humans[0]) await shot('offer-mine');
      if (ph === 'roadBuilding' && human) await shot('roadbuilding');
    },
  });
  const t0 = Date.now();
  let result;
  try {
    result = await driver.play({ maxSteps: 5000 });
  } catch (e) {
    console.log('DRIVER ERROR', e.message);
    await page.screenshot({ path: `shots/game-${tag}-${vp}-error.png` });
  }
  await page.waitForTimeout(300);
  await shot('gameover');
  console.log(JSON.stringify({ ms: Date.now() - t0, result: result && { winner: result.winner, vp: result.vp, n: result.n, steps: result.steps, round: result.turn.round }, stats: driver.stats }, null, 1));
  if (logs.length) console.log('LOGS:\n' + [...new Set(logs)].slice(0, 30).join('\n'));
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
