import { describe, expect, it } from 'vitest';
import { colorDistance, parseColor } from '../src/client/color';

const lab = (input: string) => {
  const parsed = parseColor(input);
  if (!parsed) throw new Error(`could not parse ${input}`);
  return parsed;
};

describe('parseColor', () => {
  it('reads the rgb() form browsers return', () => {
    expect(colorDistance(lab('rgb(255, 255, 255)'), lab('#ffffff'))).toBeLessThan(1e-6);
  });

  it('reads short and long hex', () => {
    expect(colorDistance(lab('#fff'), lab('#ffffff'))).toBeLessThan(1e-6);
  });

  it('reads oklch, matching its sRGB equivalent', () => {
    // oklch(1 0 0) is white; oklch(0 0 0) is black.
    expect(colorDistance(lab('oklch(1 0 0)'), lab('#ffffff'))).toBeLessThan(0.01);
    expect(colorDistance(lab('oklch(0 0 0)'), lab('#000000'))).toBeLessThan(0.01);
  });

  it('reads hsl', () => {
    expect(colorDistance(lab('hsl(0, 100%, 50%)'), lab('#ff0000'))).toBeLessThan(1e-6);
  });

  it('reads color(srgb ...)', () => {
    expect(colorDistance(lab('color(srgb 1 0 0)'), lab('#ff0000'))).toBeLessThan(1e-6);
  });

  it('handles alpha in both notations', () => {
    expect(lab('rgba(0, 0, 0, 0.5)').alpha).toBeCloseTo(0.5, 3);
    expect(lab('#00000080').alpha).toBeCloseTo(0.502, 2);
  });

  it('returns transparent as fully transparent black', () => {
    expect(lab('transparent').alpha).toBe(0);
  });

  it('refuses values that are not colours', () => {
    expect(parseColor('currentcolor')).toBeNull();
    expect(parseColor('linear-gradient(red, blue)')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('colorDistance', () => {
  it('is near zero for imperceptible differences', () => {
    expect(colorDistance(lab('#ffffff'), lab('#fefefe'))).toBeLessThan(0.01);
  });

  it('is large for obvious differences', () => {
    expect(colorDistance(lab('#ffffff'), lab('#000000'))).toBeGreaterThan(0.9);
  });

  it('never counts a different alpha as a match', () => {
    expect(colorDistance(lab('rgb(0, 0, 0)'), lab('rgba(0, 0, 0, 0.5)'))).toBeGreaterThan(0.5);
  });
});
