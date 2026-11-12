import type { GameEvent } from '@colonizers/engine';
import { nameOf } from '@colonizers/rulebook';
import { achievementById } from '@colonizers/stats';

const TRACK: Record<string, string> = {
  science: 'science (green)',
  trade: 'trade (yellow)',
  politics: 'politics (blue)',
};

function cards(c: Record<string, number> | undefined): string {
  if (!c) return '';
  const parts = Object.entries(c)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${nameOf(k).icon ?? nameOf(k).name}`);
  return parts.join(', ') || 'nothing';
}

const COMMODITY_TEXT: Record<string, string> = {
  glass: '🔮 glass',
  marble: '🪨 marble',
  sand: '⏳ sand',
  tools: '🔨 tools',
};

const GOLD_REASON: Record<string, string> = {
  bridge: ' for a bridge',
  road: ' by the river',
  settlement: ' by the river',
  fight: ' from the fight',
  delivery: ' for the delivery',
};

const EVENT_TEXT: Record<string, string> = {
  prospers: 'good times, nothing happens',
  robberAttacks: 'the robber strikes',
  epidemic: 'epidemic, cities pay only 1 card',
  earthquake: 'earthquake, everyone damages a road',
  goodNeighbors: 'good neighbours, everyone gives a card to the left',
  tournament: 'tournament, most knights take a card',
  tradeAdvantage: 'trade advantage, the longest road takes a card',
  calmSeas: 'calm seas, most harbors take a card',
  robberFlees: 'the robber flees to the desert',
  neighborlyAssistance: 'helping hand, the leaders give a card',
  conflict: 'conflict, most knights steal a card',
  plentifulYear: 'plentiful year, everyone takes a card',
};

/** One line of log text for an event, or null to leave it out. */
export function describe(e: GameEvent, names: string[]): string | null {
  const n = (seat: unknown) =>
    typeof seat === 'number' ? (names[seat] ?? `Player ${seat + 1}`) : 'Someone';
  switch (e.type) {
    case 'gameCreated':
      return 'New game started.';
    case 'turnStarted':
      return `— ${n(e.player)}'s turn —`;
    case 'rolled':
      return `${n(e.player)} rolled ${e.total as number}.`;
    case 'production': {
      const received = e.received as Record<number, Record<string, number>>;
      const lines = Object.entries(received).map(
        ([seat, c]) => `${n(Number(seat))} got ${cards(c)}`,
      );
      const short = (e.shortages as string[]).length
        ? ` Bank ran out of ${(e.shortages as string[]).join(', ')}.`
        : '';
      return lines.length ? lines.join('; ') + '.' + short : `Nobody collected anything.${short}`;
    }
    case 'built':
      return `${n(e.player)} built a ${e.piece === 'wall' ? 'city wall' : (e.piece as string)}${e.free ? ' (free)' : ''}.`;
    case 'shipMoved':
      return `${n(e.player)} moved a ship.`;
    case 'pirateMoved':
      return `${n(e.player)} moved the pirate.`;
    case 'revealed':
      return `${e.player === null || e.player === undefined ? 'Fog lifted' : `${n(e.player)} explored`}: ${nameOf(e.terrain as string).icon ?? ''} ${nameOf(e.terrain as string).name}${e.token ? ` (${e.token as number})` : ''}.`;
    case 'discovered':
      return `${n(e.player)} found ${cards(e.cards as Record<string, number>)}.`;
    case 'goldOwed': {
      const owed = e.owed as Record<number, number>;
      return `Gold! ${Object.entries(owed)
        .map(([seat, k]) => `${n(Number(seat))} picks ${k}`)
        .join(', ')}.`;
    }
    case 'goldPicked':
      return `${n(e.player)} took ${cards(e.cards as Record<string, number>)} from the gold field.`;
    case 'islandBonus':
      return `${n(e.player)} settled a new island: +${e.vp as number} points!`;
    case 'startingResources':
      return `${n(e.player)} starts with ${cards(e.cards as Record<string, number>)}.`;
    case 'discarded':
      return `${n(e.player)} discarded ${cards(e.cards as Record<string, number>)}.`;
    case 'robberMoved':
      return `${n(e.player)} moved the robber.`;
    case 'stole':
      return e.card
        ? `${n(e.thief)} stole ${cards({ [e.card as string]: 1 })} from ${n(e.victim)}.`
        : `${n(e.thief)} stole a card from ${n(e.victim)}.`;
    case 'boughtDevCard':
      return `${n(e.player)} ${e.free ? 'took' : 'bought'} a development card.`;
    case 'playedDevCard':
      return `${n(e.player)} played ${nameOf(e.card as string).name}.`;
    case 'yearOfPlenty':
      return `${n(e.player)} took ${cards(e.cards as Record<string, number>)}.`;
    case 'monopoly':
      return `${n(e.player)} took ${e.taken as number} ${nameOf(e.resource as string).icon ?? ''} from everyone.`;
    case 'bankTrade':
      return `${n(e.player)} traded ${cards(e.gave as Record<string, number>)} with the bank for ${cards(e.got as Record<string, number>)}.`;
    case 'tradeOffered': {
      const o = e.offer as {
        from: number;
        give: Record<string, number>;
        get: Record<string, number>;
      };
      return `${n(o.from)} offers ${cards(o.give)} for ${cards(o.get)}.`;
    }
    case 'tradeResponse':
      return `${n(e.player)} ${e.accept ? 'accepts' : 'declines'}.`;
    case 'traded':
      return `${n(e.from)} and ${n(e.to)} traded ${cards(e.gave as Record<string, number>)} for ${cards(e.got as Record<string, number>)}.`;
    case 'tradeCancelled':
      return 'Trade offer withdrawn.';
    case 'award': {
      const label =
        e.award === 'longestRoad'
          ? 'Longest Road'
          : e.award === 'harbormaster'
            ? 'Harbormaster'
            : 'Largest Army';
      // Seafarers calls it Longest Trade Route; the log keeps one name.
      return e.to === null ? `Nobody holds ${label} now.` : `${n(e.to)} takes ${label}!`;
    }
    case 'gameOver':
      return `🏆 ${n(e.winner)} wins!`;
    // ---- Cities & Knights ----
    case 'eventDie':
      return e.face === 'ship'
        ? 'Event die: the barbarian ship sails closer.'
        : `Event die: ${TRACK[e.face as string] ?? e.face} gate with red ${e.red as number}.`;
    case 'barbariansAdvance':
      return null;
    case 'barbarianAttack':
      return e.defended
        ? `⚔️ The barbarians attack (${e.cities as number}) and the knights (${e.knights as number}) hold them off!`
        : `🔥 The barbarians attack (${e.cities as number}) and beat the knights (${e.knights as number})!`;
    case 'robberWakes':
      return 'The robber is now in play.';
    case 'defender':
      return `${n(e.player)} is the Defender: +1 point!`;
    case 'pillaged':
      return `${n(e.player)} lost a city to the barbarians.`;
    case 'metropolis':
      return `${n(e.player)} built the ${TRACK[e.track as string] ?? ''} metropolis${e.from !== null && e.from !== undefined ? `, taking it from ${n(e.from)}` : ''}!`;
    case 'improved':
      return `${n(e.player)} raised ${TRACK[e.track as string] ?? e.track} to level ${e.level as number}.`;
    case 'progressDrawn':
      return e.card
        ? `${n(e.player)} drew ${nameOf(e.card as string).name}.`
        : `${n(e.player)} drew a ${TRACK[e.deck as string] ?? ''} progress card.`;
    case 'progressVp':
      return `${n(e.player)} drew ${nameOf(e.card as string).name}: +1 point!`;
    case 'playedProgress':
      return `${n(e.player)} played ${nameOf(e.card as string).name}.`;
    case 'progressGain':
      return Object.keys((e.cards as Record<string, number>) ?? {}).length
        ? `${n(e.player)} took ${cards(e.cards as Record<string, number>)}.`
        : null;
    case 'knightActivated':
      return `${n(e.player)} activated a knight.`;
    case 'knightPromoted':
      return `${n(e.player)} promoted a knight to ${['basic', 'strong', 'mighty'][(e.level as number) - 1]}.`;
    case 'knightMoved':
      return `${n(e.player)} moved a knight.`;
    case 'knightDisplaced':
      return `${n(e.player)} pushed away ${n(e.victim)}'s knight.`;
    case 'knightLost':
      return `${n(e.player)}'s knight had nowhere to go and left the board.`;
    case 'knightDeserted':
      return `${n(e.player)}'s knight deserted to ${n(e.to)}.`;
    case 'robberChased':
      return `${n(e.player)}'s knight chased the robber away.`;
    case 'numbersSwapped':
      return `${n(e.player)} swapped two numbers.`;
    case 'harborGave':
      return e.gave
        ? `${n(e.player)} gave ${n(e.with)} ${cards(e.gave as Record<string, number>)} for a commodity.`
        : `${n(e.player)} gave ${n(e.with)} a card for a commodity.`;
    case 'harborSwap':
      return e.got
        ? `${n(e.with)} gave ${n(e.player)} ${cards(e.got as Record<string, number>)} back.`
        : `${n(e.with)} gave ${n(e.player)} a commodity back.`;
    case 'progressReturned':
      return e.card
        ? `${n(e.player)} put ${nameOf(e.card as string).name} back under its deck.`
        : `${n(e.player)} put a progress card back under its deck.`;
    case 'tookCards':
      return e.cards
        ? `${n(e.player)} took ${cards(e.cards as Record<string, number>)} from ${n(e.from)}.`
        : `${n(e.player)} took ${e.count as number} card(s) from ${n(e.from)}.`;
    case 'spied':
      return e.card
        ? `${n(e.player)} took ${nameOf(e.card as string).name} from ${n(e.from)}.`
        : `${n(e.player)} took a progress card from ${n(e.from)}.`;
    case 'merchantPlaced':
      return `${n(e.player)} placed the merchant.`;
    case 'roadRemoved':
      return `${n(e.player)} removed ${n(e.owner)}'s road.`;
    case 'gift':
      return `${n(e.player)} gave ${n(e.to)} ${cards(e.cards as Record<string, number>)}.`;
    case 'aqueduct':
      return `${n(e.player)}'s aqueduct paid ${cards(e.cards as Record<string, number>)}.`;
    case 'achievementUnlocked': {
      const a = achievementById(e.id as string);
      return a ? `${a.icon} ${n(e.player)} unlocked an achievement: ${a.name}.` : null;
    }
    case 'specialBuildStarted':
      return `Everyone else may now build in turn.`;
    case 'specialBuildDone':
      return `${n(e.player)} is done building.`;
    case 'gifted':
      return `${n(e.from)} gave ${n(e.to)} ${cards(e.cards as Record<string, number>)}.`;
    case 'robberResting':
      return `Quiet start: the 7 does nothing yet.`;
    case 'diceShuffled':
      return `The dice deck was shuffled.`;
    // ---- Traders & Barbarians ----
    case 'fishCaught':
      return e.fish
        ? `${n(e.player)} caught ${e.fish as number} fish (${e.tokens as number} token${e.tokens === 1 ? '' : 's'}).`
        : `${n(e.player)} caught ${e.tokens as number} fish token${e.tokens === 1 ? '' : 's'}.`;
    case 'bootFound':
      return `🥾 ${n(e.player)} fished up the old boot: one point less until they pass it on.`;
    case 'bootPassed':
      return `🥾 ${n(e.player)} handed the old boot to ${n(e.to)}.`;
    case 'fishSpent': {
      const what: Record<string, string> = {
        robber: 'to take the robber off the board',
        steal: `to steal from ${n(e.target)}`,
        bank: `for ${cards({ [e.resource as string]: 1 })}`,
        road: 'for a free road',
        devCard: 'for a development card',
      };
      return `🐟 ${n(e.player)} spent ${e.fish as number} fish ${what[e.use as string] ?? ''}.`;
    }
    case 'goldEarned':
      return `🪙 ${n(e.player)} earned ${e.gold as number} gold${GOLD_REASON[e.reason as string] ?? ''}.`;
    case 'goldSpent':
      return `🪙 ${n(e.player)} paid ${e.gold as number} gold for ${cards({ [e.resource as string]: 1 })}.`;
    case 'eventCard':
      return `🃏 Event card: ${EVENT_TEXT[e.event as string] ?? e.event} (${e.total as number}).`;
    case 'eventDeckShuffled':
      return 'The event deck was shuffled.';
    case 'eventNoEffect':
      return 'Nobody is affected this time.';
    case 'eventGain':
      return `${n(e.player)} took ${cards(e.cards as Record<string, number>)}.`;
    case 'roadDamaged':
      return `${n(e.player)}'s road was damaged.`;
    case 'roadRepaired':
      return `${n(e.player)} repaired a road.`;
    case 'camelVoteStarted':
      return '🐪 Time to vote on the next camel.';
    case 'camelBid':
      return `${n(e.player)} put ${e.votes as number} vote${e.votes === 1 ? '' : 's'} on a path.`;
    case 'camelPlaced':
      return '🐪 A camel joins the caravan.';
    case 'barbariansLanded': {
      const hexes = (e.hexes as string[]).length;
      const took = (e.conquered as string[]).length;
      const rolls = (e.numbers as number[]).join(', ');
      if (!hexes) return `🪓 Barbarians rolled ${rolls}, but found nowhere to land.`;
      return `🪓 Barbarians rolled ${rolls} and landed on ${hexes} hex${hexes === 1 ? '' : 'es'}${took ? `; ${took} ${took === 1 ? 'is' : 'are'} now held by barbarians` : ''}.`;
    }
    case 'barbariansDefeated': {
      const got = Object.entries(e.prisoners as Record<string, number>)
        .map(([seat, k]) => `${n(Number(seat))} took ${k} prisoner${k === 1 ? '' : 's'}`)
        .join(', ');
      const lost = (e.lost as number[]).length;
      return `⚔️ Knights drove off the barbarians: ${got}.${lost ? ` ${lost} knight${lost === 1 ? '' : 's'} fell (die ${e.die as number}).` : ''}`;
    }
    case 'commodityLoaded':
      return `🛒 ${n(e.player)} loaded ${COMMODITY_TEXT[e.commodity as string] ?? e.commodity} at the ${e.at as string}.`;
    case 'commodityDelivered':
      return `🛒 ${n(e.player)} delivered ${COMMODITY_TEXT[e.commodity as string] ?? e.commodity} to the ${e.at as string}.`;
    case 'wagonMoved':
      return typeof e.tollTo === 'number'
        ? `🛒 ${n(e.player)} paid ${n(e.tollTo)} 1 gold to use their road.`
        : null;
    case 'wagonBoost':
      return `🛒 ${n(e.player)} fed the horses: 2 more moves.`;
    case 'wagonUpgraded':
      return `🛒 ${n(e.player)} upgraded their wagon to level ${e.level as number}.`;
    case 'barbarianChallenged':
      return e.won
        ? `⚔️ ${n(e.player)} drove off a barbarian (rolled ${e.die as number}).`
        : `⚔️ ${n(e.player)} tried to drive off a barbarian, but rolled ${e.die as number} (needed ${e.need as number}).`;
    case 'edgeBarbarianMoved':
      return `🪓 ${n(e.player)} moved a barbarian.`;
    case 'tbKnightPlaced':
      return `♞ ${n(e.player)} sent a knight out from the castle.`;
    case 'tbKnightMoved':
      return `♞ ${n(e.player)} moved a knight ${e.steps as number} step${e.steps === 1 ? '' : 's'}.`;
    case 'eruption': {
      const hit = e.hit as string | null;
      const base = `🌋 The volcano erupted (die ${e.face as number})`;
      if (!hit || e.owner === null) return `${base}, but nobody was hurt.`;
      return hit === 'city'
        ? `${base}: ${n(e.owner)}'s city dropped to a settlement.`
        : `${base}: ${n(e.owner)}'s settlement was destroyed.`;
    }
    default:
      return null;
  }
}
