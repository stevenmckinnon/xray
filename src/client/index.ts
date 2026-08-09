/**
 * Client entry. Owns the hover loop, the stylesheet model and the hotkey.
 *
 * Two rules run through all of it: never break the host app, and never report
 * something we are not sure about. A dev tool that corrupts the page it inspects
 * gets uninstalled, and one that cries wolf gets ignored.
 */

import {
  formatHotkey,
  matchesChord,
  parseHotkey,
  shouldPreventDefault,
  type Chord,
} from '../shared/hotkey.js';
import type { ClientConfig, RuntimeConfig } from '../shared/types.js';
import { formatRecording, type FormatOptions, type Recording } from '../shared/recording.js';
import { analyseElement, type ElementReport } from './analyse.js';
import { collectRules, type Collected } from './cssom.js';
import { createOverlay, type OverlayHost } from './overlay.js';
import { recordPage, type RecordOptions } from './record.js';
import {
  discoverAxes,
  parentOf,
  parseVariant,
  tokenNamesInScope,
  TokenResolver,
  type Axis,
} from './tokens.js';

/** A document or shadow root: both own stylesheets, and both scope selectors. */
type StyleRoot = Document | ShadowRoot;

export interface Diagnostics {
  active: boolean;
  rules: number;
  tokensInScope: number;
  /** Firefox has historically not enumerated custom properties. */
  enumeratesCustomProperties: boolean;
  axes: { name: string; variants: string[]; tokens: number }[];
  unreadableStylesheets: string[];
  shadowRoots: number;
}

class Xray {
  /** One rule model per style root; shadow roots scope their own selectors. */
  private roots = new Map<StyleRoot, Collected>();
  private resolver: TokenResolver | null = null;
  private overlay: OverlayHost | null = null;
  private observer: MutationObserver | null = null;
  private current: Element | null = null;
  private hovered: ElementReport | null = null;
  private pinned = false;
  private frame = 0;
  private refreshTimer = 0;
  private reportedError = false;
  active = false;

  constructor(private options: RuntimeConfig) {}

  // ---------------------------------------------------------------- stylesheets

  private collectedFor(el: Element): Collected {
    const root = el.getRootNode() as StyleRoot;
    const usable: StyleRoot = 'styleSheets' in root ? root : document;
    const hit = this.roots.get(usable);
    if (hit) return hit;
    const collected = collectRules(usable);
    this.roots.set(usable, collected);
    return collected;
  }

  private get document(): Collected {
    return this.roots.get(document) ?? this.collectedFor(document.documentElement);
  }

