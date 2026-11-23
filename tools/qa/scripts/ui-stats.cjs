/**
 * Unreleased branch: play a local game against bots to the end with real clicks, then check the
 * "Games on this device" page (/stats) on desktop and phone, and what the game-over screen offers.
 */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const { Driver } = require('./driver.cjs');
const say = (...a) => console.log(...a);
const text = async (page, sel = 'body', n = 600) => (await page.locator(sel).first().innerText().catch(() => '(none)')).replace(/\s+/g, ' ').slice(0, n);
(async () => {
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, 'desktop');
  await page.clock.install();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  say('home buttons:', JSON.stringify(await page.locator('main button').allInnerTexts()).slice(0, 600));
  await page.goto(BASE + '/stats', { waitUntil: 'networkidle' });
  say('/stats before any game:', await text(page, 'main', 300));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Play against bots/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  const driver = new Driver(page, { touch: false, failShot: 'shots/fail-stats' });
  const t0 = Date.now();
  let result;
  try {
    result = await driver.play({ maxSteps: 6000 });
  } catch (e) {
    say('DRIVER ERROR', e.message);
  }
  say('game:', JSON.stringify(result && { winner: result.winner, vp: result.vp, n: result.n, round: result.turn.round }), `${Math.round((Date.now() - t0) / 1000)} s`);
  await page.waitForTimeout(500);
  say('game over dialog:', await text(page, '[role=dialog]', 500), '| buttons', JSON.stringify(await page.locator('[role=dialog] button').allInnerTexts()));
  await page.screenshot({ path: 'shots/stats-gameover-desktop.png' });
  await page.keyboard.press('Escape');
  say('dialog after Escape:', await page.locator('[role=dialog]').count());
  say('stored stats bytes:', await page.evaluate(() => (localStorage.getItem('colonizers.localStats') || '').length));
  await ctx.storageState({ path: 'state-stats.json' });
  await page.goto(BASE + '/stats', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  say('/stats after one game:', await text(page, 'main', 1800));
  await page.screenshot({ path: 'shots/stats-desktop.png', fullPage: true });
  say('buttons:', JSON.stringify(await page.locator('main button').allInnerTexts()));
  const rep = fmtLayout(await layoutReport(page, { touch: false }));
  if (rep) say('layout (desktop):\n' + rep);
  if (logs.length) say('LOGS:\n' + [...new Set(logs)].slice(0, 12).join('\n'));
  // Phone.
  const P = await open(browser, 'phone', { context: { storageState: 'state-stats.json' } });
  await P.page.goto(BASE + '/stats', { waitUntil: 'networkidle' });
  await P.page.waitForTimeout(500);
  await P.page.screenshot({ path: 'shots/stats-phone.png', fullPage: true });
  const rep2 = fmtLayout(await layoutReport(P.page, { touch: true }));
  say('layout (phone):\n' + (rep2 || '  nothing'));
  // Clear.
  const clear = P.page.getByRole('button', { name: /Clear|Delete|Forget/ });
  say('clear buttons:', JSON.stringify(await clear.allInnerTexts()));
  if (await clear.count()) {
    await clear.first().click();
    await P.page.waitForTimeout(300);
    say('after clear click:', await text(P.page, 'main', 300), '| buttons', JSON.stringify(await P.page.locator('main button').allInnerTexts()));
  }
  if (P.logs.length) say('LOGS phone:\n' + [...new Set(P.logs)].slice(0, 12).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
