import { describe, expect, it } from 'vitest';
import { compareSpecificity, specificity, splitSelectorList } from '../src/client/cssom';

describe('splitSelectorList', () => {
  it('splits on top-level commas', () => {
    expect(splitSelectorList('.a, .b , .c')).toEqual(['.a', '.b', '.c']);
  });

  it('ignores commas inside functional pseudo-classes', () => {
    expect(splitSelectorList(':is(.a, .b) .c, .d')).toEqual([':is(.a, .b) .c', '.d']);
  });

  it('ignores commas inside attribute values', () => {
    expect(splitSelectorList('[data-x="a,b"], .c')).toEqual(['[data-x="a,b"]', '.c']);
  });
});

describe('specificity', () => {
  it('counts ids, classes and elements', () => {
    expect(specificity('#main .card button')).toEqual([1, 1, 1]);
  });

  it('counts attribute selectors as classes', () => {
    expect(specificity('.salt-theme[data-mode=dark]')).toEqual([0, 2, 0]);
  });

  it('treats :where() as free', () => {
    expect(specificity(':where(.a, #b) .c')).toEqual([0, 1, 0]);
  });

  it('takes the max of an :is() list', () => {
    expect(specificity(':is(#a, .b)')).toEqual([1, 0, 0]);
  });

  it('takes the max of a :not() list', () => {
    expect(specificity('button:not(.primary, #main)')).toEqual([1, 0, 1]);
  });

  it('ignores the universal selector', () => {
    expect(specificity('* > .a')).toEqual([0, 1, 0]);
  });

  it('counts pseudo-elements as elements', () => {
    expect(specificity('.a::before')).toEqual([0, 1, 1]);
  });

  it('adds the selector list inside :nth-child(n of S)', () => {
    expect(specificity('li:nth-child(2 of .featured)')).toEqual([0, 2, 1]);
  });

  it('orders by id, then class, then element', () => {
    expect(compareSpecificity([0, 1, 0], [0, 0, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 1], [0, 1, 1])).toBe(0);
  });
});
