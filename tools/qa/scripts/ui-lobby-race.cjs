/** Lobby: are two quick setting changes both kept? Plus a few lobby controls not covered before. */
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, 'desktop', { context: { permissions: ['clipboard-read', 'clipboard-write'] } });
  const pg = A.page;
  await pg.goto(BASE + '/', { waitUntil: 'networkidle' });
  await pg.getByLabel('Your name').first().fill('Race Host');
  await pg.getByRole('button', { name: 'Create a room' }).click();
  await pg.waitForSelector('.lobby', { timeout: 15000 });
  const code = pg.url().split('/r/')[1];
  say('room', code);
  const field = (label) => pg.locator(`.lobby label:has-text("${label}") select`).first();
  const read = async () => ({
    points: await field('Points to win').locator('option:checked').innerText(),
    timer: await field('Turn timer').locator('option:checked').innerText(),
    friendly: await pg.getByLabel(/Friendly robber/).isChecked(),
    balanced: await pg.getByLabel(/Balanced dice/).isChecked(),
    gifts: await pg.getByLabel(/Gifts:/).isChecked(),
    harbormaster: await pg.getByLabel(/Harbormaster/).isChecked(),
  });
  say('start:', JSON.stringify(await read()));
  say('points options:', (await field('Points to win').locator('option').allInnerTexts()).join(' | '));
  // (a) two selects back to back
  await field('Points to win').selectOption({ index: 0 });
  await field('Turn timer').selectOption({ label: '1 min' });
  await pg.waitForTimeout(1200);
  say('(a) points then timer, no pause:', JSON.stringify(await read()));
  // (b) two ticks back to back with real clicks
  await pg.getByLabel(/Friendly robber/).click();
  await pg.getByLabel(/Balanced dice/).click();
  await pg.waitForTimeout(1200);
  say('(b) two ticks, no pause:', JSON.stringify(await read()));
  // (c) the same with a pause in between
  await pg.getByLabel(/Gifts:/).click();
  await pg.waitForTimeout(400);
  await pg.getByLabel(/Harbormaster/).click();
  await pg.waitForTimeout(1200);
  say('(c) two ticks, 0.4 s apart:', JSON.stringify(await read()));
  // How long does one change take to come back from the server here?
  const t0 = Date.now();
  await field('Points to win').selectOption({ index: 2 });
  await pg.waitForFunction(() => true);
  let ms = null;
  for (let i = 0; i < 200; i++) {
    const v = await field('Points to win').evaluate((el) => el.selectedIndex);
    if (v === 2) { ms = Date.now() - t0; break; }
    await pg.waitForTimeout(5);
  }
  say('one change shows after about', ms, 'ms on this machine');
  // (d) three ticks in a row, as a host setting up quickly would do
  for (const re of [/Open trading/, /Both starting settlements/, /Robber goes home/]) await pg.getByLabel(re).click();
  await pg.waitForTimeout(1200);
  say('(d) three ticks in a row:', JSON.stringify({ open: await pg.getByLabel(/Open trading/).isChecked(), both: await pg.getByLabel(/Both starting settlements/).isChecked(), home: await pg.getByLabel(/Robber goes home/).isChecked() }));

  // Other lobby controls.
  await pg.locator('summary:has-text("Play this seat on another device too")').click();
  await pg.waitForTimeout(300);
  say('second device panel:', (await pg.locator('details:has(summary:has-text("Play this seat"))').innerText()).replace(/\s+/g, ' ').slice(0, 400));
  const notify = pg.getByRole('button', { name: /Notify me/ });
  say('notify button:', await notify.count(), (await notify.innerText().catch(() => '')).trim());
  await notify.click().catch(() => {});
  await pg.waitForTimeout(500);
  say('after notify click:', (await pg.locator('.lobby header, .lobby').first().innerText()).replace(/\s+/g, ' ').slice(0, 260));
  // Start with one player?
  const start = pg.locator('.lobby button.primary').last();
  say('start button alone:', (await start.innerText()).trim(), '| enabled:', await start.isEnabled());
  // Seats select and special maps shown for 1 player in the lobby.
  say('seats options:', (await field('Seats').locator('option').allInnerTexts()).join(','));
  say('map buttons shown:', await pg.locator('.lobby .card').nth(1).locator('button').count());
  await field('Seats').selectOption({ label: '8' }).catch((e) => say('seats 8:', String(e.message).split('\n')[0]));
  await pg.waitForTimeout(700);
  say('map buttons with 8 seats:', await pg.locator('.lobby .card').nth(1).locator('button').count(), '| disabled:', await pg.locator('.lobby .card').nth(1).locator('button:disabled').count());
  // Host leaves alone: what happens to the room?
  pg.once('dialog', (d) => { say('leave dialog:', d.message()); d.accept(); });
  await pg.getByRole('button', { name: 'Leave room' }).click();
  await pg.waitForTimeout(1000);
  say('after leaving: url', pg.url().replace(BASE, ''));
  const res = await pg.evaluate(async (c) => (await fetch('/api/rooms/' + c)).text(), code);
  say('room after host left:', res);
  await pg.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(600);
  say('opening the link again:', (await pg.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 220));
  if (A.logs.length) say('LOGS:\n   ' + [...new Set(A.logs)].join('\n   '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
