import type { ReactNode } from 'react';
import { SPECIAL_MAPS } from '@colonizers/maps';
import { boardFit, type Fit } from '../game/boardFit.ts';
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
  gwp = false,
  wonders = false,
  robber = true,
  dragons = false,
  onChange,
}: {
  options: GameOptions;
  players: number;
  citiesKnights: boolean;
  /** Greed, Wealth & Power is on: show its options. */
  gwp?: boolean;
  /** World Wonders is on: show its options. */
  wonders?: boolean;
  /** False on maps with no robber: robber options are hidden. */
  robber?: boolean;
  /** The Desert Dragons map: show its option. */
  dragons?: boolean;
  onChange: (o: GameOptions) => void;
}) {
  const set = (patch: Partial<GameOptions>) => onChange({ ...options, ...patch });
  const mode = resolvedTurnMode(options, players);
  const toggle = (key: keyof GameOptions, label: ReactNode) => (
    <label className="toggle">
      <input
        type="checkbox"
        checked={options[key] === true}
        onChange={(e) => set({ [key]: e.target.checked })}
      />{' '}
      {label}
    </label>
  );
  return (
    <div className="options">
      <div className="option-group">
        <h3 className="subhead">Turns and limits</h3>
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
          </select>{' '}
          <small className="muted">when a 7 is rolled</small>
        </label>
      </div>
      <div className="option-group">
        <h3 className="subhead">{robber ? 'Robber and dice' : 'Dice'}</h3>
        {dragons &&
          toggle(
            'dragonRelief',
            '🐉 Dragon relief: if a dragon blocks your field on a roll, take 1 random resource',
          )}
        {robber &&
          toggle(
            'friendlyRobber',
            "Friendly robber: it can't go next to a player with 2 or fewer points",
          )}
        {robber &&
          toggle(
            'robberHome',
            'Robber goes home: it blocks a hex for one turn, then goes back to the desert',
          )}
        {robber && (
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
        )}
        {citiesKnights ? (
          <p className="muted small">
            Cities &amp; Knights rolls its own three dice, so balanced dice and event cards are off.
          </p>
        ) : (
          <>
            {toggle(
              'balancedDice',
              'Balanced dice: every result comes up as often as the odds say',
            )}
            {toggle(
              'eventCards',
              '🃏 Event cards instead of dice: numbers spread like the dice, with events',
            )}
          </>
        )}
      </div>
      <div className="option-group">
        <h3 className="subhead">Cards and trading</h3>
        {toggle('gifting', 'Gifts: give cards to another player on your turn')}
        {toggle(
          'openTrading',
          "Open trading: anyone can offer a trade on anyone's turn, one offer at a time",
        )}
        {toggle('firstSettlementPays', 'Both starting settlements pay resources')}
        {toggle(
          'harbormaster',
          "⚓ Harbormaster: 2 points for the most buildings on harbors (3 points' worth or more)",
        )}
      </div>
      {players === 2 && (
        <div className="option-group">
          <h3 className="subhead">Two players</h3>
          {citiesKnights ? (
            <p className="muted small">Duel rules don't mix with Cities &amp; Knights.</p>
          ) : (
            toggle(
              'twoPlayer',
              '⚔️ Duel rules: two neutral builders, two rolls a turn, and trade tokens',
            )
          )}
        </div>
      )}
      {gwp && (
        <div className="option-group">
          <h3 className="subhead">Greed, Wealth &amp; Power</h3>
          {toggle(
            'gwpRiver',
            '🏞️ The river: swampland and three river hexes take the place of the desert, an ore, a brick and a wool hex. Monuments can stand on the river.',
          )}
        </div>
      )}
      {wonders && (
        <div className="option-group">
          <h3 className="subhead">World Wonders</h3>
          {toggle('wonderOptional', '🏛️ Win on points alone, without a finished wonder')}
        </div>
      )}
    </div>
  );
}

