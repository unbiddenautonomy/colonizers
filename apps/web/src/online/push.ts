/** "Your turn" notifications: a push when the app is closed, a local one when it's in the background. */

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Could not save that');
  }
}

/** Whether this device already sends pushes to the signed-in account. */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Asks for permission and signs this device up for pushes. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot show notifications');
  const { key } = (await (await fetch('/api/push/key')).json()) as { key: string | null };
  if (!key) throw new Error('Notifications are not set up on this server yet');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    }));
  await post('/api/me/push', { subscription: sub.toJSON() });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('/api/me/push/remove', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

/** Shows a notification from the open page, when it is hidden behind other apps. */
export function notifyHere(title: string, body: string): void {
  if (!pushSupported() || Notification.permission !== 'granted' || !document.hidden) return;
  void navigator.serviceWorker.getRegistration().then((reg) => {
    const opts = { body, icon: '/icon-192.png', tag: 'turn', data: { url: location.pathname } };
    if (reg) void reg.showNotification(title, opts);
    else new Notification(title, opts);
  });
}
