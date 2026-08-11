/**
 * Token resolution, done by asking the browser instead of reimplementing CSS.
 *
 * The computed value of an unregistered custom property is the substituted token
 * stream — `calc(0.5 * 8px)`, not `4px`. Rather than write a calc evaluator and a
 * unit resolver, we hand the value back to the engine: a probe element declares
 * `letter-spacing: var(--token)` and we read the computed result. Anything the
 * browser can resolve, we can read, including nested var() chains, calc(),
 * relative units and colour functions.
 *
 * Probes live *inside* the element being inspected, so every token resolves in
 * that element's real cascade context — the right theme, the right density, the
 * right container.
 */

import { parseColor, type Lab } from './color.js';
import type { Collected } from './cssom.js';
import { AXIS_MIN_TOKENS } from '../shared/types.js';

/** Values no real token is likely to hold, used to detect "var() was invalid here". */
const LENGTH_SENTINEL = '-97.31px';
const COLOR_SENTINEL = 'rgb(1, 2, 3)';

export interface ResolvedToken {
  name: string;
  kind: 'length' | 'color' | 'other';
  /** Resolved literal, e.g. `4px` or `rgb(43, 43, 43)`. */
  value: string;
  px?: number;
  lab?: Lab;
}

export interface TokenIndex {
  tokens: Map<string, ResolvedToken>;
  /** Rounded px → token names holding that value in this context. */
  byLength: Map<number, string[]>;
  colors: { name: string; lab: Lab }[];
  signature: string;
}

/**
 * One value of a variant axis, as a selector fragment we can both match against
 * and re-create on a probe element.
 *
 * Libraries split about evenly between classes (`.dark`, `.salt-density-high`)
 * and attributes (`[data-mode=dark]`, `[data-theme=night]`), so we handle both.
 */
export interface Variant {
  /** The selector fragment, e.g. `.dark` or `[data-mode=dark]`. */
  raw: string;
  /**
   * `base` is the absence of the others — the `:root` declaration that `.dark`
   * overrides. Without it the commonest setup in the ecosystem (one root block
   * plus one `.dark` block) has only a single condition and reads as a modifier
   * rather than an axis.
   */
  kind: 'class' | 'attr' | 'base';
  /** Class name, or attribute name. */
  name: string;
  /** Attribute value, when the selector pinned one. */
  value: string | null;
  /** Short display label, e.g. `high` or `dark`. */
  label: string;
}

export interface Axis {
  /** Human label, e.g. `density` or `mode`. */
  name: string;
  /** Mutually exclusive variants. */
  variants: Variant[];
  /** Tokens whose value depends on this axis. */
  tokens: Set<string>;
}

/**
 * The next element up, stepping over shadow boundaries onto the host.
 *
 * `parentElement` returns null at the top of a shadow root, so a web component's
 * internals would never find the theme provider that wraps the component.
 */
export function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const parent = el.parentNode;
  return parent instanceof ShadowRoot ? parent.host : null;
}

export const BASE_VARIANT: Variant = {
  raw: ':root',
  kind: 'base',
  name: '',
  value: null,
  label: 'base',
};

export function applyVariant(el: HTMLElement, variant: Variant): void {
  if (variant.kind === 'base') return; // clearing the others *is* applying base
  if (variant.kind === 'class') el.classList.add(variant.name);
  else el.setAttribute(variant.name, variant.value ?? '');
}

export function clearVariant(el: HTMLElement, variant: Variant): void {
  if (variant.kind === 'base') return;
  if (variant.kind === 'class') el.classList.remove(variant.name);
  else el.removeAttribute(variant.name);
}

export function matchesVariant(el: Element, variant: Variant): boolean {
  if (variant.kind === 'base') return false;
  try {
    return el.matches(variant.raw);
  } catch {
    return false;
  }
}

/**
 * The variant of `axis` in force at `el`, found by walking up the tree. Falls
 * back to the axis's base variant, since "no `.dark` anywhere above me" is
 * itself an answer.
 */
