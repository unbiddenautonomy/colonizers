import { useEffect, useSyncExternalStore } from 'react';
import { RESOURCE_COLOR, type Theme } from './clean.ts';
import { decoEmeraldBoard, decoIvoryBoard } from './boards/deco.tsx';
import { islesLagoonBoard, islesNightBoard } from './boards/isles.tsx';
import { chartSurveyBoard } from './boards/chart.tsx';
import { masqVelvetBoard } from './boards/masq.tsx';
import { strawHatBoard } from './boards/strawhat.tsx';
import { heartBoard } from './boards/heart.tsx';
import { bigMomBoard } from './boards/bigmom.tsx';
import { beastsBoard } from './boards/beasts.tsx';
import { navyBoard } from './boards/navy.tsx';
import { casinoEmeraldBoard } from './boards/casino.tsx';
import { basicCleanBoard } from './boards/basicClean.tsx';
import { woodTheme } from './pictures.tsx';
import { prefPicked } from './prefs.ts';
import { playerColorsFor } from './playerColors.ts';

const BOARDS: Theme[] = [
  woodTheme,
  decoEmeraldBoard,
  decoIvoryBoard,
  islesLagoonBoard,
  islesNightBoard,
  masqVelvetBoard,
  chartSurveyBoard,
  strawHatBoard,
  heartBoard,
  bigMomBoard,
  beastsBoard,
  navyBoard,
  casinoEmeraldBoard,
  basicCleanBoard,
];

/** Every board, each with player colours chosen for it (see playerColors.ts). */
export const THEMES: Theme[] = BOARDS.map((t) => {
  const colors = playerColorsFor(t.id);
  return colors
    ? { ...t, players: t.players.map((p, i) => ({ ...p, color: colors[i] ?? p.color })) }
    : t;
});

/** What a new device shows, and what a removed or unknown pick falls back to. */
export const DEFAULT_THEME = THEMES.find((t) => t.id === 'basic-clean')!;

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

// ---- The chosen theme, per device ----

const KEY = 'colonizers.theme';
const listeners = new Set<() => void>();

function read(): string {
  try {
    // A board that has since been removed falls back to the default.
    return themeById(localStorage.getItem(KEY)).id;
  } catch {
    return DEFAULT_THEME.id;
  }
}

let current = read();
let forced: string | null = null;

/**
 * Boards with their own art for every expansion piece and marker. A game with any expansion
 * shows one of these; the others draw generic stand-ins, so they are kept for the base game.
 */
export const EXPANSION_THEMES: readonly string[] = ['basic-clean', 'casino-emerald'];

/** True when a game's modules go beyond the base game and its house rules. */
export function isExpansionGame(modules: readonly string[]): boolean {
  return modules.some((m) => m !== 'base' && m !== 'variants');
}

let expansions = false;

function setExpansionGame(on: boolean): void {
  if (expansions === on) return;
  expansions = on;
  for (const l of listeners) l();
}

/**
 * While a screen with an expansion game is open, show a board that has art for it. The pick is
 * kept, so the player's own board comes back when the expansions go.
 */
export function useExpansionLock(on: boolean): void {
  useEffect(() => {
    setExpansionGame(on);
    return () => setExpansionGame(false);
  }, [on]);
}

/** The board this device shows now: the pick, unless an expansion game needs another. */
function shown(): string {
  const id = forced ?? current;
  return expansions && !EXPANSION_THEMES.includes(themeById(id).id) ? DEFAULT_THEME.id : id;
}

/** An admin's board skin for everyone, or null to let each player choose. */
export function setForcedTheme(id: string | null): void {
  forced = id;
  for (const l of listeners) l();
}

export function themeForced(): boolean {
  return forced !== null;
}

export function setTheme(id: string): void {
  current = themeById(id).id;
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

/** The board skin picked on this device. */
export function themePick(): string {
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The theme this device shows. Each player can pick their own, even mid-game. */
export function useTheme(): Theme {
  return themeById(useSyncExternalStore(subscribe, shown));
}

/** A card's colour in a theme, falling back to the Clean colours. */
export function cardColor(theme: Theme, card: string): string {
  return theme.cards[card] ?? RESOURCE_COLOR[card] ?? '#ddd';
}

const UI_KEYS = new Set(THEMES.flatMap((t) => Object.keys(t.ui)));

/** Puts the theme's page colours and fonts on the document. */
export function ThemeStyles() {
  const theme = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    for (const k of UI_KEYS) root.style.removeProperty(k);
    for (const [k, v] of Object.entries(theme.ui)) root.style.setProperty(k, v);
    root.style.setProperty('--board-bg', theme.boardBackground);
    root.dataset.theme = theme.id;
  }, [theme]);
  return null;
}

/** One quiet line saying the board was swapped for an expansion game; nothing otherwise. */
export function ThemeLockNote() {
  const theme = useTheme();
  const pick = useSyncExternalStore(subscribe, () => current);
  const locked = useSyncExternalStore(subscribe, () => expansions);
  if (forced !== null || !locked || themeById(pick).id === theme.id) return null;
  return (
    <p className="theme-note">
      🎨 Expansions are played on Basic or Casino, which have art for every piece. Your{' '}
      {themeById(pick).name} board comes back for base games.
    </p>
  );
}

/** A small picker for the theme. */
export function ThemePicker({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  const pick = useSyncExternalStore(subscribe, () => current);
  const locked = useSyncExternalStore(subscribe, () => expansions);
  if (forced !== null) return null;
  // The player's own board, set aside while an expansion game needs one with art for it.
  const aside = locked && themeById(pick).id !== theme.id ? themeById(pick) : null;
  const why = aside
    ? `Expansions need a board with art for every piece, so this game uses ${theme.name}. ${aside.name} comes back for base games.`
    : theme.description;
  return (
    <label className="theme-picker" title={why}>
      {compact ? <span aria-hidden="true">🎨</span> : 'Board '}
      <select
        value={theme.id}
        onChange={(e) => {
          setTheme(e.target.value);
          prefPicked({ board: e.target.value });
        }}
        aria-label="Board skin"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id} disabled={locked && !EXPANSION_THEMES.includes(t.id)}>
            {t.name}
          </option>
        ))}
      </select>
      {aside && !compact && (
        <span className="theme-note">
          Expansions use Basic or Casino. {aside.name} is back for base games.
        </span>
      )}
      {aside && compact && <span aria-hidden="true">ⓘ</span>}
    </label>
  );
}
