import { useEffect, useSyncExternalStore } from 'react';
import { cleanTheme, RESOURCE_COLOR, type Theme } from './clean.ts';
import { heritageTheme } from './heritage.tsx';
import { nightMarketTheme } from './nightMarket.tsx';

export const THEMES: Theme[] = [cleanTheme, heritageTheme, nightMarketTheme];

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? cleanTheme;
}

// ---- The chosen theme, per device ----

const KEY = 'colonizers.theme';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? cleanTheme.id;
  } catch {
    return cleanTheme.id;
  }
}

let current = read();

export function setTheme(id: string): void {
  current = themeById(id).id;
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The theme this device shows. Each player can pick their own, even mid-game. */
export function useTheme(): Theme {
  return themeById(useSyncExternalStore(subscribe, () => current));
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
  return (
    <label className="theme-picker" title={theme.description}>
      {compact ? <span aria-hidden="true">🎨</span> : 'Theme '}
      <select value={theme.id} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
