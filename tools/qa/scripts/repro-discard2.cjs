/**
 * Blank-screen check with nothing but real clicks, so it runs against a production build too.
 * Usage: BASE=http://localhost:8788 node repro-discard2.cjs [tag] [timer]
 * Room: host A and guest B (people, real clicks only: place, roll, end turn, discard), a watcher W,
 * and two easy bots. People never build, so hands grow until a 7 makes somebody discard.
 */
const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const tag = process.argv[2] || 'x';
const timer = process.argv[3] || null;
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}]`, ...a);
fs.mkdirSync(__dirname + '/shots/crash', { recursive: true });

async function clickSomething(k, pg, seen) {
  const dlg = pg.locator('[role=dialog]');
  if (await dlg.count()) {
    const title = (await dlg.first().getAttribute('aria-label').catch(() => '')) || '';
    if (/discard/i.test(title)) {
      if (!seen[k + 'd']) { seen[k + 'd'] = 1; say(`${k} sees its discard dialog: "${title}"`); }
      for (let i = 0; i < 14; i++) {
        const done = dlg.getByRole('button', { name: /^Discard \d+\/\d+/ });
        if (await done.isEnabled().catch(() => false)) { await done.click().catch(() => {}); say(`${k} discarded`); return 'discard'; }
        const more = dlg.locator('button[aria-label^="More "]:not(:disabled)');
        if (!(await more.count())) break;
        await more.first().click().catch(() => {});
      }
      return 'discard?';
    }
    const btn = dlg.locator('button:not(:disabled)').first();
    if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); return 'dialog'; }
  }
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
  const B = await open(browser, process.env.B_VP || 'laptop');
  const W = await open(browser, 'laptop');
  const crashed = {};
  for (const [k, X] of Object.entries({ A, B, W })) {
    X.page.on('pageerror', (e) => {
      if (crashed[k]) return;
      crashed[k] = Date.now();
      say(`${k} PAGE ERROR:\n   ${String(e.stack || e.message).split('\n').slice(0, 8).join('\n   ').slice(0, 900)}`);
    });
  }
  await A.page.goto(BASE + '/', { waitUntil: 'networkidle' });
  say('testing', BASE, '| script', await A.page.evaluate(() => [...document.scripts].map((s) => s.src.replace(location.origin, '')).filter(Boolean).join(' ')));
  await A.page.getByLabel('Your name').first().fill('Host');
  await A.page.getByRole('button', { name: 'Create a room' }).click();
  await A.page.waitForSelector('.lobby', { timeout: 15000 });
  const code = A.page.url().split('/r/')[1];
  say('room', code);
  await B.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  await B.page.getByLabel('Your name').fill('Guest');
  await B.page.getByRole('button', { name: 'Join' }).click();
  await B.page.waitForSelector('.lobby', { timeout: 15000 });
  await A.page.getByLabel('Bot level').selectOption({ label: 'Easy' });
  for (let i = 0; i < 2; i++) { await A.page.getByRole('button', { name: /Add a bot/ }).click(); await A.page.waitForTimeout(500); }
  if (timer) {
    await A.page.locator('.lobby label:has-text("Turn timer") select').first().selectOption({ label: timer });
    await A.page.waitForTimeout(500);
  }
  await W.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  await W.page.getByLabel('Your name').fill('Watcher');
  await W.page.getByRole('button', { name: 'Join' }).click();
  await W.page.waitForSelector('.lobby', { timeout: 15000 });
  await A.page.locator('.lobby button.primary').last().click();
  for (const X of [A, B, W]) await X.page.waitForSelector('.game', { timeout: 20000 });
  say('game started');
  const seen = {};
  const counts = { A: {}, B: {} };
  let lastPrompt = '';
  let lastClick = Date.now();
  let lastStall = 0;
  while (Date.now() - t0 < 8 * 60 * 1000 && !Object.keys(crashed).length) {
    for (const [k, X] of Object.entries({ A, B })) {
      const r = await clickSomething(k, X.page, seen).catch(() => null);
      if (r) counts[k][r] = (counts[k][r] || 0) + 1;
      if (r) lastClick = Date.now();
      else if (Date.now() - lastClick > 15000 && Date.now() - lastStall > 15000) {
        lastStall = Date.now();
        for (const [kk, XX] of Object.entries({ A, B })) say(`no click for 15 s; ${kk} sees:`, JSON.stringify(await XX.page.evaluate(() => ({ prompt: document.querySelector('.game-head .prompt')?.innerText.replace(/\s+/g, ' '), targets: document.querySelectorAll('.target').length, dialog: document.querySelector('[role=dialog]')?.getAttribute('aria-label') || null, buttons: [...document.querySelectorAll('.controls button:not(:disabled)')].map((b) => b.innerText.trim().replace(/\s+/g, ' ')).slice(0, 8), offer: document.querySelector('.offer')?.innerText.replace(/\s+/g, ' ').slice(0, 120) || null })).catch((e) => e.message)));
      }
    }
    const prompt = (await W.page.locator('.game-head .prompt').innerText({ timeout: 1000 }).catch(() => '')).replace(/\s+/g, ' ').replace(/⏱.*/, '');
    if (/discard/i.test(prompt) && prompt !== lastPrompt) say('watcher prompt:', prompt, '| cards per player:', (await W.page.locator('.players').innerText({ timeout: 1000 }).catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
    lastPrompt = prompt;
    if ((await W.page.locator('[role=dialog]').count()) && /wins/i.test(await W.page.locator('[role=dialog]').first().innerText({ timeout: 1000 }).catch(() => ''))) { say('game ended without a crash'); break; }
    await A.page.waitForTimeout(200);
  }
  say('clicks made:', JSON.stringify(counts));
  if (Object.keys(crashed).length) {
    await A.page.waitForTimeout(1500);
    for (const [k, X] of Object.entries({ A, B, W })) {
      const t = await X.page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 110), game: !!document.querySelector('.game'), rootKids: document.getElementById('root')?.children.length })).catch((e) => ({ err: e.message }));
      say(`${k}: crashed=${!!crashed[k]} page now: ${JSON.stringify(t)}`);
      await X.page.screenshot({ path: `${__dirname}/shots/crash/${tag}-${k}.png` });
    }
    // Reload each crashed page a few times over the next while: does it come back?
    for (let round = 1; round <= 4; round++) {
      for (const [k, X] of Object.entries({ A, B })) {
        if (!crashed[k]) continue;
        const errs = [];
        const h = (e) => errs.push(e.message);
        X.page.on('pageerror', h);
        await X.page.reload({ waitUntil: 'networkidle' }).catch(() => {});
        await X.page.waitForTimeout(1500);
        const ok = await X.page.locator('.game').count();
        say(`${k} reload ${round} (${Math.round((Date.now() - crashed[k]) / 1000)} s after the crash): game on page ${ok}${errs.length ? ', error again: ' + errs[0] : ''} | text: ${(await X.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90)}`);
        X.page.off('pageerror', h);
        if (ok) {
          // Back: play on a little to see the game continues.
          for (let i = 0; i < 6; i++) await clickSomething(k, X.page, seen).catch(() => null);
        }
      }
      say('watcher sees:', (await W.page.locator('.game-head .prompt').innerText().catch(() => '')).replace(/\s+/g, ' '));
      await A.page.waitForTimeout(round === 1 ? 2000 : 20000);
    }
  }
  say('done; crashed pages:', JSON.stringify(Object.keys(crashed)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
