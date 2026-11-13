import type { Action, ActionDef, Ctx, HexState, Piece } from '@colonizers/engine';
import { MODULE_ID } from './constants.ts';

/**
 * Beer festivals: on your turn, spend Beer to hold a festival that ties up
 * another player until your next production roll is worked out. One festival
 * per player at a time.
 *
 * - Road or ship festival (2 Beer): no roads, or no ships.
 * - Knight festival (3 Beer): no new knights, or no activating knights.
 * - Settlement festival (4 Beer): their settlements produce nothing.
 * - City festival (5 Beer): no city improvements.
 */

export const FESTIVALS = {
  roads: { cost: 2, name: 'Road festival', blocks: ['buildRoad'] },
  ships: { cost: 2, name: 'Ship festival', blocks: ['buildShip'] },
  knights: { cost: 3, name: 'Knight festival', blocks: ['buildKnight'] },
  activation: { cost: 3, name: 'Knight festival', blocks: ['activateKnight', 'beerKnight'] },
  settlements: { cost: 4, name: 'Settlement festival', blocks: [] as string[] },
  cities: { cost: 5, name: 'City festival', blocks: ['improveCity'] },
} as const;

export type FestivalKind = keyof typeof FESTIVALS;

export interface Festival {
  by: number;
  target: number;
  kind: FestivalKind;
  /** Turn it started on: it ends after the starter's next production roll. */
  turn: number;
}

interface FestivalData extends Record<string, unknown> {
  festivals?: Festival[];
}

export function festivals(ctx: Ctx): Festival[] {
  return (ctx.data<FestivalData>(MODULE_ID).festivals ??= []);
}

function beerOf(ctx: Ctx, seat: number): number {
  const d = ctx.state.data[MODULE_ID] as { beer?: Record<number, number> } | undefined;
  return d?.beer?.[seat] ?? 0;
}

function spendBeer(ctx: Ctx, seat: number, n: number): void {
  const d = ctx.data<{ beer?: Record<number, number> }>(MODULE_ID);
  d.beer ??= {};
  d.beer[seat] = Math.max(0, (d.beer[seat] ?? 0) - n);
}

const isKind = (k: unknown): k is FestivalKind => typeof k === 'string' && k in FESTIVALS;

const startFestival: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!isKind(a.kind)) return 'Pick a festival';
    const t = a.target;
    if (!Number.isInteger(t) || t === a.player || !ctx.state.players[t as number])
      return 'Pick another player';
    if (a.kind === 'ships' && !ctx.registry.actions.buildShip) return 'There are no ships';
    if (festivals(ctx).some((f) => f.by === a.player)) return 'You already have a festival going';
    const cost = FESTIVALS[a.kind].cost;
    return beerOf(ctx, a.player) >= cost ? null : `That festival costs ${cost} Beer`;
  },
  apply(ctx, a) {
    const kind = a.kind as FestivalKind;
    spendBeer(ctx, a.player, FESTIVALS[kind].cost);
    festivals(ctx).push({
      by: a.player,
      target: a.target as number,
      kind,
      turn: ctx.state.turn.number,
    });
    ctx.emit({ type: 'festival', player: a.player, target: a.target, kind });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    for (const kind of Object.keys(FESTIVALS) as FestivalKind[])
      for (const p of ctx.state.players)
        if (p.seat !== player) out.push({ type: 'startFestival', player, kind, target: p.seat });
    return out;
  },
};

export const festivalActions: Record<string, ActionDef> = { startFestival };

/** Why a festival stops this action, if one does. */
export function festivalBlock(ctx: Ctx, a: Action): string | null {
  for (const f of festivals(ctx)) {
    if (f.target !== a.player) continue;
    if ((FESTIVALS[f.kind].blocks as readonly string[]).includes(a.type))
      return `${FESTIVALS[f.kind].name}: you can't do that until it ends`;
  }
  return null;
}

/** Settlement festival: the target's settlements make nothing. */
export function festivalBlocksYield(
  ctx: Ctx,
  _hex: HexState,
  piece: Piece,
  value: boolean,
): boolean {
  if (value || piece.type !== 'settlement') return value;
  return festivals(ctx).some((f) => f.kind === 'settlements' && f.target === piece.owner);
}

/** A festival ends once its starter's next production roll is worked out. */
export function endFestivals(ctx: Ctx): void {
  if (!ctx.events.some((e) => e.type === 'production')) return;
  const list = festivals(ctx);
  const left = list.filter((f) => !(f.by === ctx.active && f.turn < ctx.state.turn.number));
  if (left.length === list.length) return;
  for (const f of list)
    if (!left.includes(f))
      ctx.emit({ type: 'festivalOver', player: f.by, target: f.target, kind: f.kind });
  list.splice(0, list.length, ...left);
}

/** Raven Flight can stop a festival: the one aimed at the player, or else the oldest. */
export function stopFestival(ctx: Ctx, seat: number): boolean {
  const list = festivals(ctx);
  const i = Math.max(
    0,
    list.findIndex((f) => f.target === seat),
  );
  const f = list[i];
  if (!f) return false;
  list.splice(i, 1);
  ctx.emit({ type: 'festivalOver', player: f.by, target: f.target, kind: f.kind, stopped: seat });
  return true;
}

/** Wraps an action so festivals can stop it. */
export function guardFestival(prev: ActionDef): ActionDef {
  return { ...prev, check: (ctx, a) => festivalBlock(ctx, a) ?? prev.check(ctx, a) };
}
