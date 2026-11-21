/**
 * Player colours for each board, so the pieces belong to the board they stand on. Each set keeps
 * the default's order of hues (red, blue, orange, green, pink, then a sky, white or purple, yellow
 * and one more) so a seat reads much the same from board to board, and every pair in a set stays
 * well apart (see playerColors.test.ts). A player's shape still marks the seat whatever the colour.
 * The Clean board keeps its Okabe–Ito set, which holds up best for colour blindness.
 */
export const PLAYER_COLORS: Record<string, readonly string[]> = {
  /** Bright game-box colours for the Tiles and Wooden boards. */
  classic: ['#e53228', '#1e6be0', '#ff9a00', '#17a34a', '#d6339c', '#22b8e6', '#ffd51a', '#8a5cf0'],
  /** Lit up, to stand off a dark bench. */
  'bench-dark': [
    '#ff5a4e',
    '#4ea8ff',
    '#ffb547',
    '#3ddc84',
    '#ff6ec7',
    '#5ef0ff',
    '#f5e663',
    '#b48cff',
  ],
  /** Deep, to stand off a pale bench. */
  'bench-light': [
    '#d7261e',
    '#1557c0',
    '#ec7d00',
    '#0f8f45',
    '#c22c8d',
    '#0a9bc8',
    '#d9b200',
    '#6d3fd6',
  ],
  /** Candy brights. */
  pop: ['#ff4f6d', '#3d7bff', '#ff9f1c', '#18c08f', '#ff5fd2', '#29d3ff', '#ffe03d', '#9b5cff'],
  /** Jewel tones: ruby, sapphire, amber, jade, amethyst. */
  deco: ['#d4352a', '#2456c9', '#f08a24', '#16a36d', '#c2408f', '#2bb3c9', '#f2d04b', '#7b4fd1'],
  /** Storybook colours: the Queen's red, Alice's blue, the Cheshire Cat's pink. */
  wonder: ['#e0384a', '#3c63d6', '#f2913a', '#2f9e5a', '#d659b8', '#3bb8d8', '#f5d13a', '#8e5bd6'],
  /** Tropical: coral, mango, hibiscus and a shell white. */
  isles: ['#ff5a3c', '#2a6fdb', '#ffa62b', '#1fae6a', '#ff4fa3', '#f7f2e8', '#ffd84a', '#8a5ae6'],
  /** Clear morning colours. */
  sunrise: ['#e63b2e', '#2264d1', '#ff8a1f', '#1e9e4a', '#e2479b', '#7b4fd6', '#ffd43a', '#f5f5f5'],
  /** Bright silks against the velvet. */
  masq: ['#e3324a', '#4b7dff', '#ffb02e', '#3fd08a', '#ff6fc0', '#58d6ff', '#ffe066', '#b38bff'],
  /** Inks on survey paper. */
  chart: ['#c62828', '#1a4fa8', '#e67700', '#2e7d32', '#ad1f7a', '#00838f', '#b88a00', '#5e35b1'],
  /** The crew: Luffy's red, Nami's orange, Zoro's green, Robin's purple, straw yellow, Brook's white. */
  strawhat: [
    '#e8261e',
    '#1747c4',
    '#ff9a1a',
    '#16a34a',
    '#ff5fa8',
    '#7c3aed',
    '#ffd21f',
    '#f5f5f5',
  ],
  /** Lit up against the polar night, and no white on the snow. */
  heart: ['#ff3b47', '#3d8bff', '#ffb020', '#2ed67a', '#ff5fc3', '#28d7e6', '#ffe24a', '#a06bff'],
  /** Bold flag colours over the teal sea. */
  whitebeard: [
    '#e32d2d',
    '#2a5fd9',
    '#ff9420',
    '#25b35a',
    '#e04bb0',
    '#7a4fe0',
    '#ffd33d',
    '#f2f2f2',
  ],
  /** Sweets: strawberry, blueberry, mint, candy pink. */
  bigmom: ['#ff3d6e', '#2f6bff', '#ff9f2e', '#1fbf7a', '#ff4fd8', '#22c3ee', '#ffe14d', '#6d28d9'],
  /** Lantern brights against the night sea. */
  wano: ['#e8322b', '#3d7dff', '#ff9a1f', '#2ec26a', '#ff5fb0', '#3fd2e6', '#ffd84a', '#b07cff'],
  /** Signal flags against the deep blue. */
  navy: ['#ff3b30', '#5aa0ff', '#ffa31a', '#2fc46e', '#ff63b8', '#3fe0e0', '#ffe14d', '#f2f2f2'],
};

/** Which set a board takes, by its id or the start of it. */
const FAMILY: [prefix: string, set: string][] = [
  ['tiles', 'classic'],
  ['wood', 'classic'],
  ['bench-dark', 'bench-dark'],
  ['bench-light', 'bench-light'],
  ['pop-', 'pop'],
  ['deco-', 'deco'],
  ['wonder-', 'wonder'],
  ['isles-', 'isles'],
  ['sunrise-', 'sunrise'],
  ['masq-', 'masq'],
  ['chart-', 'chart'],
  ['strawhat-', 'strawhat'],
  ['heart-', 'heart'],
  ['whitebeard-', 'whitebeard'],
  ['bigmom-', 'bigmom'],
  ['beasts-', 'wano'],
  ['navy-', 'navy'],
];

/** The player colours for a board id, or undefined to keep the board's own. */
export function playerColorsFor(id: string): readonly string[] | undefined {
  const hit = FAMILY.find(([prefix]) => id === prefix || id.startsWith(prefix));
  return hit ? PLAYER_COLORS[hit[1]] : undefined;
}
