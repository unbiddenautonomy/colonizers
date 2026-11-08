/**
 * Generates many boards per mode and player count and checks every one passes
 * its mode's rules. Run with `pnpm --filter @colonizers/maps soak [count]`.
 */
import { generateBoard, type Mode } from '../src/generate.ts';
import { layoutOf } from '../src/generate.ts';
import { brokenRules } from '../src/rules.ts';
import { componentsFor } from '../src/components.ts';

const count = Number(process.argv[2] ?? 10_000);
const modes: Mode[] = ['classic', 'balanced', 'wild', 'custom'];
let failed = 0;
for (const mode of modes) {
  for (const players of [4, 6, 8]) {
    const t = Date.now();
    const grades = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < count; i++) {
      const board = generateBoard({
        seed: `soak-${i}`,
        players,
        mode,
        ...(mode === 'custom' && {
          custom: { rules: { redApart: true, sameNumberApart: true }, optimize: i % 2 === 0 },
        }),
        ...(mode === 'balanced' && { iterations: 800 }),
      });
      const { info, layout } = layoutOf(board.map);
      const broken = brokenRules(info, layout, board.rules);
      const c = componentsFor(players);
      const terrainOk = Object.entries(c.terrain).every(
        ([t2, n]) => layout.terrain.filter((x) => x === t2).length === n,
      );
      if (broken.length || !terrainOk) {
        failed++;
        console.error(mode, players, board.seed, broken);
      }
      grades[board.report.grade]++;
    }
    console.log(
      `${mode.padEnd(8)} ${players}p: ${count} boards in ${((Date.now() - t) / 1000).toFixed(1)}s, grades A ${grades.A} B ${grades.B} C ${grades.C}`,
    );
  }
}
console.log(failed ? `${failed} boards FAILED` : 'All boards passed their rules');
process.exit(failed ? 1 : 0);
