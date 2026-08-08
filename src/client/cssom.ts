/**
 * A working model of the cascade.
 *
 * `getComputedStyle` tells you an element's padding is `8px`. It cannot tell you
 * whether the author wrote `8px` or `var(--spacing-100)` — and that distinction is
 * the entire point of this tool. So we collect every style rule in the document,
 * match them against the element ourselves, and recover the *specified* value.
 */

export interface Declaration {
  prop: string;
  /** Raw authored text, e.g. `var(--salt-spacing-100)` or `8px`. */
  value: string;
  important: boolean;
}

export interface CollectedRule {
  /** One compound selector from the rule's selector list. */
  selector: string;
  specificity: Specificity;
  /** Document order; later wins ties. */
  order: number;
  /** Layer precedence: unlayered is Infinity, otherwise index in layer order. */
  layer: number;
  /** True when the rule sits inside a condition we could not evaluate (e.g. a container query). */
  conditional: boolean;
  declarations: Declaration[];
  /**
   * The live declaration block. Kept because enumeration yields whatever the
   * author wrote — `padding` if they used the shorthand — while we usually need
   * to ask about a longhand.
   */
  style: CSSStyleDeclaration;
  sheetHref: string | null;
}

export type Specificity = [number, number, number];

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Split a selector list on top-level commas only. */
export function splitSelectorList(selectorText: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i]!;
    if (quote) {
      if (ch === quote && selectorText[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(selectorText.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = selectorText.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/** Characters that can appear in a CSS identifier (incl. escapes and non-ASCII). */
const IDENT_CHAR = /[-\w\u00a0-\uffff\\]/;

const ZERO_SPECIFICITY_PSEUDOS = new Set(['where']);
const MAX_OF_INNER_PSEUDOS = new Set(['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any']);

/**
 * Selectors Level 4 specificity. Handles :is()/:not()/:has() (max of the inner
 * list) and :where() (zero), which Tailwind v4 and most modern resets rely on.
 */
export function specificity(selector: string): Specificity {
  let a = 0;
  let b = 0;
  let c = 0;
  let i = 0;
  const s = selector;

  const readBalanced = (from: number): [string, number] => {
    let depth = 0;
    let j = from;
    for (; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')') {
        depth--;
        if (depth === 0) return [s.slice(from + 1, j), j + 1];
      }
    }
    return [s.slice(from + 1), s.length];
  };

  const readIdent = (from: number): [string, number] => {
    let j = from;
    while (j < s.length && IDENT_CHAR.test(s[j]!)) j++;
    return [s.slice(from, j), j];
  };

  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '#') {
      const [, next] = readIdent(i + 1);
      a++;
      i = next;
    } else if (ch === '.') {
      const [, next] = readIdent(i + 1);
      b++;
      i = next;
    } else if (ch === '[') {
      let depth = 0;
      let j = i;
      for (; j < s.length; j++) {
        if (s[j] === '[') depth++;
        else if (s[j] === ']') {
          depth--;
          if (depth === 0) break;
        }
      }
      b++;
      i = j + 1;
    } else if (ch === ':') {
      const doubled = s[i + 1] === ':';
      const [name, afterName] = readIdent(i + (doubled ? 2 : 1));
      let next = afterName;
      let inner: string | null = null;
      if (s[next] === '(') {
        const [content, afterParen] = readBalanced(next);
        inner = content;
        next = afterParen;
      }
      const lower = name.toLowerCase();
      if (doubled) {
        c++;
      } else if (ZERO_SPECIFICITY_PSEUDOS.has(lower)) {
        // contributes nothing
      } else if (inner !== null && MAX_OF_INNER_PSEUDOS.has(lower)) {
        let best: Specificity = [0, 0, 0];
        for (const part of splitSelectorList(inner)) {
          const sp = specificity(part);
          if (compareSpecificity(sp, best) > 0) best = sp;
        }
        a += best[0];
        b += best[1];
        c += best[2];
      } else if (inner !== null && (lower === 'nth-child' || lower === 'nth-last-child')) {
        // `:nth-child(n of S)` adds the max of S on top of the pseudo-class itself.
        b++;
        const ofIndex = inner.toLowerCase().indexOf(' of ');
        if (ofIndex !== -1) {
          let best: Specificity = [0, 0, 0];
          for (const part of splitSelectorList(inner.slice(ofIndex + 4))) {
            const sp = specificity(part);
            if (compareSpecificity(sp, best) > 0) best = sp;
          }
          a += best[0];
          b += best[1];
          c += best[2];
        }
      } else {
        b++;
      }
      i = next;
    } else if (IDENT_CHAR.test(ch)) {
      const [name, next] = readIdent(i);
      if (name !== '*') c++;
      i = next;
    } else {
      i++;
    }
  }
  return [a, b, c];
}

function declarationsOf(style: CSSStyleDeclaration): Declaration[] {
  const out: Declaration[] = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i);
    if (!prop) continue;
    out.push({
      prop,
      value: style.getPropertyValue(prop).trim(),
      important: style.getPropertyPriority(prop) === 'important',
    });
  }
  return out;
}

