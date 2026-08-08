/**
 * Rule bucketing, tested because a bug here is invisible: a dropped bucket does
 * not throw, it just silently loses findings.
 */

import { describe, expect, it } from 'vitest';
import {
  bucketRules,
  matchedRules,
  rightmostCompound,
  type Collected,
  type CollectedRule,
} from '../src/client/cssom';

function rule(selector: string, order = 0): CollectedRule {
  return {
    selector,
    specificity: [0, 1, 0],
    order,
    layer: Infinity,
    conditional: false,
    declarations: [],
    style: {} as CSSStyleDeclaration,
    sheetHref: null,
  };
}

function collected(selectors: string[]): Collected {
  const rules = selectors.map((s, i) => rule(s, i));
  return {
    rules,
    buckets: bucketRules(rules),
    tokenNames: [],
    declarationsByToken: new Map(),
    skippedSheets: [],
  };
}

/** An element that matches exactly the selectors it is told to. */
function element(opts: { tag?: string; id?: string; classes?: string[]; matches: string[] }): Element {
  return {
    tagName: (opts.tag ?? 'div').toUpperCase(),
    id: opts.id ?? '',
    classList: opts.classes ?? [],
    matches: (selector: string) => opts.matches.includes(selector),
  } as unknown as Element;
}

describe('rightmostCompound', () => {
  it('takes the last compound of a descendant selector', () => {
    expect(rightmostCompound('.card .title')).toBe('.title');
  });

  it('handles child, sibling and adjacent combinators', () => {
    expect(rightmostCompound('.a > .b')).toBe('.b');
    expect(rightmostCompound('.a + .b')).toBe('.b');
    expect(rightmostCompound('.a ~ .b')).toBe('.b');
  });

  it('does not split on a space inside an attribute value', () => {
    expect(rightmostCompound('[data-x="a b"]')).toBe('[data-x="a b"]');
  });

  it('does not split on a space inside :is()', () => {
    expect(rightmostCompound(':is(.a, .b) .c')).toBe('.c');
    expect(rightmostCompound('.x:is(.a .b)')).toBe('.x:is(.a .b)');
  });

  it('returns a lone compound unchanged', () => {
    expect(rightmostCompound('button.primary')).toBe('button.primary');
  });
});

describe('matchedRules candidate selection', () => {
  it('finds a rule keyed by class', () => {
    const c = collected(['.a', '.b']);
    const el = element({ classes: ['a'], matches: ['.a'] });
    expect(matchedRules(el, c).map((r) => r.selector)).toEqual(['.a']);
  });

  it('finds a rule whose key is the rightmost class of a descendant selector', () => {
    const c = collected(['.card .title']);
    const el = element({ classes: ['title'], matches: ['.card .title'] });
    expect(matchedRules(el, c).map((r) => r.selector)).toEqual(['.card .title']);
  });

  it('finds rules keyed by tag and by id', () => {
    const c = collected(['button', '#go', '.nope']);
    const el = element({ tag: 'button', id: 'go', matches: ['button', '#go'] });
    expect(matchedRules(el, c).map((r) => r.selector).sort()).toEqual(['#go', 'button']);
  });

  it('always considers rules with no usable key', () => {
    // `:is(...)` leaves nothing outside the parens to key on, so it must stay a
    // candidate for every element rather than being bucketed away and lost.
    const c = collected([':is(.a, .b)']);
    const el = element({ classes: ['a'], matches: [':is(.a, .b)'] });
    expect(matchedRules(el, c).map((r) => r.selector)).toEqual([':is(.a, .b)']);
  });

  it('returns matches in document order even though buckets are visited out of order', () => {
    const c = collected(['div', '.late', '.early']);
    const el = element({
      tag: 'div',
      classes: ['late', 'early'],
      matches: ['div', '.late', '.early'],
    });
    expect(matchedRules(el, c).map((r) => r.order)).toEqual([0, 1, 2]);
  });

  it('skips a selector the engine refuses to evaluate', () => {
    const c = collected(['.a::part(x)']);
    const el = {
      tagName: 'DIV',
      id: '',
      classList: ['a'],
      matches: () => {
        throw new SyntaxError('unsupported pseudo-element');
      },
    } as unknown as Element;
    expect(matchedRules(el, c)).toEqual([]);
  });
});
