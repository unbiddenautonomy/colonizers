import { describe, expect, it } from 'vitest';
import { b64url, encryptPayload, fromB64url, isSubscription, vapidAuth } from '../src/push.ts';

const dec = new TextDecoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
      key,
      bytes * 8,
    ),
  );
}

const cat = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of p) {
    out.set(x, at);
    at += x.length;
  }
  return out;
};

/** What a browser does with a push it receives (RFC 8291), to check our side. */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer,
  );
  const asKey = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      ua.privateKey,
      256,
    ),
  );
  const te = new TextEncoder();
  const ikm = await hkdf(auth, shared, cat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher),
  );
  expect(plain[plain.length - 1]).toBe(2);
  return dec.decode(plain.slice(0, -1));
}

describe('Web Push', () => {
  it('encrypts a message the browser can read', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const sub = {
      endpoint: 'https://push.example.com/abc',
      keys: {
        p256dh: b64url(
          new Uint8Array((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer),
        ),
        auth: b64url(auth),
      },
    };
    expect(isSubscription(sub)).toBe(true);
    const body = await encryptPayload(sub, '{"title":"Your turn"}');
    expect(await decrypt(body, ua, auth)).toBe('{"title":"Your turn"}');
  });

  it('signs a VAPID token the push service can check', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicKey = b64url(
      new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    );
    const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
    const header = await vapidAuth('https://push.example.com/abc', {
      publicKey,
      privateKey: jwk.d!,
      subject: 'https://example.com',
    });
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m[4]).toBe(publicKey);
    const claims = JSON.parse(dec.decode(fromB64url(m[2]!)));
    expect(claims.aud).toBe('https://push.example.com');
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      fromB64url(m[3]!),
      new TextEncoder().encode(`${m[1]}.${m[2]}`),
    );
    expect(ok).toBe(true);
  });

  it('turns away subscriptions that are not real', () => {
    expect(isSubscription({ endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } })).toBe(false);
    expect(isSubscription(null)).toBe(false);
  });
});
