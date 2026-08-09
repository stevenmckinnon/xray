import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withXray, type NextConfigLike } from '../src/next/index';

/**
 * `withXray` reads NODE_ENV to decide whether to do anything at all, so each test
 * states the environment it means.
 */
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'development';
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = originalEnv;
});

interface FakeWebpackConfig {
  module?: { rules?: unknown[] };
  [key: string]: unknown;
}

const context = (over: { dev?: boolean; isServer?: boolean } = {}) => ({
  dev: over.dev ?? true,
  isServer: over.isServer ?? false,
});

/** Run the returned config's webpack hook and report how many rules it added. */
function rulesAdded(config: NextConfigLike, over: Parameters<typeof context>[0] = {}): number {
  const input: FakeWebpackConfig = {};
  const out = config.webpack!(input, context(over)) as FakeWebpackConfig;
  return out.module?.rules?.length ?? 0;
}

describe('withXray', () => {
  it('adds the source loader in dev', () => {
    expect(rulesAdded(withXray())).toBe(1);
  });

  // Getting this wrong stamped nothing at all: an App Router page renders on the
  // server, so excluding that compilation leaves the attribute out of the HTML.
  it('stamps the server compilation too', () => {
    expect(rulesAdded(withXray(), { isServer: true })).toBe(1);
  });

  it('adds nothing to a production compilation', () => {
    expect(rulesAdded(withXray(), { dev: false })).toBe(0);
  });

  it('leaves the config untouched outside development', () => {
    process.env['NODE_ENV'] = 'production';
    const original: NextConfigLike = { output: 'export' };
    expect(withXray(original)).toBe(original);
  });

  it('keeps the caller’s own settings', () => {
    const out = withXray({ output: 'export', images: { unoptimized: true } });
    expect(out['output']).toBe('export');
    expect(out['images']).toEqual({ unoptimized: true });
  });

  it('calls a webpack hook the caller already had, and keeps its result', () => {
    let called = false;
    const out = withXray({
      webpack(config) {
        called = true;
        (config as FakeWebpackConfig)['marker'] = true;
        return config;
      },
    });
    const result = out.webpack!({}, context()) as FakeWebpackConfig;
    expect(called).toBe(true);
    expect(result['marker']).toBe(true);
    // And ours is added on top rather than instead.
    expect(result.module?.rules).toHaveLength(1);
  });

  it('registers turbopack rules for both jsx and tsx', () => {
    const rules = withXray().turbopack?.rules ?? {};
    expect(Object.keys(rules).sort()).toEqual(['*.jsx', '*.tsx']);
  });

  it('keeps turbopack rules the caller already had', () => {
    const out = withXray({ turbopack: { rules: { '*.svg': { loaders: ['svg-loader'] } } } });
    expect(Object.keys(out.turbopack?.rules ?? {}).sort()).toEqual(['*.jsx', '*.svg', '*.tsx']);
  });

  it('skips the loader entirely when source links are turned off', () => {
    const out = withXray({}, { source: false });
    expect(out.webpack).toBeUndefined();
    expect(out.turbopack).toBeUndefined();
  });

  it('rejects a malformed hotkey at config time', () => {
    // A hotkey that never fires is the hardest kind of bug to notice, so this must
    // fail while the developer is looking at the config.
    expect(() => withXray({}, { hotkey: 'mod+shift+nope' })).toThrow(/\[xray\]/);
    expect(() => withXray({}, { hotkey: 'x' })).toThrow(/\[xray\]/);
  });

  it('accepts the bindings the client accepts', () => {
    expect(() => withXray({}, { hotkey: 'alt+f8' })).not.toThrow();
    expect(() => withXray({}, { hotkey: ['mod+shift+x', 'shift shift'] })).not.toThrow();
    expect(() => withXray({}, { hotkey: false })).not.toThrow();
  });
});
