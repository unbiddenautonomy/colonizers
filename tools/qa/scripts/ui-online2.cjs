/**
 * Online room, part 1: host creates a room, three more people join (one becomes a watcher),
 * lobby settings, bot, chat, then the game starts. Saves each browser's storage so later
 * scripts can come back as the same people.
 */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, 'desktop', { context: { storageState: 'state-alex.json', permissions: ['clipboard-read', 'clipboard-write'] } });
  const B = await open(browser, 'phone', { context: { storageState: 'state-blair.json' } });
  const C = await open(browser, 'tablet');
  const D = await open(browser, 'laptop');
  const E = await open(browser, 'phone');
  const snap = async (who, name, full = false) => {
    const P = { A, B, C, D, E }[who];
    await P.page.screenshot({ path: `shots/online-${name}-${who}.png`, fullPage: full });
  };
  // Host creates the room.
  await A.page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await A.page.getByRole('button', { name: 'Create a room' }).click();
  await A.page.waitForSelector('.lobby', { timeout: 10000 });
  const code = A.page.url().split('/r/')[1];
  say('room', code);
  // Invite link button.
  await A.page.getByRole('button', { name: /Invite friends/ }).click();
  await A.page.waitForTimeout(300);
  say('invite status:', await A.page.locator('.lobby header [role=status]').allInnerTexts());
  say('clipboard:', await A.page.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message));

  // B (signed in, phone) joins by link.
  await B.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  await B.page.waitForTimeout(500);
  say('B sees:', (await B.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200))));
  await snap('B', 'join');
  const joinB = B.page.getByRole('button', { name: 'Join' });
  if (await joinB.count()) await joinB.click();
  await B.page.waitForSelector('.lobby', { timeout: 10000 });
  await snap('B', 'lobby-guest', true);
  say('B lobby layout:\n' + fmtLayout(await layoutReport(B.page, { touch: true })));

  // C (guest, tablet): empty name first.
  await C.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  const nameC = C.page.getByLabel('Your name');
  say('C join button enabled with empty name:', await C.page.getByRole('button', { name: 'Join' }).isEnabled());
  await nameC.fill('Alex QA'); // same name as the host
  await C.page.getByRole('button', { name: 'Join' }).click();
  await C.page.waitForSelector('.lobby', { timeout: 10000 });
  say('members after duplicate name join:', await A.page.locator('.members li').allInnerTexts());
  // Rename.
  await C.page.getByRole('button', { name: 'rename' }).click();
  await C.page.getByLabel('Your name').fill('Casey <b>x</b>');
  await C.page.getByRole('button', { name: 'Save' }).click();
  await C.page.waitForTimeout(400);
  say('members after rename:', await A.page.locator('.members li').allInnerTexts());

  // Host adds a hard bot and a medium bot -> table of 4 is full after the first bot... add one.
  await A.page.getByLabel('Bot level').selectOption({ label: 'Hard' });
  await A.page.getByLabel('Bot style').selectOption({ label: 'Trader' });
  await A.page.getByRole('button', { name: /Add a bot/ }).click();
  await A.page.waitForTimeout(400);
  say('members with bot:', await A.page.locator('.members li').allInnerTexts());
  say('add-bot still shown when full:', await A.page.getByRole('button', { name: /Add a bot/ }).count());

  // D joins a full table -> watcher.
  await D.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  await D.page.getByLabel('Your name').fill('Dana');
  await D.page.getByRole('button', { name: 'Join' }).click();
  await D.page.waitForSelector('.lobby', { timeout: 10000 });
  await D.page.waitForTimeout(400);
  say('D lobby text:', (await D.page.evaluate(() => document.querySelector('.lobby').innerText.replace(/\s+/g, ' ').slice(0, 500))));
  say('A players card:', (await A.page.locator('.lobby .card').first().innerText()).replace(/\s+/g, ' '));
  await snap('D', 'lobby-watcher', true);

  // Chat, with markup that must stay text.
  await B.page.getByPlaceholder('Message the table').fill('hi <img src=x onerror="window.__xss=1"> <b>bold</b> 👋');
  await B.page.getByRole('button', { name: 'Send' }).click();
  await A.page.waitForTimeout(500);
  say('A chat:', await A.page.locator('.chat, .card:has(h2:text("Chat"))').first().innerText());
  say('xss flag on A:', await A.page.evaluate(() => window.__xss ?? null), 'img tags in chat:', await A.page.locator('.chat img, .card:has(h2:text("Chat")) img').count());
  // Fast double send (rate limit).
  for (const t of ['one', 'two', 'three']) {
    await B.page.getByPlaceholder('Message the table').fill(t);
    await B.page.getByRole('button', { name: 'Send' }).click();
  }
  await A.page.waitForTimeout(800);
  say('A chat after burst:', (await A.page.locator('.card:has(h2:text("Chat"))').first().innerText()).replace(/\n/g, ' | '));
  // Long message.
  await B.page.getByPlaceholder('Message the table').fill('x'.repeat(400));
  say('chat input maxlength:', await B.page.getByPlaceholder('Message the table').getAttribute('maxlength'), 'value length', (await B.page.getByPlaceholder('Message the table').inputValue()).length);
  await B.page.getByPlaceholder('Message the table').fill('');

  // A non-host tries to see settings.
  say('B can change settings?', await B.page.locator('.lobby select').count(), 'selects;', await B.page.locator('.lobby input[type=checkbox]').count(), 'checkboxes');
  say('B settings card:', (await B.page.locator('.lobby .card').nth(1).innerText()).replace(/\s+/g, ' ').slice(0, 500));

  // Host: settings. Points to win 5, timer 1 min.
  const fieldSelect = (label) => A.page.locator(`.lobby label:has-text("${label}") select, .lobby .field:has-text("${label}") select`).first();
  await fieldSelect('Points to win').selectOption({ label: '5' });
  await fieldSelect('Turn timer').selectOption({ label: '1 min' });
  await A.page.waitForTimeout(500);
  await snap('A', 'lobby-full', true);
  say('A settings after timer:', (await A.page.locator('.lobby .card').nth(1).innerText()).replace(/\s+/g, ' ').slice(900, 1500));
  say('B sees settings:', (await B.page.locator('.lobby .card').nth(1).innerText()).replace(/\s+/g, ' ').slice(0, 500));
  // Host removes the watcher? (only players have "remove")
  say('remove links on A:', await A.page.getByRole('button', { name: 'remove' }).count());

  // E opens the link but never joins (just looking at the join page).
  await E.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
  say('E join page:', (await E.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))));
  await snap('E', 'join-page');

  // Start.
  const start = A.page.locator('.lobby button.primary').last();
  say('start button:', await start.innerText(), 'enabled', await start.isEnabled());
  await start.click();
  await A.page.waitForSelector('.game', { timeout: 15000 });
  await B.page.waitForSelector('.game', { timeout: 15000 });
  await C.page.waitForSelector('.game', { timeout: 15000 });
  await D.page.waitForSelector('.game', { timeout: 15000 });
  await A.page.waitForTimeout(500);
  for (const w of ['A', 'B', 'C', 'D']) await snap(w, 'game-start');
  // E joins after the start.
  await E.page.getByLabel('Your name').fill('Eli');
  await E.page.getByRole('button', { name: 'Join' }).click();
  await E.page.waitForTimeout(1500);
  say('E after joining a started game:', (await E.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200))));
  await snap('E', 'late-join');

  for (const [k, P] of Object.entries({ A, B, C, D, E })) {
    await P.ctx.storageState({ path: `state-online-${k}.json` });
    if (P.logs.length) say(`LOGS ${k}:\n   ` + [...new Set(P.logs)].join('\n   '));
  }
  fs.writeFileSync('online-room.txt', code);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
