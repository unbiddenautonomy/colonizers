/**
 * Web Push with no outside libraries: VAPID sign-in (RFC 8292) and message
 * encryption (RFC 8291, "aes128gcm"), all with WebCrypto.
 *
 * Keys come from two secrets, VAPID_PUBLIC_KEY (65-byte raw point) and
 * VAPID_PRIVATE_KEY (32-byte private value), both base64url. Make a pair
 * with `pnpm --filter @colonizers/server vapid`.
 */

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Contact for the push services: a mailto: or https: URL. */
  subject: string;
}

const encoder = new TextEncoder();
const enc = {
  encode: (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(encoder.encode(text)),
};

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A subscription that looks like one a browser made. */
export function isSubscription(raw: unknown): raw is PushSubscriptionJson {
  const s = raw as PushSubscriptionJson | null;
  if (!s || typeof s.endpoint !== 'string' || !s.keys) return false;
  if (!/^https:\/\/[^\s]{1,1000}$/.test(s.endpoint)) return false;
  try {
    return fromB64url(s.keys.p256dh).length === 65 && fromB64url(s.keys.auth).length === 16;
  } catch {
    return false;
  }
}

async function signingKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = fromB64url(keys.publicKey);
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(pub.slice(1, 33)),
      y: b64url(pub.slice(33, 65)),
      d: keys.privateKey,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** The Authorization header value for one push service. */
export async function vapidAuth(
  endpoint: string,
  keys: VapidKeys,
  now = Date.now(),
): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await signingKey(keys),
    enc.encode(unsigned),
  );
  return `vapid t=${unsigned}.${b64url(new Uint8Array(sig))}, k=${keys.publicKey}`;
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

/** Encrypts one message for a subscription (a single aes128gcm record). */
export async function encryptPayload(
  sub: PushSubscriptionJson,
  payload: string,
  // For tests: fixed server keys and salt.
  fixed?: { keyPair: CryptoKeyPair; salt: Uint8Array<ArrayBuffer> },
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromB64url(sub.keys.p256dh);
  const authSecret = fromB64url(sub.keys.auth);
  const local =
    fixed?.keyPair ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer,
  );
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      // The spec calls it `public`; some type files spell it differently.
      { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      local.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  );
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record, so the padding delimiter is 2 ("last record").
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/**
 * Sends one push. Returns "gone" when the subscription has expired and should
 * be forgotten.
 */
export async function sendPush(
  sub: PushSubscriptionJson,
  message: { title: string; body: string; url: string; tag?: string },
  keys: VapidKeys,
): Promise<'sent' | 'gone' | 'failed'> {
  const body = await encryptPayload(sub, JSON.stringify(message));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 3600),
      Urgency: 'high',
      ...(message.tag ? { Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
    },
    body,
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'sent' : 'failed';
}
