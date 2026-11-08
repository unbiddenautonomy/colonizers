// Tells the Workers types about our bindings and exports, so
// `import { env, exports } from 'cloudflare:workers'` is fully typed.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index.ts');
    durableNamespaces: 'GameRoom';
  }
  interface Env {
    ROOMS: DurableObjectNamespace<import('./room.ts').GameRoom>;
  }
}
