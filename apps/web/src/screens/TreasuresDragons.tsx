import type { Ctx } from '@colonizers/engine';
import {
  scenarioOf,
  tdaData,
  TOTAL_DRAGONS,
  dragonsAttacking,
  DRAGONS_TO_WIN,
  canalHexes,
  canalLeft,
} from '@colonizers/module-treasures-dragons';

/** Treasures opened and dragons driven out, for one player's row. */
export function TdaPlayerStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const d = tdaData(ctx);
  if (scenarioOf(ctx) === 'desert-dragons')
    return <span title="Dragons driven out">🐉 {d.slain[seat] ?? 0}</span>;
  if (scenarioOf(ctx) === 'enchanted-land')
    return (
      <span title={`Dragons beaten (${DRAGONS_TO_WIN} win the game)`}>
        🐉 {d.slain[seat] ?? 0}/{DRAGONS_TO_WIN}
      </span>
    );
  if (scenarioOf(ctx) === 'greater-catan') return null;
  if (scenarioOf(ctx) === 'great-canal')
    return <span title="Canal chips (1 point each)">⛏️ {d.chips[seat] ?? 0}</span>;
  return <span title="Treasures opened">🧰 {d.found[seat] ?? 0}</span>;
}

/** The dragons' state, or the treasures still out there. */
export function TdaStatus({ ctx }: { ctx: Ctx }) {
  const d = tdaData(ctx);
  if (scenarioOf(ctx) === 'desert-dragons') {
    const out = Object.entries(d.dragons).filter(
      ([h, n]) => n > 0 && ctx.state.hexes[h as keyof typeof ctx.state.hexes]?.type !== 'desert',
    ).length;
    return (
      <div className="tda-status" aria-label="Dragons">
        {dragonsAttacking(ctx) ? (
          <p>
            🐉 <strong>The dragons are attacking.</strong> {out} on the land; Knight cards drive
            them out.
          </p>
        ) : (
          <p>
            🐉 Dragons awake: <strong>{d.awake}</strong> of {TOTAL_DRAGONS}
            <small className="muted"> · each new settlement or city wakes more</small>
          </p>
        )}
        <div
          className="tda-meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={TOTAL_DRAGONS}
          aria-valuenow={d.awake}
        >
          <span style={{ width: `${(100 * d.awake) / TOTAL_DRAGONS}%` }} />
        </div>
      </div>
    );
  }
  if (scenarioOf(ctx) === 'enchanted-land') {
    const left = Object.values(ctx.state.pieces).filter((p) => p.type === 'dragon').length;
    return (
      <div className="tda-status" aria-label="Dragons">
        <p>
          🐉 <strong>{left}</strong> dragon{left === 1 ? '' : 's'} on the enchanted land
          <small className="muted">
            {' '}
            · beat {DRAGONS_TO_WIN} to win. Dots under a dragon: the knight strength it takes.
          </small>
        </p>
      </div>
    );
  }
  if (scenarioOf(ctx) === 'great-canal') {
    const total = canalHexes(ctx).length;
    // The canal is finished with one stretch still to dig.
    const needed = Math.max(1, total - 1);
    const dug = total - canalLeft(ctx);
    return (
      <div className="tda-status" aria-label="The Great Canal">
        {d.flooded ? (
          <p>
            💧 <strong>The canal is finished.</strong> The basin has flooded and the farmland grows
            grain again.
          </p>
        ) : (
          <p>
            ⛏️ Canal dug: <strong>{Math.min(dug, needed)}</strong> of {needed}
            <small className="muted">
              {' '}
              · two active knights beside a marked hex dig it for 2 points. Farmland stays dry until
              it's done.
            </small>
          </p>
        )}
        <div
          className="tda-meter canal"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={needed}
          aria-valuenow={Math.min(dug, needed)}
        >
          <span style={{ width: `${(100 * Math.min(dug, needed)) / needed}%` }} />
        </div>
      </div>
    );
  }
  if (scenarioOf(ctx) === 'greater-catan') {
    const bare = Object.values(ctx.state.hexes).filter(
      (h) =>
        !h.token &&
        h.type !== 'desert' &&
        ctx.registry.hexTypes[h.type]?.terrain === 'land' &&
        (!!ctx.registry.hexTypes[h.type]?.produces || h.type === 'gold'),
    ).length;
    return (
      <div className="tda-status" aria-label="Numbers">
        <p>
          🔢 <strong>{d.supply.length}</strong> number{d.supply.length === 1 ? '' : 's'} left in the
          pile
          <small className="muted">
            {' '}
            · {bare} new hex{bare === 1 ? '' : 'es'} still without a number
          </small>
        </p>
      </div>
    );
  }
  const chests = Object.values(ctx.state.pieces).filter((p) => p.type === 'treasure').length;
  return (
    <div className="tda-status" aria-label="Treasures">
      <p>
        🧰 <strong>{chests}</strong> chest{chests === 1 ? '' : 's'} left at sea
        {d.stack > 0 && <small className="muted"> · {d.stack} more hidden in the fog</small>}
      </p>
    </div>
  );
}
