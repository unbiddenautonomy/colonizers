/**
 * Plays a local game through the real UI: the human seat's moves are clicked like a person
 * would, bots move when the (fake) clock is advanced. Moves with no click mapping go in
 * through the saved game plus a reload (which also tests resuming a save).
 */
const REPO = process.env.REPO || require('path').resolve(__dirname, '../../..');

/** Adds helpers to the page that read the saved game and ask the bot code for a move. */
async function inject(page) {
  await page.evaluate(async (REPO) => {
    if (window.__qa) return;
    const lib = await import('/src/game/library.ts');
    const bots = await import(`/@fs${REPO}/packages/bots/src/index.ts`);
    const eng = await import(`/@fs${REPO}/packages/engine/src/index.ts`);
    const S = 60;
    const memory = new Map();
    const qa = {
      saved() {
        const raw = localStorage.getItem('colonizers.localGame');
        return raw ? JSON.parse(raw) : null;
      },
      state() {
        const saved = qa.saved();
        if (!saved) return null;
        // Cache by action count.
        if (qa._cache && qa._cache.n === saved.actions.length && qa._cache.seed === saved.config.seed) return qa._cache.state;
        let state;
        if (qa._cache && qa._cache.seed === saved.config.seed && qa._cache.n < saved.actions.length) {
          state = qa._cache.state;
          for (let i = qa._cache.n; i < saved.actions.length; i++) state = lib.library.apply(state, saved.actions[i]).state;
        } else state = lib.library.replay(saved.config, saved.actions);
        qa._cache = { n: saved.actions.length, seed: saved.config.seed, state };
        return state;
      },
      info() {
        const saved = qa.saved();
        const state = qa.state();
        if (!state) return null;
        const botSeats = Object.keys(saved.bots || {}).map(Number);
        const waiting = lib.library.waitingOn(state);
        const humans = state.players.map((p) => p.seat).filter((s) => !botSeats.includes(s));
        const ctx = new eng.Ctx(state, lib.library.registry(state.modules));
        return {
          n: saved.actions.length,
          phase: state.phase,
          turn: state.turn,
          winner: state.winner,
          waiting,
          humans,
          botSeats,
          vp: state.players.map((p) => ctx.vp(p.seat)),
          hands: state.players.map((p) => p.hand),
          trade: (state.data.base || {}).trade || null,
          modules: state.modules,
        };
      },
      /** What a bot would do in this seat now. */
      suggest(seat, level = 'medium', style = 'balanced') {
        const state = qa.state();
        if (!memory.has(seat)) memory.set(seat, bots.newMemory());
        return bots.chooseAction(lib.library, state, seat, { level, style }, memory.get(seat), { budgetMs: 300 });
      },
      legal(seat) {
        return lib.library.legalActions(qa.state(), seat);
      },
      cornerXY(id) {
        return eng.cornerToPixel(id, S);
      },
      edgeXY(id) {
        const state = qa.state();
        const g = eng.buildGeometry(Object.keys(state.hexes));
        const [a, b] = g.edgeCorners.get(id);
        return [eng.cornerToPixel(a, S), eng.cornerToPixel(b, S)];
      },
      hexXY(id) {
        const h = qa.state().hexes[id];
        return eng.hexToPixel(h.q, h.r, S);
      },
      /** Marks the target element for a spot so the driver can click it. Returns false when it isn't shown. */
      mark(kind, id) {
        document.querySelectorAll('[data-qa-target]').forEach((e) => e.removeAttribute('data-qa-target'));
        const near = (a, b) => Math.abs(a - b) < 0.6;
        let el = null;
        if (kind === 'corner') {
          const p = qa.cornerXY(id);
          el = [...document.querySelectorAll('.target-corner')].find((e) => near(+e.getAttribute('cx'), p.x) && near(+e.getAttribute('cy'), p.y));
        } else if (kind === 'edge') {
          const [a, b] = qa.edgeXY(id);
          el = [...document.querySelectorAll('.target-edge')].find((e) => {
            const x1 = +e.getAttribute('x1'), y1 = +e.getAttribute('y1'), x2 = +e.getAttribute('x2'), y2 = +e.getAttribute('y2');
            return (near(x1, a.x) && near(y1, a.y) && near(x2, b.x) && near(y2, b.y)) || (near(x1, b.x) && near(y1, b.y) && near(x2, a.x) && near(y2, a.y));
          });
        } else {
          const c = qa.hexXY(id);
          el = [...document.querySelectorAll('.target-hex')].find((e) => {
            const pts = e.getAttribute('points').split(' ').map((s) => s.split(',').map(Number));
            const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
            const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
            return Math.abs(cx - c.x) < 1.5 && Math.abs(cy - c.y) < 1.5;
          });
        }
        if (!el) return false;
        el.setAttribute('data-qa-target', '1');
        return true;
      },
      /** Appends a move to the save (for moves the driver has no clicks for). */
      push(action) {
        const saved = qa.saved();
        // Check it first so a bad move never corrupts the save.
        lib.library.apply(qa.state(), action);
        saved.actions.push(action);
        localStorage.setItem('colonizers.localGame', JSON.stringify(saved));
      },
      targetSizes() {
        const out = {};
        for (const k of ['corner', 'edge', 'hex']) {
          const els = [...document.querySelectorAll(`.target-${k}`)];
          if (!els.length) continue;
          const r = els[0].getBoundingClientRect();
          out[k] = { n: els.length, w: Math.round(r.width), h: Math.round(r.height) };
        }
        return out;
      },
    };
    window.__qa = qa;
  }, REPO);
}

