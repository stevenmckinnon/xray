/**
 * Key bindings, parsed once and shared by the plugin and the overlay.
 *
 * This lives in `shared/` on purpose: the plugin parses the user's config when
 * the dev server starts, so a typo is an immediate error with a useful message
 * rather than a hotkey that silently never fires.
 *
 * Chords match on `event.code`, not `event.key`. With a modifier held, `key` is
 * not the letter you pressed — shift+x reports `X`, and on macOS alt+x reports
 * `≈`. `code` is modifier-independent, which is what a chord needs. The cost is
 * that it is physical: on a Dvorak layout `KeyX` is wherever X sits on the board.
 */

export interface Chord {
  /** Physical key, e.g. `KeyX`, `F8`, `Backquote`. Null for a modifier-only tap. */
  code: string | null;
  /** Printable key as a fallback match, e.g. `x`, `/`. */
  key: string | null;
  /** Cmd on Apple platforms, Ctrl everywhere else. */
  mod: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /**
   * Set for a double-tap binding like `shift shift`: the `event.key` of the key
   * that must be tapped twice. Collides with nothing, at the cost of being
   * invisible until someone tells you about it.
   */
  tapTwice: string | null;
  /** The string this came from, for error messages and display. */
  source: string;
}

const MODIFIERS = new Set(['mod', 'cmd', 'command', 'meta', 'super', 'win', 'ctrl', 'control', 'alt', 'option', 'shift']);

/** `event.key` values for the modifier keys, used by double-tap bindings. */
const MODIFIER_KEY: Record<string, string> = {
  shift: 'Shift',
  alt: 'Alt',
  option: 'Alt',
  ctrl: 'Control',
  control: 'Control',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  mod: 'Meta',
};

/** Friendly names for keys whose `code` is not simply `Key<X>`. */
const NAMED_CODES: Record<string, string> = {
  escape: 'Escape',
  esc: 'Escape',
  space: 'Space',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  backquote: 'Backquote',
  backtick: 'Backquote',
  '`': 'Backquote',
  '-': 'Minus',
  minus: 'Minus',
  '=': 'Equal',
  equal: 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  semicolon: 'Semicolon',
  "'": 'Quote',
  quote: 'Quote',
  ',': 'Comma',
  comma: 'Comma',
  '.': 'Period',
  period: 'Period',
  '/': 'Slash',
  slash: 'Slash',
};

function codeFor(token: string): string | null {
  if (NAMED_CODES[token]) return NAMED_CODES[token]!;
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(token)) return `F${token.slice(1)}`;
  if (/^[a-z]$/.test(token)) return `Key${token.toUpperCase()}`;
  if (/^[0-9]$/.test(token)) return `Digit${token}`;
  return null;
}

export class HotkeyError extends Error {
  override name = 'HotkeyError';
}

/**
 * Parse one binding: `'mod+shift+x'`, `'alt+f8'`, `'shift shift'`.
 *
 * Rejects a bare printable key. A binding with no modifier means the overlay
 * opens whenever someone types that letter, and xray runs inside a real app
 * where people type.
 */
