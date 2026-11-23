const { chromium, BASE, open } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  for (const vp of ['phone', 'small', 'land', 'tablet', 'laptop']) {
    const X = await open(browser, vp, { context: { storageState: 'state-online-B.json' } });
    await X.page.goto(BASE + '/replay/xfvbes-84a3aceb', { waitUntil: 'networkidle' });
    await X.page.waitForSelector('.game.replay', { timeout: 20000 }).catch(() => {});
    await X.page.waitForTimeout(500);
    const r = await X.page.evaluate(() => {
      const vis = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const s = getComputedStyle(el); let p = el; let hidden = false; while (p) { if (getComputedStyle(p).display === 'none') hidden = true; p = p.parentElement; } return `${hidden ? 'display:none ' : ''}${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)} vis=${s.visibility}`; };
      const back = [...document.querySelectorAll('.game-head button')].find((b) => b.innerText.trim() === 'Back');
      return { back: vis(back), title: vis(document.querySelector('.game-title')), actions: vis(document.querySelector('.head-actions')), vw: innerWidth, vh: innerHeight, headButtons: [...document.querySelectorAll('.game-head button')].map((b) => b.innerText.trim().slice(0, 12)).slice(0, 6), board: vis(document.querySelector('.board-wrap')) };
    });
    console.log(vp, JSON.stringify(r));
    await X.page.screenshot({ path: `shots/after/replay-${vp}.png` });
    await X.ctx.close();
  }
  await browser.close();
})();
