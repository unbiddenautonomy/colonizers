export * from './components.ts';
export * from './shapes.ts';
export {
  shapeInfo,
  bestStartingSpots,
  cornerValue,
  pipsPerResource,
  fairShares,
  pips,
  type Layout,
  type ShapeInfo,
} from './layout.ts';
export { HARD_RULES, brokenRules, type HardRule, type RuleSet } from './rules.ts';
export {
  DEFAULT_WEIGHTS,
  MONSTER_CAP,
  scoreParts,
  totalScore,
  type ScoreParts,
  type ScoreWeights,
} from './score.ts';
export {
  analyzeMap,
  reportFor,
  gradeOf,
  ALL_RULES,
  type FairnessReport,
  type Grade,
} from './report.ts';
export {
  generateBoard,
  layoutOf,
  rulesFor,
  MODES,
  type CustomOptions,
  type GenerateOptions,
  type GeneratedBoard,
  type Mode,
} from './generate.ts';
export { validateMapFile, type MapFile } from './mapfile.ts';
export { PRESETS, presetById } from './presets.ts';
export {
  SEA_SCENARIOS,
  seaScenarioById,
  generateSeaBoard,
  buildSeaBoard,
  checkSeaBoard,
  type SeaBoard,
  type SeaBoardInfo,
  type SeaBoardOptions,
  type SeaLayout,
  type SeaScenario,
} from './seafarers.ts';
export {
  SPECIAL_MAPS,
  specialMapById,
  generateSpecialBoard,
  scaledTerrain,
  type SpecialBoard,
  type SpecialMap,
} from './special.ts';
export { TB_SCENARIOS, tbScenarioById, generateTbBoard, type TbScenarioInfo } from './traders.ts';
export {
  TDA_SCENARIOS,
  tdaScenarioById,
  generateTdaBoard,
  type TdaScenarioInfo,
} from './treasures.ts';
