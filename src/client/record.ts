/**
 * Sweep a whole page instead of one element.
 *
 * The overlay is for the element under your cursor. This is the same analysis
 * pointed at everything, aggregated by the source location that produced it, so
 * the output is a work list per file rather than a pile of DOM nodes.
 *
 * Two things make that affordable. Token resolution is already cached per theme
 * context, so the thousandth element in the same theme costs a `getComputedStyle`
 * rather than a full probe pass. And elements are sampled per source location:
 * the fiftieth row of a list is the same JSX line as the first and cannot tell
 * you anything new, so a handful of each is enough.
 */

import type { Recording, RecordedFinding } from '../shared/recording.js';
import { RECORDING_VERSION } from '../shared/recording.js';
import { atLeast, severityRank, type Severity } from '../shared/types.js';
import { analyseElement, type Finding } from './analyse.js';
import type { Collected } from './cssom.js';
import { activeVariant, parentOf, type TokenResolver } from './tokens.js';

export interface RecordOptions {
  /** Where to start. Default `document.body`. */
  root?: Element;
  /** Elements to analyse per source location. Default 3. */
  perSource?: number;
  /** Hard cap, so a pathological page cannot hang the tab. Default 2000. */
  maxElements?: number;
  /** Lowest severity to keep. Default `low`, which is everything but `ok`. */
  minSeverity?: Severity;
}

/** Nodes that never render a box worth analysing. */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'TITLE',
  'HEAD',
  'BASE',
  'TEMPLATE',
  'NOSCRIPT',
  'BR',
  'WBR',
  'PARAM',
  'SOURCE',
  'TRACK',
]);

/**
 * Every element under `root`, descending into shadow roots.
 *
 * Anything xray injected is skipped along with its subtree — probe hosts are
 * transient, but the overlay is not, and inspecting our own panel produces
 * findings about our own hardcoded styling.
 */
function walk(root: Element, out: Element[], cap: number): boolean {
  const queue: Element[] = [root];
  while (queue.length) {
    const el = queue.shift()!;
    if (el.hasAttribute('data-xray')) continue;
    if (!SKIP_TAGS.has(el.tagName)) {
      if (out.length >= cap) return true;
      out.push(el);
    }
    for (const child of Array.from(el.children)) queue.push(child);
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (shadow) for (const child of Array.from(shadow.children)) queue.push(child);
  }
  return false;
}

interface Attribution {
  file: string | null;
  line: number | null;
  column: number | null;
  exact: boolean;
  /** The grouping key: source location, or a shape fingerprint when there is none. */
  key: string;
}

/**
 * Where a finding on this element should be reported.
 *
 * `data-xray-src` only lands on elements written in your own JSX, so a design
 * system's internal nodes have none. Walking up to the nearest stamped ancestor
 * points at the line you can actually change — where you used the component —
 * and `exact` records that the finding is really about something inside it.
 *
 * Elements with no stamped ancestor at all still get grouped, by tag and class,
 * so a page with no source attribution degrades to a useful report rather than
 * to one bucket of everything.
 */
