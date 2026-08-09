'use client';

/**
 * `<Xray />` — boots the overlay in a Next.js app.
 *
 * Render it once, in the root layout. It renders nothing.
 *
 * The client is loaded with a dynamic import inside a production guard, so a
 * production build never reaches the module at all: bundlers inline
 * `process.env.NODE_ENV`, the branch folds to `false`, and the import is dropped
 * along with the 85kB behind it. That is how this keeps the same promise the Vite
 * plugin makes by being `apply: 'serve'`.
 */

import { useEffect } from 'react';
import type { XrayOptions } from '../shared/types.js';

export interface XrayProps {
  /**
   * What toggles the overlay. Default `'mod+shift+x'` — Cmd on macOS, Ctrl
   * elsewhere. `false` disables it; use `__xray.start()` from the console.
   */
  hotkey?: XrayOptions['hotkey'];
  /** Treat a literal within this many CSS pixels of a token as off-scale. Default 1. */
  lengthTolerance?: number;
  /** Max perceptual distance (OKLab ΔE) for a colour to count as near a token. Default 0.02. */
  colorTolerance?: number;
  /** Class-name axes to probe. Leave unset and xray discovers them itself. */
  axes?: string[][];
  /**
   * How many tokens a selector must move to count as a variant axis. Default 3.
   *
   * Lower it to 2 for a small system whose dark mode moves only a couple of
   * tokens. `__xray.diagnose().dismissedAxes` says whether that applies to you.
   */
  axisMinTokens?: number;
  /**
   * Run even in a production build.
   *
   * Off by default and rarely what you want. It exists because this project's own
   * marketing page is a deployed static export that has to demonstrate the tool.
   */
  force?: boolean;
}

export function Xray({ hotkey, lengthTolerance, colorTolerance, axes, axisMinTokens, force }: XrayProps = {}): null {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && !force) return;

    let cancelled = false;
    // Strings, not parsed chords: the client parses them itself, which is what
    // lets this run without the config half of the integration.
    const config = {
      ...(hotkey === false ? { hotkeys: [] } : hotkey ? { hotkeys: Array.isArray(hotkey) ? hotkey : [hotkey] } : {}),
      ...(lengthTolerance === undefined ? {} : { lengthTolerance }),
      ...(colorTolerance === undefined ? {} : { colorTolerance }),
      ...(axes === undefined ? {} : { axes }),
      ...(axisMinTokens === undefined ? {} : { axisMinTokens }),
    };

    import('../client.mjs')
      .then(({ start }) => {
        // Two instances would fight over the hotkey and the overlay, and Strict
        // Mode's development double-effect makes that the normal case rather than
        // an edge one. Tested with `in` so this file needs no global declaration
        // that could collide with the client's own.
        if (cancelled || '__xray' in window) return;
        start(config);
      })
      .catch((error: unknown) => {
        console.error('[xray] failed to load the overlay', error);
      });

    return () => {
      cancelled = true;
    };
  }, [hotkey, lengthTolerance, colorTolerance, axes, axisMinTokens, force]);

  return null;
}

export default Xray;
