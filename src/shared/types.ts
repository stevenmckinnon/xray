/** Types shared between the Vite plugin (node) and the overlay (browser). */

import type { Chord } from './hotkey.js';

export interface XrayOptions {
  /**
   * Class-name axes to probe for variant-locking, e.g. `[['salt-density-high',
   * 'salt-density-medium', 'salt-density-low', 'salt-density-touch'], ['dark']]`.
   *
   * Leave unset and xray discovers axes itself: any token declared with
   * different values under different selectors defines an axis.
   */
  axes?: string[][];

  /** Inject `data-xray-src` on JSX elements so findings link back to source. Default true. */
  source?: boolean;

  /**
   * What toggles the overlay. Default `'mod+shift+x'` — Cmd on macOS, Ctrl
   * elsewhere.
   *
   * - `'mod+shift+x'`, `'alt+f8'`, `'ctrl+alt+period'` — a chord. Modifier state
   *   must match exactly, so it will not swallow a longer combination.
   * - `'shift shift'` — tap a modifier twice. Collides with nothing.
   * - `'f8'` — a function key may be used bare; a letter may not.
   * - An array binds several at once.
   * - `false` disables the hotkey; use `__xray.start()` from the console.
   *
   * Parsed when the dev server starts, so a bad binding is an error you can see
   * rather than a key that quietly does nothing.
   */
  hotkey?: string | string[] | false;

  /**
   * Treat a literal within this many CSS pixels of a token value as "off-scale"
   * rather than unrelated. Default 1.
   */
  lengthTolerance?: number;

  /** Max perceptual distance (ΔE-ish, OKLab) for a colour to count as near a token. Default 0.02. */
  colorTolerance?: number;
}

export const DEFAULT_HOTKEY = 'mod+shift+x';

export interface ResolvedOptions {
  axes: string[][] | null;
  source: boolean;
  /** Empty when the hotkey is disabled. */
  hotkeys: Chord[];
  lengthTolerance: number;
  colorTolerance: number;
}

/**
 * The shape handed to the browser.
 *
 * The plugin sends pre-parsed chords so config errors surface at server start.
 * Anything embedding `dist/client.js` directly — a docs page, a demo — can pass
 * plain strings instead and let the client parse them.
 */
export interface ClientConfig {
  axes?: string[][] | null;
  hotkeys?: (Chord | string)[];
  lengthTolerance?: number;
  colorTolerance?: number;
}

/** ClientConfig after the client has filled in defaults. */
export interface RuntimeConfig {
  axes: string[][] | null;
  hotkeys: Chord[];
  lengthTolerance: number;
  colorTolerance: number;
}
