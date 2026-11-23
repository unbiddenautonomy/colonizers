const { chromium, BASE, open } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, 'desktop');
  await A.page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await A.page.getByLabel('Your name').first().fill('Host');
  await A.page.getByRole('button', { name: 'Create a room' }).click();
  await A.page.waitForSelector('.lobby', { timeout: 15000 });
  await A.page.getByLabel('Bot level').selectOption({ label: 'Easy' });
  for (let i = 0; i < 3; i++) { await A.page.getByRole('button', { name: /Add a bot/ }).click(); await A.page.waitForTimeout(500); }
  await A.page.locator('.lobby button.primary').last().click();
  await A.page.waitForSelector('.game', { timeout: 20000 });
  for (let i = 0; i < 24; i++) {
    await A.page.waitForTimeout(2500);
    const s = await A.page.evaluate(() => ({ prompt: document.querySelector('.game-head .prompt')?.innerText.replace(/\s+/g, ' '), targets: document.querySelectorAll('.target').length, buttons: [...document.querySelectorAll('.controls button:not(:disabled)')].map((b) => b.innerText.trim()).slice(0, 8), dialog: document.querySelector('[role=dialog]')?.getAttribute('aria-label') || null, log: [...document.querySelectorAll('.game-log li, .game-log p')].slice(-2).map((x) => x.innerText).join(' / ') }));
    console.log(i, JSON.stringify(s));
    if (s.targets) await A.page.locator('.target').first().click({ timeout: 2000, force: true }).catch((e) => console.log('  click err', e.message.split('\n')[0]));
    else {
      const roll = A.page.getByRole('button', { name: /Roll$/ });
      const end = A.page.getByRole('button', { name: 'End turn' });
      if ((await roll.count()) && (await roll.first().isEnabled())) await roll.first().click();
      else if ((await end.count()) && (await end.first().isEnabled())) await end.first().click();
    }
  }
  console.log([...new Set(A.logs)].slice(0, 5));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
