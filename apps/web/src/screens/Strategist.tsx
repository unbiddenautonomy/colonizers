import type { Action, CornerId, Ctx, GameState, HexId } from '@colonizers/engine';
import { duke, scholar, scholarWorks } from '@colonizers/module-strategist';
import type { Targets } from '../board/Board.tsx';

/** Strategist & Commander on screen: the Junker, the Duke, the Scholar, and the ship rule. */

export const strategistOn = (state: GameState) => state.modules.includes('strategist');

/** Putting down the Junker, the Duke or the Scholar: tap the field, knight or building. */
export const SF_BOARD_PHASES = ['placeJunker', 'placeSfDuke', 'placeSfScholar'];

export type StrategistMode = 'sfHold' | 'sfHurry';
export const SF_MODES: readonly string[] = ['sfHold', 'sfHurry'];

const name = (state: GameState, seat: unknown) =>
  typeof seat === 'number' ? (state.players[seat]?.name ?? `Player ${seat + 1}`) : 'someone';

export function sfPhasePrompt(state: GameState, who: string): string | null {
  switch (state.phase.id) {
    case 'placeJunker':
      return `${who}: doubles! Put the Junker on a land field. It freezes the field and hides it from the barbarians.`;
    case 'placeSfDuke':
      return `${who}: tap a knight for the Duke. Your own gets 1 stronger, a rival’s 1 weaker.`;
    case 'placeSfScholar':
      return `${who}: tap a settlement or city for the Scholar. You get what it makes again, until the barbarians land.`;
  }
  return null;
}

export function sfModePrompt(who: string, mode: string): string | null {
  if (mode === 'sfHold')
    return `${who}: tap an active strong or mighty knight. It steps down and holds the barbarians back a step.`;
  if (mode === 'sfHurry')
    return `${who}: tap an active strong or mighty knight. It steps down and brings the barbarians a step closer.`;
  return null;
}

export function sfTargets(state: GameState, legal: Action[], mode: StrategistMode): Targets {
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  const steps = mode === 'sfHold' ? -1 : 1;
  for (const a of legal) {
    if (a.type !== 'shiftBarbarians' || a.steps !== steps) continue;
    const k = state.pieces[a.knight as string];
    if (k?.at.kind === 'corner') t.corners.set(k.at.id, a);
  }
  return t;
}

export function StrategistActions({
  legal,
  mode,
  setMode,
}: {
  legal: Action[];
  mode: string | null;
  setMode: (m: StrategistMode | null) => void;
}) {
  const can = (steps: number) =>
    legal.some((a) => a.type === 'shiftBarbarians' && a.steps === steps);
  if (!can(1) && !can(-1)) return null;
  const button = (m: StrategistMode, label: string, ok: boolean, title: string) => (
    <button
      key={m}
      type="button"
      className={mode === m ? 'on' : ''}
      aria-pressed={mode === m}
      disabled={!ok}
      onClick={() => setMode(mode === m ? null : m)}
      title={title}
    >
      {label}
    </button>
  );
  return (
    <>
      {button(
        'sfHold',
        '⏪ Hold the barbarians',
        can(-1),
        'Deactivate a strong or mighty knight to move the barbarian ship a step back',
      )}
      {button(
        'sfHurry',
        '⏩ Hurry the barbarians',
        can(1),
        'Deactivate a strong or mighty knight to move the barbarian ship a step forward',
      )}
    </>
  );
}

/** The Junker, on its field. */
export function sfHexMarkers(state: GameState): {
  id: string;
  hex: HexId;
  owner: number | null;
  icon: string;
  label: string;
  dx: number;
  dy: number;
}[] {
  if (!strategistOn(state)) return [];
  const j = Object.values(state.pieces).find((p) => p.type === 'junker');
  if (j?.at.kind !== 'hex') return [];
  return [
    {
      id: j.id,
      hex: j.at.id,
      owner: null,
      icon: '🎩',
      label:
        'The Junker: nothing is built or moved on this field, and the barbarians don’t see its knights and cities',
      dx: 0,
      dy: -0.5,
    },
  ];
}

/** The Duke beside its knight and the Scholar beside its building. */
export function sfCornerMarkers(state: GameState): {
  key: string;
  at: string;
  icon: string;
  owner: number | null;
  title: string;
  slot: -1 | 0 | 1;
}[] {
  if (!strategistOn(state)) return [];
  const out: ReturnType<typeof sfCornerMarkers> = [];
  for (const p of Object.values(state.pieces)) {
    if (p.at.kind !== 'corner') continue;
    if (typeof p.props.duke === 'number') {
      const own = p.props.duke === p.owner;
      out.push({
        key: 'sf-duke',
        at: p.at.id as CornerId,
        icon: '🎖️',
        owner: p.props.duke,
        slot: 1,
        title: `${name(state, p.props.duke)}’s Duke: this knight is 1 ${own ? 'stronger (3 at most)' : 'weaker (1 at least)'}`,
      });
    }
    const m = p.props.scholar as { owner: number } | undefined;
    if (m && typeof m.owner === 'number')
      out.push({
        key: 'sf-scholar',
        at: p.at.id as CornerId,
        icon: '🎓',
        owner: m.owner,
        slot: -1,
        title: `${name(state, m.owner)}’s Scholar: they get what this makes again, until the barbarians land`,
      });
  }
  return out;
}

/** The Duke and the Scholar, for the player list. */
export function StrategistStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const d = duke(ctx);
  const s = scholar(ctx);
  const hasDuke = d?.owner === seat;
  const hasScholar = s?.mark.owner === seat && scholarWorks(ctx, s.mark);
  if (!hasDuke && !hasScholar) return null;
  return (
    <small className="muted" title="Neutral pieces score no points">
      {hasDuke ? '🎖️ Duke' : ''}
      {hasDuke && hasScholar ? ' · ' : ''}
      {hasScholar ? '🎓 Scholar' : ''}
    </small>
  );
}
