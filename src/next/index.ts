/**
 * Next.js integration.
 *
 * Two pieces, because Next's config gives no hook for injecting a script into the
 * document the way Vite's `transformIndexHtml` does:
 *
 * - `withXray(nextConfig)` wires up the source transform, so findings link back
 *   to the line of JSX that produced them.
 * - `<Xray />` from `@stevenmckinnon/xray/next/client` boots the overlay.
 *
 * Injecting the client automatically is possible on webpack, by rewriting
 * `config.entry`. It is not possible on Turbopack, which is now the default dev
 * bundler — and an integration that silently does nothing on half of installs is
 * worse than one line in a layout file.
 */

import { fileURLToPath } from 'node:url';
import { formatHotkey, HotkeyError, parseHotkeys } from '../shared/hotkey.js';
import { DEFAULT_HOTKEY, type XrayOptions } from '../shared/types.js';

/**
 * The slice of Next's config this reads and writes.
 *
 * Typed structurally so the package compiles without `next` installed — it is an
 * optional peer, and most installs are Vite.
 */
export interface NextConfigLike {
  webpack?: (config: WebpackConfigLike, context: { dev: boolean; isServer: boolean }) => WebpackConfigLike;
  turbopack?: { rules?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

interface WebpackConfigLike {
  module?: { rules?: unknown[] };
  [key: string]: unknown;
}

/** Only the build-time half. Runtime options are props on `<Xray />`. */
export interface WithXrayOptions {
  /** Stamp `data-xray-src` on JSX so findings link to source. Default true. */
  source?: boolean;
  /**
   * Only used to print the binding when the dev server starts, so the two halves
   * do not disagree in the console. Set it if you pass a custom `hotkey` to
   * `<Xray />`.
   */
  hotkey?: XrayOptions['hotkey'];
}

const LOADER = fileURLToPath(new URL('./loader.js', import.meta.url));

let announced = false;

/** Next compiles the app's own files; node_modules are somebody else's source. */
const JSX_RULE = {
  // Next's own generated files live under .next and are never matched by this
  // because the rule is scoped by `exclude`.
  test: /\.(jsx|tsx)$/,
  exclude: /node_modules/,
  use: [{ loader: LOADER }],
};

export function withXray(nextConfig: NextConfigLike = {}, options: WithXrayOptions = {}): NextConfigLike {
  // Fail at config time. A hotkey that never fires is the hardest kind of bug to
  // notice, because nothing happens and nothing complains.
  let hotkeys;
  try {
    hotkeys = options.hotkey === false ? [] : parseHotkeys(options.hotkey ?? DEFAULT_HOTKEY);
  } catch (error) {
    if (error instanceof HotkeyError) throw new Error(`[xray] ${error.message}`);
    throw error;
  }

  // `next build` and `next start` must be untouched. This is the same promise the
  // Vite plugin makes with `apply: 'serve'`.
  if (process.env['NODE_ENV'] !== 'development') return nextConfig;

  // Next may evaluate a config more than once in a single process, and the same
  // banner twice reads as something having gone wrong.
  if (!announced) {
    announced = true;
    const shown = hotkeys.length
      ? hotkeys.map((chord) => formatHotkey(chord, process.platform === 'darwin')).join(' or ')
      : 'disabled — call __xray.start()';
    console.log(`  \x1b[36m➜\x1b[0m  \x1b[1mxray\x1b[0m:    ${shown}`);
  }

  if (options.source === false) return nextConfig;

  const previousWebpack = nextConfig.webpack;

  return {
    ...nextConfig,

    webpack(config, context) {
      const next = previousWebpack ? previousWebpack(config, context) : config;
      // Both compilations, server included. An App Router page is rendered on the
      // server, so skipping that build stamps nothing into the HTML — and
      // stamping only the client bundle would make the two disagree, which is a
      // hydration mismatch rather than a missing feature.
      if (!context.dev) return next;
      next.module ??= {};
      next.module.rules ??= [];
      next.module.rules.push(JSX_RULE);
      return next;
    },

    turbopack: {
      ...nextConfig.turbopack,
      rules: {
        ...nextConfig.turbopack?.rules,
        // Turbopack is the default dev bundler from Next 16, and it runs this
        // loader on both the server and client compilations — verified, not
        // assumed: the stamped attribute appears in the server-rendered HTML.
        '*.tsx': { loaders: [LOADER] },
        '*.jsx': { loaders: [LOADER] },
      },
    },
  };
}

export type { XrayOptions };
