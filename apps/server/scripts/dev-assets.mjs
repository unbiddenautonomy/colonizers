/* global console */
/**
 * `wrangler dev` will not start unless the folder it serves the built site from exists, and on a
 * fresh clone nothing has been built yet, so `pnpm dev` half-failed with "the directory specified
 * by the assets.directory field does not exist".
 *
 * In development the site itself comes from Vite on :5173, which proxies /api to this Worker, so
 * the Worker only needs the folder to be there. This writes a placeholder page into it when it is
 * missing, rather than making every `pnpm dev` wait for a full production build.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');

if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(dist, 'index.html'),
    `<!doctype html>
<meta charset="utf-8">
<title>Colonizers: not built yet</title>
<body style="font: 16px/1.5 system-ui; margin: 10vh auto; max-width: 34em; padding: 0 1em">
<h1>Nothing is built here yet</h1>
<p>In development the site is served by Vite, usually at
<a href="http://localhost:5173">http://localhost:5173</a>. This Worker serves the API and, once
you run <code>pnpm build</code>, the built site in <code>apps/web/dist</code>.</p>
`,
  );
  console.log('dev: wrote a placeholder apps/web/dist (run `pnpm build` for the real thing)');
}
