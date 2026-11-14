import type { Action, CornerId, Ctx, EdgeId, GameState, HexId, Piece } from '@colonizers/engine';
import type { Targets } from '../board/Board.tsx';
import { CostLine } from '../ui/Cards.tsx';

/** Soldiers & Armies on screen: mustering, marching, battles and the robber fight. */

export const soldiersOn = (state: GameState) => state.modules.includes('soldiers');

/** Steps where the player taps the board. */
export const SOLDIERS_BOARD_PHASES = ['campaign', 'battle', 'relocateMerchant'];

/** Cities & Knights card steps that move units here instead of knights. */
const CARD_PHASES = ['freeUnit', 'placeDeserterUnit', 'smith', 'intrigue', 'freeWall'];

export const SOLDIERS_MODES = [
  'musterInfantry',
  'musterCavalry',
  'musterArtillery',
  'cityWall',
  'nuke',
] as const;
export type SoldiersMode = (typeof SOLDIERS_MODES)[number];

const MUSTER: Record<string, string> = {
  musterInfantry: 'infantry',
  musterCavalry: 'cavalry',
  musterArtillery: 'artillery',
};

const UNIT_ICON: Record<string, string> = { infantry: '🗡️', cavalry: '🐎', artillery: '💣' };
const UNIT_NAME: Record<string, string> = {
  infantry: 'Infantry',
  cavalry: 'Cavalry',
  artillery: 'Artillery',
};

function units(p: Piece): { infantry: number; cavalry: number; artillery: number } {
  const n = (k: string) => (typeof p.props[k] === 'number' ? (p.props[k] as number) : 0);
  return { infantry: n('infantry'), cavalry: n('cavalry'), artillery: n('artillery') };
}

export function armyLabel(p: Piece): string {
  const u = units(p);
  const parts = (['artillery', 'cavalry', 'infantry'] as const)
    .filter((k) => u[k] > 0)
    .map((k) => `${u[k]} ${k}`);
  return `Army: ${parts.join(', ') || 'no units'}`;
}

const isSoldiersMode = (m: string | null): m is SoldiersMode =>
  m !== null && (SOLDIERS_MODES as readonly string[]).includes(m);

/**
 * What can be tapped. Mustering and walls tap one of your buildings. In the
 * field an army is two taps: the army, then where it marches or what it
 * attacks (the robber's field to fight the robber).
 */
export function soldiersTargets(
  state: GameState,
  legal: Action[],
  mode: string | null,
  selected: string | null,
): Targets | null {
  const t: Targets = {
    corners: new Map<CornerId, Action>(),
    edges: new Map<EdgeId, Action>(),
    hexes: new Map<HexId, Action>(),
  };
  const ph = state.phase.id;
  if (ph === 'main' && isSoldiersMode(mode)) {
    for (const a of legal) {
      const want =
        mode === 'cityWall'
          ? a.type === 'buildCityWall'
          : mode === 'nuke'
            ? a.type === 'buyNuke'
            : a.type === 'buyUnit' && a.unit === MUSTER[mode];
      if (want) t.corners.set(a.corner as CornerId, a);
    }
    return t;
  }
  if (CARD_PHASES.includes(ph)) {
    // A free unit or wall taps a building; Smith's step-ups also tap the army
    // (infantry first: the buttons offer cavalry too); Intrigue taps a rival army.
    for (const a of legal) {
      const army = state.pieces[a.army as string];
      const at =
        typeof a.corner === 'string' ? a.corner : army?.at.kind === 'corner' ? army.at.id : null;
      if (!at || (a.type === 'stepUpUnit' && t.corners.has(at as CornerId))) continue;
      t.corners.set(at as CornerId, a);
    }
    return t;
  }
  if (ph === 'battle') {
    for (const a of legal)
      if (a.type === 'battleRetreat' && a.to) t.corners.set(a.to as CornerId, a);
    return t;
  }
  if (ph === 'relocateMerchant') {
    for (const a of legal) if (a.type === 'relocateMerchant') t.hexes.set(a.hex as HexId, a);
    return t;
  }
  if (ph !== 'campaign') return null;
  const armyActions = legal.filter(
    (a) =>
      a.type === 'marchArmy' ||
      a.type === 'attack' ||
      a.type === 'attackRobber' ||
      a.type === 'attackMerchant',
  );
  const chosen = selected !== null && armyActions.some((a) => a.army === selected);
  // Without an army picked, a field the nuke can reach sets it off.
  if (!chosen) for (const a of legal) if (a.type === 'detonateNuke') t.hexes.set(a.hex as HexId, a);
  for (const a of armyActions) {
    if (!chosen) {
      const p = state.pieces[a.army as string];
      if (p?.at.kind === 'corner')
        t.corners.set(p.at.id, { type: 'selectKnight', player: a.player, knight: p.id });
      continue;
    }
    if (a.army !== selected) continue;
    if (a.type === 'marchArmy') t.corners.set(a.to as CornerId, a);
    // With your other armies next to the target joining in, where they can.
    if (a.type === 'attack') t.corners.set((a.target as { corner: CornerId }).corner, a);
    if (a.type === 'attackRobber' || a.type === 'attackMerchant') {
      const kind = a.type === 'attackRobber' ? 'robber' : 'merchant';
      const r = Object.values(state.pieces).find((p) => p.type === kind);
      if (r?.at.kind === 'hex') t.hexes.set(r.at.id, a);
    }
  }
  return t;
}

