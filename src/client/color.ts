/**
 * Just enough colour science to answer "is this literal the same colour as that
 * token, or near it?" in a way that matches human perception rather than hex
 * proximity. Everything lands in OKLab, where euclidean distance is ~ΔE.
 */

export interface Lab {
  L: number;
  a: number;
  b: number;
  alpha: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearSrgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

/** display-p3 primaries → linear sRGB. */
function p3ToLinearSrgb(r: number, g: number, b: number): [number, number, number] {
  return [
    1.2249401762 * r - 0.2249404624 * g + 0.0000002886 * b,
    -0.0420569547 * r + 1.0420571695 * g - 0.0000000148 * b,
    -0.0196375546 * r - 0.0786360454 * g + 1.0982736 * b,
  ];
}

function splitArgs(inner: string): string[] {
  return inner
    .replace(/\//g, ' / ')
    .split(/[\s,]+/)
    .filter(Boolean);
}

function num(token: string | undefined, scale = 1): number {
  if (!token) return 0;
  if (token.endsWith('%')) return (parseFloat(token) / 100) * scale;
  if (token === 'none') return 0;
  return parseFloat(token);
}

function alphaOf(args: string[]): number {
  const slash = args.indexOf('/');
  if (slash !== -1) {
    const raw = args[slash + 1];
    if (!raw || raw === 'none') return 1;
    return raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
  }
  return 1;
}

/**
 * Parse any colour string a browser will hand back from `getComputedStyle`, plus
 * the authored forms tokens tend to use.
 *
 * Returns null for `none`, `currentcolor`, gradients and anything unparseable —
 * callers treat that as "not a colour we can compare".
 */
export function parseColor(input: string): Lab | null {
  const s = input.trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent' || s === 'currentcolor' || s === 'inherit') {
    return s === 'transparent' ? { L: 0, a: 0, b: 0, alpha: 0 } : null;
  }

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    const expand = (h: string) => parseInt(h.length === 1 ? h + h : h, 16) / 255;
    let parts: string[];
    if (hex.length === 3 || hex.length === 4) parts = hex.split('');
    else if (hex.length === 6 || hex.length === 8) parts = hex.match(/.{2}/g) ?? [];
    else return null;
    const [r, g, b, a] = parts.map(expand);
    return fromSrgb(r ?? 0, g ?? 0, b ?? 0, a ?? 1);
  }

  const fn = s.match(/^([a-z-]+)\((.*)\)$/s);
  if (!fn) return null;
  const name = fn[1]!;
  const args = splitArgs(fn[2]!);
  const alpha = alphaOf(args);
  const positional = args.slice(0, args.indexOf('/') === -1 ? args.length : args.indexOf('/'));

  switch (name) {
    case 'rgb':
    case 'rgba': {
      const [r, g, b, a] = positional;
      const toUnit = (t: string | undefined) => (t?.endsWith('%') ? parseFloat(t) / 100 : num(t) / 255);
      return fromSrgb(toUnit(r), toUnit(g), toUnit(b), positional.length > 3 ? num(a) : alpha);
    }
    case 'hsl':
    case 'hsla': {
      const [h, sat, light, a] = positional;
      const rgb = hslToRgb(parseFloat(h ?? '0'), num(sat, 1), num(light, 1));
      return fromSrgb(rgb[0], rgb[1], rgb[2], positional.length > 3 ? num(a) : alpha);
    }
    case 'oklab': {
      const [L, A, B] = positional;
      return { L: num(L, 1), a: num(A), b: num(B), alpha };
    }
    case 'oklch': {
      const [L, C, H] = positional;
      const hue = ((parseFloat(H ?? '0') || 0) * Math.PI) / 180;
      const c = num(C, 0.4);
      return { L: num(L, 1), a: c * Math.cos(hue), b: c * Math.sin(hue), alpha };
    }
    case 'color': {
      const space = positional[0];
      const [r, g, b] = positional.slice(1).map((t) => num(t, 1));
      if (space === 'srgb') return fromSrgb(r ?? 0, g ?? 0, b ?? 0, alpha);
      if (space === 'srgb-linear') {
        const [L, A, B] = linearSrgbToOklab(r ?? 0, g ?? 0, b ?? 0);
        return { L, a: A, b: B, alpha };
      }
      if (space === 'display-p3') {
        const [lr, lg, lb] = p3ToLinearSrgb(srgbToLinear(r ?? 0), srgbToLinear(g ?? 0), srgbToLinear(b ?? 0));
        const [L, A, B] = linearSrgbToOklab(lr, lg, lb);
        return { L, a: A, b: B, alpha };
      }
      return null;
    }
    default:
      return null;
  }
}

function fromSrgb(r: number, g: number, b: number, alpha: number): Lab {
  const [L, A, B] = linearSrgbToOklab(
    srgbToLinear(clamp01(r)),
    srgbToLinear(clamp01(g)),
    srgbToLinear(clamp01(b)),
  );
  return { L, a: A, b: B, alpha: Number.isFinite(alpha) ? clamp01(alpha) : 1 };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(hue / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[seg]!;
  return [r + m, g + m, b + m];
}

/** Perceptual distance. ~0.02 is "a careful eye might notice"; ~0.05 is obvious. */
export function colorDistance(a: Lab, b: Lab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  const dAlpha = a.alpha - b.alpha;
  // Alpha differences are not perceptual, but a token with a different alpha is
  // simply a different token — weight it heavily so it never counts as a match.
  return Math.sqrt(dL * dL + da * da + db * db) + Math.abs(dAlpha) * 2;
}

export function isColorLike(value: string): boolean {
  return parseColor(value) !== null;
}
