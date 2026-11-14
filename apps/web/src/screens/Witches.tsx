import type { Action, Ctx, GameState } from '@colonizers/engine';
import { witchesView, wizardOwner } from '@colonizers/module-witches';
import { nameOf } from '@colonizers/rulebook';
import { Modal } from '../ui/Modal.tsx';

/** Witches, Wizards & Dragons on screen: board picks, the Wizard, Magic Formula. */

export const witchesOn = (state: GameState) => state.modules.includes('witches');

/** Steps where the player taps the board. */
export const WITCHES_BOARD_PHASES = ['magicPick'];

const TRACK_NAME: Record<string, string> = {
  science: 'Science',
  trade: 'Trade',
  politics: 'Politics',
  magic: 'Magic',
  religion: 'Religion',
};

const FACE_NAME: Record<string, string> = {
  ship: '⛵ Barbarian ship',
  joker: '🃏 Joker',
  wild: 'Wild gate',
};

const cardsText = (cards: Record<string, number>) =>
  Object.entries(cards)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${n} ${nameOf(c).name.toLowerCase()}`)
    .join(', ');

export function witchesPrompt(state: GameState, who: string, actor: number | null): string | null {
  const ph = state.phase;
  switch (ph.id) {
    case 'magicPick': {
      if (ph.by !== actor) return `Waiting for ${nameOf(ph.card as string).name}.`;
      const first = ph.first !== undefined;
      switch (ph.card) {
        case 'lightning':
          return `${who}: tap a field for the lightning to turn into desert.`;
        case 'starFavor':
          return first
            ? `${who}: tap the second number to swap.`
            : `${who}: tap a number to swap (any number).`;
        case 'enchantedLand':
          return first
            ? `${who}: tap the second field to swap.`
            : `${who}: tap a field to swap, number and all.`;
        case 'wizard':
          return `${who}: tap one of your settlements or cities for the Wizard.`;
        case 'magicMove':
          return first
            ? `${who}: tap the new spot for it.`
            : `${who}: tap the settlement or city to move.`;
        default:
          return null;
      }
    }
    case 'magicFormula': {
      const owed = (ph.owed as Record<number, number>)[actor ?? -1];
      return owed
        ? `${who}: Magic Formula. Give ${state.players[ph.by as number]?.name ?? 'them'} a progress card of your choice.`
        : 'Waiting for progress cards for the Magic Formula.';
    }
    default:
      return null;
  }
}

/** Labels for the Magic cards' choices, or null for anything else. */
export function witchesOptionLabel(a: Action, names: string[]): string | null {
  const n = (s: unknown) => (typeof s === 'number' ? (names[s] ?? `Player ${s + 1}`) : '');
  if (a.type === 'formulaGive') {
    const c = nameOf(a.card as string);
    return `${c.icon ?? ''} ${c.name}`.trim();
  }
  if (a.type !== 'playProgress') return null;
  switch (a.card) {
    case 'greatDragon':
      return `${n(a.target)}: ${TRACK_NAME[a.option as string] ?? String(a.option)}`;
    case 'natureSpell':
      return cardsText(a.cards as Record<string, number>);
    case 'magicFortune':
      return `Leave out ${cardsText(a.cards as Record<string, number>)}`;
    case 'magicCurrent':
      return a.option === 'back' ? 'Two steps back' : 'Two steps forward';
    case 'unicornDance': {
      const f = a.option as string;
      return FACE_NAME[f] ?? `${TRACK_NAME[f] ?? f} gate`;
    }
    default:
      return null;
  }
}

/** Magic Formula: pick the progress card you hand over. */
export function WitchesChoices({
  state,
  legal,
  act,
  names,
}: {
  state: GameState;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
}) {
  if (state.phase.id !== 'magicFormula') return null;
  const opts = legal.filter((a) => a.type === 'formulaGive');
  if (!opts.length) return null;
  return (
    <Modal title={nameOf('magicFormula').name}>
      <p>
        Give {names[state.phase.by as number] ?? 'them'} one of your progress cards. They keep one
        of the cards they are given.
      </p>
      <div className="row wrap">
        {opts.map((a, i) => (
          <button key={i} type="button" onClick={() => act(a)}>
            {witchesOptionLabel(a, names)}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Spells on a player, for the player list. */
export function WitchesStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const v = witchesView(ctx);
  const spell = v.spell && v.spell.target === seat ? v.spell : null;
  return (
    <>
      {wizardOwner(ctx) === seat && <span title="Placed the Wizard (1 point)">🧙</span>}
      {spell && (
        <span
          title={`Witch’s Spell: no knights until turn ${spell.until + 1} (now turn ${ctx.state.turn.number + 1})`}
        >
          🧹
        </span>
      )}
      {v.power?.includes(seat) && (
        <span title="Magic Power: their knights count double in the next attack">✨</span>
      )}
    </>
  );
}

/** What the board shows: the Wizard beside its building. */
export function witchesMarkers(state: GameState): {
  key: string;
  at: string;
  icon: string;
  owner: number | null;
  title: string;
  slot: -1 | 0 | 1;
}[] {
  const w = Object.values(state.pieces).find((p) => p.type === 'wizard');
  if (!w || w.at.kind !== 'corner') return [];
  const by = typeof w.props.by === 'number' ? w.props.by : null;
  const name = by === null ? '' : (state.players[by]?.name ?? `Player ${by + 1}`);
  return [
    {
      key: 'wizard',
      at: w.at.id,
      icon: '🧙',
      slot: 1,
      owner: by,
      title: `The Wizard${name ? ` of ${name}` : ''}: the robber can’t stop this building or take cards through it`,
    },
  ];
}
