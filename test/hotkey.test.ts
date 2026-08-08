import { describe, expect, it } from 'vitest';
import {
  formatHotkey,
  HotkeyError,
  matchesChord,
  parseHotkey,
  parseHotkeys,
  shouldPreventDefault,
  type KeyEventLike,
} from '../src/shared/hotkey';

/** A keydown event, with nothing held unless asked for. */
function press(code: string, opts: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    code,
    key: opts.key ?? code.replace(/^Key/, '').toLowerCase(),
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...opts,
  };
}

describe('parseHotkey', () => {
  it('parses the default binding', () => {
    expect(parseHotkey('mod+shift+x')).toMatchObject({ code: 'KeyX', key: 'x', mod: true, shift: true });
  });

  it('accepts modifier aliases', () => {
    expect(parseHotkey('option+cmd+k')).toMatchObject({ alt: true, meta: true, code: 'KeyK' });
    expect(parseHotkey('control+alt+j')).toMatchObject({ ctrl: true, alt: true, code: 'KeyJ' });
  });

  it('maps named and punctuation keys to their codes', () => {
    expect(parseHotkey('alt+f8').code).toBe('F8');
    expect(parseHotkey('mod+backtick').code).toBe('Backquote');
    expect(parseHotkey('mod+/').code).toBe('Slash');
    expect(parseHotkey('mod+shift+period').code).toBe('Period');
    expect(parseHotkey('mod+1').code).toBe('Digit1');
  });

  it('allows a bare function key', () => {
    expect(parseHotkey('f8')).toMatchObject({ code: 'F8', shift: false, mod: false });
  });

  it('refuses a bare letter, because people type letters', () => {
    expect(() => parseHotkey('x')).toThrow(HotkeyError);
    expect(() => parseHotkey('x')).toThrow(/no modifier/);
  });

  it('refuses modifiers with no key', () => {
    expect(() => parseHotkey('mod+shift')).toThrow(/no key/);
  });

  it('refuses two non-modifier keys', () => {
    expect(() => parseHotkey('mod+x+y')).toThrow(/more than one non-modifier/);
  });

  it('refuses an unknown key name', () => {
    expect(() => parseHotkey('mod+wiggle')).toThrow(/unknown key/);
  });

  it('refuses an empty binding', () => {
    expect(() => parseHotkey('   ')).toThrow(HotkeyError);
  });

  it('suggests a fix in the message', () => {
    expect(() => parseHotkey('k')).toThrow(/mod\+shift\+k/);
  });

  it('parses a double tap', () => {
    expect(parseHotkey('shift shift')).toMatchObject({ tapTwice: 'Shift', code: null });
  });

  it('refuses a mismatched spaced binding', () => {
    expect(() => parseHotkey('shift alt')).toThrow(/same key twice/);
    expect(() => parseHotkey('a b c')).toThrow(/same key twice/);
  });

  it('parses a list', () => {
    expect(parseHotkeys(['mod+shift+x', 'f8'])).toHaveLength(2);
    expect(parseHotkeys('f8')).toHaveLength(1);
  });
});

describe('matchesChord', () => {
  const chord = parseHotkey('mod+shift+x');

  it('matches on Apple with Cmd held', () => {
    expect(matchesChord(press('KeyX', { metaKey: true, shiftKey: true, key: 'X' }), chord, true)).toBe(true);
  });

  it('matches elsewhere with Ctrl held', () => {
    expect(matchesChord(press('KeyX', { ctrlKey: true, shiftKey: true, key: 'X' }), chord, false)).toBe(true);
  });

  it('does not match the wrong primary modifier for the platform', () => {
    expect(matchesChord(press('KeyX', { ctrlKey: true, shiftKey: true }), chord, true)).toBe(false);
    expect(matchesChord(press('KeyX', { metaKey: true, shiftKey: true }), chord, false)).toBe(false);
  });

  it('requires an exact modifier set, so it cannot swallow a longer combination', () => {
    const withAlt = press('KeyX', { metaKey: true, shiftKey: true, altKey: true });
    expect(matchesChord(withAlt, chord, true)).toBe(false);
  });

  it('ignores the shifted key value, matching the physical code', () => {
    // shift+x reports key 'X'; alt+x on macOS reports '≈'. Neither is 'x'.
    const alt = parseHotkey('alt+x');
    expect(matchesChord(press('KeyX', { altKey: true, key: '≈' }), alt, true)).toBe(true);
  });

  it('falls back to the printable key when the code does not line up', () => {
    const slash = parseHotkey('mod+/');
    expect(matchesChord({ ...press('Unidentified', { metaKey: true, key: '/' }) }, slash, true)).toBe(true);
  });

  it('ignores auto-repeat from a held key', () => {
    expect(
      matchesChord(press('KeyX', { metaKey: true, shiftKey: true, repeat: true }), chord, true),
    ).toBe(false);
  });

  it('never matches a double-tap binding directly', () => {
    const tap = parseHotkey('shift shift');
    expect(matchesChord(press('ShiftLeft', { shiftKey: true, key: 'Shift' }), tap, true)).toBe(false);
  });
});

describe('formatHotkey', () => {
  it('uses Apple symbols in canonical order', () => {
    expect(formatHotkey(parseHotkey('mod+shift+x'), true)).toBe('⇧⌘X');
    expect(formatHotkey(parseHotkey('ctrl+alt+shift+mod+k'), true)).toBe('⌃⌥⇧⌘K');
  });

  it('spells out modifiers elsewhere', () => {
    expect(formatHotkey(parseHotkey('mod+shift+x'), false)).toBe('Ctrl+Shift+X');
    expect(formatHotkey(parseHotkey('alt+f8'), false)).toBe('Alt+F8');
  });

  it('shows punctuation as the character', () => {
    expect(formatHotkey(parseHotkey('mod+backtick'), false)).toBe('Ctrl+`');
    expect(formatHotkey(parseHotkey('mod+/'), true)).toBe('⌘/');
  });

  it('names a double tap per platform', () => {
    expect(formatHotkey(parseHotkey('shift shift'), true)).toBe('Shift Shift');
    expect(formatHotkey(parseHotkey('meta meta'), true)).toBe('Cmd Cmd');
    expect(formatHotkey(parseHotkey('meta meta'), false)).toBe('Win Win');
  });
});

describe('shouldPreventDefault', () => {
  it('swallows a chord', () => {
    expect(shouldPreventDefault(parseHotkey('mod+shift+x'))).toBe(true);
  });

  it('leaves a double-tapped modifier alone, so capitals still work', () => {
    expect(shouldPreventDefault(parseHotkey('shift shift'))).toBe(false);
  });
});
