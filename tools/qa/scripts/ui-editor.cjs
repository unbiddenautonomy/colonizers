// Map editor: paint, numbers, harbors, checks, save, play it, edit again, import and export, phone layout.
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  for (const vp of ['desktop', 'phone']) {
    const { ctx, page, logs } = await open(browser, vp, { context: { acceptDownloads: true } });
    const touch = !!VIEWPORTS[vp].hasTouch;
    await page.goto(BASE + '/editor', { waitUntil: 'networkidle' });
    const status = async () => (await page.locator('.editor-problems, .editor-warnings, .editor-ok, .editor-check').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 500);
    say(`[${vp}] fresh editor: checks: ${await status()}`);
    say(`[${vp}] layout:\n` + fmtLayout(await layoutReport(page, { touch })));
    await page.screenshot({ path: `shots/editor-${vp}-fresh.png`, fullPage: true });
    const hexes = page.locator('.editor-board polygon, .map-editor polygon, svg polygon');
    say(`[${vp}] polygons: ${await hexes.count()}`);
    const save = page.getByRole('button', { name: 'Save', exact: true });
    say(`[${vp}] Save enabled at start: ${await save.isEnabled()}`);
    // Paint a few hexes with different terrain by clicking.
    const terr = ['Forest', 'Hills', 'Fields', 'Mountains', 'Desert'];
    const box = await page.locator('svg').first().boundingBox();
    for (let i = 0; i < terr.length; i++) {
      await page.getByRole('button', { name: terr[i], exact: true }).click();
      const x = box.x + box.width * (0.42 + 0.05 * i), y = box.y + box.height * (0.42 + 0.04 * (i % 2));
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    }
    // Drag-paint.
    await page.getByRole('button', { name: 'Hills', exact: true }).click();
    if (!touch) {
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.58);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.58, { steps: 8 });
      await page.mouse.up();
    }
    await page.getByRole('button', { name: /Random numbers/ }).click();
    await page.getByRole('button', { name: /Random harbors/ }).click();
    await page.waitForTimeout(200);
    say(`[${vp}] after painting + random numbers and harbors: ${await status()}`);
    await page.screenshot({ path: `shots/editor-${vp}-painted.png`, fullPage: true });
    await page.getByLabel('Name').fill(vp === 'desktop' ? 'QA island <script>' : 'Phone map');
    say(`[${vp}] Save enabled: ${await save.isEnabled()}`);
    if (await save.isEnabled()) {
      await save.click();
      await page.waitForTimeout(300);
      say(`[${vp}] after save: url ${page.url().replace(BASE, '')} note: ${(await page.locator('.note, [role=status], .muted').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(-220)}`);
      // Export.
      const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      await page.getByRole('button', { name: 'Export file' }).click();
      const d = await dl;
      if (d) {
        const path = `${__dirname}/out/export-${vp}.json`;
        await d.saveAs(path);
        say(`[${vp}] exported ${d.suggestedFilename()} ${fs.statSync(path).size} bytes`);
      } else say(`[${vp}] export gave no download`);
      // Home -> the map is offered -> play it.
      await page.getByRole('button', { name: /Home/ }).click();
      await page.waitForTimeout(300);
      await page.locator('button', { hasText: /^\s*(2|✓)?\s*Map$/ }).first().click();
      await page.waitForTimeout(200);
      const mine = page.getByRole('button', { name: /QA island|Phone map/ });
      say(`[${vp}] "Your maps" shows it: ${await mine.count()}`);
      if (await mine.count()) {
        await mine.first().click();
        await page.screenshot({ path: `shots/editor-${vp}-mapstep.png`, fullPage: true });
        await page.locator('button', { hasText: 'Players' }).first().click();
        await page.getByRole('button', { name: /Play against bots/ }).click();
        await page.getByRole('button', { name: 'Start game' }).click();
        await page.waitForSelector('.game', { timeout: 8000 }).catch(() => say(`[${vp}] game did not start on the custom map`));
        await page.waitForTimeout(500);
        await page.screenshot({ path: `shots/editor-${vp}-playing.png` });
        say(`[${vp}] playing on the custom map: ${await page.locator('.game .target').count()} spots offered, prompt: ${await page.locator('.prompt').innerText().catch(() => '')}`);
      }
    }
    // Broken import.
    await page.goto(BASE + '/editor', { waitUntil: 'networkidle' });
    fs.writeFileSync(`${__dirname}/out/bad-map.json`, '{"hexes": "nope"}');
    const fileInput = page.locator('input[type=file]');
    if (await fileInput.count()) {
      await fileInput.setInputFiles(`${__dirname}/out/bad-map.json`);
      await page.waitForTimeout(300);
      say(`[${vp}] import of a broken file: ${(await page.locator('body').innerText()).match(/That file[^\n]*/)?.[0] || '(no message found)'}`);
      if (fs.existsSync(`${__dirname}/out/export-${vp}.json`)) {
        await fileInput.setInputFiles(`${__dirname}/out/export-${vp}.json`);
        await page.waitForTimeout(300);
        say(`[${vp}] import of the exported file: ${(await page.locator('body').innerText()).match(/Loaded[^\n]*/)?.[0] || '(no message found)'}`);
      }
    }
    // Start over with nothing: what do the checks say for an empty map?
    await page.getByRole('button', { name: 'Start over' }).click();
    await page.waitForTimeout(200);
    say(`[${vp}] after "Start over": ${await status()} | Save enabled: ${await save.isEnabled()}`);
    if (logs.length) say(`[${vp}] LOGS ` + [...new Set(logs)].map((l) => l.slice(0, 200)).join('\n'));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