  /** Drop every cache. Cheap: collection is milliseconds, and staleness is worse. */
  refresh(): void {
    this.roots.clear();
    const collected = this.document;
    const axes: Axis[] = this.options.axes
      ? this.options.axes.map((values, i) => ({
          name: `axis${i + 1}`,
          variants: values.map(parseVariant),
          // Configured axes opt out of the "which tokens does this move" filter:
          // if you named it, we assume every token might depend on it.
          tokens: new Set(collected.tokenNames),
        }))
      : discoverAxes(collected);
    this.resolver = new TokenResolver(collected, axes);
    if (this.current) this.render(this.current);
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 50) as unknown as number;
  }

  // ---------------------------------------------------------------- lifecycle

  toggle(): void {
    this.active ? this.stop() : this.start();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.refresh();
    this.overlay = createOverlay(this.resolver!, () => this.reinspect());

    document.addEventListener('mousemove', this.onMove, true);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('scroll', this.onReposition, true);
    // A resize can change which media queries match, and collection baked the
    // old answer in. Re-collect rather than report against a stale cascade.
    window.addEventListener('resize', this.onResize);

    // Catches CSS-in-JS inserting sheets at runtime. Dev-time edits arrive via
    // the HMR hook instead, which is why characterData is not observed here.
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeName === 'STYLE' || node.nodeName === 'LINK') {
            this.scheduleRefresh();
            return;
          }
        }
      }
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });

    const exit = this.options.hotkeys.length ? formatHotkey(this.options.hotkeys[0]!, IS_APPLE) : 'Esc';
    banner(`xray on · hover to inspect · click to pin · ${exit} to exit`);
  }

  stop(): void {
    this.active = false;
    this.pinned = false;
    this.current = null;
    this.hovered = null;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.refreshTimer);
    document.removeEventListener('mousemove', this.onMove, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('scroll', this.onReposition, true);
    window.removeEventListener('resize', this.onResize);
    this.observer?.disconnect();
    this.observer = null;
    this.overlay?.destroy();
    this.overlay = null;
  }

  // ---------------------------------------------------------------- inspection

  /** Analyse an element without the overlay — usable straight from the console. */
  inspect(el: Element): ElementReport {
    if (!this.resolver) this.refresh();
    return analyseElement(el, this.collectedFor(el), this.resolver!, {
      lengthTolerance: this.options.lengthTolerance,
      colorTolerance: this.options.colorTolerance,
    });
  }

  /**
   * Sweep the page and aggregate by source location.
   *
   * Works with the overlay off, which is what lets an E2E test or the CLI call it
   * on a page nobody is looking at.
   */
  record(options: RecordOptions = {}): Recording {
    if (!this.resolver) this.refresh();
    return recordPage(
      {
        resolver: this.resolver!,
        collectedFor: (el) => this.collectedFor(el),
        analyseOptions: {
          lengthTolerance: this.options.lengthTolerance,
          colorTolerance: this.options.colorTolerance,
        },
      },
      options,
    );
  }

  /**
   * `record()` as text, for reading in a console rather than parsing.
   *
   * Takes both sets of options: `perFile` shapes the output, everything else
   * shapes the sweep, and passing the whole object to only one of them silently
   * ignored half of it.
   */
  report(options: RecordOptions & FormatOptions = {}): string {
    return formatRecording(this.record(options), { perFile: options.perFile });
  }

  /** What xray can and cannot see. The first thing to check when output looks wrong. */
  diagnose(): Diagnostics {
    if (!this.resolver) this.refresh();
    const collected = this.document;
    const enumerated = tokenNamesInScope(document.body, []);
    return {
      active: this.active,
      rules: collected.rules.length,
      tokensInScope: enumerated.length || collected.tokenNames.length,
      enumeratesCustomProperties: enumerated.length > 0,
      axes: (this.resolver?.axes ?? []).map((a) => ({
        name: a.name,
        variants: a.variants.map((v) => v.label),
        tokens: a.tokens.size,
      })),
      unreadableStylesheets: collected.skippedSheets,
      shadowRoots: this.roots.size - (this.roots.has(document) ? 1 : 0),
    };
  }

  private reinspect(): void {
    if (this.current) this.render(this.current);
  }

  private render(el: Element): void {
    if (!this.overlay) return;
    if (!el.isConnected) {
      this.current = null;
      this.hovered = null;
      this.overlay.hide();
      return;
    }
    try {
      this.hovered = this.inspect(el);
      this.overlay.show(this.hovered, el.getBoundingClientRect(), el);
    } catch (error) {
      // An overlay that throws must not take the app's event handling with it.
      this.overlay.showError(describeError(error), el.getBoundingClientRect());
      if (!this.reportedError) {
        this.reportedError = true;
        console.error('[xray] failed to analyse an element', error);
      }
    }
  }

  // ---------------------------------------------------------------- events

  private onMove = (event: MouseEvent): void => {
    if (this.pinned) return;
    // composedPath sees through shadow boundaries; event.target would be
    // retargeted to the host and every web component would read as one box.
    const target = event.composedPath()[0] ?? event.target;
    if (!(target instanceof Element)) return;
    if (isOurs(target)) return;
    if (target === this.current) return;
    this.current = target;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (this.current === target) this.render(target);
    });
  };

  private onClick = (event: MouseEvent): void => {
    const target = event.composedPath()[0] ?? event.target;
    if (target instanceof Element && isOurs(target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.pinned = !this.pinned;
  };

  private onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.pinned) this.pinned = false;
    else this.stop();
    event.stopPropagation();
  };

  /** Scrolling moves the element, it does not change its styles. Do not re-analyse. */
  private onReposition = (): void => {
    if (!this.current || !this.hovered || !this.overlay) return;
    if (!this.current.isConnected) {
      this.overlay.hide();
      return;
    }
    this.overlay.show(this.hovered, this.current.getBoundingClientRect(), this.current);
  };

  private onResize = (): void => {
    this.scheduleRefresh();
    this.onReposition();
  };
}

