/**
 * The cascade model, tested without a DOM.
 *
 * `specifiedValue` needs only two things from the page: an object with a `style`
 * (for inline declarations) and a list of matching rules. Both are cheap to fake,
 * which means the precedence logic — the part most likely to be quietly wrong —
 * can be tested exhaustively instead of poked at in a browser.
 */

import { describe, expect, it } from 'vitest';
import {
  bucketRules,
  specifiedValue,
  type Collected,
  type CollectedRule,
  type Specificity,
} from '../src/client/cssom';

/** A stand-in for CSSStyleDeclaration covering what the cascade code calls. */
function block(decls: Record<string, string>, important: string[] = []): CSSStyleDeclaration {
  return {
    getPropertyValue: (prop: string) => decls[prop] ?? '',
    getPropertyPriority: (prop: string) => (important.includes(prop) ? 'important' : ''),
  } as unknown as CSSStyleDeclaration;
}

interface RuleSpec {
  selector: string;
  decls: Record<string, string>;
  important?: string[];
  specificity?: Specificity;
  layer?: number;
  order?: number;
}

function rule(spec: RuleSpec): CollectedRule {
  return {
    selector: spec.selector,
    specificity: spec.specificity ?? [0, 1, 0],
    order: spec.order ?? 0,
    layer: spec.layer ?? Infinity,
    conditional: false,
    declarations: Object.entries(spec.decls).map(([prop, value]) => ({
      prop,
      value,
      important: (spec.important ?? []).includes(prop),
    })),
    style: block(spec.decls, spec.important),
    sheetHref: null,
  };
}

const NO_RULES: Collected = {
  rules: [],
  buckets: bucketRules([]),
  tokenNames: [],
  declarationsByToken: new Map(),
  skippedSheets: [],
};

/** An element whose only real behaviour is its inline style. */
function element(inline: Record<string, string> = {}, important: string[] = []): Element {
  return { style: block(inline, important) } as unknown as Element;
}

const winner = (
  prop: string,
  rules: CollectedRule[],
  el: Element = element(),
): string | undefined => specifiedValue(el, prop, NO_RULES, rules)?.value;

describe('specifiedValue precedence', () => {
  it('takes the later rule when specificity ties', () => {
    expect(
      winner('padding-left', [
        rule({ selector: '.a', decls: { 'padding-left': '4px' }, order: 1 }),
        rule({ selector: '.b', decls: { 'padding-left': '8px' }, order: 2 }),
      ]),
    ).toBe('8px');
  });

  it('takes the more specific rule regardless of order', () => {
    expect(
      winner('padding-left', [
        rule({ selector: '#x', decls: { 'padding-left': '4px' }, specificity: [1, 0, 0], order: 1 }),
        rule({ selector: '.b', decls: { 'padding-left': '8px' }, specificity: [0, 1, 0], order: 99 }),
      ]),
    ).toBe('4px');
  });

  it('lets inline styles beat any rule', () => {
    expect(
      winner(
        'padding-left',
        [rule({ selector: '#x', decls: { 'padding-left': '4px' }, specificity: [1, 0, 0] })],
        element({ 'padding-left': '2px' }),
      ),
    ).toBe('2px');
  });

  it('lets !important in a rule beat an inline normal declaration', () => {
    expect(
      winner(
        'padding-left',
        [rule({ selector: '.a', decls: { 'padding-left': '4px' }, important: ['padding-left'] })],
        element({ 'padding-left': '2px' }),
      ),
    ).toBe('4px');
  });

  it('lets an unlayered rule beat a layered one even at lower specificity', () => {
    // This is the rule Tailwind v4 relies on: utilities live in a layer, and
    // anything unlayered wins over them.
    expect(
      winner('padding-left', [
        rule({ selector: '#x', decls: { 'padding-left': '4px' }, specificity: [1, 0, 0], layer: 0, order: 9 }),
        rule({ selector: '.b', decls: { 'padding-left': '8px' }, specificity: [0, 1, 0], layer: Infinity, order: 1 }),
      ]),
    ).toBe('8px');
  });

  it('prefers a later layer over an earlier one', () => {
    expect(
      winner('padding-left', [
        rule({ selector: '.a', decls: { 'padding-left': '4px' }, layer: 1, order: 9 }),
        rule({ selector: '.b', decls: { 'padding-left': '8px' }, layer: 2, order: 1 }),
      ]),
    ).toBe('8px');
  });

  it('returns null when nothing sets the property', () => {
    expect(specifiedValue(element(), 'padding-left', NO_RULES, [])).toBeNull();
  });

  it('reports where the winning value came from', () => {
    const found = specifiedValue(
      element(),
      'padding-left',
      NO_RULES,
      [rule({ selector: '.card', decls: { 'padding-left': '8px' } })],
    );
    expect(found).toMatchObject({ value: '8px', origin: 'rule', selector: '.card', viaShorthand: null });
  });
});

describe('specifiedValue shorthand fallback', () => {
  it('reads a longhand the CSSOM could expand', () => {
    // `padding: 0 8px` with no var() expands, so the longhand answers directly.
    expect(
      winner('padding-left', [rule({ selector: '.a', decls: { padding: '0 8px', 'padding-left': '8px' } })]),
    ).toBe('8px');
  });

  it('falls back to a var()-carrying shorthand and says so', () => {
    // A shorthand containing var() leaves its longhands empty in the CSSOM.
    const found = specifiedValue(
      element(),
      'padding-left',
      NO_RULES,
      [rule({ selector: '.a', decls: { padding: '0 var(--gap)' } })],
    );
    expect(found).toMatchObject({ value: '0 var(--gap)', viaShorthand: 'padding' });
  });

  it('does not fall back to a shorthand without a var()', () => {
    // Guessing which side of `padding: 0 8px` a longhand came from is how a tool
    // reports a finding against the wrong edge of a box.
    expect(specifiedValue(element(), 'padding-left', NO_RULES, [
      rule({ selector: '.a', decls: { padding: '0 8px' } }),
    ])).toBeNull();
  });

  it('finds a border colour through the border shorthand', () => {
    const found = specifiedValue(
      element(),
      'border-top-color',
      NO_RULES,
      [rule({ selector: '.a', decls: { border: '1px solid var(--line)' } })],
    );
    expect(found).toMatchObject({ viaShorthand: 'border' });
  });
});
