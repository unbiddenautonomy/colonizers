/** Where a player's points came from, for the end of a game. */
export interface ScorePart {
  what: string;
  vp: number;
}

/** The little of a game's state this needs, so it can be tested on its own. */
export interface ScoreCtx {
  piecesOf(seat: number): { type: string }[];
  registry: { pieceTypes: Record<string, { vp?: number } | undefined> };
  player(seat: number): { held: Record<string, { card: string }[] | undefined> };
  vp(seat: number): number;
}

export interface Awards {
  longestRoad: number | null;
  largestArmy: number | null;
  /** "Longest Road", or "Longest Trade Route" with Seafarers. */
  routeName: string;
}

const PIECE_NAME: Record<string, [one: string, many: string]> = {
  settlement: ['settlement', 'settlements'],
  city: ['city', 'cities'],
  wonder: ['wonder', 'wonders'],
  castle: ['castle', 'castles'],
  harborSettlement: ['harbour settlement', 'harbour settlements'],
};

function pieceName(type: string, n: number): string {
  const known = PIECE_NAME[type];
  if (known) return n === 1 ? known[0] : known[1];
  // A piece type from an expansion: "goldMine" reads as "gold mine".
  const words = type.replace(/([A-Z])/g, ' $1').toLowerCase();
  return n === 1 ? words : `${words}s`;
}

/**
 * Splits a player's points into the things that earned them. Anything the
 * expansions add that cannot be named here lands in one last line, so the
 * parts always add up to the total on the board.
 */
export function scoreParts(ctx: ScoreCtx, seat: number, awards: Awards): ScorePart[] {
  const parts: ScorePart[] = [];
  const counts = new Map<string, { n: number; vp: number }>();
  for (const piece of ctx.piecesOf(seat)) {
    const vp = ctx.registry.pieceTypes[piece.type]?.vp ?? 0;
    if (!vp) continue;
    const at = counts.get(piece.type) ?? { n: 0, vp: 0 };
    counts.set(piece.type, { n: at.n + 1, vp: at.vp + vp });
  }
  for (const [type, { n, vp }] of counts) parts.push({ what: `${n} ${pieceName(type, n)}`, vp });
  if (awards.longestRoad === seat) parts.push({ what: awards.routeName, vp: 2 });
  if (awards.largestArmy === seat) parts.push({ what: 'Largest Army', vp: 2 });
  const cards = (ctx.player(seat).held.dev ?? []).filter((c) => c.card === 'victoryPoint').length;
  if (cards)
    parts.push({ what: `${cards} victory point card${cards === 1 ? '' : 's'}`, vp: cards });
  const named = parts.reduce((total, p) => total + p.vp, 0);
  const rest = ctx.vp(seat) - named;
  if (rest > 0) parts.push({ what: 'expansion points', vp: rest });
  else if (rest < 0) parts.push({ what: 'points lost', vp: rest });
  return parts;
}