/**
 * Rules bucketed by the key of their rightmost compound selector, the way a real
 * engine does it.
 *
 * Without this, matching one element means calling `el.matches()` once per rule
 * in the document — fine for a hand-written sheet, ruinous for a Tailwind dev
 * build with tens of thousands of utility rules.
 */
export interface RuleBuckets {
  byId: Map<string, CollectedRule[]>;
  byClass: Map<string, CollectedRule[]>;
  byTag: Map<string, CollectedRule[]>;
  /** Rules whose key we could not determine; always candidates. */
  unkeyed: CollectedRule[];
}

export interface Collected {
  rules: CollectedRule[];
  buckets: RuleBuckets;
  /** Every custom property name declared anywhere in the document. */
  tokenNames: string[];
  /** Where each token is declared, keyed by name. */
  declarationsByToken: Map<string, CollectedRule[]>;
  /** Sheets we could not read (cross-origin). */
  skippedSheets: string[];
}

/**
 * Walk every readable stylesheet and flatten it into an ordered rule list.
 *
 * Conditional groups are unwrapped: media and supports conditions are evaluated
 * now, container queries are kept but flagged, since we cannot evaluate them
 * without knowing the element in advance.
 *
 * Accepts a shadow root as well as the document — a shadow root scopes its own
 * selectors, so an element inside one must be matched against its rules, not the
 * document's.
 */
export function collectRules(root: Document | ShadowRoot = document): Collected {
  const rules: CollectedRule[] = [];
  const skippedSheets: string[] = [];
  const layerOrder: string[] = [];
  let order = 0;

  const layerRank = (name: string | null): number => {
    if (name === null) return Infinity;
    const idx = layerOrder.indexOf(name);
    if (idx === -1) {
      layerOrder.push(name);
      return layerOrder.length - 1;
    }
    return idx;
  };

  const walk = (list: CSSRuleList, layer: string | null, conditional: boolean, href: string | null) => {
    for (let i = 0; i < list.length; i++) {
      const rule = list[i]!;
      const type = rule.constructor?.name ?? '';

      if (type === 'CSSStyleRule' || rule instanceof CSSStyleRule) {
        const styleRule = rule as CSSStyleRule;
        const decls = declarationsOf(styleRule.style);
        if (decls.length) {
          for (const selector of splitSelectorList(styleRule.selectorText)) {
            rules.push({
              selector,
              specificity: specificity(selector),
              order: order++,
              layer: layerRank(layer),
              conditional,
              declarations: decls,
              style: styleRule.style,
              sheetHref: href,
            });
          }
        }
        // Nested rules (CSS nesting, used heavily by Tailwind v4).
        const nested = (styleRule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
        if (nested?.length) walk(nested, layer, true, href);
        continue;
      }

      if (type === 'CSSMediaRule') {
        const media = (rule as CSSMediaRule).media.mediaText;
        let matches = true;
        try {
          matches = window.matchMedia(media).matches;
        } catch {
          matches = true;
        }
        if (matches) walk((rule as CSSMediaRule).cssRules, layer, conditional, href);
        continue;
      }

      if (type === 'CSSSupportsRule') {
        const cond = (rule as CSSSupportsRule).conditionText;
        let ok = true;
        try {
          ok = CSS.supports(cond);
        } catch {
          ok = true;
        }
        if (ok) walk((rule as CSSSupportsRule).cssRules, layer, conditional, href);
        continue;
      }

      if (type === 'CSSLayerBlockRule') {
        const name = (rule as CSSLayerBlockRule).name || null;
        const full = name ? (layer ? `${layer}.${name}` : name) : layer;
        layerRank(full);
        walk((rule as CSSLayerBlockRule).cssRules, full, conditional, href);
        continue;
      }

      if (type === 'CSSLayerStatementRule') {
        for (const name of (rule as CSSLayerStatementRule).nameList) {
          layerRank(layer ? `${layer}.${name}` : name);
        }
        continue;
      }

      if (type === 'CSSContainerRule') {
        walk((rule as unknown as { cssRules: CSSRuleList }).cssRules, layer, true, href);
        continue;
      }

      if (type === 'CSSImportRule') {
        const sheet = (rule as CSSImportRule).styleSheet;
        if (sheet) readSheet(sheet, layer);
        continue;
      }

      // Scope, starting-style, font-face, keyframes: nothing we can use.
      const kids = (rule as unknown as { cssRules?: CSSRuleList }).cssRules;
      if (kids?.length && type !== 'CSSKeyframesRule') walk(kids, layer, true, href);
    }
  };

  const readSheet = (sheet: CSSStyleSheet, layer: string | null = null) => {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      skippedSheets.push(sheet.href ?? '(inline)');
      return;
    }
    walk(list, layer, false, sheet.href);
  };

  for (const sheet of Array.from(root.styleSheets)) readSheet(sheet as CSSStyleSheet);
  for (const sheet of Array.from(root.adoptedStyleSheets ?? [])) readSheet(sheet);

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
    skippedSheets,
  };
}

