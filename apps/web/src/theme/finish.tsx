import { useTheme } from './themes.tsx';
import { setLandIcons, useLandIcons } from './landIcons.ts';
import {
  DRAGON_COLOURS,
  FINISHES,
  setDragonColour,
  setFinish,
  useDragonColour,
  usePieceFinish,
  type DragonColour,
  type Finish,
} from './finishStore.ts';

/** A small picker for the finish, shown only on boards whose pieces are painted. */
export function FinishPicker({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  const finish = usePieceFinish();
  const dragon = useDragonColour();
  const icons = useLandIcons();
  if (theme.id === 'wood')
    return (
      <label className="theme-picker" title="Draw an object on each land, or show only the tiles">
        {compact ? <span aria-hidden="true">🪵</span> : 'Lands '}
        <select
          value={icons ? 'on' : 'off'}
          onChange={(e) => setLandIcons(e.target.value === 'on')}
          aria-label="Land icons"
        >
          <option value="off">Tiles only</option>
          <option value="on">Tiles + icons</option>
        </select>
      </label>
    );
  if (theme.painted !== true) return null;
  return (
    <>
      <label className="theme-picker" title="How pieces in your colour are finished">
        {compact ? <span aria-hidden="true">✨</span> : 'Pieces '}
        <select
          value={finish}
          onChange={(e) => setFinish(e.target.value as Finish)}
          aria-label="Piece finish"
        >
          {FINISHES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="theme-picker" title="The colour of the dragons">
        {compact ? <span aria-hidden="true">🐉</span> : 'Dragons '}
        <select
          value={dragon}
          onChange={(e) => setDragonColour(e.target.value as DragonColour)}
          aria-label="Dragon colour"
        >
          {DRAGON_COLOURS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
