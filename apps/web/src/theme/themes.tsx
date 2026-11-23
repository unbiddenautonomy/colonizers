import { useEffect, useSyncExternalStore } from 'react';
import { cleanTheme, RESOURCE_COLOR, type Theme } from './clean.ts';
import { decoEmeraldBoard, decoIvoryBoard } from './boards/deco.tsx';
import { wonderGlassBoard, wonderTeaBoard } from './boards/wonder.tsx';
import { islesLagoonBoard, islesNightBoard } from './boards/isles.tsx';
import { benchDarkBoard, benchLightBoard } from './boards/bench.tsx';
import { popArcadeBoard, popCitrusBoard, popGrapeBoard, popSorbetBoard } from './boards/pop.tsx';
import { chartSurveyBoard } from './boards/chart.tsx';
import { masqVelvetBoard } from './boards/masq.tsx';
import { sunriseMorningBoard } from './boards/sunrise.tsx';
import { strawHatBoard } from './boards/strawhat.tsx';
import { heartBoard } from './boards/heart.tsx';
import { bigMomBoard } from './boards/bigmom.tsx';
import { beastsBoard } from './boards/beasts.tsx';
import { navyBoard } from './boards/navy.tsx';
import { casinoEmeraldBoard } from './boards/casino.tsx';
import { basicCleanBoard } from './boards/basicClean.tsx';
import { woodTheme } from './pictures.tsx';
import { tilesTheme } from './tiles.tsx';
import { prefPicked } from './prefs.ts';
import { playerColorsFor } from './playerColors.ts';

const BOARDS: Theme[] = [
  tilesTheme,
  woodTheme,
  cleanTheme,
  benchDarkBoard,
  benchLightBoard,
  popGrapeBoard,
  popSorbetBoard,
  popCitrusBoard,
  popArcadeBoard,
  decoEmeraldBoard,
  decoIvoryBoard,
  wonderTeaBoard,
  wonderGlassBoard,
  islesLagoonBoard,
  islesNightBoard,
  sunriseMorningBoard,
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

/** What a new device shows. */
export const DEFAULT_THEME = THEMES.find((t) => t.id === 'basic-clean')!;

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

// ---- The chosen theme, per device ----

const KEY = 'colonizers.theme';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_THEME.id;
  } catch {
    return DEFAULT_THEME.id;
  }
}

let current = read();
let forced: string | null = null;

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
  return themeById(useSyncExternalStore(subscribe, () => forced ?? current));
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

/** A small picker for the theme. */
export function ThemePicker({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  if (forced !== null) return null;
  return (
    <label className="theme-picker" title={theme.description}>
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
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
