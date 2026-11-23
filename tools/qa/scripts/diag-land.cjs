/** Phone on its side: what is left for the action panel in the setups with a scenario status block? */
const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const want = new RegExp(process.argv[2] || 'mode-investors|special-full-voyage|special-great-canal|^base$');
const configs = JSON.parse(fs.readFileSync(__dirname + '/ui-configs.json', 'utf8')).filter((c) => want.test(c.name));
(async () => {
  const browser = await chromium.launch();
  const { ctx, page } = await open(browser, 'land');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  for (const cfg of configs) {
    await page.evaluate((save) => localStorage.setItem('colonizers.localGame', JSON.stringify(save)), cfg.save);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Resume saved game' }).click({ timeout: 20000 });
    await page.waitForSelector('.game', { timeout: 20000 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`; };
      const c = document.querySelector('.controls');
      const cs = c ? getComputedStyle(c) : null;
      const btns = [...document.querySelectorAll('.controls button')].map((b) => { const x = b.getBoundingClientRect(); return { t: b.innerText.trim().replace(/\s+/g, ' ').slice(0, 14), y: Math.round(x.y), h: Math.round(x.height), on: x.height > 0 && x.bottom <= innerHeight && x.top >= (c ? c.getBoundingClientRect().top : 0) }; });
      return { controls: r(c), overflowY: cs && cs.overflowY, scrollH: c && c.scrollHeight, players: r(document.querySelector('.players')), status: r(document.querySelector('.tda-status')), board: r(document.querySelector('.board-wrap')), buttons: btns.length, buttonsInView: btns.filter((b) => b.on).length, first: btns.slice(0, 5) };
    });
    console.log(cfg.name, JSON.stringify(m));
    await page.screenshot({ path: `${__dirname}/shots/land-${cfg.name}.png` });
  }
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