/** The rightmost compound selector — the part that has to match the element itself. */
export function rightmostCompound(selector: string): string {
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (quote) {
      if (ch === quote && selector[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) start = i + 1;
  }
  return selector.slice(start).trim();
}

export function bucketRules(rules: CollectedRule[]): RuleBuckets {
  const buckets: RuleBuckets = {
    byId: new Map(),
    byClass: new Map(),
    byTag: new Map(),
    unkeyed: [],
  };

  const push = (map: Map<string, CollectedRule[]>, key: string, rule: CollectedRule) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(rule);
    else map.set(key, [rule]);
  };

  for (const rule of rules) {
    const compound = rightmostCompound(rule.selector);
    const id = compound.match(/#([-\w\u00a0-\uffff\\]+)/);
    if (id) {
      push(buckets.byId, id[1]!, rule);
      continue;
    }
    const cls = compound.match(/\.([-\w\u00a0-\uffff\\]+)/);
    if (cls) {
      push(buckets.byClass, cls[1]!, rule);
      continue;
    }
    const tag = compound.match(/^([a-zA-Z][-\w]*)/);
    if (tag) {
      push(buckets.byTag, tag[1]!.toLowerCase(), rule);
      continue;
    }
    buckets.unkeyed.push(rule);
  }

  return buckets;
}

export interface SpecifiedValue {
  value: string;
  important: boolean;
  origin: 'inline' | 'rule';
  selector: string | null;
  sheetHref: string | null;
  conditional: boolean;
  /** Set when the value came from a shorthand we could not safely split, e.g. `padding: 0 var(--x)`. */
  viaShorthand: string | null;
}

/**
 * Shorthands we fall back to when a longhand lookup comes up empty.
 *
 * `padding: 0 var(--gap)` cannot be split by the CSSOM — var() substitution
 * happens after parsing, so the longhands hold a "pending substitution" and read
 * back as empty. Rather than guess which side got the var, we report the
 * shorthand and stop; a false silence beats a false finding.
 */
const SHORTHANDS: Record<string, string[]> = {
  'padding-top': ['padding'],
  'padding-right': ['padding'],
  'padding-bottom': ['padding'],
  'padding-left': ['padding'],
  'margin-top': ['margin'],
  'margin-right': ['margin'],
  'margin-bottom': ['margin'],
  'margin-left': ['margin'],
  'row-gap': ['gap'],
  'column-gap': ['gap'],
  'border-top-width': ['border-width', 'border-top', 'border'],
  'border-right-width': ['border-width', 'border-right', 'border'],
  'border-bottom-width': ['border-width', 'border-bottom', 'border'],
  'border-left-width': ['border-width', 'border-left', 'border'],
  'border-top-color': ['border-color', 'border-top', 'border'],
  'border-right-color': ['border-color', 'border-right', 'border'],
  'border-bottom-color': ['border-color', 'border-bottom', 'border'],
  'border-left-color': ['border-color', 'border-left', 'border'],
  'border-top-left-radius': ['border-radius'],
  'border-top-right-radius': ['border-radius'],
  'border-bottom-right-radius': ['border-radius'],
  'border-bottom-left-radius': ['border-radius'],
  'font-size': ['font'],
  'line-height': ['font'],
  top: ['inset'],
  right: ['inset'],
  bottom: ['inset'],
  left: ['inset'],
};

/** Every rule matching an element, in document order. Compute once per element. */
export function matchedRules(el: Element, collected: Collected): CollectedRule[] {
  const { buckets } = collected;
  const candidates: CollectedRule[] = [...buckets.unkeyed];

  const byTag = buckets.byTag.get(el.tagName.toLowerCase());
  if (byTag) candidates.push(...byTag);
  if (el.id) {
    const byId = buckets.byId.get(el.id);
    if (byId) candidates.push(...byId);
  }
  for (const cls of el.classList) {
    const byClass = buckets.byClass.get(cls);
    if (byClass) candidates.push(...byClass);
  }

  const out: CollectedRule[] = [];
  for (const rule of candidates) {
    try {
      if (el.matches(rule.selector)) out.push(rule);
    } catch {
      /* a selector this engine cannot evaluate (`::part`, a pseudo-element) */
    }
  }
  // Buckets are visited out of order; the cascade needs document order back.
  return out.sort((a, b) => a.order - b.order);
}

/**
 * Recover the winning *authored* value for a property on an element.
 *
 * Precedence: importance, then origin (inline beats rules), then layer
 * (unlayered beats layered), then specificity, then document order.
 */
export function specifiedValue(
  el: Element,
  prop: string,
  collected: Collected,
  matched?: CollectedRule[],
): SpecifiedValue | null {
  let best: SpecifiedValue | null = null;
  let bestKey: [number, number, number, Specificity, number] | null = null;

  const consider = (
    value: string,
    important: boolean,
    origin: 'inline' | 'rule',
    layer: number,
    spec: Specificity,
    ord: number,
    selector: string | null,
    sheetHref: string | null,
    conditional: boolean,
    viaShorthand: string | null,
  ) => {
    // Higher is better in every slot. Layers invert under !important, which we
    // ignore here — it is vanishingly rare in token-driven CSS.
    const key: [number, number, number, Specificity, number] = [
      important ? 1 : 0,
      origin === 'inline' ? 1 : 0,
      layer === Infinity ? Number.MAX_SAFE_INTEGER : layer,
      spec,
      ord,
    ];
    if (
      bestKey === null ||
      key[0] - bestKey[0] > 0 ||
      (key[0] === bestKey[0] &&
        (key[1] - bestKey[1] > 0 ||
          (key[1] === bestKey[1] &&
            (key[2] - bestKey[2] > 0 ||
              (key[2] === bestKey[2] &&
                (compareSpecificity(key[3], bestKey[3]) > 0 ||
                  (compareSpecificity(key[3], bestKey[3]) === 0 && key[4] > bestKey[4])))))))
    ) {
      bestKey = key;
      best = { value, important, origin, selector, sheetHref, conditional, viaShorthand };
    }
  };

  /** Read `prop` from a declaration block, falling back to a containing shorthand. */
  const lookup = (style: CSSStyleDeclaration): [string, boolean, string | null] | null => {
    const direct = style.getPropertyValue(prop);
    if (direct) return [direct.trim(), style.getPropertyPriority(prop) === 'important', null];
    for (const shorthand of SHORTHANDS[prop] ?? []) {
      const v = style.getPropertyValue(shorthand);
      if (v && v.includes('var(')) {
        return [v.trim(), style.getPropertyPriority(shorthand) === 'important', shorthand];
      }
    }
    return null;
  };

  const inline = (el as HTMLElement).style;
  if (inline) {
    const found = lookup(inline);
    if (found) {
      consider(found[0], found[1], 'inline', Infinity, [1, 0, 0], Number.MAX_SAFE_INTEGER, null, null, false, found[2]);
    }
  }

  for (const rule of matched ?? matchedRules(el, collected)) {
    const found = lookup(rule.style);
    if (!found) continue;
    consider(
      found[0],
      found[1],
      'rule',
      rule.layer,
      rule.specificity,
      rule.order,
      rule.selector,
      rule.sheetHref,
      rule.conditional,
      found[2],
    );
  }

  return best;
}
