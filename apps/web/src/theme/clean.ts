import type { ReactNode } from 'react';

/**
 * A theme: every colour, pattern and piece style the board, cards and page
 * use. Themes only change looks; the rules never see them. Anything a theme
 * leaves out comes from the Clean theme (see themes.tsx).
 */
export interface Theme {
  id: string;
  name: string;
  /** One line for the theme picker. */
  description: string;
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
  /** Border between land hexes. */
  landStroke: string;
  /** Its width (default 3). */
  landStrokeWidth?: number;
  /** A soft light-and-shade wash over each land hex, like paint on wood. */
  hexShade?: boolean;
  /** A thin inner ring on each land hex, in this colour. */
  hexInset?: string | undefined;
  /** Harbor posts and face. */
  harborWood: string;
  harborFace: string;
  harborText: string;
  /** Light and shade on pieces, like turned wood. */
  shadePieces: boolean;
  /** "lift" is a drop shadow; "glow" is a soft halo in the player's colour. */
  pieceEffect: 'lift' | 'glow';
  /** Show the little terrain emoji on each hex. */
  terrainIcons: boolean;
  /** SVG <pattern> elements, with ids "pat-<hex type>" (and "pat-sea"). */
  patterns?: () => ReactNode;
  /** Hex types (and "sea") that use a pattern instead of a flat fill. */
  patterned?: string[];
  /** Card colours by card type. */
  cards: Record<string, string>;
  /** CSS custom properties for the page, e.g. "--bg". Empty keeps the light/dark defaults. */
  ui: Record<string, string>;
  /** Background behind the board. */
  boardBackground: string;
}

export type PlayerShape =
  'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon' | 'cross' | 'pentagon';

export const cleanTheme: Theme = {
  id: 'clean',
  name: 'Clean',
  description: 'Flat and bright. Easy to read on a phone.',
  terrain: {
    forest: '#3f8f5a',
    hills: '#c8663d',
    pasture: '#9fd17a',
    fields: '#e9c46a',
    mountains: '#8d99a6',
    desert: '#e8dcb5',
    hidden: '#7d8a96',
    gold: '#d4a017',
    volcano: '#7a3b2e',
    lake: '#7cc0e8',
    fishingLake: '#6fb3dc',
    swamp: '#7d8a5a',
    oasis: '#e6cf8b',
    castle: '#b7a99a',
    quarry: '#c9b8a3',
    glassworks: '#a9c7c9',
  },
  terrainIcon: {
    forest: '🌲',
    hills: '🧱',
    pasture: '🐑',
    fields: '🌾',
    mountains: '⛰️',
    desert: '🏜️',
    gold: '✨',
    volcano: '🌋',
    lake: '💧',
    fishingLake: '🎣',
    swamp: '🪷',
    oasis: '🌴',
    castle: '🏰',
    quarry: '⛏️',
    glassworks: '🏭',
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
  landStroke: '#f6f3ea',
  harborWood: '#7b5b3a',
  harborFace: '#fbf6e9',
  harborText: '#1d2321',
  shadePieces: false,
  pieceEffect: 'lift',
  terrainIcons: true,
  hexInset: '#ffffff',
  cards: {},
  ui: {},
  boardBackground: 'radial-gradient(circle at 50% 45%, #6db3e2 0%, var(--sea) 70%)',
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