export function soldiersPrompt(
  state: GameState,
  who: string,
  actor: number | null,
  mode: string | null,
  selected: string | null,
): string | null {
  if (!soldiersOn(state)) return null;
  const ph = state.phase;
  const mine = actor === state.turn.player;
  const by = state.players[state.turn.player]?.name ?? 'A player';
  if (ph.id === 'main' && mine && isSoldiersMode(mode)) {
    if (mode === 'cityWall')
      return `${who}: tap one of your cities to wall it (up to three walls).`;
    if (mode === 'nuke')
      return `${who}: tap one of your settlements or cities for the nuke (6 ore, 5 grain and your 5 most plentiful other cards).`;
    return `${who}: tap one of your settlements or cities to muster ${MUSTER[mode]} there.`;
  }
  const defending = ph.defender === actor && actor !== null;
  switch (ph.id) {
    case 'campaign':
      if (!mine) return `${by}'s armies are in the field.`;
      return selected
        ? `${who}: tap where the army marches, or a rival army or building next to it to attack.`
        : `${who}: tap an army to march or attack with it${
            Object.values(state.pieces).some((p) => p.type === 'nuke' && p.owner === actor)
              ? ', tap a field to set off your nuke'
              : ''
          }, or end your turn.`;
    case 'battleCall':
      return defending
        ? `${who}: ${by} is attacking. Your armies next to the fight can join in.`
        : `${by} is attacking. The defender is calling up their armies.`;
    case 'battle':
      if (mine) return `${who}: roll again, or tap a corner to fall back.`;
      return defending
        ? `${by} is attacking you. Hold out, or capitulate.`
        : `${by} is fighting a battle.`;
    case 'relocateMerchant':
      return mine
        ? `${who}: the merchant is beaten. Tap a field to move it to.`
        : `${by} beat the merchant.`;
    case 'merchantToll':
      return mine
        ? `${who}: the merchant held. Give its owner two cards.`
        : `${by} lost to the merchant.`;
    case 'robberToll':
      return mine ? `${who}: the robber won. Hand over a resource.` : `${by} lost to the robber.`;
    case 'seaBattle':
      if (mine) return `${who}: fight on at sea, or break off.`;
      return defending ? `${by} is attacking your ship.` : `${by} is fighting at sea.`;
    case 'freeUnit':
      return mine
        ? `${who}: tap one of your settlements or cities to muster a free infantry.`
        : `${by} is mustering a free infantry.`;
    case 'placeDeserterUnit':
      return mine
        ? `${who}: tap one of your settlements or cities for the deserting ${ph.unit as string}.`
        : `${by} is placing a deserter.`;
    case 'smith':
      return mine
        ? `${who}: step one of your units up a level, or tap a settlement or city for a free infantry.`
        : `${by} is at the smithy.`;
    case 'intrigue':
      return mine
        ? `${who}: tap a rival army on your roads to take an infantry from it.`
        : `${by} is plotting an intrigue.`;
    case 'desertKnight':
      return (ph.owed as Record<number, number> | undefined)?.[actor ?? -1]
        ? `${who}: pick one of your units to desert to ${by}.`
        : 'Waiting for a unit to desert.';
    case 'freeWall':
      return mine ? `${who}: tap one of your cities for a free wall.` : `${by} is building a wall.`;
    default:
      return null;
  }
}

