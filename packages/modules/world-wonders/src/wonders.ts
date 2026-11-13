import type { Cards } from '@colonizers/engine';

/**
 * The fourteen World Wonders, from the Civilisations & World Wonders fan
 * expansion. Each is built in four stages, in order, one stage a turn. A stage
 * gives its owner an ability or points; a finished wonder is worth 3 points.
 */

export const WONDER_IDS = [
  'pyramids',
  'lighthouse',
  'colossus',
  'hangingGardens',
  'zeus',
  'artemis',
  'mausoleum',
  'cristo',
  'taj',
  'colosseum',
  'greatWall',
  'petra',
  'chichenItza',
  'machuPicchu',
] as const;
export type WonderId = (typeof WONDER_IDS)[number];

/** What a player needs on the board before starting a wonder. */
export type Requirement =
  /** `count` settlements or cities (or only cities) touching hexes of a terrain. */
  | { kind: 'terrain'; terrain: string; count: number; citiesOnly?: boolean }
  /** `count` cities on harbors. */
  | { kind: 'harbors'; count: number }
  /** A closed loop of roads ('land') or ships ('sea') at least `length` long. */
  | { kind: 'loop'; route: 'land' | 'sea'; length: number }
  /** `count` mighty knights (Cities & Knights). */
  | { kind: 'mightyKnights'; count: number }
  /** A city and a settlement on the coast of the same sea hex. */
  | { kind: 'bay' }
  /** A city and two settlements around one hex. */
  | { kind: 'ring' }
  /** `count` settlements or cities touching hexes with these numbers. */
  | { kind: 'numbers'; numbers: number[]; count: number };

export interface Stage {
  name: string;
  cost: Cards;
  /** Points this stage adds. */
  vp: number;
  /** What the stage does, for the rulebook and the wonder panel. */
  text: string;
  /** False while the ability is still to come in a later update. */
  works: boolean;
}

export interface Wonder {
  id: WonderId;
  name: string;
  icon: string;
  /** Ancient (the seven classic wonders) or new. */
  era: 'ancient' | 'new';
  requirement: Requirement;
  /** The requirement in a few words. */
  needs: string;
  stages: [Stage, Stage, Stage, Stage];
}

const vp = (name: string, cost: Cards, n: number): Stage => ({
  name,
  cost,
  vp: n,
  text: `+${n} point${n === 1 ? '' : 's'}`,
  works: true,
});

const ability = (name: string, cost: Cards, text: string, works = false): Stage => ({
  name,
  cost,
  vp: 0,
  text,
  works,
});

