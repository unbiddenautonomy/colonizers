/**
 * Generates many Seafarers boards per scenario and player count and checks
 * every one. Run with `pnpm --filter @colonizers/maps soak:sea [count]`.
 */
import { checkSeaBoard, generateSeaBoard, SEA_SCENARIOS } from '../src/seafarers.ts';

const count = Number(process.argv[2] ?? 2000);
let failed = 0;
for (const scenario of SEA_SCENARIOS) {
  for (const players of [3, 4, 6, 8]) {
    if (players < scenario.players.min || players > scenario.players.max) continue;
    const t = Date.now();
    let attempts = 0;
    for (let i = 0; i < count; i++) {
      const board = generateSeaBoard({ seed: `soak-${i}`, players, scenario: scenario.id });
      attempts += board.info.attempts;
      const problems = checkSeaBoard(board, players);
      if (problems.length) {
        failed++;
        console.error(scenario.id, players, i, problems);
      }
    }
    console.log(
      `${scenario.id.padEnd(13)} ${players}p: ${count} boards in ${((Date.now() - t) / 1000).toFixed(1)}s, ${(attempts / count).toFixed(1)} tries per board`,
    );
  }
}
console.log(failed ? `${failed} boards failed` : 'All Seafarers boards passed their checks');
process.exit(failed ? 1 : 0);
