/**
 * Picking which token to name.
 *
 * At medium density `8px` is `--salt-spacing-100`, `--salt-curve-200`,
 * `--salt-size-adornment` and a dozen others — they all hold the same number.
 * Naming the wrong one makes a correct finding look like a guess, so candidates
 * are ranked by how well the token's name fits the property being set.
 */

/** Words in a token name that suggest it belongs to a given property. */
const TYPOGRAPHIC = ['fontsize', 'lineheight', 'letterspacing', 'fontweight'];
const ROUNDING = ['curve', 'corner', 'radius'];

/**
 * `avoid` is not a tie-break, it is a veto. Without it, "size" as a strong word
 * for `height` matches `--salt-text-display2-fontSize`, and xray confidently
 * explains a button's height with a display heading's font size.
 */
const AFFINITY: { props: RegExp; strong: string[]; weak: string[]; avoid?: string[] }[] = [
  {
    props: /^(padding|margin|row-gap|column-gap)/,
    strong: ['spacing', 'padding', 'margin', 'gap', 'inset'],
    weak: ['size', 'space'],
    avoid: [...TYPOGRAPHIC, ...ROUNDING, 'border', 'stroke'],
  },
  {
    props: /^(width|height|min-width|min-height|max-width|max-height)$/,
    strong: ['size', 'width', 'height'],
    weak: ['spacing'],
    avoid: [...TYPOGRAPHIC, ...ROUNDING],
  },
  {
    props: /^border-(top|right|bottom|left)-width$/,
    strong: ['border', 'stroke', 'strokewidth', 'divider'],
    weak: ['size', 'fixed'],
    avoid: [...TYPOGRAPHIC, ...ROUNDING],
  },
  {
    props: /radius$/,
    strong: ['curve', 'corner', 'radius', 'rounding'],
    weak: ['size'],
    avoid: [...TYPOGRAPHIC, 'spacing', 'icon'],
  },
  {
    props: /^font-size$/,
    strong: ['fontsize', 'textsize', 'font', 'text'],
    weak: ['size'],
    avoid: [...ROUNDING, 'spacing', 'icon', 'bar', 'border'],
  },
  {
    props: /^line-height$/,
    strong: ['lineheight', 'leading'],
    weak: ['text', 'font'],
    avoid: [...ROUNDING, 'spacing', 'fontsize'],
  },
  {
    props: /^letter-spacing$/,
    strong: ['letterspacing', 'tracking'],
    weak: ['text', 'font'],
  },
  {
    props: /^(top|right|bottom|left)$/,
    strong: ['inset', 'offset', 'spacing'],
    weak: ['size'],
    avoid: [...TYPOGRAPHIC, ...ROUNDING],
  },
  {
    props: /^(background-color)$/,
    strong: ['background', 'container', 'surface', 'fill'],
    weak: ['color', 'palette'],
  },
  {
    props: /^(color|-webkit-text-fill-color)$/,
    strong: ['foreground', 'content', 'text'],
    weak: ['color', 'palette'],
  },
  {
    props: /^border-(top|right|bottom|left)-color$/,
    strong: ['border', 'separable', 'divider', 'outline'],
    weak: ['color', 'palette'],
  },
  {
    props: /^outline-color$/,
    strong: ['focused', 'outline', 'border'],
    weak: ['color', 'palette'],
  },
];

const isColorProp = (prop: string) => /color$|^fill$|^stroke$/.test(prop);

/** `--salt-color-gray-900` is a raw palette entry; `--salt-content-primary-foreground` is the one to use. */
function primitiveness(name: string): number {
  let score = 0;
  if (/(^|-)(color|palette)-/.test(name)) score += 2;
  if (/-\d{2,4}(-|$)/.test(name)) score += 1;
  if (/(^|-)(legacy|internal|deprecated)(-|$)/.test(name)) score += 3;
  return score;
}

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

export interface Ranked {
  name: string;
  /** Sort key: affinity minus how primitive the name looks. */
  score: number;
  /** Keyword fit alone. One strong keyword is worth STRONG. */
  affinity: number;
}

const STRONG = 4;

/**
 * Rank token names by fitness for a property, best first.
 *
 * Never filters: the runner-up is often the one the reviewer wanted, so the
 * overlay shows several. Only the order changes — and the score, which callers
 * use to tell a real match from a numeric coincidence.
 */
export function rankScored(prop: string, names: string[]): Ranked[] {
  const entry = AFFINITY.find((a) => a.props.test(prop));
  const scored = names.map((name) => {
    const flat = normalise(name);
    let score = 0;
    if (entry) {
      for (const word of entry.strong) if (flat.includes(word)) score += STRONG;
      for (const word of entry.weak) if (flat.includes(word)) score += 1;
      // A veto outweighs any number of positive hits.
      for (const word of entry.avoid ?? []) if (flat.includes(word)) score -= STRONG * 2;
    }
    const affinity = score;
    // For colours, prefer the semantic layer over the raw palette. For lengths,
    // numbered scale steps (`--salt-spacing-100`) *are* the semantic layer.
    // This only reorders — it must not decide plausibility, or a token like
    // `--salt-palette-neutral-primary-background` would be dismissed.
    if (isColorProp(prop)) score -= primitiveness(name);
    return { name, score, affinity, length: name.length };
  });

  scored.sort((a, b) => b.score - a.score || a.length - b.length || a.name.localeCompare(b.name));
  return scored.map(({ name, score, affinity }) => ({ name, score, affinity }));
}

export function rankTokens(prop: string, names: string[]): string[] {
  return rankScored(prop, names).map((r) => r.name);
}

/**
 * Does any candidate actually look like it belongs to this property?
 *
 * At medium density there are ~40 tokens holding some value between 1 and 48px,
 * so *any* literal will collide with one. `padding: 13px` equalling a
 * `lineHeight` token is arithmetic, not intent — reporting it as a bug is how a
 * tool teaches people to ignore it.
 */
export function isPlausible(ranked: Ranked[]): boolean {
  // A weak hit is not enough: `--salt-text-label-fontSize` contains "size", which
  // makes it a poor explanation for `border-radius: 11px`.
  return ranked.some((r) => r.affinity >= STRONG);
}
