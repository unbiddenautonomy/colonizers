import { useEffect, useState } from 'react';
import { useAccount } from '../online/account.ts';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../online/push.ts';

/** Turns "your turn" notifications on or off for this device. Needs a signed-in account. */
export function NotifyButton() {
  const { user } = useAccount();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user || !pushSupported()) return;
    pushEnabled().then(setOn, () => setOn(false));
  }, [user]);
  if (!user || !pushSupported() || on === null) return null;
  return (
    <span className="notify">
      <button
        type="button"
        className="ghost"
        disabled={busy}
        aria-pressed={on}
        title="Get a notification when it's your move, even with the app closed"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            if (on) await disablePush();
            else await enablePush();
            setOn(!on);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {on ? '🔔 Notifications on' : '🔕 Notify me on my turn'}
      </button>
      {error && (
        <small className="muted" role="alert">
          {' '}
          {error}
        </small>
      )}
    </span>
  );
}
