/**
 * Turn one element into a list of findings.
 *
 * The interesting question is never "is this value in the scale" — it is "would
 * this value still be right in another theme, another density, another mode".
 * A literal that happens to equal a *constant* token is untidy. A literal that
 * equals a token which *varies* is a bug that is currently invisible because you
 * are looking at the one variant where it happens to be correct.
 */

import { isPlausible, rankScored, rankTokens } from './affinity.js';
import { colorDistance, parseColor } from './color.js';
import { matchedRules, specifiedValue, type Collected, type SpecifiedValue } from './cssom.js';
import { activeVariant, type TokenIndex, type TokenResolver } from './tokens.js';

export type FindingKind =
  | 'variant-locked'
  | 'literal'
  | 'off-scale'
  | 'untokenized'
  | 'unresolved'
  | 'tokenized';

export type Severity = 'high' | 'medium' | 'low' | 'ok';

export interface VariantBreakdown {
  /** Axis label, e.g. `density` or `mode`. */
  axis: string;
  values: { label: string; raw: string; value: string; wrong: boolean; active: boolean; unset: boolean }[];
  /** Label of the variant currently applied, if any. */
  active: string | null;
  /** Labels of the variants where the hardcoded literal would be wrong. */
  wrongIn: string[];
}

export interface Finding {
  prop: string;
  /** What the browser ended up with. */
  computed: string;
  /** What the author wrote, and where. */
  specified: SpecifiedValue | null;
  kind: FindingKind;
  severity: Severity;
  /** Tokens holding exactly this value in the current context. */
  tokens: string[];
  nearest: { name: string; value: string; delta: number; unit: 'px' | 'ΔE' } | null;
  variants: VariantBreakdown | null;
  message: string;
}

export interface ElementReport {
  tag: string;
  source: string | null;
  signature: string;
  findings: Finding[];
  counts: Record<Severity, number>;
  /** Things that limit how much of this report can be trusted. */
  warnings: string[];
}

const LENGTH_PROPS = [
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'row-gap',
  'column-gap',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'font-size',
  'line-height',
  'letter-spacing',
  'top',
  'right',
  'bottom',
  'left',
];

const COLOR_PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
  'text-decoration-color',
  'caret-color',
];

/** Keywords that carry no token meaning. */
const SKIP_VALUES = new Set([
  'auto',
  'none',
  'normal',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'currentcolor',
  'transparent',
  '0',
  '0px',
  '0%',
  'fit-content',
  'max-content',
  'min-content',
]);

const SINGLE_LENGTH = /^-?(\d*\.)?\d+(px|rem|em|pt|ch|ex|vh|vw|vmin|vmax|cap|lh|rlh)$/;
const VAR_REF = /var\(\s*(--[^\s,)]+)/g;

function tokenRefs(value: string): string[] {
  return [...value.matchAll(VAR_REF)].map((m) => m[1]!);
}

const fmtPx = (n: number) => `${Math.round(n * 1000) / 1000}px`;

export interface AnalyseOptions {
  lengthTolerance: number;
  colorTolerance: number;
}

