/**
 * Online rooms with every expansion, sea scenario, special board and screen-changing house rule:
 * does a seated player's page or a watcher's page throw while the game runs from the server's
 * redacted view? Does the room ever stop moving?
 *
 * Host (seat 0, desktop) plays the bot's suggestion through the page's own act(); server bots fill
 * the table; a watcher on a phone-sized page just looks. The known discard crash is patched in the
 * browser only (the request for that one module is rewritten), so that other errors can show.
 *
 * Usage: node ui-online-modes.cjs <worker> <of> [capSeconds] [nameRegex]
 */
const fs = require('fs');
const { chromium, BASE, open } = require('./uilib.cjs');
const REPO = require('path').resolve(__dirname, '../../..');
const [, , wk = '0', of = '1', capS = '240', filter = ''] = process.argv;
const all = JSON.parse(fs.readFileSync(__dirname + '/online-configs.json', 'utf8'));
const configs = all.filter((c) => !filter || new RegExp(filter).test(c.name)).filter((c, i) => i % Number(of) === Number(wk));
const OUT = process.env.OUT || __dirname + '/out/online-modes.jsonl';
fs.mkdirSync(__dirname + '/shots/online-modes', { recursive: true });
const T0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}]`, ...a);
const PATCH = process.env.NO_PATCH !== '1';

async function patchDiscard(ctx) {
  if (!PATCH) return;
  await ctx.route(/packages\/modules\/base\/src\/actions\.ts/, async (route) => {
    const resp = await route.fetch();
    let body = await resp.text();
    const needle = 'const hand = { ...ctx.player(player).hand };';
    if (body.includes(needle))
      body = body.replace(needle, needle + '\n\t\tif (!Object.entries(hand).some(([k, n]) => n > 0 && ctx.registry.cardTypes[k]?.countsForHandLimit)) return [];');
    else console.log('!! discard patch: needle not found');
    await route.fulfill({ response: resp, body });
  });
}

async function inject(page) {
  await page.evaluate(async (REPO) => {
    if (window.__on) return;
    const lib = await import('/src/game/library.ts');
    const bots = await import(`/@fs${REPO}/packages/bots/src/index.ts`);
    const mem = bots.newMemory();
    // Walk the tree React is showing right now. (A DOM node's own fiber pointer can be the
    // previous render's copy, which is one update behind.)
    const find = () => {
      if (!document.querySelector('.game')) return null;
      const rootEl = document.getElementById('root');
      const ck = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
      if (!ck) return null;
      const queue = [rootEl[ck].stateNode.current];
      for (let n = 0; queue.length && n < 4000; n++) {
        const f = queue.shift();
        const p = f.memoizedProps;
        if (p && p.g && typeof p.g.act === 'function') return p;
        if (f.child) queue.push(f.child);
        if (f.sibling) queue.push(f.sibling);
      }
      return null;
    };
    window.__on = {
      info() {
        const p = find();
        if (!p) return null;
        const s = p.g.state;
        let waiting = null;
        let werr = null;
        try {
          waiting = lib.library.waitingOn(s);
        } catch (e) {
          werr = String(e.message);
        }
        return {
          n: s.seq,
          phase: s.phase.id,
          step: s.phase.step ?? null,
          turn: s.turn.number,
          turnPlayer: s.turn.player,
          winner: s.winner,
          waiting,
          werr,
          seat: p.seat,
          error: p.g.error || null,
          conn: (p.online && p.online.conn) || null,
          modules: s.modules,
          vpTarget: s.settings.vpTarget,
          names: s.players.map((x) => x.name),
        };
      },
      suggest() {
        const p = find();
        return bots.chooseAction(lib.library, p.g.state, p.seat, { level: 'medium', style: 'balanced' }, mem, { budgetMs: 150 });
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

const lobbySend = (page, patch) =>
  page.evaluate((patch) => {
    if (!document.querySelector('.lobby')) return 'no lobby';
    const rootEl = document.getElementById('root');
    const ck = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
    const queue = [rootEl[ck].stateNode.current];
    for (let n = 0; queue.length && n < 4000; n++) {
      const f = queue.shift();
      const p = f.memoizedProps;
      if (p && p.r && typeof p.r.send === 'function' && p.room && p.room.settings) {
        p.r.send({ type: 'settings', settings: { ...p.room.settings, ...patch } });
        return 'sent';
      }
      if (f.child) queue.push(f.child);
      if (f.sibling) queue.push(f.sibling);
    }
    return 'no props';
  }, patch);
const lobbySettings = (page) =>
  page.evaluate(() => {
    if (!document.querySelector('.lobby')) return null;
    const rootEl = document.getElementById('root');
    const ck = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
    const queue = [rootEl[ck].stateNode.current];
    for (let n = 0; queue.length && n < 4000; n++) {
      const f = queue.shift();
      const p = f.memoizedProps;
      if (p && p.r && p.room && p.room.settings) return p.room.settings;
      if (f.child) queue.push(f.child);
      if (f.sibling) queue.push(f.sibling);
    }
    return null;
  });

const errKey = (e) => {
  const stack = String(e.stack || '')
    .split('\n')
    .slice(1, 5)
    .map((l) => l.trim().replace(/https?:\/\/[^/]+/g, '').replace(/\/@fs\/home\/user\/colonizers-latest\//g, '').replace(/\?[tv]=[^:)]*/g, ''))
    .join(' < ');
  return `${e.message} @ ${stack}`.slice(0, 600);
};

async function runOne(browser, cfg) {
  const t0 = Date.now();
  const res = { name: cfg.name, players: cfg.players, outcome: 'cap', errors: { host: {}, watcher: {} }, console: { host: {}, watcher: {} }, phases: {}, hostMoves: 0, hostActs: {}, noSuggestion: 0, actErrors: {}, blanks: { host: 0, watcher: 0 }, maxGap: null, notes: [] };
  const A = await open(browser, 'desktop');
  const W = await open(browser, 'phone');
  try {
    for (const [k, X] of Object.entries({ host: A, watcher: W })) {
      await patchDiscard(X.ctx);
      X.page.on('pageerror', (e) => {
        const key = errKey(e);
        res.errors[k][key] = (res.errors[k][key] || 0) + 1;
      });
      X.page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text().slice(0, 300);
        if (/closed before the connection|Failed to load resource/.test(t)) return;
        res.console[k][t] = (res.console[k][t] || 0) + 1;
      });
    }
    if (process.env.TRACE) {
      const tr = (who) => (ws) => {
        const brief = (dir) => (f) => {
          let m; try { m = JSON.parse(f.payload); } catch { return; }
          let extra = '';
          if (m.type === 'game') extra = `seq ${m.game.seq} ${m.game.view.phase.id} turn ${m.game.view.turn.number}/p${m.game.view.turn.player} events ${m.events.map((e) => e.event.type).join(',')} deadline ${m.game.deadline ? Math.round((m.game.deadline - m.now) / 1000) + 's' : '-'}`;
          else if (m.type === 'act') extra = `${m.action.type}(${m.action.player})`;
          else if (m.type === 'chat') extra = JSON.stringify(m.text || m.message?.text).slice(0, 50);
          else if (m.type === 'room') extra = `status ${m.room.status}`;
          say(`   ${who} ${dir} ${m.type} ${extra}`);
        };
        ws.on('framereceived', brief('<-'));
        ws.on('framesent', brief('->'));
        ws.on('close', () => say(`   ${who} socket closed`));
      };
      A.page.on('websocket', tr('host'));
      if (process.env.TRACE === '2') W.page.on('websocket', tr('watcher'));
    }
    await A.page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await A.page.getByLabel('Your name').first().fill('Host');
    await A.page.getByRole('button', { name: 'Create a room' }).click();
    await A.page.waitForSelector('.lobby', { timeout: 20000 });
    const code = A.page.url().split('/r/')[1];
    res.room = code;
    const sent = await lobbySend(A.page, cfg.patch);
    const wantModes = Object.entries(cfg.patch).filter(([, v]) => v === true).map(([k]) => k);
    let got = null;
    let mismatch = [];
    for (let i = 0; i < 20; i++) {
      await A.page.waitForTimeout(200);
      got = await lobbySettings(A.page);
      mismatch = [];
      if (JSON.stringify(got?.map) !== JSON.stringify(cfg.patch.map)) mismatch.push(`map ${JSON.stringify(got?.map)}`);
      for (const m of wantModes) if (got?.[m] !== true) mismatch.push(`${m} off`);
      if (got?.maxPlayers !== cfg.players) mismatch.push(`maxPlayers ${got?.maxPlayers}`);
      if (!mismatch.length) break;
    }
    if (sent !== 'sent' || mismatch.length) res.notes.push(`settings: ${sent}; ${mismatch.join(', ')}`);
    await A.page.getByLabel('Bot level').selectOption({ label: 'Medium' }).catch(() => res.notes.push('no Medium level option'));
    for (let i = 1; i < cfg.players; i++) {
      await A.page.getByRole('button', { name: /Add a bot/ }).click();
      await A.page.waitForTimeout(450);
    }
    await W.page.goto(`${BASE}/r/${code}`, { waitUntil: 'networkidle' });
    await W.page.getByLabel('Your name').fill('Watcher');
    await W.page.getByRole('button', { name: 'Join' }).click();
    await W.page.waitForSelector('.lobby', { timeout: 20000 });
    res.lobbyText = (await A.page.locator('.lobby .card').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 260);
    const start = A.page.locator('.lobby button.primary').last();
    res.startLabel = (await start.innerText().catch(() => '')).replace(/\s+/g, ' ');
    await start.click();
    for (const X of [A, W]) await X.page.waitForSelector('.game', { timeout: 30000 });
    await inject(A.page);
    const info = () => A.page.evaluate(() => (window.__on ? window.__on.info() : null)).catch(() => null);
    const first = await info();
    res.modules = first?.modules;
    res.vpTarget = first?.vpTarget;
    if (JSON.stringify(first?.modules) !== JSON.stringify(cfg.expectModules)) res.notes.push(`modules differ: got ${first?.modules} expected ${cfg.expectModules}`);
    let lastN = -1;
    let lastChange = Date.now();
    let lastPhase = '';
    let shotMid = false;
    let poked = false;
    let st = first;
    while (Date.now() - t0 < Number(capS) * 1000) {
      st = await info();
      if (!st) {
        // Blank page or the helper is gone: note it, reload, carry on.
        const hasGame = await A.page.locator('.game').count().catch(() => 0);
        if (!hasGame) {
          res.blanks.host++;
          await A.page.screenshot({ path: `${__dirname}/shots/online-modes/${cfg.name}-host-blank${res.blanks.host}.png` }).catch(() => {});
          await A.page.reload({ waitUntil: 'networkidle' }).catch(() => {});
          await A.page.waitForSelector('.game', { timeout: 15000 }).catch(() => {});
        }
        await inject(A.page).catch(() => {});
        await A.page.waitForTimeout(300);
        if (res.blanks.host > 12) { res.outcome = 'host keeps going blank'; break; }
        continue;
      }
      if (st.werr) res.notes.push(`waitingOn throws on the host page in ${st.phase}: ${st.werr}`.slice(0, 200));
      const ph = st.phase + (st.step ? ':' + st.step : '');
      if (ph !== lastPhase) { res.phases[ph] = (res.phases[ph] || 0) + 1; lastPhase = ph; }
      if (st.n !== lastN) { lastN = st.n; lastChange = Date.now(); poked = false; }
      else if (process.env.POKE && !poked && Date.now() - lastChange > Number(process.env.POKE) * 1000) {
        poked = true;
        res.pokes = (res.pokes || 0) + 1;
        say(`   no move for ${process.env.POKE} s at seq ${st.n} (${ph}, waiting ${JSON.stringify(st.waiting)}); the watcher sends a chat message`);
        await W.page.getByPlaceholder('Message the table').fill('anyone there?').catch(() => {});
        await W.page.getByRole('button', { name: 'Send' }).click({ timeout: 3000 }).catch((e) => say('   chat send failed: ' + String(e.message).split('\n')[0]));
      }
      else {
        const gap = Date.now() - lastChange;
        if (!res.maxGap || gap > res.maxGap.ms) res.maxGap = { ms: gap, at: st.n, phase: ph, waiting: st.waiting, turnPlayer: st.turnPlayer, hostSeat: st.seat };
      }
      if (st.winner !== null) { res.outcome = 'finished'; res.winner = st.names[st.winner]; break; }
      if (!(await W.page.locator('.game').count().catch(() => 1))) {
        res.blanks.watcher++;
        await W.page.screenshot({ path: `${__dirname}/shots/online-modes/${cfg.name}-watcher-blank${res.blanks.watcher}.png` }).catch(() => {});
        await W.page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      }
      if (!shotMid && Date.now() - t0 > 60000) {
        shotMid = true;
        await A.page.screenshot({ path: `${__dirname}/shots/online-modes/${cfg.name}-host-mid.png` }).catch(() => {});
        await W.page.screenshot({ path: `${__dirname}/shots/online-modes/${cfg.name}-watcher-mid.png` }).catch(() => {});
      }
      if (st.waiting && st.waiting.includes(st.seat)) {
        let a = await A.page.evaluate(() => { try { return window.__on.suggest(); } catch (e) { return { __err: String(e.message) + ' @ ' + String(e.stack).split('\n').slice(1, 4).join(' < ') }; } }).catch(() => null);
        if (a && a.__err) { const k = ('suggest: ' + a.__err).replace(/https?:\/\/[^/]+/g, '').slice(0, 400); res.actErrors[k] = (res.actErrors[k] || 0) + 1; a = null; }
        // In the main phase with nothing the bot wants to do, it is not really the host's move.
        if (!a) {
          res.noSuggestion++;
          const legal = await A.page.evaluate(() => { try { return window.__on.legal(); } catch (e) { return []; } }).catch(() => []);
          a = legal.find((x) => x.type === 'endTurn') || (st.turnPlayer === st.seat || st.phase !== 'main' ? legal[0] : null) || null;
        }
        if (a) {
          const before = st.n;
          await A.page.evaluate((x) => window.__on.act(x), a).catch((e) => { const k = String(e.message).split('\n')[0].slice(0, 200); res.actErrors[k] = (res.actErrors[k] || 0) + 1; });
          res.hostMoves++;
          res.hostActs[a.type] = (res.hostActs[a.type] || 0) + 1;
          for (let i = 0; i < 15; i++) {
            await A.page.waitForTimeout(100);
            const s2 = await info();
            if (!s2 || s2.n !== before) break;
          }
          const s3 = await info();
          if (s3 && s3.error) { const k = `refused ${a.type}: ${s3.error}`.slice(0, 200); res.actErrors[k] = (res.actErrors[k] || 0) + 1; }
          continue;
        }
      }
      await A.page.waitForTimeout(200);
    }
    res.seq = st?.n ?? null;
    res.turn = st?.turn ?? null;
    res.lastPhase = lastPhase;
    res.finalPlayers = (await W.page.locator('.players').innerText({ timeout: 2000 }).catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    res.watcherPrompt = (await W.page.locator('.game-head .prompt').innerText({ timeout: 2000 }).catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    res.watcherHasGame = await W.page.locator('.game').count().catch(() => 0);
    await A.page.screenshot({ path: `${__dirname}/shots/online-modes/${cfg.name}-host-end.png` }).catch(() => {});
    await W.page.screenshot({ path: `${__dirname}/shots/online-modes/${cfg.name}-watcher-end.png` }).catch(() => {});
  } catch (e) {
    res.outcome = 'driver error';
    res.notes.push(String(e.message).split('\n')[0].slice(0, 300));
    await A.page.screenshot({ path: `${__dirname}/shots/online-modes/${cfg.name}-host-error.png` }).catch(() => {});
  }
  res.ms = Date.now() - t0;
  await A.ctx.close().catch(() => {});
  await W.ctx.close().catch(() => {});
  return res;
}

(async () => {
  const browser = await chromium.launch();
  for (const cfg of configs) {
    const res = await runOne(browser, cfg);
    fs.appendFileSync(OUT, JSON.stringify(res) + '\n');
    const ne = Object.keys(res.errors.host).length + Object.keys(res.errors.watcher).length;
    say(`${cfg.name}: ${res.outcome} after ${Math.round(res.ms / 1000)} s, turn ${res.turn}, ${res.hostMoves} host moves, page errors ${ne}, blanks ${res.blanks.host}/${res.blanks.watcher}, longest wait ${res.maxGap ? Math.round(res.maxGap.ms / 1000) + ' s' : '-'}${res.notes.length ? ' | ' + res.notes.join(' ; ') : ''}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
