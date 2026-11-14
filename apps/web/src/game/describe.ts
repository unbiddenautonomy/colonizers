import type { GameEvent } from '@colonizers/engine';
import { nameOf } from '@colonizers/rulebook';
import { achievementById } from '@colonizers/stats';
import { TREASURE_TEXT, type TreasureKind } from '@colonizers/module-treasures-dragons';
import { WONDERS, type WonderId } from '@colonizers/module-world-wonders';
import { CIV_BY_ID } from '@colonizers/module-civilisations';

const TRACK: Record<string, string> = {
  science: 'science (green)',
  trade: 'trade (yellow)',
  politics: 'politics (blue)',
  magic: 'magic (purple)',
  religion: 'religion (red)',
  wealth: 'wealth (gold)',
};

const GWP_BUILDING: Record<string, string> = {
  citadel: '🏰 Citadel',
  diocese: '⛪ Diocese',
  monument: '🗿 Monument',
  silo: '🌾 Silo',
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

const vehicle = (t: unknown) => (t === 'ferry' ? 'ship' : String(t));

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
      return `${n(e.player)} built a ${e.piece === 'wall' ? 'city wall' : e.piece === 'harbor' ? 'harbor settlement' : e.piece === 'ferry' ? 'ship' : (e.piece as string)}${e.free ? ' (free)' : ''}.`;
    case 'shipSailed':
      return `${n(e.player)} sailed a ship ${e.moves as number} edge${e.moves === 1 ? '' : 's'}.`;
    case 'shipBoosted':
      return `${n(e.player)} put up extra sails.`;
    case 'cargoSwapped':
      return `${n(e.player)} swapped a ship's cargo at the harbor.`;
    case 'founded':
      return `${n(e.player)} founded a settlement from a ship.`;
    case 'boughtWithGold':
      return `${n(e.player)} paid ${e.gold as number} gold for ${cards({ [e.resource as string]: 1 })}.`;
    case 'crewLanded':
      return `${n(e.player)} landed ${e.crews as number} crew${e.crews === 1 ? '' : 's'} at a pirate lair.`;
    case 'lairCaptured':
      return `Pirate lair captured by ${(e.players as number[]).map(n).join(', ')}: ${e.gold as number} gold each, and ${n(e.hero)} is the hero.`;
    case 'pirateChased':
      return e.chased
        ? `${n(e.player)} rolled ${e.roll as number} and drove the pirate ship off!`
        : `${n(e.player)} rolled ${e.roll as number}: the pirate ship holds its ground.`;
    case 'shipsFished':
      return `Fish on ${e.total as number}: ${Object.entries(e.caught as Record<string, number>)
        .map(([seat, k]) => `${n(Number(seat))} caught ${k}`)
        .join(', ')}.`;
    case 'spiceBought':
      return `${n(e.player)} bought a sack of spice for ${e.gold as number} gold.`;
    case 'goodsDelivered': {
      const g = e.goods as Record<string, number>;
      const what = [
        g.fish ? `${g.fish} fish` : '',
        g.spice ? `${g.spice} sack${g.spice === 1 ? '' : 's'} of spice` : '',
      ]
        .filter(Boolean)
        .join(' and ');
      const steps = e.steps as number;
      return `${n(e.player)} brought home ${what}${steps ? `: ${steps} mission step${steps === 1 ? '' : 's'}` : ''}.`;
    }
    case 'tributePaid':
      return `${n(e.player)} paid the pirate ${e.gold as number} gold to sail past.`;
    case 'goldForNothing':
      return `${(e.players as number[]).map(n).join(', ')} got nothing from the roll and took 1 gold.`;
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
            : e.award === 'mostVehicles'
              ? 'Most Vehicles'
              : 'Largest Army';
      // Seafarers calls it Longest Trade Route; the log keeps one name.
      if (e.to === null) return `Nobody holds ${label} now.`;
      return e.wonder === 'colosseum'
        ? `🏟️ ${n(e.to)} ties for ${label} and the Colosseum's court gives it to them!`
        : `${n(e.to)} takes ${label}!`;
    }
    case 'gameOver':
      return `🏆 ${n(e.winner)} wins!`;
    // ---- Treasures, Dragons & Adventurers ----
    case 'treasure':
      return `🧰 ${n(e.player)} ${e.from === 'fog' ? 'found a treasure in the fog' : 'opened a treasure chest'}: ${TREASURE_TEXT[e.kind as TreasureKind] ?? 'a treasure'}.`;
    case 'dragonsWake':
      return `🐉 The dragons stir: ${e.awake as number} of ${e.total as number} awake.`;
    case 'dragonsAttack':
      return '🐉 All the dragons are awake. They attack!';
    case 'dragonsSpread': {
      const k = (e.hexes as string[]).length;
      return `🐉 ${k === 1 ? 'A dragon flies' : `${k} dragons fly`} out of the desert.`;
    }
    case 'tokenPlaced':
      return e.from === 'pile'
        ? `🔢 A new hex takes number ${e.token as number} from the pile.`
        : `🔢 ${n(e.player)} moved number ${e.token as number} from the home island to a new hex.`;
    case 'knightCrossed':
      return `⛵ ${n(e.player)} ferried a knight to the enchanted land.`;
    case 'knightRoamed':
      return `${n(e.player)} moved a knight across the enchanted land.`;
    case 'knightPushed':
      return `${n(e.player)} pushed ${n(e.victim)}'s knight aside.`;
    case 'dragonFight':
      return e.won
        ? `⚔️ ${n(e.player)} beat a dragon!`
        : `🐉 The dragon was too strong for ${n(e.player)}'s knight.`;
    case 'dragonSlain':
      return `⚔️ ${n(e.player)} drove out a dragon.`;
    case 'canalDug': {
      const who = e.players as number[];
      return who[0] === who[1]
        ? `⛏️ ${n(who[0])} dug a stretch of the canal: +2 points.`
        : `⛏️ ${n(who[0])} and ${n(who[1])} dug a stretch of the canal: +1 point each.`;
    }
    case 'canalFlooded':
      return '💧 The Great Canal is finished! The basin floods and the farmland grows grain again.';
    case 'goldPanned':
      return `⛏️ An 8: knights by the gold rivers pan for gold.`;
    // ---- Cities & Knights ----
    case 'eventDie':
      if (e.face === 'ship') return 'Event die: the barbarian ship sails closer.';
      if (e.face === 'wild')
        return `Event die: the barbarian ship sails closer, and a wild gate with red ${e.red as number}: everyone may draw from any deck they can.`;
      if (e.face === 'joker')
        return `🃏 Event die: the joker, with red ${e.red as number}. ${n(e.player)} picks the gate.`;
      return `Event die: ${TRACK[e.face as string] ?? e.face} gate with red ${e.red as number}.`;
    case 'jokerPicked':
      return `🃏 ${n(e.player)} opened the ${TRACK[e.deck as string] ?? e.deck} gate.`;
    // ---- Church, Faith & Reformation ----
    case 'citySeatBuilt':
      return `${nameOf(e.seat as string).icon ?? ''} ${n(e.player)} made a city their ${nameOf(e.seat as string).name}.`.trim();
    case 'citySeatLost':
      return `${n(e.player)} lost their ${nameOf(e.seat as string).name} with the city.`;
    case 'churchFestival':
      return `🍻 ${n(e.player)} held a festival on ${n(e.target)}'s ${e.kind as string}: it stops until ${n(e.player)}'s next turn.`;
    case 'churchFestivalOver':
      return `🍻 ${n(e.player)}'s festival on ${n(e.target)}'s ${e.kind as string} is over.`;
    case 'churchExile':
      return `${n(e.player)} sent the robber into exile.`;
    case 'churchLent':
      return `✝️ ${n(e.player)} called Lent: ${n(e.target)} may not build until they pay a grain and a wool.`;
    case 'churchLentOver':
      return `✝️ ${n(e.player)} has kept Lent and may build again.`;
    case 'churchInquisitor':
      return typeof e.target === 'number'
        ? `👁️ ${n(e.player)} sent the Inquisitor to ${n(e.target)}'s city: no level 3 abilities for them.`
        : `👁️ ${n(e.player)} moved the Inquisitor.`;
    case 'churchAnathema':
      return `⛔ ${n(e.player)} pronounced Anathema on ${n(e.target)}: ${TRACK[e.track as string] ?? e.track} is shut until they pay.`;
    case 'churchAnathemaOver':
      return `${n(e.player)} paid off the Anathema: ${TRACK[e.track as string] ?? e.track} is open again.`;
    case 'churchReformation':
      return e.option === 'mine'
        ? `${n(e.player)} played Reformation and swapped their progress cards.`
        : `${n(e.player)} played Reformation: everyone else swaps their progress cards.`;
    case 'churchRefuge':
      return `${n(e.player)} found Refuge: their cities are safe from the next barbarian attack.`;
    // ---- Witches, Wizards & Dragons ----
    case 'vetoed':
      return e.card === 'barbarians'
        ? `🛑 ${n(e.player)} played Magic Veto: their cities are safe from the barbarians.`
        : `🛑 ${n(e.player)} turned away ${n(e.by)}'s ${nameOf(e.card as string).name} with a Magic Veto.`;
    case 'princeMoved':
      return `🤴 ${n(e.player)} moved a prince.`;
    case 'explorersSwapped':
      return `🧭 ${n(e.player)}'s explorers swapped two numbers.`;
    case 'unitGaveWay':
      return `⚔️ ${n(e.player)}'s army gave ${e.left ? 'up an infantry' : 'way, a unit down'} to move the robber.`;
    case 'knightGaveWay':
      return e.left
        ? `🛡️ ${n(e.player)}'s knight left the board to move the robber.`
        : `🛡️ ${n(e.player)}'s knight stepped down to move the robber.`;
    case 'robberBought':
      return `${n(e.player)} paid to move the robber.`;
    case 'unitBought':
      return `⚔️ ${n(e.player)} mustered ${e.free ? 'a free ' : ''}${String(e.unit)}.`;
    case 'wallBuilt':
      return `🧱 ${n(e.player)} built a ${e.free ? 'free ' : ''}city wall.`;
    case 'armyBoarded':
      return `🪖 ${n(e.player)}'s army went aboard a ship.`;
    case 'armyLanded':
      return `🪖 ${n(e.player)}'s army went ashore.`;
    case 'cardSaved':
      return `🏦 ${n(e.player)} saved ${cards({ [e.card as string]: 1 })} for ${String(e.term)} turns.`;
    case 'savingsPaid':
      return `🏦 ${n(e.player)}'s savings paid out ${cards({ [e.card as string]: Number(e.cards) })}.`;
    case 'cardBorrowed':
      return `🧾 ${n(e.player)} borrowed ${cards({ [e.card as string]: 1 })} for ${String(e.term)} ${e.term === 1 ? 'turn' : 'turns'}.`;
    case 'loanRepaid':
      return `🧾 ${n(e.player)} paid back a loan with ${cards(e.paid as Record<string, number>)}.`;
    case 'loanDefaulted':
      return `📉 ${n(e.player)} could not pay back a loan: ${String(e.points)} ${e.points === 1 ? 'point' : 'points'} of bad debt.`;
    case 'townLoan':
      return `🧾 ${n(e.player)} built a ${String(e.item)} on a ${String(e.term)}-turn loan.`;
    case 'derivativeBought':
      return `🎲 ${n(e.player)} bet on ${n(e.on)}'s ${String(e.card)} loan not being paid back.`;
    case 'derivativePaid':
      return `🎲 ${n(e.player)}'s derivative on ${n(e.from)}'s loan paid ${String(e.points)} ${e.points === 1 ? 'point' : 'points'}.`;
    case 'sevenDrawn':
      return `📈 ${n(e.player)} showed ${cards(e.shown as Record<string, number>)}; drawn from the others: ${
        Object.entries(e.drawn as Record<string, Record<string, number>>)
          .map(([seat, c]) => `${n(Number(seat))} ${cards(c)}`)
          .join('; ') || 'nothing'
      }.`;
    case 'ratesSet':
      return `📈 ${n(e.player)} set the market: ${(e.up as string[]).join(' and ')} cheaper${
        (e.down as string[]).length ? `, ${(e.down as string[]).join(' and ')} dearer` : ''
      }.`;
    case 'sevenKept':
      return e.card
        ? `📈 ${n(e.player)} kept ${cards({ [e.card as string]: 1 })} of ${n(e.from)}'s.`
        : `📈 ${n(e.player)} kept one of ${n(e.from)}'s cards.`;
    case 'unitsLanded':
      return `🏴‍☠️ ${n(e.player)} put an army ashore on a pirate lair (${String(e.points)} points).`;
    case 'heroPaid':
      return `${n(e.player)}'s hero paid with a unit.`;
    case 'unitsHome':
      return `${n(e.player)}'s units from the lair went home: no ship had room.`;
    case 'shipAttacked':
      return `⚔️ ${n(e.player)} attacked ${n(e.defender)}'s ship.`;
    case 'seaBattleRound':
      return `🌊 ${n(e.player)} ${e.won ? 'won' : 'lost'} a round at sea (${(e.rolls as number[]).join(' vs ')}).`;
    case 'cargoTaken':
      return `${n(e.player)} took ${(e.taken as string[]).join(' and ') || 'nothing'} from ${n(e.from)}'s ship.`;
    case 'seaBattleBroken':
      return `${n(e.player)} broke off the sea battle.`;
    case 'pirateFought':
      return `🏴‍☠️ ${n(e.player)} fought the pirate ship (${(e.rolls as number[]).join(' vs ')}) and ${e.won ? 'won' : 'lost'}.`;
    case 'unitSteppedUp':
      return `⚒️ ${n(e.player)} stepped ${String(e.unit)} up to ${String(e.to)}.`;
    case 'unitIntrigue':
      return `🕵️ ${n(e.player)} took an infantry from ${n(e.victim)}.`;
    case 'unitDeserted':
      return `🏃 ${n(e.player)}'s ${String(e.unit)} deserted to ${n(e.to)}.`;
    case 'kingdomMarker':
      return e.attack !== null && e.attack !== undefined
        ? `⚔️ ${n(e.player)} set a kingdom marker on ${n(e.attack)}'s field.`
        : `👑 ${n(e.player)} set a ${e.free ? 'free ' : ''}kingdom marker.`;
    case 'kingdomBattle': {
      const [a, b] = e.strength as [number, number];
      return a === b
        ? `⚔️ ${n(e.player)} and ${n(e.defender)} fought to a draw (${a}–${b}); the attacker's marker goes.`
        : `⚔️ ${n(e.winner)} won the battle for a field (${a}–${b}) and takes a free marker.`;
    }
    case 'vehicleMoved':
      return `${n(e.player)} moved a ${vehicle(e.piece)}${Object.keys(e.paid as object).length ? ` for ${cards(e.paid as Record<string, number>)}` : ''}.`;
    case 'vehicleActivated':
      return `${n(e.player)} turned a ${vehicle(e.piece)} active again.`;
    case 'vehicleYield': {
      const got = e.received as Record<string, Record<string, number>>;
      return `🚂 Trains collected: ${Object.entries(got)
        .map(([seat, c]) => `${n(Number(seat))} ${cards(c)}`)
        .join(', ')}.`;
    }
    case 'fished':
      return `🎣 ${Object.entries(e.fish as Record<string, number>)
        .map(([seat, k]) => `${n(Number(seat))} ${k} fish`)
        .join(', ')}: a resource of their choice for each.`;
    case 'lwPicked':
      return `${n(e.player)} took ${cards(e.cards as Record<string, number>)}.`;
    case 'knightSpeed':
      return `⚔️ ${n(e.player)} played a knight for ${e.points as number} free steps.`;
    case 'vehicleChased':
      return `⚔️ ${n(e.player)} chased ${n(e.owner)}'s ${vehicle(e.piece)} to the next field.`;
    case 'vehicleSunk':
      return `⚔️ ${n(e.player)} chased ${n(e.owner)}'s ${vehicle(e.piece)} off the board, back to their supply.`;
    case 'startingCity':
      return `${n(e.player)} starts with a city.`;
    case 'freeDevCard':
      return `${n(e.player)} drew a free development card.`;
    case 'armyMarched':
      return `⚔️ ${n(e.player)}'s army marched${Number(e.paid) ? ` (${String(e.paid)} paid)` : ''}.`;
    case 'attacked':
      return `⚔️ ${n(e.player)} attacked ${n(e.defender)}'s ${(e.target as { kind: string }).kind === 'army' ? 'army' : 'town'}.`;
    case 'battleRound': {
      const [a, d] = e.rolls as [number, number];
      const [da, dd] = e.dice as [number, number];
      const walls = Number(e.walls) ? ` +${String(e.walls)}` : '';
      return `🎲 ${a} (d${da}) against ${d}${walls} (d${dd}): ${e.won ? `${n(e.player)} wins the round` : `${n(e.defender)} holds`}.`;
    }
    case 'armyDestroyed':
      return `${n(e.player)}'s army was wiped out.`;
    case 'armyRetreated':
      return `${n(e.player)} broke off the fight.`;
    case 'settlementCaptured':
      return e.taken
        ? `🏴 ${n(e.player)} captured ${n(e.from)}'s settlement.`
        : `🔥 ${n(e.player)} destroyed ${n(e.from)}'s settlement.`;
    case 'robberFought':
      return e.won
        ? `⚔️ ${n(e.player)}'s army drove off the robber.`
        : `⚔️ The robber beat ${n(e.player)}'s army.`;
    case 'robberToll':
      return `${n(e.player)} paid the robber a card.`;
    case 'merchantFought':
      return e.won
        ? `⚔️ ${n(e.player)}'s army beat ${n(e.defender)}'s merchant.`
        : `⚔️ ${n(e.defender)}'s merchant held off ${n(e.player)}'s army.`;
    case 'merchantRelocated':
      return `${n(e.player)} moved the merchant.`;
    case 'merchantToll':
      return `${n(e.player)} paid ${n(e.to)} two cards for the merchant.`;
    case 'barbarianSiege':
      return e.fell
        ? `🏴‍☠️ The barbarians took one of ${n(e.player)}'s cities.`
        : `🛡️ ${n(e.player)}'s city held off the barbarians.`;
    case 'alliesJoined':
      return `⚔️ ${n(e.player)}'s neighbouring armies joined the fight.`;
    case 'nukeBought':
      return `☢️ ${n(e.player)} bought a nuke.`;
    case 'nukeDetonated':
      return `☢️ ${n(e.player)} set off a nuke.`;
    case 'playerDestroyed':
      return `💀 ${n(e.player)} was wiped out by ${n(e.by)}.`;
    case 'capitulated':
      return `🏳️ ${n(e.player)} capitulated to ${n(e.to)}, finishing on ${String(e.vp)} points.`;
    case 'wizardPlaced':
      return `🧙 ${n(e.player)} put the Wizard at their building.`;
    case 'wizardGone':
      return '🧙 The Wizard left the board.';
    case 'spellLifted':
      return `🧹 The witch's spell on ${n(e.player)}'s knights has lifted.`;
    case 'smallDragon':
      return `🦎 ${n(e.player)}'s Small Dragon keeps their cards.`;
    case 'magicFortune':
      return `🍀 ${n(e.player)}'s next settlement costs ${cards(e.cards as Record<string, number>)} less.`;
    case 'magicPower':
      return `✨ ${n(e.player)}'s knights count double in the next attack.`;
    case 'greatDragon':
      return `🐉 ${n(e.player)}'s Great Dragon takes ${n(e.target)}'s top ${TRACK[e.track as string] ?? e.track} improvement.`;
    case 'lightning':
      return `⚡ ${n(e.player)}'s lightning turned a field into desert.`;
    case 'landSwapped':
      return `🗺️ ${n(e.player)} swapped two fields.`;
    case 'magicMove':
      return `🌀 ${n(e.player)} moved a ${e.piece as string} by magic.`;
    case 'unicornDance':
      return `🦄 ${n(e.player)} danced with the unicorns: the event die will show ${TRACK[e.face as string] ?? e.face}.`;
    // ---- Greed, Wealth & Power ----
    case 'gwpBuilt':
      return `${n(e.player)} built a ${GWP_BUILDING[e.building as string] ?? e.building}.`;
    case 'gwpLost':
      return `${n(e.player)} lost their ${GWP_BUILDING[e.building as string] ?? e.building} with the city.`;
    case 'beerBrewed':
      return `🍺 ${(e.players as number[]).map(n).join(', ')} brewed a Beer.`;
    case 'beerTrade':
      return `${n(e.player)} traded ${e.beer as number} Beer for ${cards(e.got as Record<string, number>)}.`;
    case 'beerKnight':
      return e.owner === e.player
        ? `🍺 ${n(e.player)} activated a knight with Beer.`
        : `🍺 ${n(e.player)} activated ${n(e.owner)}'s knight with Beer.`;
    case 'neutralPlaced': {
      const piece = nameOf(e.piece as string).name;
      return e.from === null || e.from === e.player
        ? `${n(e.player)} placed the ${piece}.`
        : `${n(e.player)} took the ${piece} from ${n(e.from)}.`;
    }
    case 'neutralChased':
      return `The ${nameOf(e.by as string).name} chased the ${nameOf(e.piece as string).name} away.`;
    case 'neutralYield':
      return `${n(e.player)}'s ${nameOf(e.piece as string).name} brought ${cards(e.got as Record<string, number>)}.`;
    case 'tradingPost':
      return `${n(e.player)}'s Trading Post gave back ${cards(e.got as Record<string, number>)}.`;
    case 'knightRemoved':
      return `${n(e.player)} gave up a knight at the Stone Circle.`;
    case 'knightsDeactivated':
      return `${n(e.player)} played ${nameOf((e.card as string | undefined) ?? 'badOmen').name}: ${n(e.target)}'s knights stand down.`;
    case 'banishment':
      return `${n(e.player)} banished the neutral pieces.`;
    case 'missionary':
      return `${n(e.player)} sent a Missionary to ${n(e.target)}, who lost ${e.lost as number} card(s).`;
    case 'summoned':
      return `${n(e.player)} summoned away ${n(e.owner)}'s ${String(e.piece).startsWith('knight') ? 'knight' : (e.piece as string)}.`;
    case 'brothel':
      return e.paid
        ? `${n(e.player)} paid ${n(e.to)} 1 ${nameOf(e.paid as string).name}.`
        : `${n(e.player)} refused ${n(e.to)}, and their knights stand down.`;
    case 'intimidation':
      return `${n(e.player)} played Intimidation and keeps their cards.`;
    case 'progressTaken':
      return `${n(e.player)} took a progress card from ${n(e.from)}.`;
    case 'progressGiven':
      return `${n(e.player)} gave ${n(e.to)} a progress card.`;
    case 'honorParade':
      return `🎺 ${n(e.player)} held an Honor Parade: every knight is active.`;
    case 'damselPlaced':
      return `👸 ${n(e.player)} rolled doubles and moved the Damsel.`;
    case 'damselLeft':
      return e.why === 'attack'
        ? '👸 The Damsel left after the attack.'
        : '👸 The Damsel was chased off her hex.';
    case 'dragonMoved':
      return e.hex === null
        ? `🐉 ${n(e.player)} sent the dragon away.`
        : `🐉 ${n(e.player)} moved the dragon.`;
    case 'dragonLair':
      return `🐉 ${n(e.player)} woke the dragon in its lair: that hex lost its number.`;
    case 'dragonChased':
      return e.by === 'wizard'
        ? '🧙 The Wizard drove the dragon away.'
        : `🐉 ${n(e.player)}'s knight chased the dragon away.`;
    case 'gwpDragonSlain':
      return `🗡️ ${n(e.player)} slew the dragon: Dragon Slayer, +2 points!`;
    case 'lentPaid':
      return `${n(e.player)} paid for Lent and may build.`;
    case 'festival':
      return `🍻 ${n(e.player)} threw a Beer festival for ${n(e.target)}.`;
    case 'festivalOver':
      return typeof e.stopped === 'number'
        ? `🐦‍⬛ ${n(e.stopped)} broke up ${n(e.player)}'s Beer festival.`
        : `🍻 ${n(e.player)}'s Beer festival is over.`;
    case 'rollHeld':
      return `🎲 ${n(e.player)} rolled ${Number(e.red) + Number(e.yellow)}: waiting on any Indulgence.`;
    case 'indulgence':
      return `📿 ${n(e.player)} played an Indulgence and threw ${(e.dice as string[]).join(' + ')} again.`;
    case 'wonderBuilt': {
      const w = WONDERS[e.wonder as WonderId];
      const stage = e.stage as number;
      if (!w) return null;
      if (stage === 1) return `${w.icon} ${n(e.player)} began the ${w.name}.`;
      return stage === 4
        ? `${w.icon} ${n(e.player)} finished the ${w.name}!`
        : `${w.icon} ${n(e.player)} built ${w.stages[stage - 1]!.name}, stage ${stage} of the ${w.name}.`;
    }
    case 'wonderTrade':
      return `${WONDERS[e.wonder as WonderId]?.icon ?? '🏛️'} ${n(e.player)} swapped ${cards(e.gave as Record<string, number>)} for ${cards(e.got as Record<string, number>)}.`;
    case 'wonderHarvest':
      return `🛕 ${n(e.player)} made an offering to Chaac, and a hex produced.`;
    case 'wonderDiceHeld':
      return null;
    case 'wonderReroll':
      return `${WONDERS[e.wonder as WonderId]?.icon ?? '🎲'} ${n(e.player)} threw again: ${e.a} and ${e.b}.`;
    case 'wonderPicks':
      return `${WONDERS[e.wonder as WonderId]?.icon ?? '🏛️'} ${n(e.player)} may take ${e.count === 1 ? 'a resource' : `${e.count} resources`} of their choice.`;
    case 'wonderPick':
      return `${n(e.player)} took ${cards({ [e.card as string]: 1 })}.`;
    case 'wonderBay':
      return `✝️ The bay produced for ${n(e.player)}: ${cards(e.got as Record<string, number>)}.`;
    case 'wonderDiscard':
      return `🏛️ The Mausoleum: ${n(e.player)} discards ${e.to} instead of ${e.from}.`;
    case 'wonderSiege':
      return `🏛️ ${n(e.player)} rolled a 6 or 8 and moves the robber.`;
    case 'wonderSweep':
      return `🏹 ${n(e.player)} swept the roaming pieces off the board.`;
    case 'wonderDraw':
      return `🌿 ${n(e.player)} drew a card for moving the robber.`;
    case 'civPicked':
      return `${n(e.player)} picked a civilisation.`;
    case 'civsRevealed':
      return `🏳️ Civilisations chosen: ${Object.entries(e.civs as Record<string, string>)
        .map(([s, c]) => `${n(Number(s))} (${CIV_BY_ID[c]?.name ?? c})`)
        .join(', ')}.`;
    case 'civUnlocked':
      return `✨ ${n(e.player)} reached 10 points: ${CIV_BY_ID[e.civ as string]?.later.name ?? 'a new ability'} is theirs.`;
    case 'civPicks':
      if (e.any) return `🏳️ ${e.why}: ${n(e.player)} may take any resource or commodity.`;
      return `🏳️ ${e.why}: ${n(e.player)} may take ${e.count === 1 ? 'a resource' : `${e.count} resources`} of their choice.`;
    case 'civPick':
      return `${n(e.player)} took ${cards({ [e.card as string]: 1 })}.`;
    case 'civHarvest':
      return `🏳️ ${n(e.player)} took ${cards({ [e.card as string]: 1 })} from beside their building.`;
    case 'civHarbor':
      return `⚓ ${n(e.player)} ${e.swapped ? 'swapped two harbors' : 'moved a harbor'}.`;
    case 'civSilk':
      return `🏳️ ${n(e.player)} now trades ${cards({ [e.card as string]: 1 })} 2:1.`;
    case 'civLake':
      return `🏳️ Lake Victoria: ${n(e.player)} takes ${e.count} ${e.card} and trades it 1:1.`;
    case 'civWall':
      return `🧱 ${n(e.player)}'s starting city has a wall.`;
    case 'civGallic':
      return `🏳️ ${n(e.player)} swapped the number under the robber with another hex's.`;
    case 'civRevolution':
      return `🏳️ ${n(e.player)}'s revolution brought down ${n(e.victim)}'s strong knight.`;
    case 'civTiticaca':
      return `🏳️ ${n(e.player)} moved a hex out to sea: Lago Titicaca.`;
    case 'civLeap':
      return `🏳️ ${n(e.player)} turned a city back into a settlement for five progress cards.`;
    case 'civKhagan':
      return `⚔️ ${n(e.player)} moves the robber on their 3 or 11.`;
    case 'civSpoils':
      return `⚔️ ${n(e.player)} also took a progress card from ${n(e.from)}.`;
    case 'civMuscovyRoll':
      return e.hexes
        ? `🏳️ ${n(e.player)} threw ${e.total} for the robber.`
        : `🏳️ ${n(e.player)} threw ${e.total}: no hex for the robber there.`;
    case 'civMuscovyHex':
      return null;
    case 'civHabsburg':
      return `🏳️ ${n(e.player)} drew ${e.count} progress cards for the Habsburg Marriage.`;
    case 'civHabsburgKept':
      return `🏳️ ${n(e.player)} kept three and put the rest back.`;
    case 'civVienna':
      return `🏳️ Vienna Conference: ${n(e.player)} takes a ${e.deck} card.`;
    case 'civElDorado':
      return e.deck
        ? `🏳️ El Dorado: ${n(e.player)} threw again and takes a ${e.deck} card.`
        : `🏳️ El Dorado: ${n(e.player)} threw again, no card this time.`;
    case 'civPolynesia':
      return `🏳️ Polynesian Migration: ${n(e.player)} takes three free roads and three progress cards.`;
    case 'civCuzco':
      return `🏳️ Kingdom of Cuzco: ${n(e.player)} gets a second road free.`;
    case 'civTwoCities':
      return `🗿 ${n(e.player)} starts with two cities.`;
    case 'civAnnex':
      return `🗿 ${n(e.player)} annexed ${n(e.victim)}'s ${e.piece}, paying its price.`;
    case 'civRevengeReady':
      return `🗿 Code of Hammurabi: ${n(e.player)} may strike back at ${n(e.target)}.`;
    case 'civRevenge':
      return `🗿 ${n(e.player)} struck back, destroying ${n(e.target)}'s ${e.piece === 'knight1' ? 'knight' : e.piece}.`;
    case 'civWelfare':
      return `🏳️ ${n(e.player)} spent welfare tokens on ${cards({ [e.card as string]: 1 })}.`;
    case 'civHarakiri':
      return `⚔️ ${n(e.player)}'s samurai gave their life to destroy ${n(e.victim)}'s ${e.piece}.`;
    case 'civZulu':
      return `⚔️ ${n(e.player)}'s knight took over the ${e.piece}.`;
    case 'civCurse':
      return `💡 Curse of the Medicine Man: ${n(e.target)} loses a city too.`;
    case 'civMaya':
      return `🗿 The yellow die brings ${n(e.player)} a ${e.deck} card.`;
    case 'civKhmer':
      return `⚔️ ${n(e.player)} reached ${e.points} points: a progress card of their choice.`;
    case 'civDiceHeld':
      return `🏳️ ${n(e.player)} may throw the dice again.`;
    case 'civDemocracy':
      return `🏳️ ${n(e.player)} threw the ${(e.dice as string[]).join(' and ')} again: ${(e.red as number) + (e.yellow as number)}.`;
    case 'civSwapReady':
      return null;
    case 'civSwap':
      return `🏳️ ${n(e.player)} swapped ${cards({ [e.gave as string]: 1 })} for ${cards({ [e.got as string]: 1 })}.`;
    case 'civGain':
      return `🏳️ ${e.why}: ${n(e.player)} takes ${cards({ [e.card as string]: 1 })}.`;
    case 'civInnovation':
      return e.lucky
        ? `💡 ${n(e.player)}'s inventors threw ${e.red}: a ${e.track} card!`
        : `💡 ${n(e.player)}'s inventors threw ${e.red}: nothing this time.`;
    case 'civCapital':
      return `⚔️ Tenochtitlán: ${n(e.player)} takes ${cards(e.cards as Record<string, number>)}.`;
    case 'civFiveSuns':
      return `⚔️ Legend of the Five Suns: ${n(e.player)} gets a free city and three progress cards.`;
    case 'civHussar':
      return `⚔️ ${n(e.player)}'s hussars destroyed ${n(e.victim)}'s ${e.piece === 'knight1' ? 'knight' : e.piece}.`;
    case 'civUnion':
      return `⚔️ ${n(e.player)} joins ${n(e.leader)} in a union for a round.`;
    case 'civUnionShare':
      return e.cards
        ? `⚔️ The union brings ${n(e.player)} ${cards(e.cards as Record<string, number>)}.`
        : `⚔️ The union brings ${n(e.player)} a ${e.deck} card.`;
    case 'civRaid':
      return `⚔️ The barbarians won: a point for their ally ${n(e.player)}.`;
    case 'civRaze':
      return `⚔️ ${n(e.player)}'s raiders pillaged ${n(e.victim)}'s city.`;
    case 'civThor':
      return `⚔️ Thor's Hammer! ${n(e.player)} calls the barbarians ashore.`;
    case 'civBombard':
      return `🗿 The Great Bombard: ${n(e.player)} drove the barbarians back to sea.`;
    case 'civCaribbean':
      return `💡 ${n(e.player)}'s settlement by the sea brings ${e.count === 1 ? 'a progress card and a commodity' : 'two progress cards and two commodities'}.`;
    case 'civVictoria':
      return (e.tracks as string[]).length
        ? `💡 ¡Hasta la victoria! ${n(e.from)} hands ${n(e.player)} their ${(e.tracks as string[]).join(' and ')} metropolis.`
        : `💡 ¡Hasta la victoria! ${n(e.from)} has no metropolis to hand ${n(e.player)}.`;
    case 'civColonyDrawn':
      return `🏛️ ${n(e.player)} drew ${(e.options as string[]).map((c) => CIV_BY_ID[c]?.name ?? c).join(', ')}.`;
    case 'civSwitched':
      return `🏛️ ${n(e.player)} now leads ${CIV_BY_ID[e.civ as string]?.name ?? e.civ}.`;
    case 'civCalendar':
      return `🏳️ ${n(e.player)} turned ${n(e.target)}'s ${e.track} track back and moved their own on.`;
    case 'trackLowered':
      return `${n(e.player)}'s ${e.track} track drops to level ${e.level}.`;
    case 'metropolisLost':
      return `${n(e.player)} loses the ${e.track} metropolis.`;
    case 'wonderFreeShip':
      return `🗼 The Lighthouse lit the way: ${n(e.player)}'s ship was free.`;
    case 'wonderRefundOffered':
      return `🕌 ${n(e.player)} may take back one resource they spent.`;
    case 'wonderRefund':
      return `🕌 ${n(e.player)} took back ${cards({ [e.card as string]: 1 })}.`;
    case 'wonderHuntStarted':
      return `🏹 ${n(e.player)} looks at the next card too.`;
    case 'wonderHunt':
      return `🏹 ${n(e.player)} ${e.swapped ? 'took the next card instead' : 'kept the card they drew'}.`;
    case 'wonderWall':
      return e.steps === 0
        ? `🧱 The Great Wall holds the barbarians where they are.`
        : `🧱 ${n(e.player)} sends the barbarians on two spaces.`;
    case 'wonderOffering':
      return `⚡ ${n(e.player)} made an offering at Olympia for a ${e.deck} card.`;
    case 'wonderEcho':
      return `🏜️ Petra: ${n(e.player)} also collected ${cards(e.got as Record<string, number>)} from their ${e.echo}s.`;
    case 'landDeed':
      return `📜 ${n(e.player)} holds a settlement spot with a Land Deed.`;
    case 'landDeedUsed':
      return `📜 ${n(e.player)} built a settlement: the Land Deed's wall comes back.`;
    case 'heroOfCatan':
      return `🦸 ${n(e.player)} has a level 4 knight: Hero of Catan, +1 point!`;
    case 'barbariansAdvance':
      return null;
    case 'barbariansWait':
      return `⛵ The barbarian ship stays in port (${e.rolls as number} of 3): it sets sail on the third ship.`;
    case 'knightCardDeserted':
      return `${n(e.player)} won over one of ${n(e.from)}'s knights.`;
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
    // ---- Duel rules ----
    case 'neutralBuilt':
      return `${n(e.player)} placed a ${e.piece as string} for the ${e.neutral === 0 ? 'white' : 'black'} builder.`;
    case 'tokensEarned':
      return `${n(e.player)} earned ${e.tokens as number} trade token${e.tokens === 1 ? '' : 's'}.`;
    case 'forcedTrade':
      return e.took
        ? `${n(e.player)} spent ${e.tokens as number} 🎟️ to take ${cards(e.took as Record<string, number>)} from ${n(e.from)}.`
        : `${n(e.player)} spent ${e.tokens as number} 🎟️ to take ${e.count as number} cards from ${n(e.from)}.`;
    case 'gaveBack':
      return `${n(e.player)} gave ${n(e.to)} ${cards(e.cards as Record<string, number>)} back.`;
    case 'robberSentHome':
      return `${n(e.player)} spent ${e.tokens as number} 🎟️ to send the robber home to the desert.`;
    case 'secondRoll':
      return 'Second roll of the turn.';
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
