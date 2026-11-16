import { useEffect, useState } from 'react';

function clock(left: number): string {
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = String(left % 60).padStart(2, '0');
  // Async games show days and hours instead of seconds.
  return h >= 24
    ? `${Math.floor(h / 24)}d ${h % 24}h`
    : h > 0
      ? `${h}h ${String(m).padStart(2, '0')}m`
      : `${m}:${s}`;
}

/**
 * Seconds left on the turn timer. Turns red for the last 15 seconds. With a time bank, shows the
 * bank left after the timer, or that the bank is being spent now.
 */
export function TurnTimer({
  deadline,
  bank,
  banking = false,
}: {
  deadline: number;
  /** Time bank left in ms for the player on the clock, when there is one. */
  bank?: number | undefined;
  banking?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((deadline - now) / 1000));
  const extra = !banking && bank ? Math.round(bank / 1000) : 0;
  return (
    <span
      className={`timer${left <= 15 ? ' low' : ''}`}
      title={banking ? 'Spending the time bank' : 'Time left for this step'}
      role="timer"
    >
      {banking ? '⏳' : '⏱'} {clock(left)}
      {banking && ' bank'}
      {extra > 0 && <span className="muted"> +{clock(extra)}</span>}
    </span>
  );
}
