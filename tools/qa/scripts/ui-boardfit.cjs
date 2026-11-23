/** For every ready-made game: how much of the screen the board gets, per screen size. */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open } = require('./uilib.cjs');
const vps = (process.argv[2] || 'phone,small,tablet,land').split(',');
const filter = new RegExp(process.argv[3] || '.');
const configs = JSON.parse(fs.readFileSync(__dirname + '/ui-configs.json', 'utf8')).filter((c) => filter.test(c.name));
(async () => {
  const browser = await chromium.launch();
  for (const vp of vps) {
    const { ctx, page } = await open(browser, vp);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const bad = [];
    for (const cfg of configs) {
      await page.evaluate((save) => localStorage.setItem('colonizers.localGame', JSON.stringify(save)), cfg.save);
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Resume saved game' }).click({ timeout: 20000 });
      await page.waitForSelector('.game', { timeout: 20000 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const r = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const b = e.getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        };
        const vw = innerWidth, vh = innerHeight;
        const wrap = r('.board-wrap');
        const svg = r('svg.board');
        const vis = svg ? Math.max(0, Math.min(svg.x + svg.w, vw) - Math.max(svg.x, 0)) * Math.max(0, Math.min(svg.y + svg.h, vh) - Math.max(svg.y, 0)) : 0;
        const player = r('.player');
        return { vw, vh, head: r('.game-head'), players: r('.players'), player, wrap, svg, controls: r('.controls'), boardShare: Math.round((100 * (wrap ? wrap.w * wrap.h : 0)) / (vw * vh)), svgVisible: Math.round((100 * vis) / (vw * vh)), stats: document.querySelector('.player-stats')?.children.length };
      });
      const line = `[${vp}] ${cfg.name}: board area ${m.boardShare}% of screen (wrap ${m.wrap?.w}x${m.wrap?.h}), players strip ${m.players?.w}x${m.players?.h}, player card ${m.player?.w}x${m.player?.h} with ${m.stats} counters, head ${m.head?.h}, controls ${m.controls?.h}`;
      if (m.boardShare < 25) { bad.push(cfg.name); console.log('  BAD ' + line); await page.screenshot({ path: `${__dirname}/shots/boardfit-${vp}-${cfg.name}.png` }); }
      else if (process.env.VERBOSE) console.log('  ok  ' + line);
    }
    console.log(`[${vp}] ${configs.length} games, board squeezed below a quarter of the screen in ${bad.length}: ${bad.join(', ')}`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
