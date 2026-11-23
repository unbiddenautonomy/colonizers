/** Opens the room as one of the saved people and reports what the page shows, with console errors. */
const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const code = fs.readFileSync(__dirname + '/online-room.txt', 'utf8').trim();
const who = process.argv[2] || 'C';
const vps = { A: 'desktop', B: 'phone', C: 'tablet', D: 'laptop', E: 'phone' };
(async () => {
  const browser = await chromium.launch();
  const X = await open(browser, vps[who], { context: { storageState: `state-online-${who}.json` } });
  X.page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e.stack || e.message).split('\n').slice(0, 6).join('\n   ')));
  await X.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle', timeout: 60000 });
  for (let i = 0; i < Number(process.argv[3] || 6); i++) {
    await X.page.waitForTimeout(5000);
    const t = await X.page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160), game: !!document.querySelector('.game'), root: document.getElementById('root')?.children.length }));
    console.log(`${who} t+${(i + 1) * 5}s:`, JSON.stringify(t));
  }
  await X.page.screenshot({ path: `shots/diag-${who}.png` });
  console.log('console:', JSON.stringify([...new Set(X.logs)].slice(0, 12), null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
