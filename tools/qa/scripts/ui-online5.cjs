/**
 * After the game, part 2: the replay screen for a signed-in player, and crews
 * (invite link, a second account joins, a guest opens the link, crew page after).
 */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
fs.mkdirSync(__dirname + '/shots/after', { recursive: true });
const text = async (page, sel = 'body', n = 500) => (await page.locator(sel).first().innerText().catch(() => '(none)')).replace(/\s+/g, ' ').slice(0, n);
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    say(`!! step "${name}" failed: ${String(e.message).split('\n')[0]}`);
  }
};
const signIn = async (page, who) => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const btn = page.getByRole('button', { name: 'Sign in' }).first();
  if (!(await btn.count())) return 'already signed in';
  await btn.click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('input[type=email]').fill(`qa-${who}@example.test`);
  await dlg.locator('input[type=password]').fill('correct horse battery');
  await dlg.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(1200);
  return (await page.getByRole('dialog').count()) ? 'dialog still open: ' + (await text(page, '[role=dialog]', 200)) : 'signed in';
};

(async () => {
  const browser = await chromium.launch();
  const B = await open(browser, 'phone', { context: { storageState: `state-online-B.json` } });
  const A = await open(browser, 'desktop', { context: { permissions: ['clipboard-read', 'clipboard-write'] } });
  const G = await open(browser, 'laptop');

  await step('replay', async () => {
    const pg = B.page;
    await pg.goto(BASE + '/me', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    if (!(await pg.getByRole('button', { name: /Watch replay/ }).count())) say('B sign-in state:', await signIn(pg, 'blair'), '| then /me');
    await pg.goto(BASE + '/me', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    await pg.getByRole('button', { name: /Watch replay/ }).first().click();
    await pg.waitForSelector('.game.replay', { timeout: 20000 });
    await pg.waitForTimeout(600);
    const range = pg.getByLabel('Move', { exact: true });
    const head = () => text(pg, '.game-head .prompt', 160);
    say('replay opens at:', await head(), '| slider max', await range.getAttribute('max'), 'value', await range.inputValue());
    say('controls:', JSON.stringify(await pg.locator('.replay-controls button, .replay-controls select').evaluateAll((els) => els.map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('aria-label') || e.innerText.trim()}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`))));
    await pg.screenshot({ path: 'shots/after/replay-open-B.png' });
    const rep = fmtLayout(await layoutReport(pg, { touch: true }));
    if (rep) say('replay layout (phone):\n' + rep);
    await pg.getByRole('button', { name: 'Start', exact: true }).click();
    await pg.waitForTimeout(300);
    say('after Start:', await head(), '| players:', await text(pg, '.players', 200));
    await pg.screenshot({ path: 'shots/after/replay-start-B.png' });
    await pg.getByRole('button', { name: 'Next move' }).click();
    await pg.getByRole('button', { name: 'Next move' }).click();
    say('after 2x Next move:', await head());
    await pg.getByRole('button', { name: 'Next turn' }).click();
    say('after Next turn:', await head());
    await pg.getByRole('button', { name: 'Previous move' }).click();
    say('after Previous move:', await head());
    await pg.getByRole('button', { name: 'Previous turn' }).click();
    say('after Previous turn:', await head());
    // Jump into the middle and look at what is shown.
    await range.fill('200');
    await pg.waitForTimeout(300);
    say('at move 200:', await head(), '| players:', await text(pg, '.players', 400));
    say('  controls text:', await text(pg, '.controls', 500));
    await pg.screenshot({ path: 'shots/after/replay-mid-B.png' });
    // Play.
    const play = pg.locator('.replay-controls button').filter({ hasText: /▶|⏸|Play/ }).first();
    say('play button:', await play.count(), await play.getAttribute('aria-label').catch(() => null));
    if (await play.count()) {
      const before = await range.inputValue();
      await play.click();
      await pg.waitForTimeout(2500);
      say(`  playing: move ${before} -> ${await range.inputValue()} in 2.5 s`);
      const speed = pg.locator('.replay-controls select').first();
      if (await speed.count()) {
        const opts = await speed.locator('option').allInnerTexts();
        say('  speeds:', JSON.stringify(opts));
        await speed.selectOption({ index: opts.length - 1 });
        const b2 = await range.inputValue();
        await pg.waitForTimeout(2500);
        say(`  fastest: move ${b2} -> ${await range.inputValue()} in 2.5 s`);
      }
      await play.click().catch(() => {});
    }
    await pg.getByRole('button', { name: 'End', exact: true }).click();
    await pg.waitForTimeout(300);
    say('at End:', await head(), '| log/controls:', await text(pg, '.controls', 300));
    // Keyboard on the slider.
    await range.focus();
    await pg.keyboard.press('ArrowLeft');
    say('ArrowLeft on the slider:', await head());
    // A board skin picker in the replay?
    say('head actions:', await text(pg, '.game-head .head-actions', 200));
    await pg.getByRole('button', { name: 'Back', exact: true }).click();
    await pg.waitForTimeout(500);
    say('Back goes to:', pg.url().replace(BASE, ''));
    // Someone not signed in opens the replay link directly.
    await G.page.goto(BASE + '/replay/xfvbes-84a3aceb', { waitUntil: 'networkidle' });
    await G.page.waitForTimeout(800);
    say('guest on the replay link:', await text(G.page, 'body', 200));
  });

  await step('crews', async () => {
    say('A sign in:', await signIn(A.page, 'alex'));
    const pg = A.page;
    await pg.goto(BASE + '/me', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    say('A crews card:', await text(pg, '.card:has(h2:text("Crews"))', 400));
    await pg.screenshot({ path: 'shots/after/me-crews-A.png', fullPage: true });
    await pg.goto(BASE + '/crew/bb13ae33', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    say('A crew page:', await text(pg, '.setup-page', 600));
    const invite = await pg.getByLabel('Crew invite link').inputValue().catch(() => null);
    say('invite link shape:', invite && invite.replace(/^https?:\/\/[^/]+/, '').replace(/[A-Za-z0-9_-]{12,}/, '<token>'));
    if (!invite) return;
    const link = invite.replace(/^https?:\/\/[^/]+/, BASE);
    // Blair (signed in) opens it.
    await B.page.goto(link, { waitUntil: 'networkidle' });
    await B.page.waitForTimeout(1000);
    const joinCrew = B.page.getByRole('button', { name: 'Join crew' });
    say('B sees a Join crew button:', await joinCrew.count(), '| around it:', await text(B.page, '.card:has(button:text("Join crew")), [role=dialog]', 300));
    await B.page.screenshot({ path: 'shots/after/crew-invite-B.png' });
    if (await joinCrew.count()) {
      await joinCrew.first().click();
      await B.page.waitForTimeout(1500);
      say('B after Join crew: url', B.page.url().replace(BASE, ''), '|', await text(B.page, '.setup-page, body', 500));
      await B.page.screenshot({ path: 'shots/after/crew-joined-B.png', fullPage: true });
      const rep = fmtLayout(await layoutReport(B.page, { touch: true }));
      if (rep) say('B crew page layout (phone):\n' + rep);
    }
    // Opening the same link again once a member.
    await B.page.goto(link, { waitUntil: 'networkidle' });
    await B.page.waitForTimeout(1000);
    say('B opens the invite again: url', B.page.url().replace(BASE, '').replace(/[A-Za-z0-9_-]{12,}/, '<token>'), '| join buttons', await B.page.getByRole('button', { name: 'Join crew' }).count(), '|', await text(B.page, 'body', 160));
    // A guest (not signed in) opens the invite.
    await G.page.goto(link, { waitUntil: 'networkidle' });
    await G.page.waitForTimeout(1000);
    say('guest on the invite link:', await text(G.page, 'body', 260), '| dialogs:', await text(G.page, '[role=dialog]', 300));
    await G.page.screenshot({ path: 'shots/after/crew-invite-guest.png' });
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    say('A crew page after B joined:', await text(pg, '.setup-page', 900));
    await pg.screenshot({ path: 'shots/after/crew-A-2.png', fullPage: true });
    // New link: does the old one stop working?
    const newBtn = pg.getByRole('button', { name: 'New link' });
    if (await newBtn.count()) {
      await newBtn.click();
      await pg.waitForTimeout(800);
      const invite2 = await pg.getByLabel('Crew invite link').inputValue().catch(() => null);
      say('new link differs:', invite2 !== invite);
      await G.page.goto(link, { waitUntil: 'networkidle' });
      await G.page.waitForTimeout(800);
      say('guest on the OLD link after a new one was made:', await text(G.page, 'body', 200));
    }
    // Leave crew (B).
    await B.page.goto(BASE + '/crew/bb13ae33', { waitUntil: 'networkidle' });
    await B.page.waitForTimeout(800);
    say('B crew page buttons:', JSON.stringify(await B.page.locator('.setup-page button').allInnerTexts()));
  });

  for (const [k, X] of Object.entries({ A, B, G })) {
    const l = [...new Set(X.logs)].filter((x) => !/closed before the connection/.test(x));
    if (l.length) say(`LOGS ${k}:\n   ` + l.map((x) => x.slice(0, 300)).join('\n   '));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
