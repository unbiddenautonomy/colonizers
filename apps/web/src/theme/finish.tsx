import { useTheme } from './themes.tsx';
import { FINISHES, setFinish, usePieceFinish, type Finish } from './finishStore.ts';

/** A small picker for the finish, shown only on boards whose pieces are painted. */
export function FinishPicker({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  const finish = usePieceFinish();
  if (theme.painted !== true) return null;
  return (
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
  );
}
