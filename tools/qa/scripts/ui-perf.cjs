// First-load timing of the production build (served by the local Worker) on an emulated mid-range phone.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  for (const [label, net, cpu] of [['desktop, no throttle', null, 1], ['phone, 4G (9 Mbit, 170 ms), 4x slower CPU', { down: 9e6 / 8, up: 9e6 / 8, lat: 170 }, 4], ['phone, slow 4G (1.6 Mbit, 300 ms), 4x slower CPU', { down: 1.6e6 / 8, up: 0.75e6 / 8, lat: 300 }, 4]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: net.down, uploadThroughput: net.up, latency: net.lat });
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    const reqs = [];
    page.on('requestfinished', async (r) => { try { const s = await r.sizes(); reqs.push({ url: r.url(), bytes: s.responseBodySize + s.responseHeadersSize, type: r.resourceType() }); } catch {} });
    const t0 = Date.now();
    await page.goto('http://localhost:8787/', { waitUntil: 'load', timeout: 120000 });
    const tLoad = Date.now() - t0;
    await page.getByRole('button', { name: 'Start game' }).waitFor({ timeout: 120000 });
    const tReady = Date.now() - t0;
    const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)])));
    const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
    const total = reqs.reduce((s, r) => s + r.bytes, 0);
    const byHost = {};
    for (const r of reqs) { const h = new URL(r.url).host; byHost[h] = (byHost[h] || 0) + r.bytes; }
    console.log(`${label}: first paint ${paint['first-contentful-paint']} ms, set-up screen ready ${tReady} ms, load event ${tLoad} ms | ${reqs.length} requests, ${(total / 1024).toFixed(0)} KB transferred | by host: ${Object.entries(byHost).map(([h, b]) => `${h} ${(b / 1024).toFixed(0)}KB`).join(', ')}`);
    // Start a bot game and time the first board render.
    const t1 = Date.now();
    await page.getByRole('button', { name: /Play against bots/ }).click();
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.waitForSelector('.game .target-corner');
    console.log(`   start game -> board shown: ${Date.now() - t1} ms`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
