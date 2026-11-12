export {
  chooseAction,
  newMemory,
  type BotConfig,
  type BotMemory,
  type ChooseOptions,
} from './bot.ts';
export { evaluate, production, pips, spotValue } from './evaluate.ts';
export {
  LEVELS,
  LEVEL_INFO,
  STYLES,
  STYLE_INFO,
  STYLE_WEIGHTS,
  type Level,
  type Style,
} from './styles.ts';

const BOT_NAMES = ['Ada', 'Brook', 'Cyra', 'Dax', 'Echo', 'Fenn', 'Gale', 'Hux', 'Iris', 'Juno'];

/** A friendly name for a bot that isn't already used at the table. */
export function botName(taken: string[], rand: () => number = Math.random): string {
  const free = BOT_NAMES.filter((n) => !taken.some((t) => t.startsWith(n)));
  const list = free.length ? free : BOT_NAMES;
  return list[Math.floor(rand() * list.length)]!;
}
