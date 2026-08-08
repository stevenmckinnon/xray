import { describe, expect, it } from 'vitest';
import type { Collected, CollectedRule, Declaration } from '../src/client/cssom';
import { bucketRules } from '../src/client/cssom';
import { discoverAxes } from '../src/client/tokens';

/** Build the slice of `Collected` that axis discovery actually reads. */
function collected(blocks: [selector: string, decls: Record<string, string>][]): Collected {
  const rules: CollectedRule[] = blocks.map(([selector, decls], order) => ({
    selector,
    specificity: [0, 0, 0],
    order,
    layer: Infinity,
    conditional: false,
    declarations: Object.entries(decls).map(
      ([prop, value]): Declaration => ({ prop, value, important: false }),
    ),
    style: {} as CSSStyleDeclaration,
    sheetHref: null,
  }));

  const declarationsByToken = new Map<string, CollectedRule[]>();
  for (const rule of rules) {
    for (const decl of rule.declarations) {
      if (!decl.prop.startsWith('--')) continue;
      const bucket = declarationsByToken.get(decl.prop);
      if (bucket) bucket.push(rule);
      else declarationsByToken.set(decl.prop, [rule]);
    }
  }

  return {
    rules,
    buckets: bucketRules(rules),
    tokenNames: [...declarationsByToken.keys()],
    declarationsByToken,
    skippedSheets: [],
  };
}

describe('discoverAxes', () => {
  it('finds a class-based density axis and names it', () => {
    const axes = discoverAxes(
      collected([
        ['.salt-density-high', { '--spacing-100': '4px', '--size-base': '20px', '--curve': '2px' }],
        ['.salt-density-medium', { '--spacing-100': '8px', '--size-base': '28px', '--curve': '4px' }],
        ['.salt-density-low', { '--spacing-100': '12px', '--size-base': '36px', '--curve': '6px' }],
      ]),
    );

    expect(axes).toHaveLength(1);
    expect(axes[0]!.name).toBe('density');
    expect(axes[0]!.variants.map((v) => v.label).sort()).toEqual(['high', 'low', 'medium']);
  });

  it('finds an attribute-based mode axis', () => {
    const axes = discoverAxes(
      collected([
        ['.salt-theme[data-mode=light]', { '--fg': '#000', '--bg': '#fff', '--border': '#eee' }],
        ['.salt-theme[data-mode=dark]', { '--fg': '#fff', '--bg': '#000', '--border': '#333' }],
      ]),
    );

    expect(axes).toHaveLength(1);
    expect(axes[0]!.name).toBe('mode');
    expect(axes[0]!.variants.map((v) => v.label).sort()).toEqual(['dark', 'light']);
  });

  it('treats a bare :root block as the base variant of a .dark axis', () => {
    const axes = discoverAxes(
      collected([
        ['(unmatched)', { '--unrelated': '1px' }],
        [':root', { '--background': '#fff', '--foreground': '#000', '--border': '#eee' }],
        ['.dark', { '--background': '#000', '--foreground': '#fff', '--border': '#333' }],
      ]),
    );

    expect(axes).toHaveLength(1);
    expect(axes[0]!.name).toBe('dark');
    expect(axes[0]!.variants.map((v) => v.kind)).toContain('base');
    expect(axes[0]!.variants.map((v) => v.label).sort()).toEqual(['base', 'dark']);
  });

  it('ignores conditions common to every declaring selector', () => {
    const axes = discoverAxes(
      collected([
        ['.salt-theme.salt-density-high', { '--a': '1px', '--b': '2px', '--c': '3px' }],
        ['.salt-theme.salt-density-low', { '--a': '4px', '--b': '5px', '--c': '6px' }],
      ]),
    );

    expect(axes[0]!.variants.map((v) => v.raw).sort()).toEqual([
      '.salt-density-high',
      '.salt-density-low',
    ]);
  });

  it('ignores a modifier that only moves one or two tokens', () => {
    const axes = discoverAxes(
      collected([
        [':root', { '--accent': 'red', '--x': '1px' }],
        ['.promo', { '--accent': 'blue', '--x': '2px' }],
      ]),
    );

    expect(axes).toEqual([]);
  });

  it('ignores a token redeclared with the same value', () => {
    const axes = discoverAxes(
      collected([
        ['.a', { '--x': '1px', '--y': '2px', '--z': '3px' }],
        ['.b', { '--x': '1px', '--y': '2px', '--z': '3px' }],
      ]),
    );

    expect(axes).toEqual([]);
  });

  it('folds one conceptual axis discovered as two back together', () => {
    // Salt declares some tokens under all five density classes, and others under
    // `.salt-density-mobile, .salt-density-touch` only.
    const axes = discoverAxes(
      collected([
        ['.salt-density-high', { '--a': '1px', '--b': '1px', '--c': '1px' }],
        ['.salt-density-medium', { '--a': '2px', '--b': '2px', '--c': '2px' }],
        ['.salt-density-touch', { '--a': '3px', '--b': '3px', '--c': '3px', '--d': '9px', '--e': '9px', '--f': '9px' }],
        ['.salt-density-mobile', { '--d': '8px', '--e': '8px', '--f': '8px' }],
      ]),
    );

    expect(axes).toHaveLength(1);
    expect(axes[0]!.variants.map((v) => v.label).sort()).toEqual([
      'high',
      'medium',
      'mobile',
      'touch',
    ]);
  });
});
