/**
 * Released build on :8788: does the installed-app shell work offline?
 * 1. first visit, then offline reload; 2. second visit, then offline reload;
 * 3. offline: start a game against bots, open a room link, create a room; 4. unknown address.
 */
const { chromium, open } = require('./uilib.cjs');
const B = process.env.BASE8788 || 'http://localhost:8788';
const say = (...a) => console.log(...a);
const text = async (page, sel = 'body', n = 300) => (await page.locator(sel).first().innerText().catch(() => '(none)')).replace(/\s+/g, ' ').slice(0, n);
(async () => {
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, 'phone', { context: { serviceWorkers: 'allow' } });
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url().replace(B, '').slice(0, 70)));
  await page.goto(B + '/', { waitUntil: 'networkidle' });
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no service worker support';
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope.replace(location.origin, ''), active: reg.active && reg.active.state, controlled: !!navigator.serviceWorker.controller };
  });
  say('after the first visit: service worker', JSON.stringify(sw), '| cached:', JSON.stringify(await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; })));
  await ctx.setOffline(true);
  failed.length = 0;
  await page.reload({ waitUntil: 'load' }).catch((e) => say('  reload error:', e.message.split('\n')[0]));
  await page.waitForTimeout(1500);
  say('OFFLINE after one visit: page shows:', await text(page, 'body', 160) || '(blank)', '| root children', await page.evaluate(() => document.getElementById('root')?.children.length ?? -1).catch(() => 'n/a'), '| failed requests:', JSON.stringify([...new Set(failed)].slice(0, 6)));
  await page.screenshot({ path: 'shots/pwa-offline-first.png' }).catch(() => {});
  await ctx.setOffline(false);
  await page.goto(B + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  say('after the second visit, cached:', JSON.stringify(await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; })));
  await ctx.setOffline(true);
  failed.length = 0;
  await page.reload({ waitUntil: 'load' }).catch((e) => say('  reload error:', e.message.split('\n')[0]));
  await page.waitForTimeout(1500);
  say('OFFLINE after two visits: page shows:', await text(page, 'body', 160), '| failed:', JSON.stringify([...new Set(failed)].slice(0, 6)));
  await page.screenshot({ path: 'shots/pwa-offline-second.png' }).catch(() => {});
  // Fonts offline?
  say('font in use offline:', await page.evaluate(() => getComputedStyle(document.body).fontFamily.slice(0, 60)), '| loaded faces', await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length));
  // Local game offline.
  const bots = page.getByRole('button', { name: /Play against bots/ });
  if (await bots.count()) {
    await bots.click();
    await page.getByRole('button', { name: 'Start game' }).click().catch((e) => say('  start failed', e.message.split('\n')[0]));
    await page.waitForSelector('.game', { timeout: 10000 }).catch(() => {});
    say('offline local game started:', await page.locator('.game').count(), '| prompt:', await text(page, '.game-head .prompt', 100));
    await page.screenshot({ path: 'shots/pwa-offline-game.png' }).catch(() => {});
  }
  // Online things while offline.
  await page.goto(B + '/', { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(800);
  const create = page.getByRole('button', { name: 'Create a room' });
  if (await create.count()) {
    await page.getByLabel('Your name').first().fill('Offline').catch(() => {});
    await create.click().catch(() => {});
    await page.waitForTimeout(2500);
    say('offline "Create a room":', await text(page, '[role=alert], .error, [role=status]', 200), '| url', page.url().replace(B, ''), '| page:', await text(page, 'body', 200));
    await page.screenshot({ path: 'shots/pwa-offline-create.png' }).catch(() => {});
  }
  await page.goto(B + '/r/abcdef', { waitUntil: 'load' }).catch((e) => say('  nav error', e.message.split('\n')[0]));
  await page.waitForTimeout(2500);
  say('offline room link:', await text(page, 'body', 260));
  await page.screenshot({ path: 'shots/pwa-offline-room.png' }).catch(() => {});
  await ctx.setOffline(false);
  // Unknown addresses, online.
  for (const p of ['/nope', '/r/zzzzzz', '/replay/nope-1', '/crew/nope', '/editor/nope', '/me']) {
    await page.goto(B + p, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    say(`online ${p}:`, await text(page, 'body', 170));
  }
  if (logs.length) say('LOGS:\n   ' + [...new Set(logs)].filter((l) => !/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED|fonts\.g/.test(l)).slice(0, 12).join('\n   '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