export function activeVariant(el: Element, axis: Axis): Variant | null {
  for (let node: Element | null = el; node; node = parentOf(node)) {
    const hit = axis.variants.find((v) => matchesVariant(node!, v));
    if (hit) return hit;
  }
  return axis.variants.find((v) => v.kind === 'base') ?? null;
}

/**
 * A class in a selector, escape sequences included.
 *
 * Tailwind escapes the punctuation in its variant classes \u2014 `.md\:ms-4`,
 * `.hover\:bg-red-500`, `.w-1\/2` \u2014 and a pattern that stops at the backslash
 * reads those as classes called `md`, `hover` and `w-1`. Unrelated selectors then
 * look like the same condition, which is how a page using Tailwind grew an `md`
 * axis that does not exist anywhere in its stylesheet.
 */
const CLASS_IN_SELECTOR = /\.((?:\\.|[-_a-zA-Z\u00a0-\uffff])(?:\\.|[-\w\u00a0-\uffff])*)/g;

/**
 * `md\:ms-4` \u2192 `md:ms-4`.
 *
 * The escaped form is what a selector needs; the plain form is what `classList`
 * needs. Only single-character escapes are unwound, which is what CSS tooling
 * emits \u2014 a numeric escape like `\3a ` would survive as-is and simply fail to
 * match, rather than matching the wrong thing.
 */
