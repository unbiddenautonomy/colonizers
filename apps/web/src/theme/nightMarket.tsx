import { cleanTheme, type Theme } from './clean.ts';

/**
 * Night Market: a dark board lit by lanterns. Deep terrain colours with
 * bright edges, glowing pieces, and a dark page.
 */

function Patterns() {
  return (
    <pattern id="pat-sea" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#0b1630" />
      <circle cx="8" cy="10" r="1" fill="#3d5a9e" />
      <circle cx="28" cy="26" r="1.2" fill="#2f4a88" />
      <circle cx="18" cy="34" r="0.8" fill="#4a6bb3" />
    </pattern>
  );
}

export const nightMarketTheme: Theme = {
  ...cleanTheme,
  id: 'night-market',
  name: 'Night Market',
  description: 'A dark board with glowing pieces. Easy on the eyes at night.',
  terrain: {
    forest: '#14513f',
    hills: '#8a3221',
    pasture: '#3f7a2c',
    fields: '#9c7a17',
    mountains: '#45506a',
    desert: '#5e5540',
    hidden: '#2a2f3d',
    gold: '#b8860b',
    volcano: '#4a1a14',
    lake: '#1d4f7a',
    fishingLake: '#1d5f8a',
    swamp: '#34402a',
    oasis: '#6b5a2e',
    castle: '#4b4652',
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
  landStroke: '#ffd23f55',
  harborWood: '#ffd23f',
  harborFace: '#141a2b',
  harborText: '#ffe08a',
  shadePieces: false,
  pieceEffect: 'glow',
  terrainIcons: true,
  patterns: Patterns,
  patterned: ['sea'],
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