function attribute(el: Element): Attribution {
  let exact = true;
  // `parentOf` rather than `parentElement`: a node inside a shadow root has no
  // parent element, and its stamped ancestor is on the other side of the host.
  for (let node: Element | null = el; node; node = parentOf(node)) {
    const src = node.getAttribute('data-xray-src');
    if (src) {
      // `file:line:col`, but a Windows path can carry a drive colon, so split
      // from the right.
      const parts = src.split(':');
      const column = Number(parts.pop());
      const line = Number(parts.pop());
      const file = parts.join(':');
      return {
        file: file || src,
        line: Number.isFinite(line) ? line : null,
        column: Number.isFinite(column) ? column : null,
        exact,
        key: src,
      };
    }
    exact = false;
  }
  const shape = `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].sort().join('.')}` : ''}`;
  return { file: null, line: null, column: null, exact: true, key: `shape:${shape}` };
}

function describe(el: Element): string {
  const classes = [...el.classList].slice(0, 2);
  return `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join('')}`;
}

/** Collapse a live finding into the flat, serialisable shape a baseline stores. */
function flatten(finding: Finding, where: Attribution, example: string): RecordedFinding {
  return {
    file: where.file,
    line: where.line,
    column: where.column,
    exact: where.exact,
    prop: finding.prop,
    kind: finding.kind,
    severity: finding.severity,
    computed: finding.computed,
    authored: finding.specified?.value ?? null,
    // Only an exact match counts as "the token this is". A near miss travels in
    // `nearest`, where it cannot be read as an identity.
    token: finding.tokens[0] ?? null,
    nearest: finding.nearest
      ? { name: finding.nearest.name, delta: finding.nearest.delta, unit: finding.nearest.unit }
      : null,
    axis: finding.variants?.axis ?? null,
    wrongIn: finding.variants?.wrongIn ?? [],
    message: finding.message,
    elements: 1,
    example,
  };
}

export interface RecordDeps {
  resolver: TokenResolver;
  collectedFor: (el: Element) => Collected;
  analyseOptions: { lengthTolerance: number; colorTolerance: number };
}

export function recordPage(deps: RecordDeps, options: RecordOptions = {}): Recording {
  const started = Date.now();
  const root = options.root ?? document.body;
  const perSource = options.perSource ?? 3;
  const maxElements = options.maxElements ?? 2000;
  const minSeverity = options.minSeverity ?? 'low';

  const elements: Element[] = [];
  const truncated = walk(root, elements, maxElements);

  // Group first, analyse second. Counting what shares a source location is a
  // string compare; analysing is a cascade walk, and the whole point of sampling
  // is to not do the expensive half a thousand times for one line of JSX.
  //
  // Attribution is kept per element rather than per group. A group is "everything
  // from this JSX line", which includes a component's shadow children — and those
  // are reported against the line with `exact: false`, so they must not inherit
  // the flag from whichever member happened to create the group.
  const groups = new Map<string, { el: Element; where: Attribution }[]>();
  for (const el of elements) {
    const where = attribute(el);
    const group = groups.get(where.key);
    if (group) group.push({ el, where });
    else groups.set(where.key, [{ el, where }]);
  }

  const aggregate = new Map<string, RecordedFinding>();
  const warnings = new Set<string>();
  const seenVariants = deps.resolver.axes.map(() => new Set<string>());
  let analysed = 0;

  for (const members of groups.values()) {
    for (const { el, where } of members.slice(0, perSource)) {
      let report;
      try {
        report = analyseElement(el, deps.collectedFor(el), deps.resolver, deps.analyseOptions);
      } catch (error) {
        // One bad element must not cost the whole sweep. Record it and move on.
        warnings.add(`Failed to analyse ${describe(el)}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      analysed++;
      for (const warning of report.warnings) warnings.add(warning);
      deps.resolver.axes.forEach((axis, i) => {
        const label = activeVariant(el, axis)?.label;
        if (label) seenVariants[i]!.add(label);
      });

      for (const finding of report.findings) {
        if (!atLeast(finding.severity, minSeverity)) continue;
        const flat = flatten(finding, where, describe(el));
        // Keyed per source *location*, so a report is a work list: `padding: 8px`
        // on four different lines is four rows to go and fix. The baseline diff
        // collapses these to file level itself, because that is the granularity
        // that survives editing — the two groupings are not the same job.
        const key = [where.key, flat.line, flat.prop, flat.kind, flat.token ?? '', flat.computed].join('|');
        const hit = aggregate.get(key);
        if (hit) hit.elements++;
        else aggregate.set(key, flat);
      }
    }
  }

  const findings = [...aggregate.values()].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      (a.file ?? '').localeCompare(b.file ?? '') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.prop.localeCompare(b.prop),
  );

  const totals: Record<Severity, number> = { high: 0, medium: 0, low: 0, ok: 0 };
  for (const finding of findings) totals[finding.severity]++;

  return {
    version: RECORDING_VERSION,
    url: location.href,
    createdAt: new Date().toISOString(),
    // Findings are relative to the variant that was applied while sweeping, so a
    // recording is only comparable against one taken in the same variant. Read
    // from the elements actually swept, not from the document root: theme and
    // density are nearly always declared on a provider inside the page, and a
    // page may legitimately contain more than one.
    axes: deps.resolver.axes.map((axis, i) => {
      const seen = [...seenVariants[i]!];
      return {
        name: axis.name,
        variants: axis.variants.map((v) => v.label),
        active: seen.length === 1 ? seen[0]! : seen.length > 1 ? 'mixed' : null,
      };
    }),
    scanned: {
      elements: elements.length,
      analysed,
      locations: groups.size,
      truncated,
      durationMs: Date.now() - started,
    },
    findings,
    totals,
    warnings: [...warnings],
  };
}
