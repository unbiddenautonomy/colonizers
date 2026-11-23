/**
 * Online room, part 2: the same five people come back to the running game (a reconnect in itself),
 * the three seated people play it out through the game screen's own "act", with a timeout,
 * a reload, a dead network, a nudge and a watcher checked along the way.
 */
const fs = require('fs');
const { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout } = require('./uilib.cjs');
const say = (...a) => console.log(...a);
const code = fs.readFileSync(__dirname + '/online-room.txt', 'utf8').trim();
const REPO = require('path').resolve(__dirname, '../../..');

async function inject(page) {
  await page.evaluate(async (REPO) => {
    if (window.__on) return;
    const lib = await import('/src/game/library.ts');
    const bots = await import(`/@fs${REPO}/packages/bots/src/index.ts`);
    const mem = bots.newMemory();
    const find = () => {
      const el = document.querySelector('.game');
      if (!el) return null;
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      let f = el[key];
      while (f) {
        const p = f.memoizedProps;
        if (p && p.g && typeof p.g.act === 'function') return p;
        f = f.return;
      }
      return null;
    };
    window.__on = {
      props: find,
      info() {
        const p = find();
        if (!p) return null;
        const s = p.g.state;
        return {
          n: s.seq,
          phase: s.phase,
          turn: s.turn,
          winner: s.winner,
          waiting: lib.library.waitingOn(s),
          seat: p.seat,
          error: p.g.error,
          conn: p.online && p.online.conn,
          deadline: p.online && p.online.deadline,
          hands: s.players.map((x) => x.hand),
          dev: s.players.map((x) => (x.held && x.held.dev) || null),
          names: s.players.map((x) => x.name),
          log: p.g.log.length,
        };
      },
      suggest() {
        const p = find();
        return bots.chooseAction(lib.library, p.g.state, p.seat, { level: 'medium', style: 'balanced' }, mem, { budgetMs: 200 });
      },
      legal() {
        const p = find();
        return lib.library.legalActions(p.g.state, p.seat);
      },
      act(a) {
        return find().g.act(a);
      },
    };
  }, REPO);
}

const within = (promise, ms, label) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`HANG: ${label} did not return in ${ms} ms`)), ms))]);

