/**
 * The Clean theme: flat, readable colours. Themes are swappable in phase 11,
 * so every colour the board uses comes from here.
 */
export interface Theme {
  id: string;
  name: string;
  terrain: Record<string, string>;
  terrainIcon: Record<string, string>;
  sea: string;
  seaEdge: string;
  token: string;
  tokenText: string;
  tokenHot: string;
  /** Player colours (colourblind-safe) and a shape per seat. */
  players: { color: string; shape: PlayerShape; name: string }[];
  outline: string;
  robber: string;
  pirate: string;
  highlight: string;
}

export type PlayerShape =
  'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon' | 'cross' | 'pentagon';

export const cleanTheme: Theme = {
  id: 'clean',
  name: 'Clean',
  terrain: {
    forest: '#3f8f5a',
    hills: '#c8663d',
    pasture: '#9fd17a',
    fields: '#e9c46a',
    mountains: '#8d99a6',
    desert: '#e8dcb5',
    hidden: '#7d8a96',
    gold: '#d4a017',
  },
  terrainIcon: {
    forest: '🌲',
    hills: '🧱',
    pasture: '🐑',
    fields: '🌾',
    mountains: '⛰️',
    desert: '🏜️',
    gold: '✨',
    hidden: '🌫️',
  },
  sea: '#4f9bd1',
  seaEdge: '#3d86bb',
  token: '#fbf6e9',
  tokenText: '#2b2b2b',
  tokenHot: '#c0392b',
  // Okabe–Ito palette, which stays distinct for common colour blindness.
  players: [
    { color: '#d55e00', shape: 'circle', name: 'Vermilion' },
    { color: '#0072b2', shape: 'square', name: 'Blue' },
    { color: '#e69f00', shape: 'triangle', name: 'Orange' },
    { color: '#009e73', shape: 'diamond', name: 'Green' },
    { color: '#cc79a7', shape: 'star', name: 'Pink' },
    { color: '#56b4e9', shape: 'hexagon', name: 'Sky' },
    { color: '#f0e442', shape: 'cross', name: 'Yellow' },
    { color: '#6b6b6b', shape: 'pentagon', name: 'Grey' },
  ],
  outline: '#1d2321',
  robber: '#2a2a2a',
  pirate: '#1b1b2f',
  highlight: '#ffffff',
};

export const RESOURCE_ICON: Record<string, string> = {
  brick: '🧱',
  lumber: '🌲',
  wool: '🐑',
  grain: '🌾',
  ore: '⛰️',
  paper: '📜',
  cloth: '🧵',
  coin: '🪙',
};

export const RESOURCE_COLOR: Record<string, string> = {
  brick: '#c8663d',
  lumber: '#3f8f5a',
  wool: '#9fd17a',
  grain: '#e9c46a',
  ore: '#8d99a6',
  paper: '#efe6c6',
  cloth: '#c9b3e3',
  coin: '#f0cf5e',
};

/** Improvement track colours (science, trade, politics). */
export const TRACK_COLOR: Record<string, string> = {
  science: '#3f8f5a',
  trade: '#e0b23a',
  politics: '#3a6fb5',
};