const unescapeClass = (name: string) => name.replace(/\\(.)/g, '$1');
const ATTR_IN_SELECTOR = /\[\s*([-\w]+)\s*(?:([~^$*|]?=)\s*("[^"]*"|'[^']*'|[^\]\s]*))?\s*[iIsS]?\s*\]/g;

/** The class and attribute conditions a selector imposes, as reusable fragments. */
function conditionsIn(selector: string): Variant[] {
  const out: Variant[] = [];
  for (const m of selector.matchAll(CLASS_IN_SELECTOR)) {
    // `raw` keeps the escapes, because that is what `matches()` needs; `name` and
    // `label` drop them, because that is what `classList` and a human need.
    const plain = unescapeClass(m[1]!);
    out.push({ raw: `.${m[1]!}`, kind: 'class', name: plain, value: null, label: plain });
  }
  for (const m of selector.matchAll(ATTR_IN_SELECTOR)) {
    const name = m[1]!;
    const op = m[2];
    const rawValue = m[3];
    // Only equality pins a value we can reproduce; `[data-x]` alone is presence.
    const value = op === '=' && rawValue ? rawValue.replace(/^["']|["']$/g, '') : null;
    out.push({
      raw: value === null ? `[${name}]` : `[${name}="${value}"]`,
      kind: 'attr',
      name,
      value,
      label: value ?? name,
    });
  }
  return out;
}

/** Parse a user-supplied axis value: `dark`, `.dark` or `[data-mode=dark]`. */
export function parseVariant(raw: string): Variant {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const found = conditionsIn(trimmed)[0];
    if (found) return found;
  }
  const name = trimmed.replace(/^\./, '');
  return { raw: `.${name}`, kind: 'class', name, value: null, label: name };
}

/** Longest common prefix of the variant labels, used to name the axis. */
function axisLabel(variants: Variant[]): string {
  if (variants.length === 1) return variants[0]!.label;
  const attr = variants.find((v) => v.kind === 'attr');
  if (attr) return attr.name.replace(/^data-/, '');
  const first = variants[0]!.label;
  let prefix = first.length;
  for (const v of variants.slice(1)) {
    let i = 0;
    while (i < prefix && i < v.label.length && v.label[i] === first[i]) i++;
    prefix = i;
  }
  const common = first.slice(0, prefix).replace(/[-_]+$/, '');
  return common.length > 2 ? common.split(/[-_]/).pop()! : variants.map((v) => v.label).join('|');
}

/** Trim a shared prefix off each label so chips read `high` not `salt-density-high`. */
function shortenLabels(variants: Variant[]): Variant[] {
  if (variants.length < 2 || variants.some((v) => v.kind !== 'class')) return variants;
  const labels = variants.map((v) => v.label);
  let prefix = labels[0]!.length;
  for (const l of labels.slice(1)) {
    let i = 0;
    while (i < prefix && i < l.length && l[i] === labels[0]![i]) i++;
    prefix = i;
  }
  if (prefix < 3) return variants;
  return variants.map((v) => ({ ...v, label: v.label.slice(prefix).replace(/^[-_]+/, '') || v.label }));
}

/**
 * Find the variant axes in a document without being told what they are.
 *
 * A token declared once is constant. A token declared under several selectors
 * with different values varies — and the classes those selectors disagree on
 * *are* the axis. `--salt-spacing-100` declared under `.salt-theme.salt-density-high`
 * and `.salt-theme.salt-density-medium` yields the density axis; `--background`
 * declared under `:root` and `.dark` yields the dark-mode axis. No config, no
 * per-library adapters.
 */

export function discoverAxes(collected: Collected, minTokens = AXIS_MIN_TOKENS): Axis[] {
  const byClassSet = new Map<string, Axis>();

  for (const [token, rules] of collected.declarationsByToken) {
    if (rules.length < 2) continue;

    const values = new Set<string>();
    for (const rule of rules) {
      for (const decl of rule.declarations) {
        if (decl.prop === token) values.add(decl.value);
      }
    }
    if (values.size < 2) continue;

    // Conditions common to every declaring selector are context, not axis:
    // `.salt-theme` appears on all of them, `[data-mode=dark]` does not.
    const conditionSets = rules.map((r) => new Map(conditionsIn(r.selector).map((v) => [v.raw, v])));
    const shared = new Set(conditionSets[0]?.keys() ?? []);
    for (const set of conditionSets.slice(1)) {
      for (const raw of [...shared]) if (!set.has(raw)) shared.delete(raw);
    }
    const distinguishing = new Map<string, Variant>();
    let hasBase = false;
    for (const set of conditionSets) {
      let distinguishingHere = 0;
      for (const [raw, variant] of set) {
        if (shared.has(raw)) continue;
        distinguishing.set(raw, variant);
        distinguishingHere++;
      }
      // This rule is the unqualified one — `:root`, or `.salt-theme` alone.
      if (distinguishingHere === 0) hasBase = true;
    }
    if (distinguishing.size === 0) continue;
    if (distinguishing.size + (hasBase ? 1 : 0) < 2) continue; // a modifier, not an axis

    const variants = [...distinguishing.values()].sort((a, b) => a.raw.localeCompare(b.raw));
    if (hasBase) variants.unshift({ ...BASE_VARIANT });
    const key = variants.map((v) => v.raw).join('|');
    const existing = byClassSet.get(key);
    if (existing) existing.tokens.add(token);
    else {
      byClassSet.set(key, {
        name: axisLabel(variants),
        variants: shortenLabels(variants),
        tokens: new Set([token]),
      });
    }
  }

  const real = [...byClassSet.values()]
    .filter((a) => a.tokens.size >= minTokens)
    .sort((a, b) => b.tokens.size - a.tokens.size);

  return dedupeNames(mergeOverlapping(real));
}

/**
 * One axis often surfaces as several.
 *
 * Salt declares some tokens under all five density classes and others under
 * `.salt-density-mobile, .salt-density-touch` together, so the same conceptual
 * axis is discovered twice with different variant sets. Fold them back together.
 */
function mergeOverlapping(axes: Axis[]): Axis[] {
  const merged: Axis[] = [];

  for (const axis of axes) {
    const host = merged.find((candidate) => {
      const shared = axis.variants.filter((v) => candidate.variants.some((c) => c.raw === v.raw));
      if (!shared.length) return false;
      const subset = shared.length === Math.min(axis.variants.length, candidate.variants.length);
      const kin = family(axis) !== null && family(axis) === family(candidate);
      return subset || shared.length >= 2 || kin;
    });

    if (!host) {
      merged.push(axis);
      continue;
    }
    for (const v of axis.variants) {
      if (!host.variants.some((c) => c.raw === v.raw)) host.variants.push(v);
    }
    for (const t of axis.tokens) host.tokens.add(t);
  }

  for (const axis of merged) {
    axis.variants.sort((a, b) => a.label.localeCompare(b.label));
    // Name from the full class/attribute names — labels have already been
    // shortened, and `high|low|medium` is not a useful axis name.
    const named = axis.variants.filter((v) => v.kind !== 'base');
    axis.name = axisLabel(named.map((v) => ({ ...v, label: v.kind === 'class' ? v.name : v.label })));
  }
  return merged;
}

/**
 * A naming fingerprint for an axis: the shared prefix of its class names, or the
 * attribute they all test. Two axes sharing one variant *and* a family are the
 * same axis seen twice — `.salt-density-{high,medium,touch}` and
 * `.salt-density-{touch,mobile}` both belong to `salt-density-`.
 */
function family(axis: Axis): string | null {
  const named = axis.variants.filter((v) => v.kind !== 'base');
  if (!named.length) return null;

  if (named.every((v) => v.kind === 'attr')) {
    const names = new Set(named.map((v) => v.name));
    return names.size === 1 ? `attr:${[...names][0]}` : null;
  }
  if (!named.every((v) => v.kind === 'class')) return null;

  let prefix = named[0]!.name;
  for (const v of named.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < v.name.length && v.name[i] === prefix[i]) i++;
    prefix = prefix.slice(0, i);
  }
  // Trim back to a separator so `salt-density-h` cannot masquerade as a family.
  prefix = prefix.replace(/[^-_]*$/, '');
  return prefix.length >= 3 ? `class:${prefix}` : null;
}

function dedupeNames(axes: Axis[]): Axis[] {
  const seen = new Map<string, number>();
  for (const axis of axes) {
    const n = (seen.get(axis.name) ?? 0) + 1;
    seen.set(axis.name, n);
    if (n > 1) axis.name = `${axis.name}-${n}`;
  }
  return axes;
}

/** Selectors that declare a token, used to find which ancestor owns its value. */
export function declaringSelectors(collected: Collected, token: string): string[] {
  const rules = collected.declarationsByToken.get(token) ?? [];
  return rules.map((r) => r.selector);
}

/**
 * Every custom property in scope for an element, asked of the browser directly.
 *
 * Better than the names harvested from parsed rules in three ways: it sees
 * tokens declared in cross-origin sheets we are not allowed to read, it sees
 * tokens declared inside a shadow root, and it lists exactly what is in scope
 * *here* rather than everything declared anywhere in the document.
 *
 * Engines that do not enumerate custom properties fall back to the parsed names.
 */
export function tokenNamesInScope(el: Element, fallback: string[]): string[] {
  const cs = getComputedStyle(el);
  const names: string[] = [];
  for (let i = 0; i < cs.length; i++) {
    const prop = cs.item(i);
    if (prop.startsWith('--')) names.push(prop);
  }
  return names.length ? names : fallback;
}

interface ProbeHost {
  host: HTMLElement;
  spans: HTMLElement[];
  dispose(): void;
}

/**
 * Styles that keep an injected node from disturbing the page.
 *
 * `position: absolute` is the load-bearing one: an absolutely positioned child is
 * neither a flex item nor a grid item, so it adds no gap, no track and no
 * reordering to the container we are borrowing.
 */
const OUT_OF_FLOW = [
  'position:absolute',
  'left:-9999px',
  'top:0',
  'width:0',
  'height:0',
  'margin:0',
  'padding:0',
  'border:0',
  'overflow:hidden',
  'visibility:hidden',
  'pointer-events:none',
  'contain:strict',
];

function makeProbeHost(parent: Element, tokenNames: string[]): ProbeHost {
  const host = document.createElement('div');
  host.setAttribute('data-xray', 'probe');
  // Invisible and out of flow, but still inheriting — font-size has to come
  // through for `em`-based tokens to resolve as they would on the real element.
  host.style.cssText = [
    ...OUT_OF_FLOW,
    `letter-spacing:${LENGTH_SENTINEL}`,
    `color:${COLOR_SENTINEL}`,
  ].join(';');

  const spans: HTMLElement[] = [];
  const frag = document.createDocumentFragment();
  for (const name of tokenNames) {
    const span = document.createElement('span');
    span.style.setProperty('letter-spacing', `var(${name})`);
    span.style.setProperty('color', `var(${name})`);
    spans.push(span);
    frag.appendChild(span);
  }
  host.appendChild(frag);
  parent.appendChild(host);

  return {
    host,
    spans,
    dispose() {
      host.remove();
    },
  };
}

function readProbe(span: HTMLElement, name: string): ResolvedToken {
  const cs = getComputedStyle(span);
  const spacing = cs.letterSpacing;
  const color = cs.color;

  if (spacing && spacing !== 'normal' && spacing !== LENGTH_SENTINEL) {
    const px = parseFloat(spacing);
    if (Number.isFinite(px)) return { name, kind: 'length', value: `${round(px)}px`, px };
  }
  if (color && color !== COLOR_SENTINEL) {
    const lab = parseColor(color);
    if (lab) return { name, kind: 'color', value: color, lab };
  }
  return { name, kind: 'other', value: '' };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export class TokenResolver {
  private cache = new Map<string, TokenIndex>();
  private overridable: string[] | null = null;
  /**
   * Memo for `acrossAxis`, keyed by scope as well as token and axis.
   *
   * Every finding now probes its named token under every variant, and a sweep
   * analyses many elements that share one scope, so the same question is asked
   * repeatedly. Keyed on the same signature as the index, which is what makes it
   * safe: a local override changes the signature, so a scope with an override
   * cannot read another scope's answer.
   */
  private variants = new Map<string, Map<string, string>>();
  /**
   * Signatures are read from live computed style, so they are not free — and with
   * the override-sensitive tokens folded in, computing one costs more than the probe
   * a memo lookup saves. Caching per element made the memo worth having instead of a
   * pessimisation. Replaced wholesale on `invalidate`, since a WeakMap cannot be
   * cleared and a stale signature would hand back another scope's answer.
   */
  private signatures = new WeakMap<Element, string>();

  constructor(
    private collected: Collected,
    readonly axes: Axis[],
  ) {}

  /**
   * Tokens whose value can differ between two elements in this document.
   *
   * A token declared only by rules that apply to the whole document — `:root`,
   * `html`, `html.dark` — has one value everywhere, so it cannot tell two contexts
   * apart. One declared anywhere else can: the component-level override hook that
   * every design system ships (`.my-card { --spacing-100: 20px }`) is exactly this.
   *
   * Computed once, and usually tiny. It exists to keep the signature below cheap:
   * fingerprinting *every* token would mean hundreds of reads per element, and
   * fingerprinting none is the bug this replaces.
   */
  private overridableTokens(): string[] {
    if (this.overridable) return this.overridable;
    const root = document.documentElement;
    const out: string[] = [];
    for (const [token, rules] of this.collected.declarationsByToken) {
      const local = rules.some((rule) => {
        // A rule we could not evaluate might apply here and not there, so treat it
        // as local rather than assume it is harmless.
        if (rule.conditional) return true;
        try {
          return !root.matches(rule.selector);
        } catch {
          return true;
        }
      });
      if (local) out.push(token);
    }
    this.overridable = out;
    return out;
  }

  /**
   * A cheap fingerprint of "which theme context is this element in", used to
   * reuse an index across the (usually many) elements that share one.
   *
   * The token values matter, not just the token names. `count` was meant to catch
   * a subtree that declares its own tokens, and it does — but an override *replaces*
   * a value without changing the count, so a locally overridden token produced a
   * signature identical to the theme's and reused the theme's index. On the
   * playground that made `padding: 20px` inside `.override` report as
   * `--salt-spacing-250` — the token that happens to hold 20px at the root — and
   * then claim the element "renders wrong at high, low, mobile, touch", when the
   * override pins it to 20px at every density. A false positive at high severity,
   * in the verdict this tool exists to produce.
   *
   * `getPropertyValue` is used rather than a probe: custom properties inherit and
   * can be read straight off the element, so this costs a string read each and needs
   * no DOM insertion.
   */
  private signature(el: Element): string {
    const cached = this.signatures.get(el);
    if (cached !== undefined) return cached;
    const computed = this.computeSignature(el);
    this.signatures.set(el, computed);
    return computed;
  }

  private computeSignature(el: Element): string {
    const parts: string[] = [];
    for (const axis of this.axes) {
      parts.push(`${axis.name}=${activeVariant(el, axis)?.raw ?? '-'}`);
    }
    const cs = getComputedStyle(el);
    parts.push(`fs=${cs.fontSize}`, `cs=${cs.colorScheme}`, `count=${cs.length}`);
    for (const token of this.overridableTokens()) {
      parts.push(`${token}=${cs.getPropertyValue(token)}`);
    }
    return parts.join(';');
  }

  /** Resolve every token in the document, in this element's context. */
  index(el: Element): TokenIndex {
    const signature = this.signature(el);
    const hit = this.cache.get(signature);
    if (hit) return hit;

    const names = tokenNamesInScope(el, this.collected.tokenNames);
    // Inside the element, never beside it. A sibling changes `el`'s own
    // :nth-child/:last-child matching, which would corrupt the values we are
    // about to read off it. A child only affects `el`'s descendants, which we
    // never measure.
    const probe = makeProbeHost(el, names);
    const tokens = new Map<string, ResolvedToken>();
    const byLength = new Map<number, string[]>();
    const colors: { name: string; lab: Lab }[] = [];

    try {
      for (let i = 0; i < names.length; i++) {
        const name = names[i]!;
        const resolved = readProbe(probe.spans[i]!, name);
        tokens.set(name, resolved);
        if (resolved.kind === 'length' && resolved.px !== undefined) {
          const key = round(resolved.px);
          const bucket = byLength.get(key);
          if (bucket) bucket.push(name);
          else byLength.set(key, [name]);
        } else if (resolved.kind === 'color' && resolved.lab) {
          colors.push({ name, lab: resolved.lab });
        }
      }
    } finally {
      probe.dispose();
    }

    const index: TokenIndex = { tokens, byLength, colors, signature };
    this.cache.set(signature, index);
    return index;
  }

  /** What `token` resolves to at `el`, read through a probe in `el`'s own scope. */
  private readInScope(el: Element, token: string): string {
    const probe = makeProbeHost(el, [token]);
    try {
      return readProbe(probe.spans[0]!, token).value;
    } finally {
      probe.dispose();
    }
  }

  /**
   * Is `token` re-declared somewhere between `owner` and `el`?
   *
   * Custom properties inherit, so comparing the computed value at each end answers
   * this without touching the DOM or walking a single rule.
   */
  private overriddenBelow(el: Element, owner: Element, token: string): boolean {
    return getComputedStyle(el).getPropertyValue(token) !== getComputedStyle(owner).getPropertyValue(token);
  }

  /**
   * Probe every variant but the current one by swapping the class on the owner.
   *
   * Synchronously, so no frame is ever painted in the wrong variant, and in a
   * `finally` so a throw cannot leave the page stuck in it.
   */
  private swapAcross(
    el: Element,
    owner: HTMLElement,
    current: Variant,
    axis: Axis,
    token: string,
    out: Map<string, string>,
  ): void {
    for (const variant of axis.variants) {
      if (variant.raw === current.raw) continue;
      clearVariant(owner, current);
      applyVariant(owner, variant);
      try {
        out.set(variant.raw, this.readInScope(el, token));
      } finally {
        clearVariant(owner, variant);
        applyVariant(owner, current);
      }
    }
  }

  /**
   * What this token resolves to under every value of an axis.
   *
   * Works by re-declaring the axis class on a nested probe host — the same
   * mechanism a nested density provider uses — and falls back to briefly
   * swapping the class on the owning ancestor when the tokens are declared with
   * a selector a nested element cannot match (`html.dark`, say).
   */
  acrossAxis(el: Element, token: string, axis: Axis): Map<string, string> {
    const key = `${this.signature(el)}|${token}|${axis.name}`;
    const memo = this.variants.get(key);
    if (memo) return memo;

    const out = new Map<string, string>();
    const owner = this.axisOwner(el, axis);
    const current = owner ? activeVariant(owner, axis) : null;
    this.variants.set(key, out);

    // A local override between this element and wherever the axis is declared rules
    // the nested probe out entirely: the wrapper below sits *inside* the element, so
    // whatever variant it carries re-declares the token underneath the override and
    // silently discards it. The variant has to be applied at or above the overriding
    // scope for the override to survive, which means swapping on an ancestor.
    //
    // `documentElement` when there is no owner, because a page sitting at the base
    // variant has nothing carrying the axis and still needs its other variants
    // probed. Getting this wrong is what made `padding: 20px` inside
    // `.override { --space-100: 20px }` report as locked to one density and "wrong at
    // compact, cosy", when the override pins it to 20px at every density and the
    // element renders correctly everywhere.
    const target = owner ?? document.documentElement;
    const here = current ?? activeVariant(target, axis);
    if (here && this.overriddenBelow(el, target, token)) {
      out.set(here.raw, this.readInScope(el, token));
      this.swapAcross(el, target, here, axis, token, out);
      return out;
    }

    // Inside the element, not inside the theme provider: a component that
    // overrides a token locally (`--saltButton-height`, `--salt-spacing-100` on a
    // wrapper) must have that override reflected in every variant we report.
    const parent = el;

    for (const variant of axis.variants) {
      // A nested element re-declaring the axis gets the axis's values, which is
      // exactly how a nested density or theme provider works.
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-xray', 'probe');
      if (owner) {
        wrapper.className = owner.className;
        for (const attr of Array.from(owner.attributes)) {
          if (attr.name !== 'class' && attr.name !== 'id' && attr.name !== 'style') {
            wrapper.setAttribute(attr.name, attr.value);
          }
        }
      }
      wrapper.style.cssText = OUT_OF_FLOW.join(';');
      for (const other of axis.variants) clearVariant(wrapper, other);
      applyVariant(wrapper, variant);

      parent.appendChild(wrapper);
      try {
        const probe = makeProbeHost(wrapper, [token]);
        try {
          out.set(variant.raw, readProbe(probe.spans[0]!, token).value);
        } finally {
          probe.dispose();
        }
      } finally {
        wrapper.remove();
      }
    }

    if (new Set(out.values()).size > 1 || !owner || !current) return out;

    // Re-declaring on a nested element did not move the value, so the token must
    // be declared against a selector only the ancestor can match (`html.dark`).
    this.swapAcross(el, owner, current, axis, token, out);
    return out;
  }

  /** The nearest ancestor that carries one of an axis's variants. */
  axisOwner(el: Element, axis: Axis): HTMLElement | null {
    for (let node: Element | null = el; node; node = parentOf(node)) {
      if (axis.variants.some((v) => matchesVariant(node!, v))) return node as HTMLElement;
    }
    return null;
  }

  /** Switch an axis in the live page so the consequence is visible, not described. */
  flip(el: Element, axis: Axis, variant: Variant): boolean {
    const owner = this.axisOwner(el, axis);
    if (!owner) return false;
    for (const other of axis.variants) clearVariant(owner, other);
    applyVariant(owner, variant);
    this.invalidate();
    return true;
  }

  invalidate(): void {
    this.cache.clear();
    this.variants.clear();
    this.signatures = new WeakMap();
  }
}