(async () => {
  const browser = await chromium.launch();
  const P = {};
  const vps = { A: 'desktop', B: 'phone', C: 'tablet', D: 'laptop', E: 'phone' };
  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    P[k] = await open(browser, vps[k], { context: { storageState: `state-online-${k}.json` } });
    await P[k].page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle', timeout: 90000 });
  }
  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    await P[k].page.waitForSelector('.game', { timeout: 60000 }).catch(() => say(`${k}: no game screen after coming back:`, ''));
    if (!(await P[k].page.locator('.game').count())) say(await P[k].page.evaluate(() => document.body.innerText.slice(0, 300)));
    else await inject(P[k].page);
  }
  const info = (k) => within(P[k].page.evaluate(() => (window.__on ? window.__on.info() : null)), 20000, `${k} info`).catch((e) => { if (/HANG/.test(e.message)) say(e.message); return null; });
  const snap = (k, name) => P[k].page.screenshot({ path: `shots/online-${name}-${k}.png` });
  const first = {};
  for (const k of ['A', 'B', 'C', 'D', 'E']) first[k] = await info(k);
  say('seats:', Object.fromEntries(Object.entries(first).map(([k, v]) => [k, v && v.seat])), 'names', first.A.names);
  // What each screen knows about hands and dev cards (hidden information).
  say('header off-screen check (tablet C):\n' + fmtLayout(await layoutReport(P.C.page, { touch: true })));
  say('header off-screen check (phone B):\n' + fmtLayout(await layoutReport(P.B.page, { touch: true })));
  say('spectator D layout:\n' + fmtLayout(await layoutReport(P.D.page, { touch: false })));

  const players = ['A', 'B', 'C'];
  const skip = process.env.SKIP_CHECKS === '1';
  const done = { timeout: skip, reload: skip, offline: skip, nudge: skip, hidden: skip, spectator: skip };
  let idleC = null; // when C started idling
  const t0 = Date.now();
  let lastN = -1;
  let lastChange = Date.now();
  let winner = null;
  const acted = {};
  const lost = {};
  const blanks = {};
  /** A page whose game screen is gone (blank after a crash): reload it and put the helper back. */
  const revive = async (k) => {
    const pg = P[k].page;
    const hasGame = await pg.locator('.game').count().catch(() => 0);
    if (!hasGame) {
      blanks[k] = (blanks[k] || 0) + 1;
      say(`${k}: game screen gone (blank page #${blanks[k]}), reloading. Page errors so far: ${JSON.stringify([...new Set(P[k].logs.filter((x) => /pageerror/.test(x)).map((x) => x.split('\n')[0]))])}`);
      await pg.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await pg.waitForSelector('.game', { timeout: 8000 }).catch(() => {});
    }
    await inject(pg).catch(() => {});
    await pg.waitForTimeout(300);
  };
  let lastSay = 0;
  while (Date.now() - t0 < 25 * 60 * 1000) {
    const st = await info('A');
    if (st && Date.now() - lastSay > 30000) {
      lastSay = Date.now();
      say(`  [${Math.round((Date.now() - t0) / 1000)} s] seq ${st.n} round ${st.turn.round} phase ${st.phase.id} waiting ${JSON.stringify(st.waiting)} cards ${JSON.stringify(st.hands.map((h) => (typeof h === 'number' ? h : Object.values(h || {}).reduce((a, b) => a + b, 0))))} moves ${JSON.stringify(acted)}`);
    }
    if (!st) {
      await revive('A');
      // Keep the others moving even while A's screen is blank.
      for (const k of ['B', 'C']) {
        const me = await info(k);
        if (!me) { await revive(k); continue; }
        if (me.winner !== null || !me.waiting.includes(me.seat)) continue;
        const a = await P[k].page.evaluate(() => window.__on.suggest()).catch(() => null);
        if (a) await P[k].page.evaluate((x) => window.__on.act(x), a).catch(() => {});
      }
      continue;
    }
    if (st.winner !== null) {
      winner = st.winner;
      break;
    }
    if (st.n !== lastN) {
      lastN = st.n;
      lastChange = Date.now();
      if (st.n % 40 === 0) say(`  seq ${st.n} round ${st.turn.round} phase ${st.phase.id}`);
    }
    if (Date.now() - lastChange > 150000) {
      say('STUCK for 150 s at', JSON.stringify({ n: st.n, phase: st.phase, waiting: st.waiting }));
      break;
    }
    // --- one-off checks ---
    if (!done.hidden && st.turn.round >= 2 && st.phase.id === 'main') {
      done.hidden = true;
      const b = await info('B');
      const d = await info('D');
      say('B (seat ' + b.seat + ') sees hands:', JSON.stringify(b.hands), 'dev:', JSON.stringify(b.dev));
      say('D (watcher) sees hands:', JSON.stringify(d.hands), 'dev:', JSON.stringify(d.dev));
      const dtxt = await P.D.page.evaluate(() => ({ controls: (document.querySelector('.controls')?.innerText || '').replace(/\s+/g, ' ').slice(0, 300), buttons: [...document.querySelectorAll('.controls button:not(:disabled)')].map((x) => x.textContent.trim()).slice(0, 12) }));
      say('D controls:', JSON.stringify(dtxt));
      await snap('D', 'watching');
      await snap('A', 'mid');
      await snap('B', 'mid');
    }
    if (!done.nudge && st.phase.id === 'main') {
      const nb = P.A.page.getByRole('button', { name: /Nudge/ });
      if (await nb.count()) {
        done.nudge = true;
        await nb.first().click();
        await P.A.page.waitForTimeout(400);
        await nb.first().click().catch(() => {});
        await P.A.page.waitForTimeout(400);
        say('after two nudges, A chat tail:', (await P.A.page.locator('.chat').innerText().catch(() => '')).split('\n').slice(-4).join(' | '), '| A error:', (await info('A')).error);
      }
    }
    if (!done.reload && st.turn.round >= 3) {
      done.reload = true;
      const before = await info('B');
      const r0 = Date.now();
      await P.B.page.reload({ waitUntil: 'domcontentloaded' });
      await P.B.page.waitForSelector('.game', { timeout: 15000 });
      await inject(P.B.page);
      const after = await info('B');
      say(`B reload: back in ${Date.now() - r0} ms, seat ${before.seat} -> ${after.seat}, seq ${before.n} -> ${after.n}, log lines ${before.log} -> ${after.log}`);
    }
    if (!done.offline && st.turn.round >= 4 && st.waiting.includes(first.C.seat) && st.phase.id === 'main') {
      done.offline = true;
      await P.C.ctx.setOffline(true);
      await P.C.page.waitForTimeout(4000);
      const c1 = await info('C');
      const connTxt = await P.C.page.locator('.conn').innerText().catch(() => '(no conn label visible)');
      say('C offline 4 s: conn state', c1.conn, '| label:', connTxt, '| A sees C presence:', await P.A.page.locator(`.player[data-seat="${first.C.seat}"] .presence`).getAttribute('aria-label'));
      const a = await P.C.page.evaluate(() => window.__on.suggest());
      const sent = a ? await P.C.page.evaluate((x) => window.__on.act(x), a) : null;
      await P.C.page.waitForTimeout(1500);
      const c2 = await info('C');
      say('C acted while offline:', a && a.type, 'send returned', sent, '| seq', c1.n, '->', c2.n, '| error shown:', c2.error, '| conn', c2.conn);
      await snap('C', 'offline');
      await P.C.ctx.setOffline(false);
      await P.C.page.waitForTimeout(6000);
      const c3 = await info('C');
      const a3 = await info('A');
      say('C back online 6 s: conn', c3.conn, 'seq C', c3.n, 'seq A', a3.n, 'error', c3.error);
    }
    if (!done.timeout && st.turn.round >= 5 && st.waiting.length === 1 && st.waiting[0] === first.C.seat && st.phase.id === 'roll') {
      // C sits on its hands until the clock runs out.
      if (!idleC) {
        idleC = Date.now();
        say('C goes quiet at seq', st.n, 'deadline in', st.deadline ? Math.round((st.deadline - Date.now()) / 1000) + ' s' : st.deadline);
        await snap('A', 'timer-running');
      }
    }
    if (idleC && !done.timeout) {
      const chat = await P.A.page.locator('.chat').innerText().catch(() => '');
      if (/Time ran out/.test(chat)) {
        done.timeout = true;
        say(`timeout fired after ${Math.round((Date.now() - idleC) / 1000)} s; chat tail: ${chat.split('\n').slice(-3).join(' | ')}; now phase ${(await info('A')).phase.id} waiting ${(await info('A')).waiting}`);
      } else if (Date.now() - idleC > 100000) {
        done.timeout = true;
        say('NO timeout after 100 s of waiting');
      }
    }
    // --- moves ---
    for (const k of players) {
      if (k === 'C' && idleC && !done.timeout) continue;
      const me = await info(k);
      if (!me) {
        await revive(k);
        continue;
      }
      if (false) {
        lost[k] = (lost[k] || 0) + 1;
        if (lost[k] === 1 || lost[k] % 50 === 0) say(`${k}: test helper gone from the page (${lost[k]}x), page text: ${(await P[k].page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 120)).catch(() => '?'))}`);
        await inject(P[k].page).catch((e) => say(`${k}: re-inject failed: ${String(e.message).split('\n')[0]}`));
        continue;
      }
      if (me.winner !== null) continue;
      if (!me.waiting.includes(me.seat)) continue;
      try {
        let a = await within(P[k].page.evaluate(() => window.__on.suggest()), 20000, `${k} suggest in phase ${me.phase.id} (seq ${me.n})`);
        if (a && a.type === 'offerTrade' && skip) {
          // Keep the pace up: no more offers, end the turn instead.
          a = await within(P[k].page.evaluate(() => window.__on.legal().find((x) => x.type === 'endTurn') || null), 20000, `${k} legal`);
        }
        if (!a) continue;
        await within(P[k].page.evaluate((x) => window.__on.act(x), a), 20000, `${k} act ${a.type}`);
        acted[a.type] = (acted[a.type] || 0) + 1;
        await P[k].page.waitForTimeout(120);
        const after = await info(k);
        if (after && after.error) {
          say(`${k} move ${a.type} refused: ${after.error}`);
          await P[k].page.evaluate(() => window.__on.props().g.clearError());
        }
      } catch (e) {
        say(`${k} move failed: ${String(e.message).split('\n')[0]}`);
        await inject(P[k].page).catch(() => {});
      }
    }
    await P.A.page.waitForTimeout(150);
  }
  say('blank pages:', JSON.stringify(blanks));
  say('winner seat', winner, 'after', Math.round((Date.now() - t0) / 1000), 's; moves by people:', JSON.stringify(acted));
  await P.A.page.waitForTimeout(1500);
  for (const k of ['A', 'B', 'C', 'D']) {
    await snap(k, 'gameover');
    say(`${k} end dialog:`, (await P[k].page.locator('[role=dialog]').innerText().catch(() => '(none)')).replace(/\s+/g, ' ').slice(0, 400));
  }
  for (const [k, X] of Object.entries(P)) {
    await X.ctx.storageState({ path: `state-online-${k}.json` });
    const l = [...new Set(X.logs)].filter((x) => !/closed before the connection/.test(x));
    if (l.length) say(`LOGS ${k}:\n   ` + l.join('\n   '));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