/** Main-turn buttons: muster units, build walls, take the free card, take the field. */
export function SoldiersActions({
  ctx,
  actor,
  legal,
  act,
  mode,
  setMode,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  mode: string | null;
  setMode: (m: SoldiersMode | null) => void;
}) {
  const has = (type: string, unit?: string) =>
    legal.some((a) => a.type === type && (unit === undefined || a.unit === unit));
  const toggle = (m: SoldiersMode) => setMode(mode === m ? null : m);
  return (
    <>
      {(['musterInfantry', 'musterCavalry', 'musterArtillery'] as const).map((m) => {
        const unit = MUSTER[m] as string;
        return (
          <button
            key={m}
            type="button"
            className={mode === m ? 'on' : ''}
            aria-pressed={mode === m}
            disabled={!has('buyUnit', unit)}
            onClick={() => toggle(m)}
            title={`Muster ${unit} at one of your settlements or cities`}
          >
            {UNIT_ICON[unit]} {UNIT_NAME[unit]} <CostLine cost={ctx.cost(unit, actor)} />
          </button>
        );
      })}
      <button
        type="button"
        className={mode === 'cityWall' ? 'on' : ''}
        aria-pressed={mode === 'cityWall'}
        disabled={!has('buildCityWall')}
        onClick={() => toggle('cityWall')}
        title="A wall adds 1 to a city's defence and keeps 2 more cards on a 7"
      >
        🧱 Wall <CostLine cost={ctx.cost('wall', actor)} />
      </button>
      <button
        type="button"
        className={mode === 'nuke' ? 'on' : ''}
        aria-pressed={mode === 'nuke'}
        disabled={!has('buyNuke')}
        onClick={() => toggle('nuke')}
        title="Once a game: set it off later on a field up to 6 away. The field makes nothing again, and its buildings drop a level."
      >
        ☢️ Nuke <small>(6 ore, 5 grain, +5 any)</small>
      </button>
      <button
        type="button"
        disabled={!has('drawFreeDevCard')}
        onClick={() => act({ type: 'drawFreeDevCard', player: actor })}
        title="After a turn without buying or playing anything: draw a development card, then march"
      >
        Free dev card
      </button>
      <button
        type="button"
        disabled={!has('takeTheField')}
        onClick={() => act({ type: 'takeTheField', player: actor })}
        title="Building is over: march and fight"
      >
        ⚔️ Take the field
      </button>
    </>
  );
}

/** Give up to another player: everything goes to them, and you finish on half your points. */
function Capitulate({
  state,
  actor,
  to,
  act,
}: {
  state: GameState;
  actor: number;
  to: number[];
  act: (a: Action) => void;
}) {
  if (!to.length) return null;
  return (
    <details className="soldiers-capitulate">
      <summary>🏳️ Capitulate</summary>
      {to.map((seat) => (
        <button
          key={seat}
          type="button"
          onClick={() => act({ type: 'capitulate', player: actor, to: seat })}
          title="Everything you have goes to them, and you finish on half your points"
        >
          to {state.players[seat]?.name ?? `Player ${seat + 1}`}
        </button>
      ))}
    </details>
  );
}

