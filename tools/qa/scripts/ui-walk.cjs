/**
 * Plays ready-made local games (one human seat, bots elsewhere) in the real game screen for every
 * expansion and special board. The human's moves are the bot's suggestion, sent through the game
 * screen's own "act" function; before each one the screen is checked for a way to make a move.
 *
 * Usage: node ui-walk.cjs <viewport> <name regex> [maxActions] [maxMs]
 * Appends one JSON line per game to out/ui-walk.jsonl and screenshots to shots/walk/.
 */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const { inject } = require('./driver.cjs');

const [vp = 'desktop', filter = '.', maxActionsArg, maxMsArg] = process.argv.slice(2);
const maxActions = Number(maxActionsArg || 700);
const maxMs = Number(maxMsArg || 120000);
const configs = JSON.parse(fs.readFileSync(__dirname + '/ui-configs.json', 'utf8')).filter((c) => new RegExp(filter).test(c.name));
fs.mkdirSync(__dirname + '/shots/walk', { recursive: true });

async function addAct(page) {
  await page.evaluate(() => {
    const qa = window.__qa;
    if (qa.act) return;
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
    qa.act = (action) => {
      const g = qa.controller();
      if (!g) throw new Error('no game controller found');
      return g.act(action);
    };
    /** What the screen offers right now. */
    qa.affordances = () => {
      const shown = (e) => {
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        const cs = getComputedStyle(e);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const skip = (b) =>
        b.classList.contains('sheet-handle') ||
        b.classList.contains('menu-toggle') ||
        b.closest('.game-log, .chat, .game-head, .head-actions, .error, .players') ||
        /Show my cards/.test(b.textContent);
      const dialog = document.querySelector('[role="dialog"]');
      const scope = dialog || document.querySelector('.game');
      const all = scope ? [...scope.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled)')].filter((b) => !skip(b)) : [];
      const visible = all.filter(shown);
      const hidden = all.filter((b) => !shown(b));
      return {
        targets: document.querySelectorAll('.game .target').length,
        dialog: dialog ? dialog.getAttribute('aria-label') || '(untitled)' : null,
        buttons: visible.map((b) => (b.textContent || b.getAttribute('aria-label') || b.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)),
        hidden: hidden.map((b) => (b.textContent || b.getAttribute('aria-label') || b.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)),
        prompt: (document.querySelector('.game-head .prompt, .game-head p, .game-head')?.textContent || '').trim().slice(0, 120),
      };
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  for (const cfg of configs) {
    const t0 = Date.now();
    const { ctx, page, logs } = await open(browser, vp);
    const touch = !!VIEWPORTS[vp].hasTouch;
    const res = { name: cfg.name, vp, modules: cfg.save.config.modules, outcome: 'running', n: 0, humanMoves: {}, deadEnds: [], hiddenOnly: [], layout: {}, phases: {}, dialogs: {}, errors: [], shots: [] };
    try {
      await page.clock.install();
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.evaluate((save) => localStorage.setItem('colonizers.localGame', JSON.stringify(save)), cfg.save);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Resume saved game' }).click({ timeout: 10000 });
      await page.waitForSelector('.game', { timeout: 10000 });
      await inject(page);
      await addAct(page);
      const shot = async (label) => {
        if (res.shots.length >= 14 || res.shots.includes(label)) return;
        res.shots.push(label);
        await page.screenshot({ path: `${__dirname}/shots/walk/${cfg.name}-${vp}-${label}.png` });
        const rep = fmtLayout(await layoutReport(page, { touch }));
        if (rep) res.layout[label] = rep;
      };
      let lastN = -1;
      let stuck = 0;
      let nullWaits = 0;
      for (let step = 0; step < 100000; step++) {
        const info = await page.evaluate(() => window.__qa.info());
        if (!info) throw new Error('no saved game to read');
        res.n = info.n;
        res.round = info.turn.round;
        res.vp = info.vp;
        if (info.winner !== null) {
          res.outcome = 'won';
          res.winner = info.winner;
          break;
        }
        if (info.n >= maxActions) {
          res.outcome = 'capped';
          break;
        }
        if (Date.now() - t0 > maxMs) {
          res.outcome = 'timecap';
          break;
        }
        if (info.n === lastN) stuck++;
        else stuck = 0;
        lastN = info.n;
        if (stuck > 60) {
          res.outcome = 'stuck';
          res.stuck = { phase: info.phase, waiting: info.waiting };
          await shot('stuck');
          break;
        }
        const human = info.waiting.includes(0);
        if (human) {
          const ph = info.phase.id + (info.phase.step ? '-' + info.phase.step : '');
          res.phases[ph] = (res.phases[ph] || 0) + 1;
          const a = await page.evaluate(() => window.__qa.suggest(0));
          if (a) {
            nullWaits = 0;
            const aff = await page.evaluate(() => window.__qa.affordances());
            if (aff.dialog) res.dialogs[aff.dialog] = (res.dialogs[aff.dialog] || 0) + 1;
            const legalTypes = await page.evaluate(() => [...new Set(window.__qa.legal(0).map((x) => x.type))]);
            if (aff.targets === 0 && aff.buttons.length === 0) {
              const entry = { phase: info.phase, legal: legalTypes, hidden: aff.hidden.slice(0, 8), prompt: aff.prompt, want: a.type };
              const key = JSON.stringify([info.phase.id, legalTypes]);
              const list = aff.hidden.length ? res.hiddenOnly : res.deadEnds;
              if (!list.some((d) => d.key === key)) {
                list.push({ key, ...entry });
                await shot(`${aff.hidden.length ? 'hidden' : 'deadend'}-${ph}-${list.length}`);
              }
            }
            if (res.phases[ph] === 1) await shot(`p-${ph}`);
            if (aff.dialog && res.dialogs[aff.dialog] === 1) await shot(`d-${aff.dialog.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}`);
            if (ph === 'main' && res.phases[ph] === 12) {
              await shot('main-mid');
              const handle = page.locator('.sheet-handle');
              if ((await handle.count()) && (await handle.isVisible()) && !(await page.locator('[role="dialog"]').count())) {
                await handle.click();
                await shot('main-sheet-open');
                await handle.click();
              }
            }
            const ok = await page.evaluate((x) => {
              try {
                return window.__qa.act(x);
              } catch (e) {
                return 'ERR ' + e.message;
              }
            }, a);
            if (ok !== true) res.errors.push(`act ${a.type} -> ${ok}`);
            res.humanMoves[a.type] = (res.humanMoves[a.type] || 0) + 1;
            continue;
          }
          nullWaits++;
        }
        await page.clock.fastForward(human ? 13000 : 700);
      }
      await page.waitForTimeout(200);
      if (res.outcome === 'won') {
        await shot('gameover');
        res.gameOverDialog = await page.locator('[role="dialog"]').count();
      } else await shot('end');
    } catch (e) {
      res.outcome = 'error';
      res.errors.push(String(e.message).split('\n')[0]);
      await page.screenshot({ path: `${__dirname}/shots/walk/${cfg.name}-${vp}-error.png` }).catch(() => {});
    }
    res.ms = Date.now() - t0;
    res.logs = [...new Set(logs)].slice(0, 20);
    fs.appendFileSync(__dirname + '/out/ui-walk.jsonl', JSON.stringify(res) + '\n');
    console.log(
      `[${vp}] ${cfg.name}: ${res.outcome} n=${res.n} round=${res.round} ${(res.ms / 1000).toFixed(0)}s deadEnds=${res.deadEnds.length} hiddenOnly=${res.hiddenOnly.length} layout=${Object.keys(res.layout).length} logs=${res.logs.length} errors=${res.errors.length}`,
    );
    for (const d of res.deadEnds) console.log('   DEAD END', JSON.stringify(d).slice(0, 400));
    for (const d of res.hiddenOnly) console.log('   HIDDEN ONLY', JSON.stringify(d).slice(0, 400));
    for (const e of res.errors.slice(0, 5)) console.log('   ERROR', e);
    for (const l of res.logs.slice(0, 5)) console.log('   LOG', l.slice(0, 300));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
