import { SPECIAL_MAPS } from '@colonizers/maps';
import {
  DISCARD_LIMITS,
  resolvedTurnMode,
  ROBBER_FREE_ROUNDS,
  TURN_MODES,
  type GameOptions,
  type TurnModeChoice,
} from '../../../server/src/protocol.ts';

const TURN_MODE_NAME: Record<TurnModeChoice, string> = {
  auto: 'Automatic',
  normal: 'Normal turns',
  specialBuild: 'Special Building Phase',
  paired: 'Paired turns',
};

const TURN_MODE_TEXT = {
  normal: 'One player at a time.',
  specialBuild: 'After each turn, everyone else may build in order (no trading or cards).',
  paired: 'The player across the table may build and trade with the bank during your turn.',
};

/** Game options and house rules, shared by the lobby and games on one device. */
export function OptionsPanel({
  options,
  players,
  citiesKnights,
  onChange,
}: {
  options: GameOptions;
  players: number;
  citiesKnights: boolean;
  onChange: (o: GameOptions) => void;
}) {
  const set = (patch: Partial<GameOptions>) => onChange({ ...options, ...patch });
  const mode = resolvedTurnMode(options, players);
  return (
    <details className="options">
      <summary>Options and house rules</summary>
      <label>
        Turns{' '}
        <select
          value={options.turnMode}
          onChange={(e) => set({ turnMode: e.target.value as TurnModeChoice })}
        >
          {TURN_MODES.map((m) => (
            <option key={m} value={m} disabled={m === 'paired' && players < 4}>
              {TURN_MODE_NAME[m]}
            </option>
          ))}
        </select>{' '}
        <small className="muted">
          {options.turnMode === 'auto' ? `${TURN_MODE_NAME[mode]}: ` : ''}
          {TURN_MODE_TEXT[mode]}
        </small>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={options.friendlyRobber}
          onChange={(e) => set({ friendlyRobber: e.target.checked })}
        />{' '}
        Friendly robber: it can't go next to a player with 2 or fewer points
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={options.balancedDice && !citiesKnights}
          disabled={citiesKnights}
          onChange={(e) => set({ balancedDice: e.target.checked })}
        />{' '}
        Balanced dice: every result comes up as often as the odds say
        {citiesKnights && <small className="muted"> (not with Cities &amp; Knights)</small>}
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={options.gifting}
          onChange={(e) => set({ gifting: e.target.checked })}
        />{' '}
        Gifts: give cards to another player on your turn
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={options.firstSettlementPays}
          onChange={(e) => set({ firstSettlementPays: e.target.checked })}
        />{' '}
        Both starting settlements pay resources
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={options.harbormaster}
          onChange={(e) => set({ harbormaster: e.target.checked })}
        />{' '}
        ⚓ Harbormaster: 2 points for the most buildings on harbors (3 points' worth or more)
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={options.eventCards}
          disabled={citiesKnights}
          onChange={(e) => set({ eventCards: e.target.checked })}
        />{' '}
        🃏 Event cards instead of dice: numbers spread like the dice, with events
        {citiesKnights && <small className="muted"> (not with Cities &amp; Knights)</small>}
      </label>
      <div className="row wrap">
        <label>
          Quiet start{' '}
          <select
            value={options.robberFreeRounds}
            onChange={(e) => set({ robberFreeRounds: Number(e.target.value) })}
          >
            {ROBBER_FREE_ROUNDS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Off' : `7s do nothing for ${n} round${n === 1 ? '' : 's'}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Discard above{' '}
          <select
            value={options.discardLimit}
            onChange={(e) => set({ discardLimit: Number(e.target.value) })}
          >
            {DISCARD_LIMITS.map((n) => (
              <option key={n} value={n}>
                {n} cards
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}

/** Buttons for the special maps that fit this many players. */
export function SpecialMapButtons({
  players,
  selected,
  onPick,
}: {
  players: number;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const maps = SPECIAL_MAPS.filter((m) => players >= m.players.min && players <= m.players.max);
  if (!maps.length) return null;
  const groups = [
    { title: 'Special maps', maps: maps.filter((m) => !m.group) },
    { title: 'Traders & Barbarians', maps: maps.filter((m) => m.group === 'traders') },
  ];
  return (
    <>
      {groups
        .filter((g) => g.maps.length)
        .map((g) => (
          <div key={g.title}>
            <h3 className="subhead">{g.title}</h3>
            <div className="row wrap">
              {g.maps.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={selected === m.id ? 'on' : ''}
                  title={m.description}
                  onClick={() => onPick(m.id)}
                >
                  {SPECIAL_ICON[m.id] ?? '🗺️'} {m.name}
                </button>
              ))}
            </div>
          </div>
        ))}
    </>
  );
}

export const SPECIAL_ICON: Record<string, string> = {
  'gold-rush': '🪙',
  volcano: '🌋',
  'deep-forest': '🌲',
  lakes: '💧',
  diamond: '🔷',
  twirl: '🌀',
  ring: '⭕',
  mini: '🔹',
  fishermen: '🐟',
  rivers: '🌊',
};

/** The options that differ from the standard rules, in words, for players who aren't the host. */
export function describeOptions(o: GameOptions, players: number): string[] {
  const out: string[] = [];
  const mode = resolvedTurnMode(o, players);
  if (mode !== 'normal') out.push(TURN_MODE_NAME[mode]);
  if (o.friendlyRobber) out.push('Friendly robber');
  if (o.balancedDice) out.push('Balanced dice');
  if (o.gifting) out.push('Gifts allowed');
  if (o.firstSettlementPays) out.push('Both starting settlements pay');
  if (o.harbormaster) out.push('Harbormaster');
  if (o.eventCards) out.push('Event cards');
  if (o.robberFreeRounds) out.push(`7s do nothing for ${o.robberFreeRounds} round(s)`);
  if (o.discardLimit !== 7) out.push(`Discard above ${o.discardLimit} cards`);
  return out;
}
