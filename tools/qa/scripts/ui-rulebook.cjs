const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  for (const vp of ['desktop', 'phone']) {
    const { ctx, page, logs } = await open(browser, vp);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Rulebook/ }).click();
    await page.waitForSelector('[role=dialog]');
    const d = page.getByRole('dialog');
    for (const tab of ['This game', 'Cost card', 'Cards', 'Full rulebook']) {
      await d.getByRole('tab', { name: tab, exact: true }).click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `shots/rulebook-${vp}-${tab.replace(/ /g, '_')}.png` });
      const txt = await d.evaluate((el) => el.innerText.replace(/\s+/g, ' ').length);
      const rep = fmtLayout(await layoutReport(page, { touch: vp !== 'desktop' }));
      console.log(`[${vp}] tab "${tab}": ${txt} chars${rep ? '\n' + rep : ''}`);
    }
    const titles = d.locator('.rule-title');
    const n = await titles.count();
    let short = [], bad = [];
    for (let i = 0; i < n; i++) {
      const t = titles.nth(i);
      await t.click();
      const body = await d.locator('.rule-page.open .rule-body').innerText().catch(() => '');
      const name = (await t.locator('strong').innerText()).trim();
      if (body.length < 120) short.push(`${name}(${body.length})`);
      if (/\{[a-zA-Z]+\}|undefined|NaN|\*\*/.test(body)) bad.push(`${name}: ${body.match(/.{0,30}(\{[a-zA-Z]+\}|undefined|NaN|\*\*).{0,30}/)[0]}`);
      if (i === 4) await page.screenshot({ path: `shots/rulebook-${vp}-entry.png` });
    }
    console.log(`[${vp}] opened ${n} entries; short: ${short.join(', ') || 'none'}; unfilled or broken text: ${bad.join(' || ') || 'none'}`);
    const search = d.getByPlaceholder('Search rules…');
    for (const q of ['robber', 'metropolis', 'zzzz', 'TRADE ', 'knigth']) {
      await search.fill(q);
      await page.waitForTimeout(150);
      const cnt = await d.locator('.rule-title').count();
      console.log(`[${vp}] search "${q}": ${cnt} entries${cnt === 0 ? ' | ' + (await d.locator('.rule-list').innerText()) : ''}`);
    }
    if (logs.length) console.log('LOGS', [...new Set(logs)].join('\n'));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
