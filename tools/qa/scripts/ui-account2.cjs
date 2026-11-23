const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const vp = process.argv[2] || 'desktop';
const who = process.argv[3] || 'alex';
(async () => {
  const browser = await chromium.launch();
  const { ctx, page, logs } = await open(browser, vp);
  const touch = !!VIEWPORTS[vp].hasTouch;
  const snap = async (name, full) => {
    await page.screenshot({ path: `shots/acct-${vp}-${name}.png`, fullPage: !!full });
    const rep = fmtLayout(await layoutReport(page, { touch }));
    const txt = await page.evaluate(() => (document.querySelector('[role="dialog"]') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 900));
    console.log(`\n[${vp}] ${name}: ${txt}${rep ? '\n' + rep : ''}`);
    if (logs.length) { console.log('   LOGS ' + [...new Set(logs)].join('\n   ')); logs.length = 0; }
  };
  const dlg = () => page.getByRole('dialog');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  // Wrong sign-in first.
  await dlg().locator('input[type=email]').fill('nobody@example.test');
  await dlg().locator('input[type=password]').fill('wrong-password');
  await dlg().getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(600);
  await snap('signin-wrong');
  await dlg().getByRole('button', { name: 'Forgot password?' }).click();
  await page.waitForTimeout(200);
  await snap('forgot');
  const sub = dlg().locator('button[type=submit]');
  if (await sub.count()) { await sub.click(); await page.waitForTimeout(600); await snap('forgot-sent'); }
  // Back to create account.
  const back = dlg().getByRole('button', { name: /Back|Sign in/ }).first();
  if (await back.count()) await back.click().catch(() => {});
  await page.waitForTimeout(200);
  const create = dlg().getByRole('button', { name: 'Create an account' });
  if (await create.count()) await create.click();
  await page.waitForTimeout(200);
  await snap('create-empty');
  const inputs = await dlg().locator('input').evaluateAll((els) => els.map((e) => `${e.type}:${e.name}:${e.placeholder}:${e.autocomplete}:${e.required}:${e.minLength}`));
  console.log('inputs', inputs.join(' | '));
  // Bad values.
  const fillAll = async (name, email, pw) => {
    const ins = dlg().locator('input');
    const n = await ins.count();
    for (let i = 0; i < n; i++) {
      const t = await ins.nth(i).getAttribute('type');
      if (t === 'email') await ins.nth(i).fill(email);
      else if (t === 'password') await ins.nth(i).fill(pw);
      else await ins.nth(i).fill(name);
    }
  };
  await fillAll('A', 'not-an-email', '123');
  await dlg().locator('button[type=submit]').click();
  await page.waitForTimeout(500);
  await snap('create-bad');
  await fillAll(who === 'alex' ? 'Alex QA' : 'Blair QA', `qa-${who}@example.test`, 'correct horse battery');
  await dlg().locator('button[type=submit]').click();
  await page.waitForTimeout(1200);
  await snap('create-done');
  await page.goto(BASE + '/me', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await snap('me', true);
  const btns = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, textarea')].map((b) => `${b.tagName}:${b.type || ''}:${(b.textContent || b.placeholder || b.getAttribute('aria-label') || '').trim().slice(0, 30)}`));
  console.log(btns.join(' | '));
  await ctx.storageState({ path: `state-${who}.json` });
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
