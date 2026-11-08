/** Thrown when an action breaks the rules. The game state is left unchanged. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function rule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
