/**
 * Do bots in an online room ever sit on their move? Host (real clicks: roll, end turn, discard, robber)
 * plus three hard bots. A watcher page times every change of the prompt and reports long waits on a bot.
 * Usage: BASE=http://localhost:8788 node bot-stall.cjs [minutes] [timer label or ""] [bot level]
 */
const { chromium, BASE, open } = require('./uilib.cjs');
const minutes = Number(process.argv[2] || 10);
const timer = process.argv[3] || '';
const level = process.argv[4] || 'Hard';
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}]`, ...a);

async function clickSomething(pg) {
  const dlg = pg.locator('[role=dialog]');
  if (await dlg.count()) {
    const title = (await dlg.first().getAttribute('aria-label').catch(() => '')) || '';
    if (/discard/i.test(title)) {
      for (let i = 0; i < 14; i++) {
        const done = dlg.getByRole('button', { name: /^Discard \d+\/\d+/ });
        if (await done.isEnabled().catch(() => false)) { await done.click().catch(() => {}); return 'discard'; }
        const more = dlg.locator('button[aria-label^="More "]:not(:disabled)');
        if (!(await more.count())) break;
        await more.first().click().catch(() => {});
      }
      return 'discard?';
    }
    if (/Game over/i.test(title)) return 'over';
    const btn = dlg.locator('button:not(:disabled)').first();
    if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); return 'dialog'; }
  }
  const offer = pg.locator('.offer').getByRole('button', { name: 'Decline' });
  if (await offer.count()) { await offer.first().click({ timeout: 2000 }).catch(() => {}); return 'decline'; }
  const roll = pg.getByRole('button', { name: /Roll$/ });
  if ((await roll.count()) && (await roll.first().isEnabled().catch(() => false))) { await roll.first().click({ timeout: 2000 }).catch(() => {}); return 'roll'; }
  if (await pg.locator('.target').count()) { await pg.locator('.target').first().click({ timeout: 2000, force: true }).catch(() => {}); return 'target'; }
  const end = pg.getByRole('button', { name: 'End turn' });
  if ((await end.count()) && (await end.first().isEnabled().catch(() => false))) { await end.first().click({ timeout: 2000 }).catch(() => {}); return 'end'; }
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, 'desktop');
  const W = await open(browser, 'laptop');
  await A.page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await A.page.getByLabel('Your name').first().fill('Host');
  await A.page.getByRole('button', { name: 'Create a room' }).click();
  await A.page.waitForSelector('.lobby', { timeout: 15000 });
  const code = A.page.url().split('/r/')[1];
  await A.page.getByLabel('Bot level').selectOption({ label: level });
  for (let i = 0; i < 3; i++) { await A.page.getByRole('button', { name: /Add a bot/ }).click(); await A.page.waitForTimeout(500); }
  if (timer) { await A.page.locator('.lobby label:has-text("Turn timer") select').first().selectOption({ label: timer }); await A.page.waitForTimeout(500); }
  await W.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  await W.page.getByLabel('Your name').fill('Watcher');
  await W.page.getByRole('button', { name: 'Join' }).click();
  await W.page.waitForSelector('.lobby', { timeout: 15000 });
  await A.page.locator('.lobby button.primary').last().click();
  for (const X of [A, W]) await X.page.waitForSelector('.game', { timeout: 20000 });
  say('room', code, 'started;', level, 'bots; timer', timer || 'off');
  let lastKey = '';
  let lastChange = Date.now();
  let lastPrompt = '';
  let reported = false;
  const gaps = [];
  let blanks = 0;
  let over = false;
  while (Date.now() - t0 < minutes * 60000 && !over) {
    // Host: reload when the screen has gone blank, otherwise click what is offered.
    if (!(await A.page.locator('.game').count())) {
      blanks++;
      await A.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await A.page.waitForSelector('.game', { timeout: 5000 }).catch(() => {});
    } else if ((await clickSomething(A.page).catch(() => null)) === 'over') over = true;
    const key = await W.page.evaluate(() => {
      const log = document.querySelector('.game-log');
      return `${document.querySelector('.game-head .prompt')?.innerText.replace(/⏱.*/, '').replace(/\s+/g, ' ').trim()}|${log ? log.querySelectorAll('li, p').length : 0}|${log ? (log.lastElementChild?.innerText || '').slice(-60) : ''}`;
    }).catch(() => lastKey);
    if (key !== lastKey) {
      const waited = Date.now() - lastChange;
      if (waited > 8000) { gaps.push(Math.round(waited / 1000)); say(`waited ${(waited / 1000).toFixed(0)} s on: "${lastPrompt}" | then: ${key.split('|')[2]}`); }
      lastKey = key;
      lastPrompt = key.split('|')[0];
      lastChange = Date.now();
      reported = false;
    } else if (!reported && Date.now() - lastChange > 45000) {
      reported = true;
      say(`STILL WAITING after 45 s on: "${lastPrompt}" | last log: ${key.split('|')[2]} | players: ${(await W.page.locator('.players').innerText({ timeout: 1000 }).catch(() => '')).replace(/\s+/g, ' ').slice(0, 220)}`);
      await W.page.screenshot({ path: `${__dirname}/shots/bot-stall-${code}.png` });
    }
    await W.page.waitForTimeout(200);
  }
  say(`done: ${over ? 'game over' : 'time up'}; waits over 8 s: ${JSON.stringify(gaps)}; host blank screens: ${blanks}; final: ${(await W.page.locator('.players').innerText({ timeout: 1000 }).catch(() => '')).replace(/\s+/g, ' ').slice(0, 260)}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
