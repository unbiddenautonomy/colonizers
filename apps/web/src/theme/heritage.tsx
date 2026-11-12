import { cleanTheme, type Theme } from './clean.ts';

/**
 * Heritage: the feel of a wooden board game, with our own art. Painted
 * terrain textures, turned-wood pieces, parchment cards and a walnut frame.
 * Every shape here is drawn in code for this project.
 */

const PAINT = {
  forest: '#4a6b2f',
  hills: '#a8552f',
  pasture: '#8cab4c',
  fields: '#d9a93c',
  mountains: '#7f7a73',
  desert: '#d8c08a',
  gold: '#c99a2e',
  volcano: '#5e2f24',
  lake: '#6b9cb8',
  fishingLake: '#5d93b3',
  swamp: '#6f7a4c',
  oasis: '#dcc27c',
  castle: '#a89a88',
  hidden: '#6f6a5e',
};

function Patterns() {
  return (
    <>
      <pattern id="pat-forest" width="36" height="36" patternUnits="userSpaceOnUse">
        <rect width="36" height="36" fill={PAINT.forest} />
        <path d="M8 26 l6 -14 l6 14 z" fill="#2f4c1d" />
        <path d="M22 32 l5 -11 l5 11 z" fill="#3a5a24" />
        <path d="M26 14 l4 -9 l4 9 z" fill="#2f4c1d" />
        <rect x="13" y="26" width="2" height="4" fill="#5b3a1f" />
      </pattern>
      <pattern id="pat-hills" width="40" height="24" patternUnits="userSpaceOnUse">
        <rect width="40" height="24" fill={PAINT.hills} />
        <path d="M0 18 q10 -10 20 0 t20 0" fill="none" stroke="#8a4124" strokeWidth="3" />
        <rect x="6" y="4" width="10" height="5" fill="#bf6a40" stroke="#8a4124" />
        <rect x="24" y="6" width="10" height="5" fill="#bf6a40" stroke="#8a4124" />
      </pattern>
      <pattern id="pat-pasture" width="30" height="30" patternUnits="userSpaceOnUse">
        <rect width="30" height="30" fill={PAINT.pasture} />
        <path
          d="M5 22 l2 -6 l2 6 M18 10 l2 -6 l2 6 M22 27 l2 -5 l2 5"
          stroke="#6b8a34"
          strokeWidth="1.6"
          fill="none"
        />
        <ellipse cx="12" cy="9" rx="4" ry="3" fill="#f3efe2" />
        <circle cx="15.5" cy="8" r="1.4" fill="#3d3a33" />
      </pattern>
      <pattern id="pat-fields" width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill={PAINT.fields} />
        <path d="M0 6 h24 M0 14 h24 M0 22 h24" stroke="#bf8f2a" strokeWidth="2" />
        <path d="M6 2 v6 M14 10 v6 M20 18 v6" stroke="#f1cf72" strokeWidth="1.6" />
      </pattern>
      <pattern id="pat-mountains" width="44" height="30" patternUnits="userSpaceOnUse">
        <rect width="44" height="30" fill={PAINT.mountains} />
        <path d="M2 28 l12 -20 l12 20 z" fill="#66625c" />
        <path d="M10 15 l4 -7 l4 7 l-4 -2 z" fill="#ece8df" />
        <path d="M22 28 l10 -15 l10 15 z" fill="#5b5852" />
      </pattern>
      <pattern id="pat-desert" width="40" height="20" patternUnits="userSpaceOnUse">
        <rect width="40" height="20" fill={PAINT.desert} />
        <path d="M0 14 q10 -8 20 0 t20 0" fill="none" stroke="#c2a66c" strokeWidth="2" />
      </pattern>
      <pattern id="pat-gold" width="28" height="28" patternUnits="userSpaceOnUse">
        <rect width="28" height="28" fill={PAINT.gold} />
        <path d="M8 6 l2 4 l4 2 l-4 2 l-2 4 l-2 -4 l-4 -2 l4 -2 z" fill="#f7e08a" />
        <circle cx="21" cy="20" r="2.5" fill="#f2d065" stroke="#9b7420" />
      </pattern>
      <pattern id="pat-volcano" width="32" height="32" patternUnits="userSpaceOnUse">
        <rect width="32" height="32" fill={PAINT.volcano} />
        <path
          d="M4 30 q8 -10 4 -18 M20 30 q6 -8 2 -16"
          stroke="#d2582a"
          strokeWidth="2.5"
          fill="none"
        />
        <circle cx="25" cy="8" r="2" fill="#f08a3c" />
      </pattern>
      <pattern id="pat-sea" width="48" height="24" patternUnits="userSpaceOnUse">
        <rect width="48" height="24" fill="#3d6f8e" />
        <path d="M0 12 q6 -5 12 0 t12 0 t12 0 t12 0" fill="none" stroke="#5a8eac" strokeWidth="2" />
        <path d="M6 22 q4 -3 8 0 M30 4 q4 -3 8 0" fill="none" stroke="#6f9fbb" strokeWidth="1.5" />
      </pattern>
    </>
  );
}

export const heritageTheme: Theme = {
  ...cleanTheme,
  id: 'heritage',
  name: 'Heritage',
  description: 'Painted land, wooden pieces and parchment, like a board game on the table.',
  terrain: { ...cleanTheme.terrain, ...PAINT },
  sea: '#3d6f8e',
  seaEdge: '#2e5a75',
  token: '#f3e6c4',
  tokenText: '#3b2a1a',
  tokenHot: '#9e2a1c',
  players: [
    { color: '#b8401f', shape: 'circle', name: 'Red' },
    { color: '#2c5e9e', shape: 'square', name: 'Blue' },
    { color: '#e0a526', shape: 'triangle', name: 'Ochre' },
    { color: '#3f7f4a', shape: 'diamond', name: 'Green' },
    { color: '#f2ead8', shape: 'star', name: 'Ivory' },
    { color: '#7a4a2a', shape: 'hexagon', name: 'Walnut' },
    { color: '#7b4f9e', shape: 'cross', name: 'Plum' },
    { color: '#4a4a4a', shape: 'pentagon', name: 'Slate' },
  ],
  outline: '#2b1d12',
  robber: '#3a2c22',
  pirate: '#1f1a17',
  landStroke: '#e9d9b0',
  harborWood: '#5b3a1f',
  harborFace: '#f3e6c4',
  harborText: '#3b2a1a',
  shadePieces: true,
  pieceEffect: 'lift',
  terrainIcons: false,
  patterns: Patterns,
  patterned: [
    'forest',
    'hills',
    'pasture',
    'fields',
    'mountains',
    'desert',
    'gold',
    'volcano',
    'sea',
  ],
  cards: {
    brick: '#b9643c',
    lumber: '#4f7535',
    wool: '#a3bf68',
    grain: '#e2b955',
    ore: '#8c877f',
    paper: '#efe2bd',
    cloth: '#b79bc9',
    coin: '#d9b44a',
  },
  ui: {
    '--bg': '#efe4cc',
    '--card': '#fbf4e3',
    '--text': '#2b1d12',
    '--muted': '#6e5a45',
    '--accent': '#7a3e1d',
    '--accent-text': '#fbf4e3',
    '--border': '#d6c29a',
    '--danger': '#9e2a1c',
    '--sea': '#3d6f8e',
    '--font': "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
  },
  boardBackground:
    'radial-gradient(circle at 50% 45%, #4d7f9e 0%, #2e5a75 70%), linear-gradient(#5b3a1f, #5b3a1f)',
};
