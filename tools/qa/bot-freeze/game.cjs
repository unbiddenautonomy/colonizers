const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); page.on('console', m => console.log('C', m.type(), m.text().slice(0,200))); page.on('pageerror', e => console.log('E', e.message));
  await page.goto('http://localhost:5198/', { waitUntil: 'networkidle' });
  await page.getByLabel('Look', { exact: true }).selectOption('strawhat-sunny');
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.argv[2] + '/1-home.png' });
  await page.locator('select').filter({ hasText: 'Hard bot' }).first().selectOption({ label: 'Medium bot' });
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.game');
  await page.waitForTimeout(+process.argv[3] || 15000);
  await page.screenshot({ path: process.argv[2] + '/2-game.png' }); require('fs').writeFileSync(process.argv[2]+'/localGame.json', await page.evaluate(()=>localStorage.getItem('colonizers.localGame'))); console.log('TOP', await page.locator('.game').innerText().then(t=>t.slice(0,80)));
  await b.close();
})();
