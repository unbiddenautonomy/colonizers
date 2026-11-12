/* global Buffer, crypto, console */
// Makes a VAPID key pair for "your turn" notifications. Save them with:
//   wrangler secret put VAPID_PUBLIC_KEY
//   wrangler secret put VAPID_PRIVATE_KEY
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
