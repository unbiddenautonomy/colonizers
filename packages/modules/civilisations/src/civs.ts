import type { Requirement, WonderId } from '@colonizers/module-world-wonders';

/**
 * The 40 civilisations of the Civilisations & World Wonders fan expansion,
 * ten in each of four classes. Each has an ability from the start of the game
 * and a second one from the first time its player reaches 10 points.
 *
 * Only civilisations whose two abilities both work are dealt (`ready`); the
 * rest arrive in later updates.
 */

export const CLASSES = ['warlord', 'republic', 'innovator', 'monument'] as const;
export type CivClass = (typeof CLASSES)[number];

export const CLASS_INFO: Record<CivClass, { name: string; icon: string; bonus: string }> = {
  warlord: {
    name: 'Warlord',
    icon: '⚔️',
    bonus: 'Start with an active strong knight beside one of your starting roads.',
  },
  republic: {
    name: 'Republic',
    icon: '🏛️',
    bonus:
      'Each new settlement takes a resource, and each new city a commodity, from a hex beside it.',
  },
  innovator: {
    name: 'Innovator',
    icon: '💡',
    bonus:
      "Each time you raise a city improvement, the red die is thrown: on a number that track's gate would pay you, take its progress card.",
  },
  monument: {
    name: 'Monument',
    icon: '🗿',
    bonus: 'Your wonder is easier to start, and its first stage is free (with World Wonders).',
  },
};

export interface Ability {
  name: string;
  text: string;
}

export interface Civ {
  id: string;
  name: string;
  cls: CivClass;
  start: Ability;
  /** From the first time the player reaches 10 points. */
  later: Ability;
  /** Monument civilisations: their wonder and its lower requirement. */
  wonder?: { id: WonderId; needs: string; requirement: Requirement };
  /** Both abilities work, so the civilisation can be dealt. */
  ready: boolean;
}

const civ = (
  id: string,
  name: string,
  cls: CivClass,
  start: [string, string],
  later: [string, string],
  ready = false,
  wonder?: Civ['wonder'],
): Civ => ({
  id,
  name,
  cls,
  start: { name: start[0], text: start[1] },
  later: { name: later[0], text: later[1] },
  ready,
  ...(wonder ? { wonder } : {}),
});

const swap = (track: string): string =>
  `Once a game, turn another player's ${track} track back a level while yours goes up one, for free.`;

const anyCard = (terrain: string): string =>
  `Once a roll, when ${terrain} pays you, swap one of those cards for any resource or commodity.`;

