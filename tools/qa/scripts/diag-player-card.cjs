const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const name = process.argv[2] || 'special-full-voyage';
const vp = process.argv[3] || 'phone';
const cfg = JSON.parse(fs.readFileSync(__dirname + '/ui-configs.json', 'utf8')).find((c) => c.name === name);
(async () => {
  const browser = await chromium.launch();
  const { page } = await open(browser, vp);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((save) => localStorage.setItem('colonizers.localGame', JSON.stringify(save)), cfg.save);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Resume saved game' }).click({ timeout: 20000 });
  await page.waitForSelector('.game', { timeout: 20000 });
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const d = (e, depth = 0) => {
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      const line = `${'  '.repeat(depth)}${e.tagName.toLowerCase()}.${String(e.className.baseVal ?? e.className).split(' ').join('.')} ${Math.round(b.width)}x${Math.round(b.height)} display:${cs.display} pos:${cs.position} flex:${cs.flex} h:${cs.height} minH:${cs.minHeight} "${(e.childElementCount ? '' : e.textContent || '').slice(0, 20)}"`;
      return [line, ...(depth < 3 ? [...e.children].flatMap((c) => d(c, depth + 1)) : [])];
    };
    const game = document.querySelector('.game');
    const gs = getComputedStyle(game);
    const kids = [...document.querySelector('.players').children].map((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `KID ${e.tagName.toLowerCase()}.${String(e.className).split(' ').join('.')} ${Math.round(b.width)}x${Math.round(b.height)} display:${cs.display} writing:${cs.writingMode} align-self:${cs.alignSelf} text:"${e.textContent.replace(/\s+/g, ' ').slice(0, 80)}" scrollH:${e.scrollHeight}`; });
    const ps = getComputedStyle(document.querySelector('.players'));
    kids.unshift(`players: flex-direction ${ps.flexDirection} wrap ${ps.flexWrap} align-items ${ps.alignItems} overflow ${ps.overflowX}/${ps.overflowY} scrollH ${document.querySelector('.players').scrollHeight}`);
    if (true) return kids;
    return [`game grid rows: ${gs.gridTemplateRows} | areas: ${gs.gridTemplateAreas} | height ${gs.height}`, ...d(document.querySelector('.players')).slice(0, 40), '--- board-wrap', ...d(document.querySelector('.board-wrap')).slice(0, 8)];
  });
  console.log(out.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
