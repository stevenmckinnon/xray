'use client';

/**
 * Reading the appearance store from React.
 *
 * Separate from `appearance.ts` because the root layout is a server component that needs
 * `RESTORE_SCRIPT`, and Next refuses to pull any module importing `useSyncExternalStore`
 * into the server graph — it objects to the import, not to a call, so the hooks have to
 * sit in their own file.
 *
 * `useSyncExternalStore` rather than `useState` plus an effect, because it is the one
 * hook that reads external state during hydration honestly: `getServerSnapshot` gives the
 * server's default, and the client re-reads once hydrated. By then the restore script has
 * usually set the attributes to something else, and this is the difference between React
 * re-rendering once and React warning about a mismatch.
 */
import { useSyncExternalStore } from 'react';

import {
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  readDensity,
  readTheme,
  subscribe,
  type Density,
  type Theme,
} from './appearance';

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
}

export function useDensity(): Density {
  return useSyncExternalStore(subscribe, readDensity, () => DEFAULT_DENSITY);
}
