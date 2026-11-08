import { useEffect, useState } from 'react';

/** Seconds left on the turn timer. Turns red for the last 15 seconds. */
export function TurnTimer({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((deadline - now) / 1000));
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span
      className={`timer${left <= 15 ? ' low' : ''}`}
      title="Time left for this step"
      role="timer"
    >
      ⏱ {m}:{s}
    </span>
  );
}
