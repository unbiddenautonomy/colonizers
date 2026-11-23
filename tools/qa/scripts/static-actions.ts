import { readFileSync, readdirSync, statSync } from 'node:fs';
import { library } from './sim-core.ts';
const REPO = process.env.REPO ?? '../../..';
const lib: any = library;
const cfgs = JSON.parse(readFileSync('ui-configs.json', 'utf8'));
const seen = new Map<string, Set<string>>();
for (const c of cfgs) {
  const reg = lib.registry(c.save.config.modules);
  for (const t of Object.keys(reg.actions ?? {})) {
    if (!seen.has(t)) seen.set(t, new Set());
    for (const m of c.save.config.modules) seen.get(t)!.add(m);
  }
}
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = `${d}/${f}`;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p);
  }
};
walk(`${REPO}/apps/web/src`);
const src = files.filter((f) => !/describe\.ts$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
const botSrc = (() => {
  const fs: string[] = [];
  const w = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = `${d}/${f}`;
      if (statSync(p).isDirectory()) w(p);
      else if (/\.ts$/.test(f)) fs.push(p);
    }
  };
  w(`${REPO}/packages/bots/src`);
  return fs.map((f) => readFileSync(f, 'utf8')).join('\n');
})();
const missing: string[] = [];
const botMissing: string[] = [];
for (const t of [...seen.keys()].sort()) {
  const has = (s: string) => s.includes(`'${t}'`) || s.includes(`"${t}"`) || s.includes('`' + t + '`');
  if (!has(src)) missing.push(t);
  if (!has(botSrc)) botMissing.push(t);
}
console.log('action types:', seen.size, 'web files:', files.length);
console.log('NOT built anywhere in the web app (outside the log text):', missing.length ? '\n  ' + missing.join(', ') : 'none');
console.log('NOT named in the bots code (may be covered generically):', botMissing.length, '\n  ' + botMissing.join(', '));
