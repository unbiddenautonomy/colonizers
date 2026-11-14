import type { Action, CornerId, Ctx, EdgeId, GameState, HexId, Piece } from '@colonizers/engine';
import type { Targets } from '../board/Board.tsx';
import { CostLine } from '../ui/Cards.tsx';

/** Soldiers & Armies on screen: mustering, marching, battles and the robber fight. */

export const soldiersOn = (state: GameState) => state.modules.includes('soldiers');

/** Steps where the player taps the board. */
export const SOLDIERS_BOARD_PHASES = ['campaign', 'battle'];

export const SOLDIERS_MODES = [
  'musterInfantry',
  'musterCavalry',
  'musterArtillery',
  'wall',
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
      if (
        mode === 'wall' ? a.type === 'buildWall' : a.type === 'buyUnit' && a.unit === MUSTER[mode]
      )
        t.corners.set(a.corner as CornerId, a);
    }
    return t;
  }
  if (ph === 'battle') {
    for (const a of legal)
      if (a.type === 'battleRetreat' && a.to) t.corners.set(a.to as CornerId, a);
    return t;
  }
  if (ph !== 'campaign') return null;
  const armyActions = legal.filter(
    (a) => a.type === 'marchArmy' || a.type === 'attack' || a.type === 'attackRobber',
  );
  const chosen = selected !== null && armyActions.some((a) => a.army === selected);
  for (const a of armyActions) {
    if (!chosen) {
      const p = state.pieces[a.army as string];
      if (p?.at.kind === 'corner')
        t.corners.set(p.at.id, { type: 'selectKnight', player: a.player, knight: p.id });
      continue;
    }
    if (a.army !== selected) continue;
    if (a.type === 'marchArmy') t.corners.set(a.to as CornerId, a);
    if (a.type === 'attack') t.corners.set((a.target as { corner: CornerId }).corner, a);
    if (a.type === 'attackRobber') {
      const r = Object.values(state.pieces).find((p) => p.type === 'robber');
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
  if (ph.id === 'main' && mine && isSoldiersMode(mode))
    return mode === 'wall'
      ? `${who}: tap one of your cities to wall it (up to three walls).`
      : `${who}: tap one of your settlements or cities to muster ${MUSTER[mode]} there.`;
  switch (ph.id) {
    case 'campaign':
      if (!mine) return `${by}'s armies are in the field.`;
      return selected
        ? `${who}: tap where the army marches, or a rival army or building next to it to attack.`
        : `${who}: tap an army to march or attack with it, or end your turn.`;
    case 'battle':
      return mine
        ? `${who}: roll again, or tap a corner to fall back.`
        : `${by} is fighting a battle.`;
    case 'robberToll':
      return mine ? `${who}: the robber won. Hand over a resource.` : `${by} lost to the robber.`;
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
        className={mode === 'wall' ? 'on' : ''}
        aria-pressed={mode === 'wall'}
        disabled={!has('buildWall')}
        onClick={() => toggle('wall')}
        title="A wall adds 1 to a city's defence and keeps 2 more cards on a 7"
      >
        🧱 Wall <CostLine cost={ctx.cost('wall', actor)} />
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

/** Buttons for a battle and the robber's toll. */
export function SoldiersChoices({
  state,
  legal,
  act,
}: {
  state: GameState;
  legal: Action[];
  act: (a: Action) => void;
}) {
  if (state.phase.id === 'battle') {
    const roll = legal.find((a) => a.type === 'battleRoll');
    const hold = legal.find((a) => a.type === 'battleRetreat' && a.to === null);
    const army = state.pieces[state.phase.army as string];
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
    return end ? (
      <button type="button" className="primary" onClick={() => act(end)}>
        End turn
      </button>
    ) : null;
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
  return null;
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
