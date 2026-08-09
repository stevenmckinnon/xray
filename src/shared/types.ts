/** Types shared between the Vite plugin (node) and the overlay (browser). */

import type { Chord } from './hotkey.js';

/**
 * What a finding is.
 *
 * Lives here rather than beside the analyser because the recording report and
 * the baseline diff run in node, where the client's DOM-typed modules cannot be
 * compiled. `analyse.ts` re-exports both, so this move is invisible to callers.
 */
export type FindingKind =
  | 'variant-locked'
  | 'literal'
  | 'off-scale'
  | 'untokenized'
  | 'unresolved'
  | 'tokenized';

export type Severity = 'high' | 'medium' | 'low' | 'ok';

/** Worst first. Used for sorting and for `--fail-on` thresholds. */
export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'ok'];

export function severityRank(severity: Severity): number {
  const i = SEVERITY_ORDER.indexOf(severity);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

/** True when `severity` is at least as bad as `threshold`. */
export function atLeast(severity: Severity, threshold: Severity): boolean {
  return severityRank(severity) <= severityRank(threshold);
}

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

  /**
   * How many tokens a selector must move before it counts as a variant axis
   * rather than a state class. Default 3.
   *
   * Lower it to 2 if your system is small enough that a real axis — a dark mode
   * overriding only a foreground and a background — moves fewer tokens than a
   * modifier would. `__xray.diagnose().dismissedAxes` lists what the current
   * setting is throwing away.
   */
  axisMinTokens?: number;
}

/**
 * How many tokens a condition must move before it counts as an axis rather than a
 * state class or a one-off modifier. Real theming axes move tokens in bulk.
 *
 * Three is a judgement call, and it cuts both ways. A `:root` / `.dark` pair that
 * moves only a foreground and a background is a real axis in a small design
 * system, and missing it is worse than noise: values matching those tokens get
 * reported as constant "drift" rather than locked to a variant, which is a
 * confident wrong answer.
 *
 * It stays at three because nothing in a stylesheet distinguishes that pair from
 * a `.promo` modifier that also moves two tokens, and this tool would rather be
 * quiet than wrong. `axisMinTokens` lowers it for systems small enough to need
 * that, and `diagnose()` lists what the threshold dismissed so the choice is
 * visible rather than silent.
 */
export const AXIS_MIN_TOKENS = 3;

export const DEFAULT_HOTKEY = 'mod+shift+x';

export interface ResolvedOptions {
  axes: string[][] | null;
  source: boolean;
  /** Empty when the hotkey is disabled. */
  hotkeys: Chord[];
  lengthTolerance: number;
  colorTolerance: number;
  axisMinTokens: number;
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
  axisMinTokens?: number;
}

/** ClientConfig after the client has filled in defaults. */
export interface RuntimeConfig {
  axes: string[][] | null;
  hotkeys: Chord[];
  lengthTolerance: number;
  colorTolerance: number;
  axisMinTokens: number;
}