export const CIVS: Civ[] = [
  // ---- Warlord ----
  civ(
    'austria',
    'Austria-Hungary',
    'warlord',
    [
      'Vienna Conference',
      "Rolling a track's gate on your turn gives you its progress card, whatever your level.",
    ],
    [
      'Habsburg Marriage',
      'Once a game, draw a progress card from each deck and two more from one; keep three.',
    ],
    true,
  ),
  civ(
    'aztec',
    'Aztec',
    'warlord',
    [
      'Capital Tenochtitlán',
      'Your starting city takes two resources and two commodities from one hex beside it.',
    ],
    [
      'Legend of the Five Suns',
      'With all 5 settlements built, upgrade one to a city for free and take three progress cards.',
    ],
  ),
  civ(
    'japan',
    'Japan',
    'warlord',
    [
      'Empire of the Shogunate',
      'With each Defender of Catan card, also take a Politics card and a free active basic knight.',
    ],
    [
      'Samurai Harakiri',
      "Twice a game, give up a strong knight to destroy a rival's settlement, or a mighty one for a city.",
    ],
  ),
  civ(
    'khmer',
    'Khmer',
    'warlord',
    [
      'Angkor Wat',
      'Place a Diocese or Citadel beside your starting city and take a Religion or Magic card.',
    ],
    ['Neang Kong-hing', 'Take a progress card each time you first reach an even number of points.'],
  ),
  civ(
    'kongo',
    'Kongo',
    'warlord',
    [
      'Nzambi Mpungu',
      'Start with 2 more grain and a wool. Settlements cost one resource less, the one you lack if any.',
    ],
    ['Glory of Manikongo', anyCard('pasture')],
    true,
  ),
  civ(
    'maori',
    'Maori',
    'warlord',
    [
      'Haka Ceremony',
      'Rolling a gate on your turn gives you a resource or commodity of your choice.',
    ],
    [
      'Polynesian Migration',
      'With a city and a settlement on two islands, build 3 roads free and take three progress cards.',
    ],
    true,
  ),
  civ(
    'zulu',
    'Zulu',
    'warlord',
    [
      'Iklwa Spear',
      'Moving knights keeps them active, and an active basic knight can take over a roaming piece beside it.',
    ],
    ['Mbaba Mwana Waresa', anyCard('fields')],
  ),
  civ(
    'mongolia',
    'Mongolia',
    'warlord',
    [
      'Khaganate Terror',
      'Also move the robber on a 3 or 11, and take a card and a progress card from the player you rob.',
    ],
    ["Genghis Khan's Realm", 'Place 4 roads and an inland settlement beside them, for free.'],
    true,
  ),
  civ(
    'nordic',
    'Nordic',
    'warlord',
    [
      'Ivar the Boneless',
      'You side with the barbarians: your knights add to their strength, and you gain when they win.',
    ],
    ["Thor's Hammer", 'Once a game, win with the barbarians.'],
  ),
  civ(
    'poland',
    'Poland',
    'warlord',
    [
      'Winged Hussars',
      'Moving the robber lets you destroy a road, ship or basic knight beside it and place your own.',
    ],
    [
      'Polish-Lithuanian Union',
      "Once a game, share the leader's production and progress cards for a round.",
    ],
  ),
  // ---- Republic ----
  civ(
    'spain',
    'Spain',
    'republic',
    [
      'Age of the Conquistadores',
      'Start with the Inquisitor on a hex of your choice and two Religion cards.',
    ],
    ['Colonization of the Americas', 'Draw a new civilisation from the Americas and play it.'],
  ),
  civ(
    'britain',
    'Britain',
    'republic',
    ['Royal Navy', 'The barbarians can not take your cities.'],
    ['Colonies of the British Empire', 'Draw three civilisations and play one of them.'],
  ),
  civ(
    'ethiopia',
    'Ethiopia',
    'republic',
    ['Origin of Life', 'Place your settlement and city first, and take starting cards from both.'],
    ['Blessings of Atwa', 'Each of your cities adds 1 to your strength against the barbarians.'],
  ),
  civ(
    'france',
    'France',
    'republic',
    [
      'Gallic Empire',
      "Once a game, swap the number on the robber's hex with any other hex's number.",
    ],
    [
      'French Revolution',
      "Once a game, destroy a rival's strong knight and build a free settlement.",
    ],
    true,
  ),
  civ(
    'granColombia',
    'Gran Colombia',
    'republic',
    [
      'Cartagena de Indias',
      'Move a harbor anywhere on the coast, or swap two, and take two free ships.',
    ],
    [
      'Treasures of El Dorado',
      'Take a gold. On your turns, throw the red and event dice again for an extra progress card.',
    ],
    true,
  ),
  civ(
    'judea',
    'Judea',
    'republic',
    ['King Solomon', 'Start with the Wizard on a hex of your choice and two Magic cards.'],
    ['Holy City of Jerusalem', swap('Religion')],
    true,
  ),
  civ(
    'morocco',
    'Morocco',
    'republic',
    [
      'Moorish Kingdom',
      'Start with two resources of your choice. Until the first 7, everyone else takes resources instead of commodities.',
    ],
    ['Trade Gate to Africa', 'Trade any resource 2:1 for its commodity with the bank.'],
    true,
  ),
  civ(
    'netherlands',
    'Netherlands',
    'republic',
    [
      'The Dutch Golden Age',
      'Two free roads or ships after your starting placements, and one with each new settlement.',
    ],
    ['Amsterdam Tulip Mania', swap('Trade')],
    true,
  ),
  civ(
    'prussia',
    'Prussia',
    'republic',
    [
      "Von Bismarck's Welfare System",
      'Each roll that gives you nothing earns a welfare token; 2 buy a resource, 3 a commodity.',
    ],
    ['Unification with Bavaria', 'Take 5 Beer, and your festivals cost less Beer.'],
  ),
  civ(
    'russia',
    'Russia',
    'republic',
    [
      'Treatises of Muscovy',
      'When the player before you rolls a 7, throw the dice and put the robber on that number for them.',
    ],
    ["KGB's Foreign Intelligence", swap('Politics')],
    true,
  ),
  // ---- Monument ----
  civ(
    'rome',
    'Rome',
    'monument',
    ['Holy Roman Empire', 'Start with a Diocese and two Religion cards.'],
    [
      'All Roads lead to Rome',
      "Twice, buy a rival's settlement or city beside your roads from them at its building price.",
    ],
    false,
    {
      id: 'colosseum',
      needs: 'a city and a settlement around one hex',
      requirement: { kind: 'ring' },
    },
  ),
  civ(
    'babylon',
    'Babylon',
    'monument',
    ['Mesopotamian Trade', 'Start with the Merchant on a hex of your choice and two Trade cards.'],
    [
      'Code of Hammurabi',
      'When another player harms you, destroy one of their roads, ships or inactive basic knights.',
    ],
    false,
    {
      id: 'hangingGardens',
      needs: '3 settlements or cities by forest',
      requirement: { kind: 'terrain', terrain: 'lumber', count: 3 },
    },
  ),
  civ(
    'china',
    'China',
    'monument',
    ['Silk Road', 'Trade a resource of your choice 2:1, as if you had its harbor.'],
    [
      'Great Leap Forward',
      'Once a game, turn a city back into a settlement for five progress cards, one of each colour.',
    ],
    true,
    {
      id: 'greatWall',
      needs: 'a closed ring of 7 or more roads',
      requirement: { kind: 'loop', route: 'land', length: 7 },
    },
  ),
  civ(
    'egypt',
    'Egypt',
    'monument',
    [
      "Cleopatra's Empire",
      'Each time you upgrade a settlement to a city, also raise a city improvement one level for free.',
    ],
    ['People of the Nile', 'Trade lumber and wool, and paper and cloth, 1:1 with the bank.'],
    true,
    {
      id: 'pyramids',
      needs: 'a city by the desert',
      requirement: { kind: 'terrain', terrain: 'desert', count: 1, citiesOnly: true },
    },
  ),
  civ(
    'greece',
    'Greece',
    'monument',
    ["Plato's Republic", 'Start with the Scholar on a hex of your choice and two Science cards.'],
    [
      'Athenian Democracy',
      "Once every two rounds, on anyone's turn, throw one, two or all dice again.",
    ],
    true,
    {
      id: 'zeus',
      needs: 'a city by a gold field',
      requirement: { kind: 'terrain', terrain: 'gold', count: 1, citiesOnly: true },
    },
  ),
  civ(
    'inca',
    'Inca',
    'monument',
    [
      'Kingdom of Cuzco',
      'By mountains or pasture, each road you pay for brings a second free, and settlements cost a resource less.',
    ],
    ['Lago Titicaca', 'Once a game, swap an inland hex, with its number, for a sea hex.'],
    true,
    {
      id: 'machuPicchu',
      needs: '3 settlements or cities by pasture',
      requirement: { kind: 'terrain', terrain: 'wool', count: 3 },
    },
  ),
  civ(
    'india',
    'India',
    'monument',
    ['Population Growth', 'Start with two cities and two city walls.'],
    [
      'Multi-Ethnic Empire',
      'Each settlement or city you build may take a progress card matching a hex beside it.',
    ],
    false,
    {
      id: 'taj',
      needs: '3 settlements or cities by hills',
      requirement: { kind: 'terrain', terrain: 'brick', count: 3 },
    },
  ),
  civ(
    'maya',
    'Maya',
    'monument',
    ["Temples of Tik'al", 'Start with a Citadel, a city wall and two Magic cards.'],
    [
      'Queen Wak Chanil Ajaw',
      'On your rolls, the yellow die also counts for taking progress cards.',
    ],
    false,
    {
      id: 'chichenItza',
      needs: '3 settlements or cities by fields',
      requirement: { kind: 'terrain', terrain: 'grain', count: 3 },
    },
  ),
  civ(
    'ottoman',
    'Ottoman',
    'monument',
    [
      'Protection of Constantinople',
      'Start with a Citadel and a city wall beside your starting city, and a Politics card.',
    ],
    ['Great Turkish Bombard', 'Once a game, defeat the barbarians.'],
    false,
    {
      id: 'artemis',
      needs: '3 settlements or cities by mountains',
      requirement: { kind: 'terrain', terrain: 'ore', count: 3 },
    },
  ),
  civ(
    'persia',
    'Persia',
    'monument',
    ['Xerxes the Great', 'Start with the Duke on a hex of your choice and two Politics cards.'],
    [
      'Achaemenid Legacy',
      'Rolling the barbarian ship on your turn gives you a resource of your choice.',
    ],
    true,
    {
      id: 'mausoleum',
      needs: 'a mighty knight',
      requirement: { kind: 'mightyKnights', count: 1 },
    },
  ),
  // ---- Innovator ----
  civ(
    'papua',
    'Papua',
    'innovator',
    [
      'Uncontacted Tribes',
      'Start on an island apart from the main one; nobody may build within 3 roads of you.',
    ],
    ['Glorious Peak of Puncak Jaya', anyCard('mountains')],
  ),
  civ(
    'amazon',
    'Amazon',
    'innovator',
    ['Beauty of the Amazon', anyCard('forest')],
    ['Shamanic Yagé Ceremony', swap('Magic')],
    true,
  ),
  civ(
    'america',
    'America',
    'innovator',
    [
      'Iroquois Confederacy',
      'Start with three settlements. Your first city costs only 2 ore and a grain.',
    ],
    [
      'Curse of the Medicine Man',
      'When the barbarians win and you were not the weakest, a second player loses a city.',
    ],
  ),
  civ(
    'australia',
    'Australia',
    'innovator',
    ['The Mystery of Uluru', anyCard('hills')],
    ['Aboriginal People', 'Place a free settlement on an island apart from all your buildings.'],
    true,
  ),
  civ(
    'cuba',
    'Cuba',
    'innovator',
    [
      'Riches of the Spanish Caribbean',
      'Each settlement by the sea brings a progress card and a commodity of your choice.',
    ],
    [
      '¡Hasta la Victoria Siempre!',
      'The first other player to reach the winning points hands you a metropolis.',
    ],
  ),
  civ(
    'indonesia',
    'Indonesia',
    'innovator',
    [
      'Borobudur Temple',
      'Start with 2 more brick and 2 coin, and a wall under your starting city.',
    ],
    ['Great Nusantara', 'Place 4 ships and a coastal settlement beside them, for free.'],
    true,
  ),
  civ(
    'inuit',
    'Inuit',
    'innovator',
    [
      'Permafrost Preservation',
      "Start with 2 more wool and 2 cloth. Wool and cloth don't count on a 7 and can't be stolen.",
    ],
    ['Polar Circle', 'Hexes beside the northernmost sea produce one more card for you.'],
    true,
  ),
  civ(
    'korea',
    'Korea',
    'innovator',
    [
      'Joseon Dynasty',
      "Each progress card you draw brings its track's resource; the second of a kind in a round, its commodity.",
    ],
    ['Scholars of the Jade Hall', swap('Science')],
    true,
  ),
  civ(
    'maasai',
    'Maasai',
    'innovator',
    [
      'Lake Victoria',
      'Start with two of your scarcest resource, and trade it 1:1 for other resources.',
    ],
    [
      'The Spirit of Kilimanjaro',
      'When mountains pay one of your cities, it also takes a resource from another hex beside it.',
    ],
    true,
  ),
  civ(
    'mali',
    'Mali',
    'innovator',
    ['Golden Age of Timbuktu', 'Start with 2 more wool and 2 paper, and one free road or ship.'],
    ['The Wealth of Mansa Musa', 'Take two gold and raise your Wealth track one level.'],
    true,
  ),
];

export const CIV_BY_ID: Record<string, Civ> = Object.fromEntries(CIVS.map((c) => [c.id, c]));

export const READY_CIVS = CIVS.filter((c) => c.ready).map((c) => c.id);
