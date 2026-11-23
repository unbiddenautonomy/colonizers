/** Lobby setting changes with a realistic network delay on the room connection (each way). */
const { chromium, BASE, open } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
const delay = Number(process.argv[2] || 150);
const gap = Number(process.argv[3] || 0);
(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, 'desktop');
  const pg = A.page;
  await pg.routeWebSocket(/\/api\/rooms\/.*\/ws/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => setTimeout(() => server.send(m), delay));
    server.onMessage((m) => setTimeout(() => ws.send(m), delay));
  });
  await pg.goto(BASE + '/', { waitUntil: 'networkidle' });
  await pg.getByLabel('Your name').first().fill('Race Host');
  await pg.getByRole('button', { name: 'Create a room' }).click();
  await pg.waitForSelector('.lobby', { timeout: 15000 });
  const boxes = [/Friendly robber/, /Balanced dice/, /Gifts:/, /Open trading/, /Both starting settlements/, /Harbormaster/];
  const t0 = Date.now();
  const times = [];
  for (const re of boxes) {
    await pg.getByLabel(re).click();
    times.push(Date.now() - t0);
    if (gap) await pg.waitForTimeout(gap);
  }
  await pg.waitForTimeout(delay * 2 + 1500);
  const kept = [];
  for (const re of boxes) kept.push(await pg.getByLabel(re).isChecked());
  say(`delay ${delay} ms each way, clicks at ${times.join(', ')} ms: ticked 6 boxes, still ticked: ${kept.filter(Boolean).length} of 6 ${JSON.stringify(kept)}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
