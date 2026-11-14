import {
  MODES as MODE_IDS,
  modeStatus,
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
  return { on: picked, status: modeStatus(board, [...on]) };
}