export function analyseElement(
  el: Element,
  collected: Collected,
  resolver: TokenResolver,
  options: AnalyseOptions,
): ElementReport {
  const computed = getComputedStyle(el);
  const index = resolver.index(el);
  const matched = matchedRules(el, collected);
  const findings: Finding[] = [];

  for (const prop of [...LENGTH_PROPS, ...COLOR_PROPS]) {
    const spec = specifiedValue(el, prop, collected, matched);
    if (!spec) continue; // the author never set it; browser default, not our business

    const computedValue = computed.getPropertyValue(prop).trim();
    const isColor = COLOR_PROPS.includes(prop);

    if (spec.value.includes('var(')) {
      // A var() inside a shorthand cannot be attributed to one longhand, so
      // report it against the shorthand and let identical rows collapse.
      findings.push(tokenizedFinding(el, spec.viaShorthand ?? prop, computedValue, spec));
      continue;
    }

    if (SKIP_VALUES.has(spec.value.toLowerCase())) continue;

    const finding = isColor
      ? analyseColor(prop, computedValue, spec, index, resolver, el, options)
      : analyseLength(prop, computedValue, spec, index, resolver, el, options);
    if (finding) findings.push(finding);
  }

  const grouped = groupSides(dedupe(findings));
  grouped.sort((a, b) => rank(b.severity) - rank(a.severity) || a.prop.localeCompare(b.prop));

  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, ok: 0 };
  for (const f of grouped) counts[f.severity]++;

  const warnings: string[] = [];
  if (collected.skippedSheets.length) {
    // Token *values* still resolve (the browser does that for us), but selectors
    // and authored values from these sheets are invisible, so a value may look
    // untokenised when it is not.
    warnings.push(
      `${collected.skippedSheets.length} stylesheet${collected.skippedSheets.length > 1 ? 's' : ''} could not be read (cross-origin); rules in them are not considered.`,
    );
  }
  if (grouped.some((f) => f.specified?.conditional)) {
    warnings.push('Some values come from a container query whose condition xray cannot evaluate.');
  }

  return {
    tag: describe(el),
    source: el.getAttribute('data-xray-src'),
    signature: index.signature,
    findings: grouped,
    counts,
    warnings,
  };
}

/** Drop rows that say exactly the same thing about the same property. */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.prop}|${f.kind}|${f.specified?.value}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Per-side longhands, collapsed back to the name a human would use.
 *
 * Four identical border-radius findings is four times the noise for one bug.
 */
const SIDE_GROUPS: { label: string; props: string[] }[] = [
  { label: 'padding', props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
  { label: 'margin', props: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] },
  { label: 'gap', props: ['row-gap', 'column-gap'] },
  {
    label: 'border-radius',
    props: [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ],
  },
  {
    label: 'border-width',
    props: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  },
  {
    label: 'border-color',
    props: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  },
  { label: 'inset', props: ['top', 'right', 'bottom', 'left'] },
];

/** Short side name: `padding-top` in the padding group becomes `top`. */
function sideName(prop: string, group: { label: string }): string {
  const stripped = prop.replace(group.label.split('-')[0]!, '').replace(/-?(width|color|radius)$/, '');
  return stripped.replace(/^-|-$/g, '') || prop;
}

function groupSides(findings: Finding[]): Finding[] {
  const byProp = new Map(findings.map((f) => [f.prop, f]));
  const consumed = new Set<string>();
  const out: Finding[] = [];

  for (const group of SIDE_GROUPS) {
    const members = group.props.map((p) => byProp.get(p)).filter((f): f is Finding => !!f);
    if (members.length < 2) continue;

    // Sides that say the same thing merge; sides that disagree stay apart. A
    // button with `padding: 8px 16px` has two separate stories to tell.
    const partitions = new Map<string, Finding[]>();
    for (const m of members) {
      const key = `${m.kind}|${m.specified?.value}|${m.tokens.join(',')}|${m.message}`;
      const bucket = partitions.get(key);
      if (bucket) bucket.push(m);
      else partitions.set(key, [m]);
    }

    for (const bucket of partitions.values()) {
      if (bucket.length < 2) continue;
      for (const m of bucket) consumed.add(m.prop);
      const whole = bucket.length === group.props.length;
      out.push({
        ...bucket[0]!,
        prop: whole ? group.label : `${group.label} (${bucket.map((m) => sideName(m.prop, group)).join(', ')})`,
      });
    }
  }

  for (const f of findings) if (!consumed.has(f.prop)) out.push(f);
  return out;
}

const rank = (s: Severity) => (s === 'high' ? 3 : s === 'medium' ? 2 : s === 'low' ? 1 : 0);

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = [...el.classList]
    .filter((c) => !c.startsWith('xray-'))
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join('');
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

