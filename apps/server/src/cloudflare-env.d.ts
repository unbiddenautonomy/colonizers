// Tells the Workers types about our bindings and exports, so
// `import { env, exports } from 'cloudflare:workers'` is fully typed.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index.ts');
    durableNamespaces: 'GameRoom' | 'Accounts';
  }
  interface Env {
    ROOMS: DurableObjectNamespace<import('./room.ts').GameRoom>;
    ACCOUNTS: DurableObjectNamespace<import('./accounts.ts').Accounts>;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    /** Web Push keys (base64url) and contact, for "your turn" notifications. */
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    /** Comma-separated emails of accounts that see admin details (e.g. the map's fairness numbers). */
    ADMIN_EMAILS?: string;
  }
}
