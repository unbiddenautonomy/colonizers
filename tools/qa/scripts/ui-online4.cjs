/**
 * Online room, part 3 (after the game has ended): game-over screens for host, players and watchers,
 * history / replay / leaderboard for the two signed-in players, back to the lobby, removing a player,
 * crews (create, invite link, join), sign out.
 */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
const code = fs.readFileSync(__dirname + '/online-room.txt', 'utf8').trim();
fs.mkdirSync(__dirname + '/shots/after', { recursive: true });
const text = async (page, sel = 'body', n = 500) =>
  (await page.locator(sel).first().innerText().catch(() => '(none)')).replace(/\s+/g, ' ').slice(0, n);
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    say(`!! step "${name}" failed: ${String(e.message).split('\n')[0]}`);
  }
};

(async () => {
  const browser = await chromium.launch();
  const P = {};
  const vps = { A: 'desktop', B: 'phone', C: 'tablet', D: 'laptop', E: 'phone' };
  for (const k of Object.keys(vps)) {
    P[k] = await open(browser, vps[k], { context: { storageState: `state-online-${k}.json`, permissions: k === 'A' ? ['clipboard-read', 'clipboard-write'] : [] } });
    await P[k].page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle', timeout: 90000 });
  }
  const snap = (k, name, full = false) => P[k].page.screenshot({ path: `shots/after/${name}-${k}.png`, fullPage: full });

  await step('game over screens', async () => {
    for (const k of Object.keys(vps)) {
      await P[k].page.waitForSelector('.game, .lobby, .setup-page', { timeout: 60000 });
      await P[k].page.waitForTimeout(800);
      const dlg = P[k].page.locator('[role=dialog]');
      say(`${k} (${vps[k]}) game over dialog:`, await text(P[k].page, '[role=dialog]', 400), '| buttons:', JSON.stringify(await dlg.locator('button').allInnerTexts().catch(() => [])));
      await snap(k, 'gameover');
      const rep = fmtLayout(await layoutReport(P[k].page, { touch: !!VIEWPORTS[vps[k]].hasTouch }));
      if (rep) say(`${k} layout:\n${rep}`);
    }
    // Can the dialog be put aside to look at the final board?
    const dlg = P.B.page.locator('[role=dialog]');
    await P.B.page.keyboard.press('Escape');
    await P.B.page.waitForTimeout(300);
    say('B: dialog still there after Escape:', await dlg.count(), '| close button:', await dlg.getByRole('button', { name: 'Close' }).count());
  });

  await step('signed-in player B: home, history, replay', async () => {
    const pg = P.B.page;
    await pg.locator('[role=dialog]').getByRole('button', { name: 'Home' }).click();
    await pg.waitForTimeout(800);
    say('B after Home: url', pg.url().replace(BASE, ''), '| page:', await text(pg, 'body', 260));
    await snap('B', 'home-after-game', true);
    await pg.goto(BASE + '/me', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    say('B /me your games:', await text(pg, '.card:has(h2:text("Your games"))', 600));
    say('B /me leaderboard:', await text(pg, '.card:has(h2:text("Leaderboard"))', 600));
    await snap('B', 'me', true);
    const rep = fmtLayout(await layoutReport(pg, { touch: true }));
    if (rep) say('B /me layout:\n' + rep);
    const cards = await pg.locator('.setup-page .card h2').allInnerTexts();
    say('B /me cards:', JSON.stringify(cards));
    const watch = pg.getByRole('button', { name: /Watch replay/ }).first();
    say('B replay links:', await pg.getByRole('button', { name: /Watch replay/ }).count());
    if (await watch.count()) {
      await watch.click();
      await pg.waitForSelector('.game.replay', { timeout: 20000 });
      await pg.waitForTimeout(500);
      say('B replay url', pg.url().replace(BASE, ''), '| head:', await text(pg, '.game-head', 200));
      await snap('B', 'replay-start');
      const rep2 = fmtLayout(await layoutReport(pg, { touch: true }));
      if (rep2) say('B replay layout:\n' + rep2);
      const range = pg.getByLabel('Move');
      say('B replay moves: max', await range.getAttribute('max'), 'value', await range.inputValue());
      await pg.getByRole('button', { name: 'Next turn' }).click();
      await pg.getByRole('button', { name: 'Next move' }).click();
      say('  after next turn + next move: value', await range.inputValue(), '| prompt', await text(pg, '.game-head .prompt', 160));
      await pg.getByRole('button', { name: 'End' }).click();
      await pg.waitForTimeout(400);
      say('  at end: value', await range.inputValue(), '| prompt', await text(pg, '.game-head .prompt', 160), '| hands visible:', await text(pg, '.players', 300));
      await snap('B', 'replay-end');
      // Whose hands does a replay show? (hidden information after the game)
      say('  replay controls:', await text(pg, '.controls', 400));
    }
  });

  await step('stats page for the host', async () => {
    const pg = P.A.page;
    const ctx2 = await P.A.ctx.newPage();
    await ctx2.goto(BASE + '/me', { waitUntil: 'networkidle' });
    await ctx2.waitForTimeout(800);
    say('A /me (desktop):', await text(ctx2, '.setup-page', 1600));
    await ctx2.screenshot({ path: 'shots/after/me-A.png', fullPage: true });
    P.A.me = ctx2;
    void pg;
  });

  await step('host: back to the lobby', async () => {
    const pg = P.A.page;
    const btn = pg.locator('[role=dialog]').getByRole('button', { name: 'Back to the lobby' });
    say('A back-to-lobby button:', await btn.count());
    await btn.click();
    await pg.waitForSelector('.lobby', { timeout: 15000 });
    await pg.waitForTimeout(800);
    say('A lobby after game:', await text(pg, '.lobby', 900));
    await snap('A', 'lobby-again', true);
    for (const k of ['C', 'D', 'E']) say(`${k} now sees:`, (await P[k].page.locator('.lobby').count()) ? 'lobby: ' + (await text(P[k].page, '.lobby .card', 260)) : 'not lobby: ' + (await text(P[k].page, 'body', 200)));
    // B went Home earlier: is B still listed, and can B get back in?
    say('A members:', JSON.stringify(await pg.locator('.members li').allInnerTexts()));
    await P.B.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
    await P.B.page.waitForTimeout(800);
    say('B back in room:', (await P.B.page.locator('.lobby').count()) ? 'lobby' : await text(P.B.page, 'body', 200));
  });

  await step('host removes a player; the player comes back', async () => {
    const pg = P.A.page;
    const rows = pg.locator('.members li');
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const t = (await rows.nth(i).innerText()).replace(/\s+/g, ' ');
      if (/Casey/.test(t)) {
        await rows.nth(i).getByRole('button', { name: 'remove' }).click();
        break;
      }
    }
    await pg.waitForTimeout(800);
    say('A members after removing Casey:', JSON.stringify((await pg.locator('.members li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '))));
    say('C (removed) sees:', await text(P.C.page, 'body', 300));
    await snap('C', 'removed');
    await P.C.page.reload({ waitUntil: 'networkidle' });
    await P.C.page.waitForTimeout(600);
    say('C after reload:', await text(P.C.page, 'body', 300));
    const join = P.C.page.getByRole('button', { name: 'Join' });
    if (await join.count()) {
      await join.click();
      await P.C.page.waitForTimeout(800);
      say('C after joining again:', (await P.C.page.locator('.lobby').count()) ? 'lobby' : await text(P.C.page, 'body', 200));
      say('A members now:', JSON.stringify((await pg.locator('.members li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '))));
    }
    // A watcher takes a free seat?
    say('D lobby buttons:', JSON.stringify(await P.D.page.locator('.lobby button').allInnerTexts()));
  });

  await step('host leaves the lobby: who becomes host', async () => {
    const pg = P.A.page;
    const leave = pg.getByRole('button', { name: /Leave/ });
    say('A leave buttons:', await leave.count(), JSON.stringify(await leave.allInnerTexts()));
    if (await leave.count()) {
      pg.once('dialog', (d) => d.accept());
      await leave.first().click();
      await pg.waitForTimeout(1000);
      say('A after leaving: url', pg.url().replace(BASE, ''));
      for (const k of ['B', 'C', 'D']) say(`${k} lobby header:`, await text(P[k].page, '.lobby', 220), '| start buttons:', await P[k].page.locator('.lobby button.primary').allInnerTexts());
    }
  });

  await step('crews', async () => {
    const pg = P.A.me;
    await pg.goto(BASE + '/me', { waitUntil: 'networkidle' });
    const card = pg.locator('.card:has(h2:text("Crews"))');
    await card.getByLabel('New crew name').fill('QA Crew <i>x</i>');
    await card.locator('form').first().getByRole('button').click();
    await pg.waitForTimeout(1000);
    say('A crews card:', await text(pg, '.card:has(h2:text("Crews"))', 400), '| url', pg.url().replace(BASE, ''));
    const link = card.locator('.crew-list button.link').first();
    if (await link.count()) await link.click();
    await pg.waitForTimeout(1000);
    say('A crew page url', pg.url().replace(BASE, ''), '|', await text(pg, '.setup-page', 900));
    await pg.screenshot({ path: 'shots/after/crew-A.png', fullPage: true });
    const invite = await pg.getByLabel('Crew invite link').inputValue().catch(() => null);
    say('invite link:', invite && invite.replace(BASE, '').replace(/[A-Za-z0-9_-]{12,}/, '<token>'));
    if (invite) {
      // B (signed in) opens the invite.
      await P.B.page.goto(invite.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' });
      await P.B.page.waitForTimeout(1000);
      say('B on invite link:', await text(P.B.page, 'body', 400));
      await snap('B', 'crew-invite');
      const joinBtn = P.B.page.getByRole('button', { name: /Join/ });
      say('B join buttons:', JSON.stringify(await joinBtn.allInnerTexts()));
      if (await joinBtn.count()) {
        await joinBtn.first().click();
        await P.B.page.waitForTimeout(1200);
        say('B after joining crew: url', P.B.page.url().replace(BASE, ''), '|', await text(P.B.page, 'body', 500));
        await snap('B', 'crew-joined', true);
      }
      // A guest (not signed in) opens the invite.
      await P.D.page.goto(invite.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' });
      await P.D.page.waitForTimeout(1000);
      say('D (guest) on invite link:', await text(P.D.page, 'body', 400));
      await pg.reload({ waitUntil: 'networkidle' });
      await pg.waitForTimeout(800);
      say('A crew page after B joined:', await text(pg, '.setup-page', 900));
    }
  });

  await step('sign out', async () => {
    const pg = P.A.me;
    await pg.goto(BASE + '/me', { waitUntil: 'networkidle' });
    await pg.getByRole('button', { name: 'Sign out' }).click();
    await pg.waitForTimeout(1000);
    say('A after sign out: url', pg.url().replace(BASE, ''), '|', await text(pg, 'body', 200));
    await pg.goto(BASE + '/me', { waitUntil: 'networkidle' });
    say('A /me signed out:', await text(pg, 'body', 300));
  });

  for (const [k, X] of Object.entries(P)) {
    const l = [...new Set(X.logs)].filter((x) => !/closed before the connection/.test(x));
    if (l.length) say(`LOGS ${k}:\n   ` + l.join('\n   '));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
