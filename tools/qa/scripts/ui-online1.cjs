const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
(async () => {
  const browser = await chromium.launch();
  const host = await open(browser, 'desktop', { context: { storageState: 'state-alex.json', permissions: ['clipboard-read', 'clipboard-write'] } });
  const page = host.page;
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const nameInput = page.getByPlaceholder('Name shown to others');
  console.log('name prefilled:', JSON.stringify(await nameInput.inputValue()));
  if (!(await nameInput.inputValue())) await nameInput.fill('Alex');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await page.waitForURL(/\/r\//, { timeout: 10000 });
  await page.waitForSelector('.lobby', { timeout: 10000 });
  console.log('url', page.url());
  await page.screenshot({ path: 'shots/online-lobby-host-desktop.png', fullPage: true });
  const controls = await page.evaluate(() => [...document.querySelectorAll('.lobby button, .lobby select, .lobby input, .lobby label.toggle')].map((b) => {
    if (b.tagName === 'SELECT') return `SELECT[${b.getAttribute('aria-label') || b.closest('.field')?.querySelector('span')?.textContent || ''}]: ${[...b.options].map((o) => o.textContent).join(' / ').slice(0, 300)}`;
    if (b.tagName === 'LABEL') return `TOGGLE: ${b.textContent.trim().slice(0, 60)}`;
    return `${b.tagName}:${b.type}: ${(b.textContent || b.placeholder || b.getAttribute('aria-label') || '').trim().slice(0, 40)}`;
  }));
  console.log(controls.join('\n'));
  console.log(fmtLayout(await layoutReport(page, { touch: false })));
  console.log('LOGS', host.logs.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
