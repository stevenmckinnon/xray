/**
 * The page's theme and density: the store, with no React in it.
 *
 * The hooks live next door in `useAppearance.ts` because they cannot live here. The root
 * layout is a server component and needs `RESTORE_SCRIPT`, and Next rejects any module
 * that so much as imports `useSyncExternalStore` from the server graph — the error names
 * the import, not the call, so keeping the hooks out is the only way the layout can read
 * a string constant from this file.
 *
 * ## Why the DOM is the source of truth
 *
 * `<html data-theme data-density>` is not a mirror of React state — it is the state.
 * Three things write it: the two copies of `<Instruments />`, and xray's own overlay,
 * whose variant chips flip the page to show you what a locked value looks like in
 * another theme. Nothing here can be the owner, so the attributes are, and everything
 * else subscribes.
 *
 * That was already half true: `Instruments` watched the attributes with a
 * MutationObserver so two copies agreed. What it did not do was *read* them at mount —
 * it started from hardcoded defaults and wrote those out in an effect. So arriving on
 * /docs, where the sidebar mounts a fresh copy, silently reset the page to
 * blueprint/regular. A reload lost the choice too, since nothing was persisted.
 *
 * ## Hydration
 *
 * `useSyncExternalStore` is used rather than `useState` + effect because it is the one
 * hook that reads a store during hydration without lying about it: `getServerSnapshot`
 * supplies the server's defaults, and the client re-reads after hydrating. The restore
 * script has usually already set the attributes to something else by then, and this is
 * the difference between "React re-renders once" and "React warns about a mismatch".
 */
export const THEMES = ['blueprint', 'paper'] as const;
export const DENSITIES = ['tight', 'regular', 'loose'] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export const DEFAULT_THEME: Theme = 'blueprint';
export const DEFAULT_DENSITY: Density = 'regular';

const KEY = 'xray-appearance';

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);
const isDensity = (value: unknown): value is Density => DENSITIES.includes(value as Density);

export function readTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function readDensity(): Density {
  if (typeof document === 'undefined') return DEFAULT_DENSITY;
  const value = document.documentElement.dataset.density;
  return isDensity(value) ? value : DEFAULT_DENSITY;
}

/** Persisted as one object so a single `storage` event covers both. */
function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: readTheme(), density: readDensity() }));
  } catch {
    // Private browsing, or storage disabled. The page still works; the choice just
    // does not outlive the tab.
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

/**
 * Notify on any change to either attribute, from any source, in any tab.
 *
 * The `storage` event is what keeps two open tabs together. It does not fire in the
 * tab that wrote the value, which is exactly right — that tab already knows.
 */
export function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme', 'data-density'] });

  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      const { theme, density } = JSON.parse(event.newValue) as { theme?: unknown; density?: unknown };
      // Written straight to the DOM rather than through the setters, so this does not
      // bounce back into storage and start a loop between tabs.
      if (isTheme(theme)) document.documentElement.dataset.theme = theme;
      if (isDensity(density)) document.documentElement.dataset.density = density;
    } catch {
      // A value we did not write. Ignore it rather than guess.
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    observer.disconnect();
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Runs before the body is parsed, so the restored choice is in place for the first
 * paint and there is no flash of the default theme.
 *
 * Inlined as a string rather than imported, because a module cannot run early enough:
 * anything deferred or hydrated is by definition after the first paint. Kept to the
 * smallest thing that can work, and silent on failure — a page that throws here would
 * be a page that renders nothing.
 */
export const RESTORE_SCRIPT = `
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('${KEY}') || '{}');
    var themes = ${JSON.stringify(THEMES)};
    var densities = ${JSON.stringify(DENSITIES)};
    if (themes.indexOf(saved.theme) !== -1) document.documentElement.dataset.theme = saved.theme;
    if (densities.indexOf(saved.density) !== -1) document.documentElement.dataset.density = saved.density;
  } catch (e) {}
})();
`.trim();
