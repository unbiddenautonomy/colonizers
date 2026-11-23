/** Joins the running room as one more watcher and prints where the game stands. */
const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const code = fs.readFileSync(__dirname + '/online-room.txt', 'utf8').trim();
(async () => {
  const browser = await chromium.launch();
  const X = await open(browser, 'laptop', fs.existsSync('state-probe.json') ? { context: { storageState: 'state-probe.json' } } : {});
  await X.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle', timeout: 60000 });
  const name = X.page.getByLabel('Your name');
  if (await name.count()) {
    await name.fill('Probe');
    await X.page.getByRole('button', { name: 'Join' }).click();
  }
  await X.page.waitForSelector('.game, .lobby', { timeout: 30000 });
  await X.page.waitForTimeout(1500);
  console.log('players:', (await X.page.locator('.players').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
  console.log('prompt:', (await X.page.locator('.game-head .prompt').innerText().catch(() => '')).replace(/\s+/g, ' '));
  console.log('log tail:', (await X.page.locator('.game-log').innerText().catch(() => '')).split('\n').slice(-8).join(' | '));
  await X.page.screenshot({ path: 'shots/probe.png' });
  await X.ctx.storageState({ path: 'state-probe.json' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
