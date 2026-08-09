import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { injectSource } from './plugin/source-transform.js';
import { formatHotkey, HotkeyError, parseHotkeys } from './shared/hotkey.js';
import {
  AXIS_MIN_TOKENS,
  DEFAULT_HOTKEY,
  type ClientConfig,
  type ResolvedOptions,
  type XrayOptions,
} from './shared/types.js';

const VIRTUAL_ID = 'virtual:xray-client';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

let cachedClient: string | null = null;

function clientBundle(): string {
  if (cachedClient) return cachedClient;
  const path = fileURLToPath(new URL('./client.js', import.meta.url));
  cachedClient = readFileSync(path, 'utf8');
  return cachedClient;
}

function resolveOptions(options: XrayOptions): ResolvedOptions {
  let hotkeys;
  try {
    hotkeys = options.hotkey === false ? [] : parseHotkeys(options.hotkey ?? DEFAULT_HOTKEY);
  } catch (error) {
    // Fail at config time. A hotkey that never fires is the hardest kind of bug
    // to notice, because nothing happens and nothing complains.
    if (error instanceof HotkeyError) throw new Error(`[xray] ${error.message}`);
    throw error;
  }

  return {
    axes: options.axes ?? null,
    source: options.source ?? true,
    hotkeys,
    lengthTolerance: options.lengthTolerance ?? 1,
    colorTolerance: options.colorTolerance ?? 0.02,
    axisMinTokens: options.axisMinTokens ?? AXIS_MIN_TOKENS,
  };
}

/**
 * Dev-only overlay that maps an element's computed styles back to design tokens
 * and flags the ones that only work in the variant you happen to be looking at.
 */
export default function xray(options: XrayOptions = {}): Plugin {
  const resolved = resolveOptions(options);
  let root = process.cwd();

  return {
    name: 'xray',
    apply: 'serve',
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
    },

    configureServer(server) {
      const shown = resolved.hotkeys.length
        ? resolved.hotkeys.map((chord) => formatHotkey(chord, process.platform === 'darwin')).join(' or ')
        : 'disabled — call __xray.start()';
      server.config.logger.info(`  \x1b[36m➜\x1b[0m  \x1b[1mxray\x1b[0m:    ${shown}`);
    },

    resolveId(id) {
      if (id === VIRTUAL_ID || id === RESOLVED_ID) return RESOLVED_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_ID) return null;
      const config: ClientConfig = {
        hotkeys: resolved.hotkeys,
        lengthTolerance: resolved.lengthTolerance,
        colorTolerance: resolved.colorTolerance,
        axisMinTokens: resolved.axisMinTokens,
        axes: resolved.axes,
      };
      // The MutationObserver in the client catches sheets added at runtime, but
      // an HMR CSS update rewrites an existing <style> in place and mutates
      // nothing observable. Vite tells us instead.
      return [
        clientBundle(),
        `__xrayClient.start(${JSON.stringify(config)});`,
        `if (import.meta.hot) {`,
        `  import.meta.hot.on('vite:afterUpdate', () => window.__xray && window.__xray.refresh());`,
        `}`,
        ``,
      ].join('\n');
    },

    transform(code, id) {
      if (!resolved.source) return null;
      if (id.includes('/node_modules/') || id.includes('\0')) return null;
      if (!/\.[jt]sx(\?|$)/.test(id)) return null;
      return injectSource(code, id.split('?')[0]!, root);
    },

    transformIndexHtml() {
      return [
        {
          // Vite spells the leading null byte `__x00__` in URLs.
          attrs: { type: 'module', src: `/@id/__x00__${VIRTUAL_ID}` },
          tag: 'script',
          injectTo: 'head',
        },
      ];
    },
  };
}

export type { XrayOptions };