export function parseHotkey(input: string): Chord {
  const source = input.trim();
  if (!source) throw new HotkeyError('Hotkey is empty.');

  // Space-separated identical tokens mean "tap this twice".
  if (/\s/.test(source)) {
    const taps = source.split(/\s+/).map((t) => t.toLowerCase());
    if (taps.length !== 2 || taps[0] !== taps[1]) {
      throw new HotkeyError(
        `Cannot parse hotkey "${source}". A spaced binding must be the same key twice, e.g. "shift shift".`,
      );
    }
    const token = taps[0]!;
    const key = MODIFIER_KEY[token] ?? (codeFor(token) ? token : null);
    if (!key) throw new HotkeyError(`Cannot parse hotkey "${source}": unknown key "${token}".`);
    return {
      code: MODIFIER_KEY[token] ? null : codeFor(token),
      key,
      mod: false,
      meta: false,
      ctrl: false,
      alt: false,
      shift: false,
      tapTwice: key,
      source,
    };
  }

  const tokens = source
    .split('+')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) throw new HotkeyError(`Cannot parse hotkey "${source}".`);

  const chord: Chord = {
    code: null,
    key: null,
    mod: false,
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
    tapTwice: null,
    source,
  };

  for (const token of tokens) {
    if (MODIFIERS.has(token)) {
      if (token === 'mod') chord.mod = true;
      else if (token === 'shift') chord.shift = true;
      else if (token === 'alt' || token === 'option') chord.alt = true;
      else if (token === 'ctrl' || token === 'control') chord.ctrl = true;
      else chord.meta = true;
      continue;
    }
    if (chord.code || chord.key) {
      throw new HotkeyError(
        `Cannot parse hotkey "${source}": more than one non-modifier key ("${chord.key}" and "${token}").`,
      );
    }
    const code = codeFor(token);
    if (!code) throw new HotkeyError(`Cannot parse hotkey "${source}": unknown key "${token}".`);
    chord.code = code;
    chord.key = token;
  }

  if (!chord.code) {
    throw new HotkeyError(`Cannot parse hotkey "${source}": it has modifiers but no key.`);
  }

  const bare = !chord.mod && !chord.meta && !chord.ctrl && !chord.alt && !chord.shift;
  const isFunctionKey = /^F\d+$/.test(chord.code);
  if (bare && !isFunctionKey) {
    throw new HotkeyError(
      `Hotkey "${source}" has no modifier, so it would fire whenever someone types "${chord.key}". ` +
        `Add a modifier ("mod+shift+${chord.key}"), use a function key ("f8"), or use a double tap ("shift shift").`,
    );
  }

  return chord;
}

export function parseHotkeys(input: string | string[]): Chord[] {
  return (Array.isArray(input) ? input : [input]).map(parseHotkey);
}

const SYMBOLS: Record<string, string> = {
  mod: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
};

const KEY_LABEL: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
};

/** Render a binding the way the platform writes it: `⇧⌘X` on Apple, `Ctrl+Shift+X` elsewhere. */
export function formatHotkey(chord: Chord, apple: boolean): string {
  if (chord.tapTwice) {
    const name = chord.tapTwice === 'Meta' ? (apple ? 'Cmd' : 'Win') : chord.tapTwice;
    return `${name} ${name}`;
  }

  const label =
    KEY_LABEL[chord.code ?? ''] ??
    (chord.code?.startsWith('Key')
      ? chord.code.slice(3)
      : chord.code?.startsWith('Digit')
        ? chord.code.slice(5)
        : (chord.code ?? ''));

  if (apple) {
    // Apple's canonical modifier order.
    let out = '';
    if (chord.ctrl) out += SYMBOLS.ctrl;
    if (chord.alt) out += SYMBOLS.alt;
    if (chord.shift) out += SYMBOLS.shift;
    if (chord.mod || chord.meta) out += SYMBOLS.mod;
    return out + label;
  }

  const parts: string[] = [];
  if (chord.mod || chord.ctrl) parts.push('Ctrl');
  if (chord.meta) parts.push('Win');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  parts.push(label);
  return parts.join('+');
}

export interface KeyEventLike {
  code: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

/**
 * Does this event satisfy the chord?
 *
 * Modifier state must match *exactly*. Without that, a binding of `mod+shift+x`
 * would also swallow `mod+shift+alt+x`, which may belong to something else.
 */
export function matchesChord(event: KeyEventLike, chord: Chord, apple: boolean): boolean {
  if (chord.tapTwice) return false; // handled by the tap tracker, not here
  if (event.repeat) return false;

  const wantMeta = chord.meta || (chord.mod && apple);
  const wantCtrl = chord.ctrl || (chord.mod && !apple);
  if (event.metaKey !== wantMeta) return false;
  if (event.ctrlKey !== wantCtrl) return false;
  if (event.altKey !== chord.alt) return false;
  if (event.shiftKey !== chord.shift) return false;

  if (chord.code && event.code === chord.code) return true;
  // Fall back to `key` for layouts where the physical code does not line up.
  return !!chord.key && event.key.toLowerCase() === chord.key;
}

/** True when a chord would swallow a keystroke the page might want. */
export function shouldPreventDefault(chord: Chord): boolean {
  return chord.tapTwice === null;
}
