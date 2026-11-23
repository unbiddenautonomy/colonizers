// Every look: home screen and game screen render, console errors, and text contrast.
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
const contrastScan = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[, /]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    let layers = [];
    let e = el;
    let image = false;
    while (e && e.nodeType === 1) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') image = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      e = e.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { bg: base, image };
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    const text = t.textContent.trim();
    if (text.length < 2) continue;
    const el = t.parentElement;
    if (!el || el.closest('svg, option, script, style, .sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const { bg, image } = bgOf(el);
    // Opacity of ancestors dims the text.
    let op = 1; let p = el; while (p && p.nodeType === 1) { op *= Number(getComputedStyle(p).opacity); p = p.parentElement; }
    const fg = over({ ...fg0, a: fg0.a * op }, bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const big = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = big ? 3 : 4.5;
    if (ratio < need) {
      const disabled = !!el.closest('button:disabled, [disabled], .dim, .blocked');
      const key = `${el.tagName}.${(el.className && typeof el.className === 'string' ? el.className : '').split(' ')[0]}|${Math.round(ratio * 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: text.slice(0, 28), ratio: +ratio.toFixed(2), size, cls: key.split('|')[0], disabled, image });
    }
  }
  return out.sort((a, b) => a.ratio - b.ratio);
};
(async () => {
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, 'desktop');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const looks = await page.getByLabel('Look', { exact: true }).evaluate((s) => [...s.options].map((o) => ({ value: o.value, label: o.textContent })));
  fs.mkdirSync('shots/themes', { recursive: true });
  const results = [];
  for (const look of looks) {
    logs.length = 0;
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.getByLabel('Look', { exact: true }).selectOption(look.value);
    await page.waitForTimeout(400);
    const slug = look.label.replace(/[^a-z0-9]+/gi, '_');
    await page.screenshot({ path: `shots/themes/${slug}-home.png` });
    const home = await page.evaluate(contrastScan);
    const board = await page.getByLabel('Board skin').inputValue();
    await page.getByRole('button', { name: /Play against bots/ }).click();
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.waitForSelector('.game');
    await page.waitForTimeout(2500); // bots place a few pieces
    await page.screenshot({ path: `shots/themes/${slug}-game.png` });
    const game = await page.evaluate(contrastScan);
    const fonts = await page.evaluate(() => [getComputedStyle(document.body).fontFamily.split(',')[0], getComputedStyle(document.querySelector('h1, h2') || document.body).fontFamily.split(',')[0]].join(' / '));
    const bad = (list) => list.filter((x) => !x.disabled && !x.image);
    results.push({ look: look.label, board, fonts, home: bad(home), game: bad(game), logs: [...new Set(logs)] });
    say(`${look.label} [board ${board}] fonts ${fonts}: low-contrast text home ${bad(home).length}, game ${bad(game).length}${logs.length ? ' | console: ' + [...new Set(logs)].join(' ; ').slice(0, 200) : ''}`);
    for (const x of [...bad(home).slice(0, 4), ...bad(game).slice(0, 5)]) say(`     ${x.ratio}:1 "${x.text}" ${x.cls} ${x.size}px`);
    // Leave the game (confirm is auto-accepted).
    await page.evaluate(() => localStorage.removeItem('colonizers.localGame'));
  }
  fs.writeFileSync('out/themes.json', JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