const NAME = { brick: 'Brick', lumber: 'Lumber', wool: 'Wool', grain: 'Grain', ore: 'Ore' };

class Driver {
  constructor(page, opts = {}) {
    this.page = page;
    this.opts = opts;
    this.stats = { ui: {}, fallback: {}, botMoves: 0, reloads: 0, uiFailures: [] };
    this.onShot = opts.onShot || (async () => {});
  }

  async info() {
    await inject(this.page);
    return this.page.evaluate(() => window.__qa.info());
  }

  async clickTarget(kind, id) {
    const ok = await this.page.evaluate(([k, i]) => window.__qa.mark(k, i), [kind, id]);
    if (!ok) throw new Error(`no ${kind} target shown for ${id}`);
    // Click the real screen point, like a finger or a mouse would (a vertical line has no width for a locator click).
    const pt = await this.page.evaluate(() => {
      const el = document.querySelector('[data-qa-target="1"]');
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, hit: top === el, top: top ? `${top.tagName}.${top.getAttribute('class') || ''}` : null };
    });
    if (!pt.hit) throw new Error(`${kind} target ${id} is covered at its centre by ${pt.top}`);
    if (this.opts.touch) await this.page.touchscreen.tap(pt.x, pt.y);
    else await this.page.mouse.click(pt.x, pt.y);
  }

  async pick(group, cards) {
    // CardPicker: press "More x" n times inside the group with this aria-label.
    const g = this.page.getByRole('group', { name: group });
    for (const [card, n] of Object.entries(cards))
      for (let i = 0; i < n; i++) await g.getByRole('button', { name: `More ${card}` }).click({ timeout: 4000 });
  }

  /** Phone layout: pull the controls sheet up or push it down (never while a dialog is open). */
  async sheet(open) {
    const handle = this.page.locator('.sheet-handle');
    if (!(await handle.count()) || !(await handle.isVisible())) return;
    if (await this.page.locator('[role="dialog"]').count()) return;
    const cur = (await handle.getAttribute('aria-expanded')) === 'true';
    if (cur !== open) {
      if (cur && !open) this.stats.sheetLeftOpen = (this.stats.sheetLeftOpen || 0) + 1;
      await handle.click();
    }
  }

  /** Performs one move for the human seat with clicks. Throws when it has no mapping. */
  async perform(a, info) {
    const p = this.page;
    const names = await p.evaluate(() => window.__qa.state().players.map((x) => x.name));
    const action = (sel) => p.locator(`.actions ${sel}`);
    switch (a.type) {
      case 'roll':
        return p.locator('.game [data-shortcut="r"]').click({ timeout: 4000 });
      case 'endTurn':
        return p.locator('.game [data-shortcut="e"]').click({ timeout: 4000 });
      case 'placeSetupSettlement':
        await this.sheet(false);
        return this.clickTarget('corner', a.corner);
      case 'placeSetupRoad':
      case 'placeFreeRoad':
        await this.sheet(false);
        return this.clickTarget('edge', a.edge);
      case 'moveRobber':
        await this.sheet(false);
        return this.clickTarget('hex', a.hex);
      case 'buildRoad':
        await p.locator('.game [data-shortcut="d"]').click({ timeout: 4000 });
        return this.clickTarget('edge', a.edge);
      case 'buildSettlement':
        await p.locator('.game [data-shortcut="s"]').click({ timeout: 4000 });
        return this.clickTarget('corner', a.corner);
      case 'buildCity':
        await p.locator('.game [data-shortcut="c"]').click({ timeout: 4000 });
        return this.clickTarget('corner', a.corner);
      case 'buyDevCard':
        return action('button').filter({ hasText: 'Dev card' }).click({ timeout: 4000 });
      case 'steal':
        return p.getByRole('dialog', { name: 'Steal a card' }).getByRole('button', { name: new RegExp('^' + names[a.from]) }).click({ timeout: 4000 });
      case 'discard': {
        await this.pick('Cards to discard', a.cards);
        return p.getByRole('dialog').getByRole('button', { name: /^Discard \d+\/\d+/ }).click({ timeout: 4000 });
      }
      case 'bankTrade': {
        await p.locator('.game [data-shortcut="b"]').click({ timeout: 4000 });
        const d = p.getByRole('dialog', { name: 'Trade with the bank' });
        await d.locator(`button:has(.rcard[title="${NAME[a.give]}"])`).first().click({ timeout: 4000 });
        await d.locator(`button:has(.rcard[title="${NAME[a.get]}"])`).last().click({ timeout: 4000 });
        // The dialog stays open for more trades; close it.
        if (await d.count()) await d.getByRole('button', { name: 'Close' }).click({ timeout: 4000 }).catch(() => {});
        return;
      }
      case 'offerTrade': {
        await p.locator('.game [data-shortcut="t"]').click({ timeout: 4000 });
        await this.pick('Cards you give', a.give);
        await this.pick('Cards you want', a.get);
        return p.getByRole('button', { name: 'Offer to everyone' }).click({ timeout: 4000 });
      }
      case 'respondTrade': {
        const row = p.locator('.offer li').filter({ hasText: names[a.player] });
        return row.getByRole('button', { name: a.accept ? 'Accept' : 'Decline' }).click({ timeout: 4000 });
      }
      case 'confirmTrade':
        return p.locator('.offer').getByRole('button', { name: `Trade with ${names[a.with]}` }).click({ timeout: 4000 });
      case 'cancelTrade':
        return p.locator('.offer').getByRole('button', { name: 'Withdraw offer' }).click({ timeout: 4000 });
      case 'playDevCard': {
        const label = { knight: 'Knight', roadBuilding: 'Road Building', monopoly: 'Monopoly', yearOfPlenty: 'Year of Plenty' }[a.card];
        await this.sheet(true);
        await p.locator('.dev-cards button:not(:disabled)').filter({ hasText: label }).first().click({ timeout: 4000 });
        if (a.card === 'monopoly') {
          const d = p.getByRole('dialog');
          await d.locator(`button:has(.rcard[title="${NAME[a.resource]}"])`).click({ timeout: 4000 });
          return d.getByRole('button', { name: 'Play card' }).click({ timeout: 4000 });
        }
        if (a.card === 'yearOfPlenty') {
          const d = p.getByRole('dialog');
          for (const r of a.resources) await d.locator(`button:has(.rcard[title="${NAME[r]}"])`).click({ timeout: 4000 });
          return d.getByRole('button', { name: 'Play card' }).click({ timeout: 4000 });
        }
        return;
      }
      case 'pickGold': {
        await this.pick('Resources to take', a.cards);
        return p.getByRole('dialog').getByRole('button', { name: /^Take \d+\/\d+/ }).click({ timeout: 4000 });
      }
      default:
        throw new Error(`no click mapping for ${a.type}`);
    }
  }

  async fallback(a) {
    await this.page.evaluate((x) => window.__qa.push(x), a);
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    this.stats.reloads++;
    // The home screen offers to resume.
    const resume = this.page.getByRole('button', { name: 'Resume saved game' });
    await resume.click({ timeout: 8000 });
    await this.page.waitForSelector('.game', { timeout: 8000 });
  }

  /** Plays until the game ends or the limit is hit. */
  async play({ maxSteps = 6000, shots = {}, uiOnly = false } = {}) {
    const page = this.page;
    let lastN = -1;
    let stuck = 0;
    for (let step = 0; step < maxSteps; step++) {
      let info = await this.info();
      if (!info) {
        // Nothing is saved until the first move: make it by hand (any glowing corner), or wait for a bot.
        const first = page.locator('.target-corner');
        if (await first.count()) await first.nth(Math.floor((await first.count()) / 2)).click({ timeout: 4000 });
        else await page.clock.runFor(700);
        info = await this.info();
        if (!info) continue;
      }
      if (info.winner !== null) return { ...info, steps: step };
      if (info.n === lastN) stuck++;
      else stuck = 0;
      lastN = info.n;
      if (stuck > 40) throw new Error(`stuck at action ${info.n} in phase ${JSON.stringify(info.phase)} waiting on ${info.waiting}`);
      await this.onShot(info, this);
      const human = info.waiting.find((s) => info.humans.includes(s));
      // A bot's open offer the human hasn't answered counts as the human's move.
      let a = null;
      if (human !== undefined) a = await page.evaluate((s) => window.__qa.suggest(s), human);
      if (human !== undefined && a) {
        try {
          if (['buildRoad', 'buildSettlement', 'buildCity'].includes(a.type)) await this.sheet(false);
          await this.perform(a, info);
          this.stats.ui[a.type] = (this.stats.ui[a.type] || 0) + 1;
          // The move must have landed.
          const after = await this.info();
          if (after.n === info.n && a.type !== 'bankTrade') {
            // Give React a beat, then check again.
            await page.waitForTimeout(50);
            const again = await this.info();
            if (again.n === info.n) throw new Error(`clicks for ${a.type} did not make a move`);
          }
        } catch (e) {
          this.stats.uiFailures.push(`${a.type}: ${String(e.message).split('\n')[0]}`);
          // Evidence: what the screen looked like and what the page says.
          try {
            const k = this.stats.uiFailures.length;
            const dbg = await page.evaluate(() => ({
              error: document.querySelector('.game .error')?.textContent || null,
              pressed: [...document.querySelectorAll('.game [aria-pressed="true"]')].map((b) => b.textContent.trim().slice(0, 20)),
              zoom: document.querySelector('.zoom-inner')?.getAttribute('style'),
              dialog: document.querySelector('[role="dialog"]')?.getAttribute('aria-label') || null,
              sheet: document.querySelector('.sheet-handle')?.getAttribute('aria-expanded') || null,
              targets: document.querySelectorAll('.target').length,
              marked: !!document.querySelector('[data-qa-target]'),
            }));
            this.stats.uiFailures[k - 1] += ' ' + JSON.stringify(dbg) + ' action=' + JSON.stringify(a);
            if (this.opts.failShot) await page.screenshot({ path: `${this.opts.failShot}-${k}.png` });
          } catch {}
          if (uiOnly) throw e;
          // Close anything half-open, then put the move in through the save.
          await page.keyboard.press('Escape').catch(() => {});
          const cur = await this.info();
          if (cur.n === info.n) {
            this.stats.fallback[a.type] = (this.stats.fallback[a.type] || 0) + 1;
            await this.fallback(a);
          }
        }
        continue;
      }
      // Bots (or nobody): let time pass.
      await page.clock.runFor(700);
      this.stats.botMoves++;
      if (human !== undefined && !a) await page.clock.runFor(13000); // an unanswered offer times out
    }
    return { ...(await this.info()), steps: maxSteps, timedOut: true };
  }
}

module.exports = { inject, Driver };
