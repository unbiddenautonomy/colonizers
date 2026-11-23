/** Opens the three seated people like the game driver does and logs page events live. */
const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const code = fs.readFileSync(__dirname + '/online-room.txt', 'utf8').trim();
const src = fs.readFileSync(__dirname + '/ui-online3.cjs', 'utf8');
// Reuse the driver's inject() by evaluating its source text.
const injectSrc = src.slice(src.indexOf('async function inject(page)'), src.indexOf('const within'));
const REPO = require('path').resolve(__dirname, '../../..');
const inject = eval(`(${injectSrc.replace('async function inject(page)', 'async function (page)')})`);
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}]`, ...a);
(async () => {
  const browser = await chromium.launch();
  const P = {};
  const vps = { A: 'desktop', B: 'phone', C: 'tablet' };
  for (const k of Object.keys(vps)) {
    P[k] = await open(browser, vps[k], { context: { storageState: `state-online-${k}.json` } });
    const pg = P[k].page;
    pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) say(`${k} NAVIGATED ${f.url().replace(BASE, '')}`); });
    pg.on('console', (m) => { const t = m.text(); if (/vite|error|Error|reload/i.test(t)) say(`${k} console.${m.type()}: ${t.slice(0, 200)}`); });
    pg.on('pageerror', (e) => say(`${k} PAGE ERROR: ${String(e.stack || e.message).split('\n').slice(0, 5).join(' | ')}`));
    pg.on('crash', () => say(`${k} CRASHED`));
    await pg.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle', timeout: 90000 });
    say(`${k} loaded`);
  }
  for (const k of Object.keys(vps)) {
    await P[k].page.waitForSelector('.game', { timeout: 60000 });
    const a = Date.now();
    await inject(P[k].page);
    say(`${k} injected in ${Date.now() - a} ms`);
  }
  for (let i = 0; i < 40; i++) {
    for (const k of Object.keys(vps)) {
      const a = Date.now();
      const me = await P[k].page.evaluate(() => (window.__on ? window.__on.info() : 'no helper')).catch((e) => 'ERR ' + e.message.split('\n')[0]);
      const ms = Date.now() - a;
      if (typeof me === 'string' || me === null) { say(`${k} info -> ${JSON.stringify(me)} (${ms} ms); game on page: ${await P[k].page.locator('.game').count().catch(() => '?')}`); continue; }
      if (ms > 500) say(`${k} info took ${ms} ms`);
      if (me.waiting.includes(me.seat) && me.winner === null) {
        const b = Date.now();
        const act = await Promise.race([P[k].page.evaluate(() => window.__on.suggest()), new Promise((r) => setTimeout(() => r('HANG'), 15000))]).catch((e) => 'ERR ' + e.message.split('\n')[0]);
        say(`${k} (seat ${me.seat}) to move in ${me.phase.id} seq ${me.n}: suggest -> ${JSON.stringify(act).slice(0, 120)} in ${Date.now() - b} ms`);
        if (act === 'HANG') { say(`${k} page is hung`); continue; }
        if (act && typeof act === 'object') {
          const c = Date.now();
          const r = await Promise.race([P[k].page.evaluate((x) => window.__on.act(x), act), new Promise((r) => setTimeout(() => r('HANG'), 15000))]).catch((e) => 'ERR ' + e.message.split('\n')[0]);
          say(`${k} act -> ${JSON.stringify(r)} in ${Date.now() - c} ms`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
