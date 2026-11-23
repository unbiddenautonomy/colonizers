// Local flows: save and resume, starting over an unfinished game, hot-seat privacy, what is remembered.
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, 'desktop');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  // 1. Change set-up, reload: is it remembered?
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.locator('.setup-page input[type=text], .setup-page input:not([type])').nth(1).fill('Zed');
  const before = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).filter(Boolean).slice(0, 6));
  await page.reload({ waitUntil: 'networkidle' });
  const after = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).filter(Boolean).slice(0, 6));
  say('set-up before reload:', JSON.stringify(before), '| after reload:', JSON.stringify(after));
  say('localStorage keys:', await page.evaluate(() => Object.keys(localStorage)));
  // 2. Hot-seat game with 3 people, private hands.
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  say('hot-seat: private hands checked by default:', await page.getByLabel('Private hands').isChecked().catch(() => 'n/a'));
  // First player places a settlement and a road by clicking glowing spots.
  const place = async () => {
    const c = page.locator('.target-corner');
    if (await c.count()) { await c.nth(Math.floor((await c.count()) / 2)).click(); return 'corner'; }
    const e = page.locator('.target-edge');
    if (await e.count()) {
      const pt = await e.first().evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await page.mouse.click(pt.x, pt.y);
      return 'edge';
    }
    return null;
  };
  for (let i = 0; i < 12; i++) { await place(); await page.waitForTimeout(120); }
  say('prompt after set-up:', await page.locator('.prompt').innerText());
  await page.screenshot({ path: 'shots/local-hotseat-roll.png' });
  say('hand area text:', (await page.locator('.hand').innerText().catch(() => '(no hand)')).replace(/\s+/g, ' ').slice(0, 200));
  await page.getByLabel('Private hands').check().catch(() => {});
  await page.waitForTimeout(200);
  say('with private hands on, hand area:', (await page.locator('.hand').innerText().catch(() => '(no hand)')).replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: 'shots/local-hotseat-private.png' });
  say('cover text:', (await page.locator('.pass-cover').innerText().catch(() => '(none)')).replace(/\s+/g, ' '));
  const im = page.locator('.pass-cover button');
  if (await im.count()) { await im.click(); await page.waitForTimeout(150); say('after "I\'m ...":', (await page.locator('.hand').innerText()).replace(/\s+/g, ' ').slice(0, 120)); }
  // Roll and end turn: does the next player's hand show at once?
  await page.locator('[data-shortcut="r"]').click();
  await page.waitForTimeout(400);
  // (a 7 may need handling; just try to end the turn)
  const end = page.locator('[data-shortcut="e"]');
  if (await end.isEnabled().catch(() => false)) {
    await end.click();
    await page.waitForTimeout(300);
    say('after end turn, prompt:', await page.locator('.prompt').innerText(), '| hand area:', (await page.locator('.hand').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120), '| cover:', (await page.locator('.pass-cover').innerText().catch(() => '(none)')).replace(/\s+/g, ' '));
    const im2 = page.locator('.pass-cover button');
    if (await im2.count()) await im2.click();
    await page.screenshot({ path: 'shots/local-hotseat-next.png' });
  } else say('could not end turn right away (a 7?), prompt:', await page.locator('.prompt').innerText());
  // 3. Leave to the menu, then start another game: any warning about the unfinished one?
  page.removeAllListeners('dialog');
  const seenDialogs = [];
  page.on('dialog', (d) => { seenDialogs.push(`${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(300);
  say('leaving asks:', JSON.stringify(seenDialogs));
  say('home offers resume:', await page.getByRole('button', { name: 'Resume saved game' }).count());
  await page.screenshot({ path: 'shots/local-home-with-save.png' });
  const savedN = await page.evaluate(() => JSON.parse(localStorage.getItem('colonizers.localGame')).actions.length);
  seenDialogs.length = 0;
  await page.getByRole('button', { name: /Play against bots/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  await page.waitForTimeout(1500);
  const nowSaved = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('colonizers.localGame') || 'null'); return s ? s.actions.length : null; });
  say(`starting a new game over a saved one with ${savedN} moves: confirm dialogs ${JSON.stringify(seenDialogs)}; save now holds ${nowSaved} moves (the old game is gone)`);
  // 4. Keyboard: Tab reaches the board spots?
  const focusables = await page.evaluate(() => [...document.querySelectorAll('.game .target')].filter((t) => t.tabIndex >= 0).length);
  say('board spots reachable by keyboard:', focusables, 'of', await page.locator('.game .target').count());
  if (logs.length) say('LOGS', [...new Set(logs)].join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
