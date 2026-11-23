/**
 * Does an online client's page go blank when a 7 makes somebody discard?
 * Room: host A (driven through the test helper, only rolls and ends turns so hands grow),
 * guest B (helper only during setup, then a reload and real button clicks only),
 * watcher W (never touched), and two easy bots.
 */
const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const src = fs.readFileSync(__dirname + '/ui-online3.cjs', 'utf8');
const injectSrc = src.slice(src.indexOf('async function inject(page)'), src.indexOf('const within'));
const REPO = require('path').resolve(__dirname, '../../..');
const inject = eval(`(${injectSrc.replace('async function inject(page)', 'async function (page)')})`);
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}]`, ...a);
fs.mkdirSync(__dirname + '/shots/crash', { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, 'desktop');
  const B = await open(browser, 'phone');
  const W = await open(browser, 'laptop');
  const crashed = {};
  for (const [k, X] of Object.entries({ A, B, W })) {
    X.page.on('pageerror', async (e) => {
      if (crashed[k]) return;
      crashed[k] = Date.now();
      say(`${k} PAGE ERROR:\n   ${String(e.stack || e.message).split('\n').slice(0, 14).join('\n   ')}`);
    });
  }
  await A.page.goto(BASE + '/', { waitUntil: 'networkidle' });
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
  await A.page.getByRole('button', { name: /Add a bot/ }).click();
  await A.page.waitForTimeout(500);
  await A.page.getByRole('button', { name: /Add a bot/ }).click();
  await A.page.waitForTimeout(500);
  await W.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  await W.page.getByLabel('Your name').fill('Watcher');
  await W.page.getByRole('button', { name: 'Join' }).click();
  await W.page.waitForSelector('.lobby', { timeout: 15000 });
  say('members:', JSON.stringify((await A.page.locator('.members li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '))), '| watching:', (await A.page.locator('.lobby .card').first().innerText()).match(/Watching:[^\n]*/)?.[0]);
  await A.page.locator('.lobby button.primary').last().click();
  for (const X of [A, B, W]) await X.page.waitForSelector('.game', { timeout: 20000 });
  await inject(A.page);
  await inject(B.page);
  const info = (X) => X.page.evaluate(() => (window.__on ? window.__on.info() : null)).catch(() => null);
  let bClean = false; // B's helper removed
  const SIMPLE = new Set(['placeSetupSettlement', 'placeSetupRoad', 'roll', 'endTurn', 'discard', 'moveRobber', 'steal', 'respondTrade']);
  let lastPhase = '';
  const seen = { discardBy: {} };
  while (Date.now() - t0 < 9 * 60 * 1000) {
    const st = await info(A);
    if (Object.keys(crashed).length) {
      await A.page.waitForTimeout(1200);
      for (const [k, X] of Object.entries({ A, B, W })) {
        const t = await X.page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 140), game: !!document.querySelector('.game'), rootKids: document.getElementById('root')?.children.length, bg: getComputedStyle(document.body).backgroundColor })).catch((e) => ({ err: e.message }));
        say(`${k}: crashed=${!!crashed[k]} page now: ${JSON.stringify(t)}`);
        await X.page.screenshot({ path: `${__dirname}/shots/crash/${k}.png` });
      }
      // Does a reload bring the crashed page back?
      for (const [k, X] of Object.entries({ A, B, W })) {
        if (!crashed[k]) continue;
        await X.page.reload({ waitUntil: 'networkidle' });
        await X.page.waitForTimeout(1500);
        say(`${k} after reload: game on page ${await X.page.locator('.game').count()}, text: ${(await X.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 100)}`);
        await X.page.screenshot({ path: `${__dirname}/shots/crash/${k}-reloaded.png` });
      }
      break;
    }
    if (!st) { await A.page.waitForTimeout(300); continue; }
    if (st.winner !== null) { say('game ended without a crash, winner', st.winner); break; }
    const ph = `${st.phase.id}:${JSON.stringify(st.phase.owed || '')}`;
    if (ph !== lastPhase) {
      lastPhase = ph;
      if (st.phase.id === 'discard') say(`discard phase at seq ${st.n}: owed ${JSON.stringify(st.phase.owed)} | A is seat ${st.seat} | hands as A sees them ${JSON.stringify(st.hands)}`);
    }
    // After setup, take B's helper away for good.
    if (!bClean && st.phase.id !== 'setup') {
      await B.page.reload({ waitUntil: 'networkidle' });
      await B.page.waitForSelector('.game', { timeout: 20000 });
      bClean = true;
      say('B reloaded: no test helper on its page from here on (helper present:', await B.page.evaluate(() => !!window.__on), ')');
    }
    // A: simple moves through the helper.
    if (st.waiting.includes(st.seat)) {
      const a = await A.page.evaluate(() => window.__on.suggest()).catch(() => null);
      let pick = a;
      if (a && !SIMPLE.has(a.type)) pick = await A.page.evaluate(() => window.__on.legal().find((x) => x.type === 'endTurn') || null);
      if (pick) await A.page.evaluate((x) => window.__on.act(x), pick).catch(() => {});
    }
    // B: helper during setup; real buttons afterwards.
    if (!bClean) {
      const b = await info(B);
      if (b && b.waiting.includes(b.seat)) {
        const a = await B.page.evaluate(() => window.__on.suggest()).catch(() => null);
        if (a) await B.page.evaluate((x) => window.__on.act(x), a).catch(() => {});
      }
    } else if (!crashed.B) {
      const roll = B.page.getByRole('button', { name: /Roll$/ });
      const end = B.page.getByRole('button', { name: 'End turn' });
      if ((await roll.count()) && (await roll.first().isEnabled().catch(() => false))) await roll.first().click({ timeout: 2000 }).catch(() => {});
      else if ((await end.count()) && (await end.first().isEnabled().catch(() => false))) await end.first().click({ timeout: 2000 }).catch(() => {});
      else {
        // Discard dialog, robber, steal: whatever the screen offers.
        const dlg = B.page.locator('[role=dialog]');
        if (await dlg.count()) {
          const title = await dlg.getAttribute('aria-label').catch(() => '');
          if (/discard/i.test(title || '')) {
            if (!seen.bDiscard) { seen.bDiscard = true; say('B has a discard dialog:', title); }
            const more = dlg.getByRole('button', { name: /^More / });
            for (let i = 0; i < 12; i++) {
              const done = dlg.getByRole('button', { name: /^Discard \d+\/\d+/ });
              if (await done.isEnabled().catch(() => false)) { await done.click().catch(() => {}); break; }
              const n = await more.count();
              let clicked = false;
              for (let j = 0; j < n && !clicked; j++) if (await more.nth(j).isEnabled().catch(() => false)) { await more.nth(j).click().catch(() => {}); clicked = true; }
              if (!clicked) break;
            }
          } else {
            const btn = dlg.locator('button:not(:disabled)').first();
            if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => {});
          }
        } else if (await B.page.locator('.target').count()) {
          await B.page.locator('.target').first().click({ timeout: 2000, force: true }).catch(() => {});
        }
      }
    }
    await A.page.waitForTimeout(250);
  }
  say('done; crashed pages:', JSON.stringify(Object.keys(crashed)));
  for (const [k, X] of Object.entries({ A, B, W })) {
    const l = [...new Set(X.logs)].filter((x) => !/closed before the connection/.test(x)).slice(0, 6);
    if (l.length) say(`LOGS ${k}:\n   ` + l.map((x) => x.slice(0, 600)).join('\n   '));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
