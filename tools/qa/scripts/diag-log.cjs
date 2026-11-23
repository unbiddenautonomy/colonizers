/**
 * Does the game log keep following new moves when nobody touches it?
 * A local game against three bots on the real clock, with clicks at a human pace
 * (roll, place, end turn only). Every 250 ms the log's distance from its end and the
 * "New moves below" button are sampled. The log is never scrolled by the test.
 * Usage: node diag-log.cjs [paceMs] [seconds]
 */
const { chromium, BASE, open } = require('./uilib.cjs');
const pace = Number(process.argv[2] || 1200);
const seconds = Number(process.argv[3] || 150);
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}]`, ...a);

(async () => {
  const browser = await chromium.launch();
  const { page } = await open(browser, 'desktop');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Play against bots/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  say('game started on', BASE, '| pace', pace, 'ms');
  let stuckSince = null;
  let firstStuck = null;
  let samples = 0;
  let away = 0;
  let maxDist = 0;
  const sampler = setInterval(async () => {
    const s = await page
      .evaluate(() => {
        const el = document.querySelector('.game-log-list');
        if (!el) return null;
        return {
          dist: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight),
          pill: document.querySelector('.game-log-latest')?.innerText.trim() || null,
          lines: el.querySelectorAll('li').length,
          overflow: el.scrollHeight > el.clientHeight,
        };
      })
      .catch(() => null);
    if (!s) return;
    samples++;
    if (s.dist > maxDist) maxDist = s.dist;
    if (s.pill) {
      away++;
      if (stuckSince === null) stuckSince = Date.now();
      // Away from the end for over 3 s with nobody scrolling: the log has stopped following.
      if (Date.now() - stuckSince > 3000 && firstStuck === null) {
        firstStuck = { at: ((Date.now() - t0) / 1000).toFixed(1), ...s };
        say('log stopped following:', JSON.stringify(firstStuck));
        await page.screenshot({ path: 'shots/log-stuck.png' }).catch(() => {});
      }
    } else stuckSince = null;
  }, 250);

  let clicks = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const dlg = page.locator('[role=dialog]');
    let did = null;
    if (await dlg.count()) {
      const title = (await dlg.first().getAttribute('aria-label').catch(() => '')) || '';
      if (/discard/i.test(title)) {
        for (let i = 0; i < 14; i++) {
          const done = dlg.getByRole('button', { name: /^Discard \d+\/\d+/ });
          if (await done.isEnabled().catch(() => false)) { await done.click().catch(() => {}); break; }
          const more = dlg.locator('button[aria-label^="More "]:not(:disabled)');
          if (!(await more.count())) break;
          await more.first().click().catch(() => {});
        }
        did = 'discard';
      } else if (/wins/i.test(await dlg.first().innerText().catch(() => ''))) {
        say('game over');
        break;
      } else {
        const btn = dlg.locator('button:not(:disabled)').first();
        if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); did = 'dialog'; }
      }
    }
    if (!did) {
      const roll = page.getByRole('button', { name: /Roll$/ });
      const end = page.getByRole('button', { name: 'End turn' });
      if ((await roll.count()) && (await roll.first().isEnabled().catch(() => false))) { await roll.first().click({ timeout: 2000 }).catch(() => {}); did = 'roll'; }
      else if (await page.locator('.target').count()) { await page.locator('.target').first().click({ timeout: 2000, force: true }).catch(() => {}); did = 'target'; }
      else if ((await end.count()) && (await end.first().isEnabled().catch(() => false))) { await end.first().click({ timeout: 2000 }).catch(() => {}); did = 'end'; }
    }
    if (did) clicks++;
    await page.waitForTimeout(did ? pace : 300);
  }
  clearInterval(sampler);
  await page.waitForTimeout(600);
  const fin = await page.evaluate(() => {
    const el = document.querySelector('.game-log-list');
    return el && { dist: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), pill: document.querySelector('.game-log-latest')?.innerText.trim() || null, lines: el.querySelectorAll('li').length };
  });
  say('clicks', clicks, '| samples', samples, '| samples away from the end', away, '| largest distance', maxDist, 'px | first stuck', JSON.stringify(firstStuck), '| at the end', JSON.stringify(fin));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