/** Buttons for a battle, the call to arms, the robber's toll and capitulating. */
export function SoldiersChoices({
  state,
  legal,
  act,
  actor,
}: {
  state: GameState;
  legal: Action[];
  act: (a: Action) => void;
  actor: number | null;
}) {
  if (!soldiersOn(state) || actor === null) return null;
  const ph = state.phase;
  const out = (state.data.soldiers as { out?: Record<string, unknown> } | undefined)?.out ?? {};
  if ((ph.id === 'battle' || ph.id === 'battleCall') && ph.defender === actor) {
    const calls = legal.filter((a) => a.type === 'answerBattleCall');
    return (
      <>
        {calls.map((a) => (
          <button
            key={String(a.join)}
            type="button"
            className={a.join ? 'primary' : ''}
            onClick={() => act(a)}
          >
            {a.join ? '⚔️ Join the fight' : 'Stay out'}
          </button>
        ))}
        <Capitulate state={state} actor={actor} to={[state.turn.player]} act={act} />
      </>
    );
  }
  const others = state.players.map((p) => p.seat).filter((s) => s !== actor && !out[String(s)]);
  const capitulate =
    (ph.id === 'main' || ph.id === 'campaign') &&
    actor === state.turn.player &&
    !out[String(actor)] ? (
      <Capitulate state={state} actor={actor} to={others} act={act} />
    ) : null;
  if (state.phase.id === 'seaBattle') {
    const roll = legal.find((a) => a.type === 'seaBattleRoll');
    const stop = legal.find((a) => a.type === 'seaBattleBreak');
    return (
      <>
        {roll && (
          <button type="button" className="primary" onClick={() => act(roll)}>
            🎲 Fight on
          </button>
        )}
        {stop && (
          <button type="button" onClick={() => act(stop)}>
            Break off
          </button>
        )}
      </>
    );
  }
  if (state.phase.id === 'battle') {
    const roll = legal.find((a) => a.type === 'battleRoll');
    const hold = legal.find((a) => a.type === 'battleRetreat' && a.to === null);
    const army = state.pieces[(state.phase.attackers as string[] | undefined)?.[0] ?? ''];
    return (
      <>
        {army && <span className="soldiers-army">{armyLabel(army)}</span>}
        {roll && (
          <button type="button" className="primary" onClick={() => act(roll)}>
            🎲 Fight on
          </button>
        )}
        {hold && (
          <button type="button" onClick={() => act(hold)}>
            Break off
          </button>
        )}
      </>
    );
  }
  if (state.phase.id === 'campaign') {
    const end = legal.find((a) => a.type === 'endTurn');
    return (
      <>
        {end && (
          <button type="button" className="primary" onClick={() => act(end)}>
            End turn
          </button>
        )}
        {capitulate}
      </>
    );
  }
  if (state.phase.id === 'merchantToll') {
    const pay = legal.find((a) => a.type === 'payMerchantToll');
    return pay ? (
      <button type="button" className="primary" onClick={() => act(pay)}>
        Give{' '}
        {Object.entries(pay.cards as Record<string, number>)
          .map(([c, n]) => `${n} ${c}`)
          .join(' and ')}
      </button>
    ) : null;
  }
  if (state.phase.id === 'smith' || state.phase.id === 'desertKnight') {
    const picks = legal.filter((a) => a.type === 'stepUpUnit' || a.type === 'desertUnit');
    return (
      <>
        {picks.map((a) => {
          const army = state.pieces[a.army as string];
          const unit = a.unit as string;
          const to = unit === 'infantry' ? 'cavalry' : 'artillery';
          const label =
            a.type === 'stepUpUnit'
              ? `${UNIT_ICON[unit]} → ${UNIT_ICON[to]} ${UNIT_NAME[unit]} to ${to}`
              : `${UNIT_ICON[unit]} Give up ${unit}`;
          return (
            <button
              key={`${a.army as string}-${unit}`}
              type="button"
              onClick={() => act(a)}
              title={army ? armyLabel(army) : undefined}
            >
              {label}
              {army && <small> ({armyLabel(army).replace('Army: ', '')})</small>}
            </button>
          );
        })}
      </>
    );
  }
  if (state.phase.id === 'robberToll')
    return (
      <>
        {legal
          .filter((a) => a.type === 'payRobberToll')
          .map((a) => (
            <button key={a.card as string} type="button" onClick={() => act(a)}>
              Give {a.card as string}
            </button>
          ))}
      </>
    );
  return capitulate;
}

/** Fields a nuke turned over, drawn like the other markers on a field. */
export function soldiersMarkers(state: GameState): {
  id: string;
  hex: HexId;
  owner: number | null;
  icon: string;
  label: string;
  dx: number;
  dy: number;
}[] {
  const nuked = (state.data.soldiers as { nuked?: Record<string, boolean> } | undefined)?.nuked;
  return Object.keys(nuked ?? {}).map((hex) => ({
    id: `nuked-${hex}`,
    hex: hex as HexId,
    owner: null,
    icon: '☢️',
    label: 'Nuked: this field makes nothing for the rest of the game',
    dx: 0,
    dy: 0.5,
  }));
}

/** An army beside its corner: a flag in its owner's colour, with how many units it has. */
export function ArmyFlag({
  x,
  y,
  color,
  army,
  theme,
}: {
  x: number;
  y: number;
  color: string;
  army: Piece;
  theme: { outline: string };
}) {
  const u = units(army);
  const n = u.infantry + u.cavalry + u.artillery;
  const k = 14;
  const best = u.artillery ? 'artillery' : u.cavalry ? 'cavalry' : 'infantry';
  return (
    <g>
      <line
        x1={x - k}
        y1={y + k * 1.2}
        x2={x - k}
        y2={y - k}
        stroke={theme.outline}
        strokeWidth={2.5}
      />
      <path
        d={`M${x - k},${y - k} h${k * 2.2} l${-k * 0.5},${k * 0.6} l${k * 0.5},${k * 0.6} h${-k * 2.2} z`}
        fill={color}
        stroke={theme.outline}
        strokeWidth={1.5}
      />
      <text
        x={x}
        y={y + k * 0.05}
        textAnchor="middle"
        fontSize={k * 0.9}
        fontWeight={700}
        fill="#fff"
        stroke={theme.outline}
        strokeWidth={0.6}
      >
        {n}
      </text>
      <text x={x - k * 1.6} y={y + k * 1.2} textAnchor="middle" fontSize={k * 0.9}>
        {UNIT_ICON[best]}
      </text>
      <title>{armyLabel(army)}</title>
    </g>
  );
}
