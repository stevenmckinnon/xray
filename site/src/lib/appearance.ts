'use client';

/**
 * The page's theme and density.
 *
 * `<html data-theme data-density>` is not a mirror of React state — it is the state.
 * Two things write it: the copies of `<Instruments />`, and xray's own overlay, whose
 * variant chips flip the page to show what a locked value looks like in another theme.
 * Neither can be the owner, so the attributes are, and everything reads them.
 *
 * That was already half true — the switches watched the attributes so two copies agreed.
 * What they never did was *read* them at mount: each copy started from a hardcoded
 * default and wrote it out in an effect, so arriving on /docs, where the sidebar mounts
 * its own copy, reset the page. `useSyncExternalStore` fixes that by construction, and is
 * the one hook that reads an external source during hydration without lying about it.
 */
import { useSyncExternalStore } from 'react';

export const THEMES = ['blueprint', 'paper'] as const;
export const DENSITIES = ['tight', 'regular', 'loose'] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

/** Must match the values baked into `<html>` and into the restore script in layout.tsx. */
export const DEFAULT_THEME: Theme = 'blueprint';
export const DEFAULT_DENSITY: Density = 'regular';

export const STORAGE_KEY = 'xray-appearance';

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);
const isDensity = (value: unknown): value is Density => DENSITIES.includes(value as Density);

function read(): { theme: Theme; density: Density } {
  if (typeof document === 'undefined') return { theme: DEFAULT_THEME, density: DEFAULT_DENSITY };
  const { theme, density } = document.documentElement.dataset;
  return {
    theme: isTheme(theme) ? theme : DEFAULT_THEME,
    density: isDensity(density) ? density : DEFAULT_DENSITY,
  };
}

function persist(): void {
  try {
    const { theme, density } = read();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, density }));
  } catch {
    // Storage disabled. The page works; the choice just does not outlive the tab.
  }
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  persist();
}

export function setDensity(density: Density): void {
  document.documentElement.dataset.density = density;
  persist();
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme', 'data-density'] });
  return () => observer.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => read().theme, () => DEFAULT_THEME);
}

export function useDensity(): Density {
  return useSyncExternalStore(subscribe, () => read().density, () => DEFAULT_DENSITY);
}
