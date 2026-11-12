import { cleanTheme, type Theme } from './clean.ts';
import { tilePatterns, type Palette } from './motifs.tsx';

/**
 * Night Market: a dark board lit by lanterns. Deep terrain colours with
 * bright edges, glowing pieces, and a dark page.
 */

// The printed tiles at night: deep colours with lines lit like neon.
const PALETTE: Record<string, Palette> = {
  forest: { base: '#14513f', dark: '#0b3326', light: '#1f7a5c' },
  pasture: { base: '#3f7a2c', dark: '#141a2b', light: '#e8ecf5', accent: '#2c5c1e' },
  fields: { base: '#7d6114', dark: '#ffd23f', light: '#957419' },
  hills: { base: '#7a2c1d', dark: '#ff7a3d', light: '#ff9a6b' },
  mountains: { base: '#3a4560', dark: '#9bf0ff', light: '#c9d6f0', accent: '#45506a' },
  desert: { base: '#5e5540', dark: '#ffd23f', light: '#7a6f52' },
  gold: { base: '#8a6508', dark: '#3a2a05', light: '#ffe08a' },
  volcano: { base: '#3a140f', dark: '#1a0806', light: '#7a6a72', accent: '#ff6b3d' },
  lake: { base: '#1d4f7a', dark: '#45b3ff', light: '#5fa8e0' },
  fishingLake: { base: '#1d5f8a', dark: '#9bf0ff', light: '#5fa8e0' },
  swamp: { base: '#34402a', dark: '#9be07a', light: '#4f6a3a' },
  oasis: { base: '#6b5a2e', dark: '#3ddc97', light: '#8a7840', accent: '#45b3ff' },
  castle: { base: '#4b4652', dark: '#c7a6ff', light: '#6a6475' },
  hidden: { base: '#2a2f3d', dark: '#141a2b', light: '#4a5268' },
};

const SEA: Palette = { base: '#0b1630', dark: '#1a2a52', light: '#13234a', accent: '#2f6fb3' };

export const nightMarketTheme: Theme = {
  ...cleanTheme,
  id: 'night-market',
  name: 'Night Market',
  description: 'A dark board with glowing pieces. Easy on the eyes at night.',
  terrain: {
    ...cleanTheme.terrain,
    ...Object.fromEntries(Object.entries(PALETTE).map(([k, p]) => [k, p.base])),
  },
  sea: '#0b1630',
  seaEdge: '#1a2a52',
  token: '#141a2b',
  tokenText: '#e8ecf5',
  tokenHot: '#ff6b5a',
  players: [
    { color: '#ff7a3d', shape: 'circle', name: 'Ember' },
    { color: '#45b3ff', shape: 'square', name: 'Neon blue' },
    { color: '#ffd23f', shape: 'triangle', name: 'Lantern' },
    { color: '#3ddc97', shape: 'diamond', name: 'Jade' },
    { color: '#ff6ad5', shape: 'star', name: 'Magenta' },
    { color: '#9bf0ff', shape: 'hexagon', name: 'Ice' },
    { color: '#c7a6ff', shape: 'cross', name: 'Lilac' },
    { color: '#d8d8d8', shape: 'pentagon', name: 'Silver' },
  ],
  outline: '#05070d',
  robber: '#c9c9d6',
  pirate: '#c9c9d6',
  highlight: '#ffe08a',
  landStroke: '#ffd23f99',
  landStrokeWidth: 3,
  harborWood: '#ffd23f',
  harborFace: '#141a2b',
  harborText: '#ffe08a',
  shadePieces: false,
  pieceEffect: 'glow',
  terrainIcons: false,
  hexInset: undefined,
  patterns: () => tilePatterns(PALETTE, SEA),
  patterned: [...Object.keys(PALETTE), 'sea'],
  cards: {
    brick: '#a3402b',
    lumber: '#1d6b52',
    wool: '#4d8f36',
    grain: '#b38f1d',
    ore: '#58627e',
    paper: '#6b6247',
    cloth: '#6a4f8a',
    coin: '#a6862a',
  },
  ui: {
    '--bg': '#0a0d17',
    '--card': '#141a2b',
    '--text': '#e8ecf5',
    '--muted': '#9aa3bd',
    '--accent': '#ffd23f',
    '--accent-text': '#141a2b',
    '--border': '#273152',
    '--danger': '#ff7a6b',
    '--sea': '#0b1630',
  },
  boardBackground: 'radial-gradient(circle at 50% 40%, #16264d 0%, #070b18 75%)',
};
