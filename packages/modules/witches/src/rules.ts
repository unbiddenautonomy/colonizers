import type { Cards, CornerId, Ctx, HexId, HexState, Piece } from '@colonizers/engine';
import { robber } from '@colonizers/module-base';
import { isActive, knightsOf, seatAt } from '@colonizers/module-cities-knights';
import { MODULE_ID, WIZARD } from './constants.ts';

/**
 * Witches, Wizards & Dragons' board rules: the Wizard, the Witch's Spell,
 * Magic Power and Magic Fortune.
 */

export interface WitchesData extends Record<string, unknown> {
  /** Witch's Spell: the player whose knights stay down until turn `until`. */
  spell?: { target: number; until: number } | null;
  /** Magic Power: seats whose knights count double in the next attack. */
  power?: number[];
  /** Magic Fortune: a settlement this turn costs less by these cards. */
  fortune?: { seat: number; turn: number; waive: Cards } | null;
}

export function witchesData(ctx: Ctx): WitchesData {
  return ctx.data<WitchesData>(MODULE_ID);
}

export function witchesView(ctx: Ctx): Partial<WitchesData> {
  return (ctx.state.data[MODULE_ID] as WitchesData | undefined) ?? {};
}

// ---- The Wizard ----

export const wizardPiece = (ctx: Ctx): Piece | undefined => ctx.piecesOfType(WIZARD)[0];

/** Who placed the Wizard (and scores its point). */
export function wizardOwner(ctx: Ctx): number | null {
  const w = wizardPiece(ctx);
  return typeof w?.props.by === 'number' ? w.props.by : null;
}

/** The Wizard's corner, and the building it guards. */
function guarded(ctx: Ctx): { corner: CornerId; by: number } | null {
  const w = wizardPiece(ctx);
  if (!w || w.at.kind !== 'corner' || typeof w.props.by !== 'number') return null;
  return { corner: w.at.id, by: w.props.by };
}

/** Church, Faith & Reformation's Inquisitor, when it is in the game. */
export const inquisitorAt = (ctx: Ctx): CornerId | null =>
  (ctx.state.data.church as { inquisitor?: CornerId | null } | undefined)?.inquisitor ?? null;

/** Own settlements and cities the Wizard may go to: not a Diocese, not the Inquisitor's. */
export function wizardSpots(ctx: Ctx, seat: number): CornerId[] {
  const now = guarded(ctx)?.corner;
  const inquisitor = inquisitorAt(ctx);
  return ctx
    .piecesOf(seat)
    .flatMap((p) =>
      (p.type === 'settlement' || p.type === 'city') &&
      p.at.kind === 'corner' &&
      seatAt(p) !== 'diocese' &&
      p.at.id !== inquisitor &&
      p.at.id !== now
        ? [p.at.id]
        : [],
    );
}

export function placeWizard(ctx: Ctx, seat: number, corner: CornerId): void {
  const w = wizardPiece(ctx);
  if (w) {
    w.props.by = seat;
    ctx.move(w, { kind: 'corner', id: corner });
  } else ctx.place(WIZARD, null, { kind: 'corner', id: corner }, { by: seat });
  ctx.emit({ type: 'wizardPlaced', player: seat, at: corner });
}

/** The Wizard leaves when its building is lost, becomes a Diocese, or meets the Inquisitor. */
export function syncWizard(ctx: Ctx): void {
  const g = guarded(ctx);
  const w = wizardPiece(ctx);
  if (!w) return;
  const b = g ? ctx.buildingAt(g.corner) : undefined;
  if (g && b && b.owner === g.by && seatAt(b) !== 'diocese' && inquisitorAt(ctx) !== g.corner)
    return;
  ctx.remove(w);
  ctx.emit({ type: 'wizardGone', player: g?.by ?? null });
}

/** Does the Wizard guard this building? */
function guards(ctx: Ctx, piece: Piece): boolean {
  const g = guarded(ctx);
  return !!g && piece.at.kind === 'corner' && piece.at.id === g.corner && piece.owner === g.by;
}

/** The Wizard's building produces even with the robber next to it. */
export function wizardUnblocks(ctx: Ctx, hex: HexState, piece: Piece, value: boolean): boolean {
  if (!value || !guards(ctx, piece)) return value;
  const r = robber(ctx);
  return !(r?.at.kind === 'hex' && r.at.id === hex.id);
}

/** Nor can the robber's mover take a card through it. */
export function wizardRobbable(ctx: Ctx, building: Piece, _hex: HexId, value: boolean): boolean {
  return value && !guards(ctx, building);
}

// ---- Witch's Spell ----

export function spellOn(ctx: Ctx, seat: number): boolean {
  const s = witchesView(ctx).spell;
  return !!s && s.target === seat && ctx.state.turn.number < s.until;
}

/** While the spell lasts, the target's knights stay down; then it lifts. */
export function syncSpell(ctx: Ctx): void {
  const s = witchesView(ctx).spell;
  if (!s) return;
  if (ctx.state.turn.number >= s.until) {
    witchesData(ctx).spell = null;
    ctx.emit({ type: 'spellLifted', player: s.target });
    return;
  }
  for (const k of knightsOf(ctx, s.target))
    if (isActive(k)) {
      k.props.active = false;
      delete k.props.activatedTurn;
    }
}

// ---- Magic Power and Magic Fortune ----

export function magicDefense(ctx: Ctx, seat: number, value: number): number {
  return witchesView(ctx).power?.includes(seat) ? value * 2 : value;
}

/** Magic Power lasts until the next attack. */
export function endPower(ctx: Ctx): void {
  if (!witchesView(ctx).power?.length) return;
  if (ctx.events.some((e) => e.type === 'barbarianAttack')) witchesData(ctx).power = [];
}

export function fortuneCost(ctx: Ctx, item: string, seat: number, value: Cards): Cards {
  const f = witchesView(ctx).fortune;
  if (item !== 'settlement' || !f || f.seat !== seat || f.turn !== ctx.state.turn.number)
    return value;
  const out: Cards = { ...value };
  for (const [c, n] of Object.entries(f.waive)) out[c] = Math.max(0, (out[c] ?? 0) - n);
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
}

/** Magic Fortune is spent on the next settlement, or at the end of the turn. */
export function endFortune(ctx: Ctx): void {
  const f = witchesView(ctx).fortune;
  if (!f) return;
  const used = ctx.events.some(
    (e) => e.type === 'built' && e.piece === 'settlement' && e.player === f.seat && !e.free,
  );
  if (used || f.turn !== ctx.state.turn.number) witchesData(ctx).fortune = null;
}