export const WONDERS: Record<WonderId, Wonder> = {
  pyramids: {
    id: 'pyramids',
    name: 'Pyramids of Giza',
    icon: '🔺',
    era: 'ancient',
    requirement: { kind: 'terrain', terrain: 'desert', count: 2, citiesOnly: true },
    needs: '2 cities by the desert',
    stages: [
      ability(
        'Osiris, God of the Underworld',
        { wool: 2 },
        'When you move the robber, pirate or dragon, it also stops the wonder on that hex from working.',
      ),
      ability(
        'Nile Delta',
        { grain: 1, lumber: 2, wool: 1 },
        'On a 7, each desert beside one of your buildings gives you a resource of your choice.',
      ),
      ability(
        'Isis, Goddess of Fertility',
        { grain: 1, brick: 1, lumber: 1, wool: 2 },
        'The robber no longer stops your buildings from producing.',
        true,
      ),
      vp('Temple to Ra', { grain: 1, brick: 2, ore: 2 }, 3),
    ],
  },
  lighthouse: {
    id: 'lighthouse',
    name: 'Lighthouse of Alexandria',
    icon: '🗼',
    era: 'ancient',
    requirement: { kind: 'harbors', count: 2 },
    needs: '2 cities on harbors',
    stages: [
      ability(
        'Navigational Fire',
        { grain: 1, lumber: 2 },
        'Once a turn, build 2 ships for the price of one.',
      ),
      vp('Royal Library of Alexandria', { brick: 2, lumber: 1, ore: 1 }, 1),
      ability(
        'Merchant Guidance',
        { grain: 2, lumber: 1, wool: 2 },
        'Trade any resource with the bank 2:1.',
        true,
      ),
      vp('Alexander the Great', { grain: 1, lumber: 1, ore: 2, wool: 1 }, 2),
    ],
  },
  colossus: {
    id: 'colossus',
    name: 'Colossus of Rhodes',
    icon: '🗿',
    era: 'ancient',
    requirement: { kind: 'loop', route: 'sea', length: 7 },
    needs: 'a closed ring of 7 or more ships',
    stages: [
      ability(
        "Defense against Demetrius' Siege",
        { ore: 3 },
        'Your knights beside the sea count one more against the barbarians.',
      ),
      vp('Temple of Athena Lindia', { grain: 1, brick: 2, ore: 1 }, 1),
      ability(
        'Rhodo-Egyptian Alliance',
        { grain: 1, lumber: 2, wool: 2 },
        'Trade ore with the bank 1:1.',
        true,
      ),
      vp('Helios, Titan of the Sun', { grain: 1, lumber: 2, ore: 2 }, 2),
    ],
  },
  hangingGardens: {
    id: 'hangingGardens',
    name: 'Hanging Gardens of Babylon',
    icon: '🌿',
    era: 'ancient',
    requirement: { kind: 'terrain', terrain: 'lumber', count: 4 },
    needs: '4 settlements or cities by forest',
    stages: [
      ability(
        'Blossoming Variety',
        { grain: 1, lumber: 1, wool: 1 },
        'Once a turn, swap a lumber for any resource from the bank.',
        true,
      ),
      vp('Ishtar Gate', { brick: 2, ore: 2 }, 1),
      ability(
        'Mesopotamian Lion',
        { brick: 1, lumber: 1, ore: 1, wool: 2 },
        'When you move the robber or pirate, also draw a progress or development card.',
      ),
      vp('King Nebuchadnezzar', { grain: 2, lumber: 1, ore: 2 }, 2),
    ],
  },
  zeus: {
    id: 'zeus',
    name: 'Statue of Zeus at Olympia',
    icon: '⚡',
    era: 'ancient',
    requirement: { kind: 'terrain', terrain: 'gold', count: 2 },
    needs: '2 settlements or cities by a gold field',
    stages: [
      ability(
        'Nike, Goddess of Victory',
        { grain: 1, brick: 1, ore: 1, wool: 1 },
        'Up to two of your inactive knights also count against the barbarians.',
      ),
      vp('The Birth of Aphrodite', { grain: 1, lumber: 2, wool: 1 }, 1),
      ability(
        'Peloponnesian Offering',
        { grain: 1, wool: 2, ore: 2 },
        'Buy a progress card for one resource and the matching commodity.',
      ),
      vp('Olympic Games', { grain: 1, brick: 1, lumber: 1, ore: 1, wool: 1 }, 2),
    ],
  },
  artemis: {
    id: 'artemis',
    name: 'Temple of Artemis',
    icon: '🏹',
    era: 'ancient',
    requirement: { kind: 'terrain', terrain: 'ore', count: 4 },
    needs: '4 settlements or cities by mountains',
    stages: [
      ability(
        'The Amazons of Ephesus',
        { grain: 1, lumber: 1, ore: 1 },
        'When you roll a 7, you may take every roaming piece, like the merchant, off the board.',
      ),
      vp('Great Theater', { grain: 1, brick: 2, wool: 1 }, 1),
      ability(
        'Artemis, Goddess of the Hunt',
        { lumber: 2, ore: 1, wool: 2 },
        'Once a round, when you draw a progress or development card, look at the top two and keep one.',
      ),
      vp('Capital of Asiana', { grain: 2, brick: 1, lumber: 1, ore: 1 }, 2),
    ],
  },
  mausoleum: {
    id: 'mausoleum',
    name: 'Mausoleum at Halicarnassus',
    icon: '🏛️',
    era: 'ancient',
    requirement: { kind: 'mightyKnights', count: 2 },
    needs: '2 mighty knights',
    stages: [
      ability(
        'Stronghold of the Persian Empire',
        { brick: 2, ore: 1, wool: 1 },
        'On a 7, you discard only half of what you would.',
      ),
      vp('Herodotus, the Father of History', { grain: 2, lumber: 2 }, 1),
      ability(
        'Siege of Halicarnassus',
        { grain: 1, brick: 1, lumber: 1, ore: 2 },
        'When you roll a 6 or 8, you may also move the robber, pirate or dragon.',
      ),
      vp("Artemisia's Grief for Mausolus", { grain: 1, brick: 1, lumber: 1, wool: 2 }, 2),
    ],
  },
  cristo: {
    id: 'cristo',
    name: 'Cristo Redentor',
    icon: '✝️',
    era: 'new',
    requirement: { kind: 'bay' },
    needs: 'a city and a settlement on the same bay',
    stages: [
      ability(
        'Teleférico',
        { ore: 1, lumber: 2 },
        'You may build roads straight across mountains.',
      ),
      vp('Pão de Açúcar', { grain: 1, brick: 1, wool: 2 }, 1),
      ability(
        'Praias de Ipanema e Copacabana',
        { grain: 2, ore: 2, wool: 1 },
        'On a 7, the land hexes of your bay produce for you.',
      ),
      vp('Carnaval do Rio', { grain: 1, brick: 1, ore: 1, wool: 2 }, 2),
    ],
  },
  taj: {
    id: 'taj',
    name: 'Taj Mahal',
    icon: '🕌',
    era: 'new',
    requirement: { kind: 'terrain', terrain: 'brick', count: 4 },
    needs: '4 settlements or cities by hills',
    stages: [
      ability(
        'Yamuna River',
        { lumber: 2, wool: 1 },
        'Build ships for the price of a road, and roads for the price of a ship.',
      ),
      vp('Darwaza Gate', { grain: 1, brick: 2, ore: 1 }, 1),
      ability(
        'Eight Levels of Paradise',
        { grain: 1, brick: 1, lumber: 1, ore: 2 },
        'At the end of your turn, take back one resource you spent on building that turn.',
      ),
      vp('Eternal Love of Shah & Mumtaz', { grain: 1, lumber: 1, ore: 1, wool: 2 }, 2),
    ],
  },
  colosseum: {
    id: 'colosseum',
    name: 'Colosseum',
    icon: '🏟️',
    era: 'new',
    requirement: { kind: 'ring' },
    needs: 'a city and 2 settlements around one hex',
    stages: [
      ability(
        'Centumviral Court',
        { grain: 1, lumber: 1, wool: 1 },
        'Tie the holder of Longest Road or Largest Army and the card is yours.',
      ),
      vp('Arco di Trionfo', { brick: 2, lumber: 1, ore: 1 }, 1),
      ability(
        "Emperor Titus' Dictate",
        { grain: 2, brick: 1, lumber: 1, wool: 1 },
        'Once on each of your turns, roll the dice again.',
      ),
      vp('Gladiator Games', { grain: 1, ore: 2, wool: 2 }, 2),
    ],
  },
  greatWall: {
    id: 'greatWall',
    name: 'Great Wall of China',
    icon: '🧱',
    era: 'new',
    requirement: { kind: 'loop', route: 'land', length: 9 },
    needs: 'a closed ring of 9 or more roads',
    stages: [
      ability(
        'Fortification',
        { lumber: 1, ore: 2 },
        'Your knights and buildings on the ring can not be knocked down, moved or destroyed.',
      ),
      vp('Stronghold of Juyongguan', { grain: 1, brick: 1, ore: 1, wool: 1 }, 1),
      ability(
        'The Cry of Meng Jiangnu',
        { grain: 1, brick: 1, lumber: 1, wool: 2 },
        'When you roll the barbarian ship, move it two spaces or none.',
      ),
      vp('Ming Dynasty', { grain: 2, brick: 1, lumber: 1, wool: 1 }, 2),
    ],
  },
  petra: {
    id: 'petra',
    name: 'Petra',
    icon: '🏜️',
    era: 'new',
    requirement: { kind: 'numbers', numbers: [2, 12], count: 2 },
    needs: '2 settlements or cities by a 2 or a 12',
    stages: [
      ability(
        'Nabataean Prayer',
        { grain: 1, brick: 1, wool: 1 },
        'Your 2s also produce when a 3 is rolled, and your 12s when an 11 is rolled.',
        true,
      ),
      vp('Theatre at the Tombs', { lumber: 1, ore: 2, wool: 1 }, 1),
      ability(
        'Silk Road Hub',
        { grain: 2, lumber: 2, wool: 1 },
        'Once a turn, swap any number of one resource for as many of another with the bank.',
        true,
      ),
      vp('Temple Khaznat al-Faroun', { brick: 2, ore: 2, wool: 1 }, 2),
    ],
  },
  chichenItza: {
    id: 'chichenItza',
    name: 'Chichen Itza',
    icon: '🛕',
    era: 'new',
    requirement: { kind: 'terrain', terrain: 'grain', count: 4 },
    needs: '4 settlements or cities by fields',
    stages: [
      ability(
        'Mayan Geometry',
        { brick: 1, ore: 1, wool: 1 },
        'When a 1 and 2 or a 1 and 3 is rolled, take a resource of your choice.',
      ),
      vp('Temple to Kukulkan', { brick: 1, lumber: 2, ore: 1 }, 1),
      ability(
        'Sacrifice to Chaac',
        { grain: 2, wool: 3 },
        'Once on each of your turns, pay 2 wool to make one hex (not gold) produce as if its number was rolled.',
        true,
      ),
      vp('Monument to Itzamna', { grain: 1, brick: 1, lumber: 1, ore: 2 }, 2),
    ],
  },
  machuPicchu: {
    id: 'machuPicchu',
    name: 'Machu Picchu',
    icon: '⛰️',
    era: 'new',
    requirement: { kind: 'terrain', terrain: 'wool', count: 4 },
    needs: '4 settlements or cities by pasture',
    stages: [
      ability(
        'Alpaca Breeding',
        { grain: 3 },
        'Activate knights for 1 wool, and build roads for 2 wool.',
      ),
      vp('Río Urubamba', { brick: 1, lumber: 2, wool: 1 }, 1),
      ability(
        'Piedra Intihuatana',
        { brick: 1, lumber: 1, ore: 2, wool: 1 },
        'When you roll doubles, you may roll one, two or all of the dice again.',
      ),
      vp('Montaña de Siete Colores', { grain: 1, brick: 2, ore: 1, wool: 1 }, 2),
    ],
  },
};

/** Points a wonder gives at a stage (0 to 4 stages built). */
export function wonderVp(id: WonderId, stages: number): number {
  return WONDERS[id].stages.slice(0, stages).reduce((n, s) => n + s.vp, 0);
}
