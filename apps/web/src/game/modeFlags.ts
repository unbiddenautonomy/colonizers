import {
  MODES as MODE_IDS,
  modeStatus,
  warnings,
  weightOf,
  resolve,
  type BoardInfo,
  type ModeId,
} from '@colonizers/modes';

/** Which expansions are in, and what each card shows, for the picked map and options. */
export function modesFor(
  kind: BoardInfo['kind'],
  group: NonNullable<BoardInfo['group']> | null,
  fog: boolean,
  needsCk: boolean,
  noCk: boolean,
  wanted: Record<ModeId, boolean>,
) {
  const board: BoardInfo =
    kind === 'special'
      ? { kind, group, needsCk, noCk }
      : kind === 'seafarers'
        ? { kind, fog }
        : { kind };
  const on = resolve(
    board,
    MODE_IDS.filter((m) => wanted[m]),
  );
  const picked = Object.fromEntries(MODE_IDS.map((m) => [m, on.has(m)])) as Record<ModeId, boolean>;
  const list = [...on];
  return {
    on: picked,
    /** The same answer as a set, which is what the shared game-building rules take. */
    chosen: on,
    status: modeStatus(board, list),
    weight: weightOf(board, list),
    warn: (vpTarget: number) => warnings(board, list, vpTarget),
  };
}
