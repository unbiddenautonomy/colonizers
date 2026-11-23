const { chromium, BASE } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[701, 1000], [744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [900, 1200], [1000, 1300], [1024, 768], [1100, 800], [1180, 820], [1280, 720], [1366, 768]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1200, isMobile: false });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Play against bots/ }).click();
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.waitForSelector('.game');
    const rep = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const off = [...document.querySelectorAll('.game-head button, .game-head select, .game-head label')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1); }).map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 16)}@${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`);
      const head = document.querySelector('.game-head').getBoundingClientRect();
      const board = document.querySelector('.board-wrap').getBoundingClientRect();
      const controls = document.querySelector('.controls').getBoundingClientRect();
      const hs = document.documentElement.scrollWidth - vw;
      const vs = document.documentElement.scrollHeight - vh;
      return { off, head: `${Math.round(head.width)}x${Math.round(head.height)}`, board: `${Math.round(board.width)}x${Math.round(board.height)}`, controls: `${Math.round(controls.width)}x${Math.round(controls.height)}`, hs, vs, headScroll: document.querySelector('.game-head').scrollWidth };
    });
    console.log(`${w}x${h}: off-screen header controls: ${rep.off.join(', ') || 'none'} | head ${rep.head} (scrollWidth ${rep.headScroll}) board ${rep.board} controls ${rep.controls} | page scroll x${rep.hs} y${rep.vs}`);
    if ([820, 1024].includes(w)) await page.screenshot({ path: `shots/header-${w}.png` });
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
