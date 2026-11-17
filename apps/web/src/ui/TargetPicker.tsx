import {
  chosenTarget,
  describeParts,
  storedTarget,
  type WinTarget,
} from '../../../server/src/winTarget.ts';

/** The label beside a target in the list: which one is the default and which we suggest. */
function tag(target: WinTarget, v: number): string {
  const marks = [v === target.standard && 'default', v === target.recommended && 'recommended'];
  const text = marks.filter(Boolean).join(', ');
  return text ? ` (${text})` : '';
}

/** The warning for a target, if any: the default where we'd suggest another, or a change. */
function targetWarning(target: WinTarget, picked: number): string | null {
  if (picked === target.standard && target.advice)
    return `${target.standard} points is the official target, but ${target.advice} We recommend ${target.recommended}.`;
  return null;
}

/** Points to win, for any game: the official target is the default. */
export function TargetPicker({
  target,
  stored,
  onChange,
}: {
  target: WinTarget;
  /** The room's stored choice (the usual 10 plus the change). */
  stored: number;
  onChange: (stored: number) => void;
}) {
  const picked = chosenTarget(target, stored);
  const warning = targetWarning(target, picked);
  return (
    <div className="target-pick">
      <label>
        Points to win{' '}
        <select
          value={picked}
          onChange={(e) => onChange(storedTarget(target, Number(e.target.value)))}
        >
          {target.choices.map((v) => (
            <option key={v} value={v}>
              {v}
              {tag(target, v)}
            </option>
          ))}
        </select>
      </label>
      {target.parts.length > 0 && (
        <small className="muted"> The usual 10, {describeParts(target.parts)}.</small>
      )}
      {picked !== target.standard && (
        <small className="muted">
          {' '}
          The official rules play to {target.standard}
          {picked === target.recommended ? '; this is the one we recommend' : ''}.
        </small>
      )}
      {warning && (
        <p className="target-warn" role="note">
          ⚠️ {warning}
        </p>
      )}
    </div>
  );
}