/** Buttons for the special maps that fit this many players. */
export function SpecialMapButtons({
  players,
  selected,
  onPick,
  seats,
}: {
  players: number;
  selected: string | null;
  onPick: (id: string) => void;
  /**
   * The seats the room has, in a lobby where players are still arriving. With
   * it, every map is shown and the ones that do not fit are greyed out, rather
   * than hidden: a host alone in a new room would otherwise see almost none.
   */
  seats?: number;
}) {
  const maps =
    seats === undefined
      ? SPECIAL_MAPS.filter((m) => players >= m.players.min && players <= m.players.max)
      : SPECIAL_MAPS;
  if (!maps.length) return null;
  const groups = [
    { title: 'Special maps', maps: maps.filter((m) => !m.group) },
    { title: 'Traders & Barbarians', maps: maps.filter((m) => m.group === 'traders') },
    {
      title: 'Treasures, Dragons & Adventurers',
      maps: maps.filter((m) => m.group === 'treasures'),
    },
    { title: 'Explorers & Pirates', maps: maps.filter((m) => m.group === 'explorers') },
  ];
  return (
    <>
      {groups
        .filter((g) => g.maps.length)
        .map((g) => (
          <div key={g.title}>
            <h3 className="subhead">{g.title}</h3>
            <div className="row wrap">
              {g.maps.map((m) => {
                const fit =
                  seats === undefined ? ({ ok: true } as Fit) : boardFit(m.players, players, seats);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={selected === m.id ? 'on' : ''}
                    disabled={!fit.ok}
                    title={fit.ok ? m.description : `${fit.why}. ${m.description}`}
                    onClick={() => onPick(m.id)}
                  >
                    {SPECIAL_ICON[m.id] ?? '🗺️'} {m.name}
                    {!fit.ok && <small> {fit.why}</small>}
                    {fit.ok && fit.waiting && <small> {fit.waiting}</small>}
                  </button>
                );
              })}
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
  world: '🌍',
  fishermen: '🐟',
  rivers: '🌊',
  caravans: '🐪',
  barbarians: '🪓',
  traders: '🛒',
  'treasure-islands': '🧰',
  'into-the-unknown': '🧭',
  'greater-catan': '🔢',
  'desert-dragons': '🐉',
  'enchanted-land': '🔮',
  'great-canal': '⛏️',
  'land-ho': '🔭',
  'pirate-lairs': '🏴‍☠️',
  'fishing-grounds': '🐟',
  'spice-islands': '🌶️',
  'full-voyage': '🗺️',
};

/** Icons for the Seafarers scenarios. */
export const SEA_ICON: Record<string, string> = {
  'new-shores': '⛵',
  'four-islands': '🏝️',
  'fog-islands': '🌫️',
  archipelago: '🗾',
};

/** Icons for the fixed maps. */
export const PRESET_ICON: Record<string, string> = {
  starter: '🧭',
  'classic-5-6': '🗺️',
  'big-7-8': '🌍',
};

/** The options that differ from the standard rules, in words, for players who aren't the host. */
export function describeOptions(
  o: GameOptions,
  players: number,
  gwp = false,
  wonders = false,
): string[] {
  const out: string[] = [];
  const mode = resolvedTurnMode(o, players);
  if (mode !== 'normal') out.push(TURN_MODE_NAME[mode]);
  if (o.friendlyRobber) out.push('Friendly robber');
  if (o.robberHome) out.push('Robber goes home after each turn');
  if (o.openTrading) out.push('Anyone can offer trades');
  if (o.balancedDice) out.push('Balanced dice');
  if (o.gifting) out.push('Gifts allowed');
  if (o.firstSettlementPays) out.push('Both starting settlements pay');
  if (o.harbormaster) out.push('Harbormaster');
  if (o.eventCards) out.push('Event cards');
  if (gwp && o.gwpRiver) out.push('The river (Greed, Wealth & Power)');
  if (wonders && o.wonderOptional) out.push('No wonder needed to win');
  if (o.dragonRelief) out.push('Dragon relief');
  if (o.twoPlayer && players === 2) out.push('Duel rules');
  if (o.robberFreeRounds) out.push(`7s do nothing for ${o.robberFreeRounds} round(s)`);
  if (o.discardLimit !== 7) out.push(`Discard above ${o.discardLimit} cards`);
  return out;
}
