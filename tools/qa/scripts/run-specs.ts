/**
 * Runs a list of sim specs (JSON file) and appends one JSON line per game to an output file.
 * Usage: tsx run-specs.ts specs.json out.jsonl [shard] [shards]
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { runSim, type SimSpec } from './sim-core.ts';

const [specFile, outFile, shardArg, shardsArg] = process.argv.slice(2);
if (!specFile || !outFile) throw new Error('usage: run-specs.ts specs.json out.jsonl [shard] [shards]');
const shard = Number(shardArg ?? 0);
const shards = Number(shardsArg ?? 1);
// Resume: skip games already in the output file.
const have = new Set<string>();
if (existsSync(outFile))
  for (const line of readFileSync(outFile, 'utf8').split('\n'))
    if (line.trim()) {
      try {
        const r = JSON.parse(line);
        have.add(`${r.name}|${r.seed}`);
      } catch {
        /* a half-written line */
      }
    }
const specs = (JSON.parse(readFileSync(specFile, 'utf8')) as SimSpec[])
  .filter((_, i) => i % shards === shard)
  .filter((s) => !have.has(`${s.name}|${s.seed}`));
let done = 0;
for (const spec of specs) {
  const r = runSim(spec);
  appendFileSync(outFile, JSON.stringify(r) + '\n');
  done++;
  if (done % 5 === 0 || r.outcome !== 'won')
    console.log(
      `[${shard}] ${done}/${specs.length} ${r.name} ${r.outcome} rounds=${r.rounds} actions=${r.actions} ${(r.ms / 1000).toFixed(1)}s${r.error ? ' ERR ' + r.error : ''}${r.problems.length ? ' PROBLEMS ' + r.problems.slice(0, 3).join(' | ') : ''}`,
    );
}
console.log(`[${shard}] finished ${done} games`);
