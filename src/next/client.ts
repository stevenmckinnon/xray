'use client';

/**
 * `<Xray />` — boots the overlay in a Next.js app.
 *
 * Render it once, in the root layout. It renders nothing.
 *
 * The guard below is what keeps the 86kB client out of the consumer's production
 * build, which is the same promise the Vite plugin keeps by being `apply: 'serve'`.
 * Two things about it are load-bearing, and each bundler cares about a different one.
 * Measured against `playground-next`, by grepping the build output for strings only
 * the client contains:
 *
 *                                          Turbopack   webpack
 *   `if (prod && !force) return;`           emitted     emitted
 *   `if (prod) return;`                     dropped     emitted
 *   `if (!prod) { ...import()... }`         dropped     dropped
 *
 * So: (1) nothing in the condition may be a runtime value, or neither bundler can
 * fold it; and (2) the `import()` has to be inside the branch, because webpack skips
 * a dead block without walking it for dependencies but happily walks the statements
 * after a `return`. Chunks are decided during that walk, before any minifier gets to
 * eliminate the dead code, which is why an unreachable `import()` still produces one.
 *
 * The first rule is why there is no longer a `force` prop. A prop is a runtime value,
 * so `dist/client.mjs` was emitted as a 48,338-byte lazy chunk plus two server files
 * into every consumer's production build. Nothing fetched it — it was absent from the
 * build manifest — but the README claimed it was not bundled, and that was false. To
 * run the overlay on a deployed site, serve `dist/client.js` yourself and call
 * `__xrayClient.start()`; this project's own site does exactly that, and needs no API
 * here for it.
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
}

export function Xray({ hotkey, lengthTolerance, colorTolerance, axes, axisMinTokens }: XrayProps = {}): null {
  useEffect(() => {
    // `NODE_ENV` and nothing else, and the import stays inside the block. Both halves
    // are measured — see the table above — and either one alone ships the client.
    if (process.env.NODE_ENV !== 'production') {
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
    }
  }, [hotkey, lengthTolerance, colorTolerance, axes, axisMinTokens]);

  return null;
}

export default Xray;