/**
 * Anything xray injected: the overlay host, banners, probe hosts.
 *
 * Walks up through shadow hosts rather than using `closest`, which stops at the
 * boundary — the overlay lives in its own shadow root, so a `closest` check from
 * a node inside it finds nothing and the overlay starts inspecting itself.
 */
function isOurs(el: Element): boolean {
  for (let node: Element | null = el; node; node = parentOf(node)) {
    if (node.hasAttribute('data-xray')) return true;
  }
  return false;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function banner(text: string): void {
  const el = document.createElement('div');
  el.setAttribute('data-xray', 'banner');
  el.textContent = text;
  el.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:16px',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'background:#0b0e14',
    'color:#d7dae0',
    'border:1px solid #262c38',
    'border-radius:6px',
    'padding:5px 10px',
    'font:11px ui-monospace,Menlo,monospace',
    'pointer-events:none',
    'transition:opacity 200ms',
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
  }, 2200);
  setTimeout(() => el.remove(), 2600);
}

declare global {
  interface Window {
    __xray?: Xray;
  }
}

/** Cmd is the primary modifier on Apple platforms, Ctrl everywhere else. */
const IS_APPLE = /mac|iphone|ipad|ipod/i.test(
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.userAgent,
);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return /^(input|textarea|select)$/i.test(target.tagName);
}

/**
 * Double-tap detection for bindings like `shift shift`.
 *
 * The sequence only counts when the key is tapped alone: pressing shift and then
 * a letter resets it, so holding shift to type capitals never triggers anything.
 */
class TapTracker {
  private last = 0;
  private lastKey: string | null = null;

  constructor(private windowMs = 400) {}

  /** Returns the chord that just completed a double tap, if any. */
  test(event: KeyboardEvent, chords: Chord[]): Chord | null {
    const taps = chords.filter((c) => c.tapTwice);
    if (!taps.length) return null;

    const match = taps.find((c) => c.tapTwice === event.key);
    if (!match) {
      this.lastKey = null; // any other key breaks the sequence
      return null;
    }
    if (event.repeat) return null;

    const now = event.timeStamp || Date.now();
    const isSecond = this.lastKey === event.key && now - this.last <= this.windowMs;
    this.last = now;
    this.lastKey = isSecond ? null : event.key;
    return isSecond ? match : null;
  }
}

/** Fill in defaults and parse any bindings that arrived as strings. */
function resolve(options: ClientConfig): RuntimeConfig {
  return {
    axes: options.axes ?? null,
    hotkeys: (options.hotkeys ?? ['mod+shift+x']).map((h) => (typeof h === 'string' ? parseHotkey(h) : h)),
    lengthTolerance: options.lengthTolerance ?? 1,
    colorTolerance: options.colorTolerance ?? 0.02,
  };
}

export function start(input: ClientConfig = {}): Xray {
  const options = resolve(input);
  const xray = new Xray(options);
  window.__xray = xray;
  const taps = new TapTracker();

  window.addEventListener(
    'keydown',
    (event) => {
      const tapped = taps.test(event, options.hotkeys);
      const chord = tapped ?? options.hotkeys.find((c) => matchesChord(event, c, IS_APPLE));
      if (!chord) return;
      // Do not hijack a keystroke someone is typing into a field. Once the
      // overlay is up it owns input anyway, so the binding still gets you out.
      if (!xray.active && isEditable(event.target)) return;
      if (shouldPreventDefault(chord)) event.preventDefault();
      xray.toggle();
    },
    true,
  );

  const shown = options.hotkeys.length
    ? options.hotkeys.map((c) => formatHotkey(c, IS_APPLE)).join(' or ')
    : '__xray.start()';
  console.info(`[xray] ready — ${shown} to inspect · __xray.diagnose()`);
  return xray;
}