function tokenizedFinding(
  el: Element,
  prop: string,
  computedValue: string,
  spec: SpecifiedValue,
): Finding {
  const refs = tokenRefs(spec.value);
  // Ask the element, not our parsed rules. A token declared in a stylesheet we
  // are not allowed to read still resolves here, and reporting it as missing
  // would be a confident lie. This also narrows the claim from "not declared
  // anywhere" to "not in scope at this element", which is what actually matters.
  const style = getComputedStyle(el);
  const missing = refs.filter((r) => style.getPropertyValue(r).trim() === '');

  if (missing.length) {
    const hasFallback = /var\(\s*--[^\s,)]+\s*,/.test(spec.value);
    return {
      prop,
      computed: computedValue,
      specified: spec,
      kind: 'unresolved',
      severity: hasFallback ? 'medium' : 'high',
      tokens: refs,
      nearest: null,
      variants: null,
      message: hasFallback
        ? `${missing.join(', ')} is not in scope here, so the fallback is what renders.`
        : `${missing.join(', ')} is not in scope here — the declaration is dropped and the property falls back to its inherited or initial value.`,
    };
  }
  return {
    prop,
    computed: computedValue,
    specified: spec,
    kind: 'tokenized',
    severity: 'ok',
    tokens: refs,
    nearest: null,
    variants: null,
    message: spec.viaShorthand ? `set via the \`${spec.viaShorthand}\` shorthand` : '',
  };
}

/** Which axes move any of these tokens, and how. */
function variantBreakdown(
  el: Element,
  tokens: string[],
  resolver: TokenResolver,
  literal: string,
): VariantBreakdown | null {
  for (const token of tokens) {
    for (const axis of resolver.axesFor(token)) {
      const resolved = resolver.acrossAxis(el, token, axis);
      if (new Set(resolved.values()).size < 2) continue;

      const active = activeVariant(el, axis);
      const values = axis.variants.map((variant) => {
        const value = resolved.get(variant.raw) ?? '';
        return {
          label: variant.label,
          raw: variant.raw,
          value,
          // A token the theme never declares for this variant is not evidence of
          // breakage — say "not set" rather than counting it as a wrong value.
          unset: value === '',
          wrong: value !== '' && value !== literal,
          active: variant.raw === active?.raw,
        };
      });
      const wrongIn = values.filter((v) => v.wrong).map((v) => v.label);
      if (!wrongIn.length) continue;
      return { axis: axis.name, values, active: active?.label ?? null, wrongIn };
    }
  }
  return null;
}

function analyseLength(
  prop: string,
  computedValue: string,
  spec: SpecifiedValue,
  index: TokenIndex,
  resolver: TokenResolver,
  el: Element,
  options: AnalyseOptions,
): Finding | null {
  const literal = spec.value.trim();
  if (!SINGLE_LENGTH.test(literal)) return null; // calc(), percentages, multi-value: out of scope

  // Prefer the browser's own resolution so rem/em land in the same space as tokens.
  let px = literal.endsWith('px') ? parseFloat(literal) : parseFloat(computedValue);
  if (!Number.isFinite(px)) px = parseFloat(literal);
  if (!Number.isFinite(px) || px === 0) return null;

  const key = Math.round(px * 1000) / 1000;
  const candidates = rankScored(prop, index.byLength.get(key) ?? []);
  const exact = isPlausible(candidates) ? candidates.map((c) => c.name) : [];

  if (candidates.length && !exact.length) {
    return {
      prop,
      computed: computedValue,
      specified: spec,
      kind: 'untokenized',
      severity: 'low',
      tokens: [],
      nearest: null,
      variants: null,
      message: `${literal} equals ${candidates.length} token${candidates.length > 1 ? 's' : ''} by value (${candidates[0]!.name}), none of them named for this property — most likely a coincidence.`,
    };
  }

  if (exact.length) {
    const value = fmtPx(px);
    const variants = variantBreakdown(el, exact, resolver, value);
    if (variants) {
      const correctIn = variants.active ?? 'the current variant';
      return {
        prop,
        computed: computedValue,
        specified: spec,
        kind: 'variant-locked',
        severity: 'high',
        tokens: exact,
        nearest: null,
        variants,
        message:
          `${literal} is ${exact[0]} at ${correctIn} only. ` +
          `This element is locked to one ${variants.axis} — it renders wrong at ${variants.wrongIn.join(', ')}.`,
      };
    }
    return {
      prop,
      computed: computedValue,
      specified: spec,
      kind: 'literal',
      severity: 'low',
      tokens: exact,
      nearest: null,
      variants: null,
      message: `${literal} is exactly ${exact[0]}. Same value today, but it will not follow the token.`,
    };
  }

  let nearest: { name: string; value: string; delta: number } | null = null;
  for (const [value, names] of index.byLength) {
    const delta = Math.abs(value - px);
    if (!nearest || delta < nearest.delta) {
      nearest = { name: rankTokens(prop, names)[0]!, value: fmtPx(value), delta };
    }
  }

  if (nearest && nearest.delta <= options.lengthTolerance) {
    return {
      prop,
      computed: computedValue,
      specified: spec,
      kind: 'off-scale',
      severity: 'medium',
      tokens: [],
      nearest: { ...nearest, unit: 'px' },
      variants: null,
      message: `${literal} is ${fmtPx(nearest.delta)} off ${nearest.name} (${nearest.value}). Off-scale by a hair — almost certainly meant to be the token.`,
    };
  }

  return {
    prop,
    computed: computedValue,
    specified: spec,
    kind: 'untokenized',
    severity: 'low',
    tokens: [],
    nearest: nearest ? { ...nearest, unit: 'px' } : null,
    variants: null,
    message: `${literal} matches no token in this context.`,
  };
}

