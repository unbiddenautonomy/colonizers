import type { Action, ActionDef, Cards, Ctx, HexId } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { WONDER_IDS, wonderVp, type WonderId } from './wonders.ts';

/** World Wonders' shared state and helpers. */

export const MODULE_ID = 'world-wonders';

/** Pieces that stop a wonder going up while they stand on its hex. */
export const BLOCKERS = ['robber', 'pirate', 'dragon', 'gwpDragon'];

export interface Built {
  owner: number;
  hex: HexId;
  /** Stages built, 1 to 4. */
  stages: number;
}

export interface WonderData extends Record<string, unknown> {
  wonders: Partial<Record<WonderId, Built>>;
  /** Turn number of each player's last stage, so only one goes up a turn. */
  lastStage: Record<number, number>;
  /** Once-a-turn abilities used, by "seat:ability", with the turn number. */
  used: Record<string, number>;
  /** Resources of their choice that wonders owe players. */
  picks: Record<number, number>;
  /** Turn on which the Mausoleum's owner rolled a 6 or 8. */
  siege?: number;
  /** Turn on which the Temple of Artemis' owner rolled a 7. */
  amazons?: number;
}

export function wonderData(ctx: Ctx): WonderData {
  const d = ctx.data<WonderData>(MODULE_ID);
  d.wonders ??= {};
  d.lastStage ??= {};
  d.used ??= {};
  d.picks ??= {};
  return d;
}

/** Read-only view for screens and other modules (no data is created). */
export function builtWonders(ctx: Ctx): Partial<Record<WonderId, Built>> {
  return (ctx.state.data[MODULE_ID] as WonderData | undefined)?.wonders ?? {};
}

/** Stages of this wonder the player has built (0 if it isn't theirs). */
export function stagesOf(ctx: Ctx, seat: number, id: WonderId): number {
  const w = builtWonders(ctx)[id];
  return w && w.owner === seat ? w.stages : 0;
}

/** Does the player have this stage's ability? */
export function hasStage(ctx: Ctx, seat: number, id: WonderId, stage: number): boolean {
  return stagesOf(ctx, seat, id) >= stage;
}

export function wonderPoints(ctx: Ctx, seat: number): number {
  let n = 0;
  for (const [id, w] of Object.entries(builtWonders(ctx)))
    if (w?.owner === seat) n += wonderVp(id as WonderId, w.stages);
  return n;
}

export function finishedWonders(ctx: Ctx, seat: number): WonderId[] {
  return WONDER_IDS.filter((id) => stagesOf(ctx, seat, id) >= 4);
}

/** Is a robber, pirate or dragon on the hex? */
export function wonderBlocked(ctx: Ctx, hex: HexId): boolean {
  return ctx.piecesAt({ kind: 'hex', id: hex }).some((p) => BLOCKERS.includes(p.type));
}

export const stageItem = (id: WonderId, stage: number) => `wonder:${id}:${stage}`;

export type A<T> = Action & T;
export function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

export const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

export const isWonder = (w: unknown): w is WonderId =>
  typeof w === 'string' && (WONDER_IDS as readonly string[]).includes(w);

export const isResource = (c: unknown): c is string =>
  typeof c === 'string' && (RESOURCES as readonly string[]).includes(c);

export function usedThisTurn(ctx: Ctx, seat: number, ability: string): boolean {
  const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
  return d?.used?.[`${seat}:${ability}`] === ctx.state.turn.number;
}

export function markUsed(ctx: Ctx, seat: number, ability: string): void {
  wonderData(ctx).used[`${seat}:${ability}`] = ctx.state.turn.number;
}

/** One hex makes its cards, as if its number was rolled (for `only`, or everyone). */
export function produceHex(ctx: Ctx, hexId: HexId, only?: number): Record<number, Cards> {
  const hex = ctx.state.hexes[hexId];
  const received: Record<number, Cards> = {};
  if (!hex || hex.hidden) return received;
  const def = ctx.registry.hexTypes[hex.type];
  if (!def || def.terrain !== 'land') return received;
  const robbed = ctx.piecesAt({ kind: 'hex', id: hexId }).some((p) => p.type === 'robber');
  for (const corner of ctx.geometry.hexCorners.get(hexId) ?? []) {
    for (const piece of ctx.piecesAt({ kind: 'corner', id: corner })) {
      if (piece.owner === null || (only !== undefined && piece.owner !== only)) continue;
      if (ctx.reduce('hexBlocked', hex, piece, robbed)) continue;
      const pdef = ctx.registry.pieceTypes[piece.type];
      const base: Cards = {};
      if (def.produces && pdef?.production) base[def.produces] = pdef.production;
      for (const [card, n] of Object.entries(ctx.reduce('hexYield', hex, piece, base))) {
        const give = Math.min(n, ctx.state.bank[card] ?? 0);
        if (give <= 0) continue;
        ctx.grant(piece.owner, { [card]: give });
        const mine = (received[piece.owner] ??= {});
        mine[card] = (mine[card] ?? 0) + give;
      }
    }
  }
  return received;
}
