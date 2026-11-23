/** Dice skins (with "Your own…"), sound, animation level, and whether the choices survive a reload. */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const { inject } = require('./driver.cjs');
const say = (...a) => console.log(...a);
const vp = process.argv[2] || 'desktop';
const cfg = JSON.parse(fs.readFileSync(__dirname + '/ui-configs.json', 'utf8')).find((c) => c.name === 'base');
fs.mkdirSync(__dirname + '/shots/prefs', { recursive: true });

async function addAct(page) {
  await page.evaluate(() => {
    const qa = window.__qa;
    qa.controller = () => {
      const el = document.querySelector('.game');
      if (!el) return null;
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      let f = el[key];
      while (f) {
        const g = f.memoizedProps && f.memoizedProps.g;
        if (g && typeof g.act === 'function') return g;
        f = f.return;
      }
      return null;
    };
    qa.act = (a) => qa.controller().act(a);
  });
}

(async () => {
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, vp);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((save) => localStorage.setItem('colonizers.localGame', JSON.stringify(save)), cfg.save);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Resume saved game' }).click({ timeout: 20000 });
  await page.waitForSelector('.game', { timeout: 20000 });
  await inject(page);
  await addAct(page);
  // Play until the human has to roll.
  for (let i = 0; i < 400; i++) {
    const info = await page.evaluate(() => window.__qa.info());
    if (info.phase.id === 'roll' && info.waiting.includes(0)) break;
    if (info.waiting.includes(0)) {
      const a = await page.evaluate(() => window.__qa.suggest(0));
      if (a) await page.evaluate((x) => window.__qa.act(x), a);
    }
    await page.waitForTimeout(250);
  }
  const menu = page.locator('.menu-toggle');
  const openMenu = async () => {
    if ((await menu.count()) && (await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
  };
  await openMenu();
  // Roll with the real button.
  const roll = page.getByRole('button', { name: /Roll$/ });
  say('roll button:', await roll.count(), (await roll.first().innerText().catch(() => '')).trim());
  await roll.first().click();
  await page.waitForTimeout(1800);
  const diceBox = async () => {
    const d = page.locator('.dice').first();
    return (await d.count()) ? await d.boundingBox() : null;
  };
  say('dice shown after roll:', JSON.stringify(await diceBox()), 'label', await page.locator('.dice').first().getAttribute('aria-label').catch(() => null), 'text', (await page.locator('.dice').first().innerText().catch(() => '')).replace(/\s+/g, ' '));
  const sel = page.getByLabel('Dice skin');
  const options = await sel.locator('option').allInnerTexts();
  say('dice skins:', options.join(', '));
  for (const o of options) {
    if (/Your own/.test(o)) continue;
    await openMenu();
    await sel.selectOption({ label: o });
    await page.waitForTimeout(300);
    const box = await diceBox();
    if (box) await page.screenshot({ path: `${__dirname}/shots/prefs/dice-${o}-${vp}.png`, clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.width + 40, height: box.height + 40 } });
    say(`  ${o}: die classes`, await page.locator('.die3d').first().getAttribute('class').catch(() => null));
  }
  // Your own dice.
  await openMenu();
  await sel.selectOption({ label: 'Your own…' });
  await page.waitForTimeout(400);
  const dlg = page.locator('[role=dialog]');
  say('designer dialog:', await dlg.count(), await dlg.getAttribute('aria-label').catch(() => null));
  await page.screenshot({ path: `${__dirname}/shots/prefs/dice-designer-${vp}.png` });
  say('designer layout:\n' + fmtLayout(await layoutReport(page, { touch: !!VIEWPORTS[vp].hasTouch })));
  await dlg.locator('.swatch').nth(3).click();
  const styles = await dlg.locator('[role=radiogroup] label').allInnerTexts();
  say('face styles:', styles.map((s) => s.trim()).join(', '));
  await dlg.getByLabel('Symbols', { exact: false }).check().catch(async () => dlg.locator('[role=radiogroup] input').last().check());
  const faces = dlg.locator('.face-inputs input');
  say('face inputs:', await faces.count(), 'maxlength', await faces.first().getAttribute('maxlength').catch(() => null));
  const vals = ['🐑', '🌲', 'WW', '<b>', '🧱🧱', ''];
  for (let i = 0; i < (await faces.count()); i++) await faces.nth(i).fill(vals[i] ?? '');
  await page.screenshot({ path: `${__dirname}/shots/prefs/dice-designer-symbols-${vp}.png` });
  // Escape closes without saving?
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  say('after Escape: dialog open', await dlg.count(), '| skin now', await sel.inputValue(), '| edit button shown', await page.getByRole('button', { name: 'Change your dice' }).count());
  await openMenu();
  if (!(await dlg.count())) await page.getByRole('button', { name: 'Change your dice' }).click();
  await page.waitForTimeout(300);
  say('reopened: faces kept from before Escape?', JSON.stringify(await dlg.locator('.face-inputs input').evaluateAll((els) => els.map((e) => e.value)).catch(() => 'no symbol inputs')));
  await dlg.locator('.swatch').nth(3).click();
  await dlg.locator('[role=radiogroup] input').last().check();
  const faces2 = dlg.locator('.face-inputs input');
  for (let i = 0; i < (await faces2.count()); i++) await faces2.nth(i).fill(vals[i] ?? '');
  await dlg.getByRole('button', { name: 'Use these dice' }).click();
  await page.waitForTimeout(500);
  const box = await diceBox();
  if (box) await page.screenshot({ path: `${__dirname}/shots/prefs/dice-custom-${vp}.png`, clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.width + 40, height: box.height + 40 } });
  say('custom dice html has script/b tag:', await page.locator('.dice b, .dice script').count(), '| dice text:', (await page.locator('.dice').first().innerText().catch(() => '')).replace(/\s+/g, ' '));

  // Sound.
  await openMenu();
  const snd = page.locator('.head-actions button').filter({ hasText: /🔊|🔇|🔈/ }).first();
  const sndInfo = async () => ({ text: (await snd.innerText().catch(() => '')).trim(), label: await snd.getAttribute('aria-label').catch(() => null), pressed: await snd.getAttribute('aria-pressed').catch(() => null), title: await snd.getAttribute('title').catch(() => null) });
  say('sound before:', JSON.stringify(await sndInfo()));
  await snd.click();
  say('sound after click:', JSON.stringify(await sndInfo()));
  // Motion.
  const mot = page.getByLabel('Animations');
  const mopts = await mot.locator('option').allInnerTexts();
  say('animation levels:', mopts.join(', '));
  for (const o of mopts) {
    await openMenu();
    await mot.selectOption({ label: o });
    await page.waitForTimeout(150);
    say(`  ${o}: html data-motion =`, await page.evaluate(() => document.documentElement.dataset.motion));
  }
  await mot.selectOption({ label: mopts[mopts.length - 1] });
  const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('colonizers.') && k !== 'colonizers.localGame').map((k) => [k, localStorage.getItem(k).slice(0, 80)])));
  say('stored choices:', JSON.stringify(before));
  // Reload: are they kept?
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Resume saved game' }).click({ timeout: 20000 });
  await page.waitForSelector('.game', { timeout: 20000 });
  await openMenu();
  say('after reload: dice', await page.getByLabel('Dice skin').inputValue(), '| motion', await page.getByLabel('Animations').inputValue(), '| sound', JSON.stringify(await sndInfo()), '| html motion', await page.evaluate(() => document.documentElement.dataset.motion));
  await page.screenshot({ path: `${__dirname}/shots/prefs/after-reload-${vp}.png` });
  if (logs.length) say('LOGS:\n   ' + [...new Set(logs)].join('\n   '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