function analyseColor(
  prop: string,
  computedValue: string,
  spec: SpecifiedValue,
  index: TokenIndex,
  resolver: TokenResolver,
  el: Element,
  options: AnalyseOptions,
): Finding | null {
  const lab = parseColor(spec.value) ?? parseColor(computedValue);
  if (!lab || lab.alpha === 0) return null;

  let nearest: { name: string; value: string; delta: number } | null = null;
  const matches: string[] = [];
  for (const candidate of index.colors) {
    const delta = colorDistance(lab, candidate.lab);
    if (delta < 0.001) matches.push(candidate.name);
    if (!nearest || delta < nearest.delta) {
      nearest = {
        name: candidate.name,
        value: index.tokens.get(candidate.name)?.value ?? '',
        delta,
      };
    }
  }

  const candidates = rankScored(prop, matches);
  const exact = isPlausible(candidates) ? candidates.map((c) => c.name) : [];

  if (candidates.length && !exact.length) {
    return {
      prop,
      computed: computedValue,
      specified: spec,
      kind: 'literal',
      severity: 'low',
      tokens: candidates.slice(0, 3).map((c) => c.name),
      nearest: null,
      variants: null,
      message: `${spec.value} is exactly ${candidates[0]!.name}, though no token here is named for this property.`,
    };
  }

  if (exact.length) {
    const variants = variantBreakdown(el, exact, resolver, computedValue);
    if (variants) {
      const correctIn = variants.active ?? 'the current variant';
      return {
        prop,
        computed: computedValue,
        specified: spec,
        kind: 'variant-locked',
        severity: 'high',
        tokens: exact,
        nearest: null,
        variants,
        message:
          `${spec.value} is ${exact[0]} at ${correctIn} only. ` +
          `That token changes with ${variants.axis} — hardcoding it breaks ${variants.wrongIn.join(', ')}.`,
      };
    }
    return {
      prop,
      computed: computedValue,
      specified: spec,
      kind: 'literal',
      severity: 'low',
      tokens: exact,
      nearest: null,
      variants: null,
      message: `${spec.value} is exactly ${exact[0]}.`,
    };
  }

  if (nearest && nearest.delta <= options.colorTolerance) {
    return {
      prop,
      computed: computedValue,
      specified: spec,
      kind: 'off-scale',
      severity: 'medium',
      tokens: [],
      nearest: { ...nearest, unit: 'ΔE' },
      variants: null,
      message: `${spec.value} is perceptually ${nearest.delta.toFixed(3)} from ${nearest.name} (${nearest.value}) — near enough that nobody will see the difference, far enough to dodge every theme.`,
    };
  }

  return {
    prop,
    computed: computedValue,
    specified: spec,
    kind: 'untokenized',
    severity: 'low',
    tokens: [],
    nearest: nearest ? { ...nearest, unit: 'ΔE' } : null,
    variants: null,
    message: `${spec.value} matches no colour token${nearest ? `; nearest is ${nearest.name} at ΔE ${nearest.delta.toFixed(3)}` : ''}.`,
  };
}
