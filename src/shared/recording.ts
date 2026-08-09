/**
 * The shape of a swept page, and what it means to compare two of them.
 *
 * The overlay answers "what is wrong with this element". A recording answers
 * "what is wrong with this app, and is it getting worse" — which is the question
 * CI can act on. Everything here is pure and DOM-free: the browser produces a
 * recording, node reads it back, and both need the same notion of identity.
 */

import { atLeast, severityRank, type FindingKind, type Severity } from './types.js';

/** Bumped when the on-disk shape changes in a way a diff cannot bridge. */
export const RECORDING_VERSION = 1;

export interface RecordedFinding {
  /** Source location, from `data-xray-src`. Null when nothing in the tree carried one. */
  file: string | null;
  line: number | null;
  column: number | null;
  /**
   * False when the location came from an ancestor rather than the element itself
   * — a third-party component's internal node, whose nearest actionable line is
   * where you used the component.
   */
  exact: boolean;
  prop: string;
  kind: FindingKind;
  severity: Severity;
  /** What the browser ended up with. */
  computed: string;
  /** What the author wrote, when we could recover it. */
  authored: string | null;
  /**
   * A token this value *equals*. Null when nothing matches exactly.
   *
   * Kept separate from `nearest` on purpose. Folding the two together made the
   * report claim `is --primary` about a value that merely sat near it, which is
   * the opposite of what an off-scale finding means.
   */
  token: string | null;
  /** The closest token when the value is not exactly one. */
  nearest: { name: string; delta: number; unit: 'px' | 'ΔE' } | null;
  /** The axis the value is locked to, e.g. `density`. */
  axis: string | null;
  /** Variants where the hardcoded value would be wrong. */
  wrongIn: string[];
  message: string;
  /** How many analysed elements produced this same finding. */
  elements: number;
  /** One element that produced it, e.g. `button.hand-button`. */
  example: string;
}

export interface Recording {
  version: number;
  url: string;
  createdAt: string;
  axes: { name: string; variants: string[]; active: string | null }[];
  scanned: {
    /** Elements in the tree, before sampling. */
    elements: number;
    /** Elements actually analysed. */
    analysed: number;
    /** Distinct source locations seen. */
    locations: number;
    /** True when the element cap cut the sweep short. */
    truncated: boolean;
    durationMs: number;
  };
  findings: RecordedFinding[];
  totals: Record<Severity, number>;
  warnings: string[];
}

/**
 * What makes two findings "the same finding" across runs.
 *
 * Deliberately excludes line and column. A baseline keyed on line numbers goes
 * stale the moment anyone adds an import, and a diff that reports every finding
 * in a reformatted file as both removed and added is a diff nobody reads. File,
 * property, kind, token and value is specific enough to be meaningful and stable
 * enough to survive editing — the line still travels in the finding, as the place
 * to look rather than as part of its name.
 */
export function findingIdentity(finding: RecordedFinding): string {
  return [
    finding.file ?? '<unattributed>',
    finding.prop,
    finding.kind,
    finding.token ?? '',
    finding.computed,
  ].join('|');
}

export interface RecordingDiff {
  added: RecordedFinding[];
  removed: RecordedFinding[];
  /** Same finding, now on more elements: the bug spread rather than appeared. */
  spread: { finding: RecordedFinding; was: number; now: number }[];
  unchanged: number;
}

/**
 * Collapse a recording's per-location findings to one entry per identity.
 *
 * A recording lists findings per source location, because that is what a work
 * list needs. Comparing at that granularity would report every finding in an
 * edited file as both removed and added, so the diff folds them to file level
 * first and sums the element counts. The earliest location survives as the place
 * to start looking.
 */
function collapse(findings: RecordedFinding[]): Map<string, RecordedFinding> {
  const out = new Map<string, RecordedFinding>();
  for (const finding of findings) {
    const id = findingIdentity(finding);
    const hit = out.get(id);
    if (!hit) {
      out.set(id, { ...finding });
      continue;
    }
    hit.elements += finding.elements;
    if (hit.line !== null && finding.line !== null && finding.line < hit.line) {
      hit.line = finding.line;
      hit.column = finding.column;
      hit.exact = finding.exact;
    }
  }
  return out;
}

export function diffRecordings(baseline: Recording, current: Recording): RecordingDiff {
  const before = collapse(baseline.findings);
  const after = collapse(current.findings);

  const added: RecordedFinding[] = [];
  const spread: RecordingDiff['spread'] = [];
  let unchanged = 0;

  for (const [id, finding] of after) {
    const was = before.get(id);
    if (!was) {
      added.push(finding);
      continue;
    }
    unchanged++;
    if (finding.elements > was.elements) {
      spread.push({ finding, was: was.elements, now: finding.elements });
    }
  }

  const removed = [...before].filter(([id]) => !after.has(id)).map(([, f]) => f);

  const bySeverity = (a: RecordedFinding, b: RecordedFinding) =>
    severityRank(a.severity) - severityRank(b.severity) ||
    (a.file ?? '').localeCompare(b.file ?? '') ||
    a.prop.localeCompare(b.prop);

  added.sort(bySeverity);
  removed.sort(bySeverity);
  return { added, removed, spread, unchanged };
}

/**
 * Whether a diff should fail a build.
 *
 * Only additions count. Findings disappearing is progress, and a finding
 * spreading to more elements is a regression worth reporting but not one worth
 * blocking on — element counts move for reasons that have nothing to do with
 * styling, like a list rendering more rows.
 */
export function diffFails(diff: RecordingDiff, threshold: Severity): boolean {
  return diff.added.some((f) => atLeast(f.severity, threshold));
}

// ------------------------------------------------------------------ formatting

/**
 * Rows are labelled by kind, not by severity.
 *
 * Severity is how much to care; kind is what is actually wrong, and it is the
 * vocabulary the docs use. Labelling a row `DRIFT` because it happened to be low
 * severity said the wrong thing about findings that were really untokenised.
 */
const KIND_LABEL: Record<FindingKind, string> = {
  'variant-locked': 'LOCKED',
  'off-scale': 'OFF-SCALE',
  literal: 'DRIFT',
  untokenized: 'UNTOKENIZED',
  unresolved: 'UNRESOLVED',
  tokenized: 'OK',
};

const LABEL_WIDTH = Math.max(...Object.values(KIND_LABEL).map((l) => l.length));

/**
 * Kinds where the value really does equal the token, so `is <token>` is true.
 *
 * `unresolved` carries a token name too — the one the declaration points at — but
 * the finding exists precisely because that token is not in scope, so claiming
 * the value "is" it states the opposite of the problem.
 */
const EQUALS_ITS_TOKEN = new Set<FindingKind>(['variant-locked', 'literal', 'tokenized']);

function location(finding: RecordedFinding): string {
  if (!finding.file) return '<no source>';
  const at = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
  return finding.exact ? at : `${at} (in a child)`;
}

/** Group findings by file, worst file first, so the output reads as a work list. */
function byFile(findings: RecordedFinding[]): [string, RecordedFinding[]][] {
  const groups = new Map<string, RecordedFinding[]>();
  for (const finding of findings) {
    const key = finding.file ?? '<no source>';
    const bucket = groups.get(key);
    if (bucket) bucket.push(finding);
    else groups.set(key, [finding]);
  }
  for (const bucket of groups.values()) {
    bucket.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.line ?? 0) - (b.line ?? 0),
    );
  }
  return [...groups].sort((a, b) => {
    const worst = (list: RecordedFinding[]) => Math.min(...list.map((f) => severityRank(f.severity)));
    return worst(a[1]) - worst(b[1]) || b[1].length - a[1].length || a[0].localeCompare(b[0]);
  });
}

export interface FormatOptions {
  /** Findings per file before collapsing the rest into a count. Default 10. */
  perFile?: number;
}

/**
 * One finding as two lines: what and where, then why.
 *
 * Built from the structured fields rather than reused from the overlay's prose.
 * The overlay explains one finding to someone looking at one element; a list of
 * sixty needs the same information at a glance, and the same sentence repeated
 * sixty times is noise.
 */
function row(finding: RecordedFinding): string[] {
  const at = (finding.line === null ? '' : String(finding.line)).padStart(5);
  const label = KIND_LABEL[finding.kind].padEnd(LABEL_WIDTH);
  const count = finding.elements > 1 ? ` ×${finding.elements}` : '';
  const head = `${at}  ${label}  ${finding.prop}: ${finding.computed}${count}`;

  const detail: string[] = [];
  if (finding.token && EQUALS_ITS_TOKEN.has(finding.kind)) {
    detail.push(`is ${finding.token}`);
  } else if (finding.kind === 'off-scale' && finding.nearest) {
    // "off", not "is": the whole point of the finding is that it is close enough
    // that nobody notices and far enough to escape the theme. Rounded, because a
    // raw ΔE carries seventeen digits of noise.
    const { delta, unit, name } = finding.nearest;
    const shown = unit === 'px' ? delta.toFixed(2).replace(/\.?0+$/, '') : delta.toFixed(3);
    detail.push(`${shown}${unit} off ${name}`);
  }
  if (finding.wrongIn.length) {
    detail.push(`wrong at ${finding.wrongIn.join(', ')}`);
  } else if (finding.axis) {
    detail.push(`varies with ${finding.axis}`);
  }
  if (!finding.exact) detail.push('on a child of this element');

  // Nothing structured to say — an unresolved var(), say — so fall back to the
  // analyser's own sentence rather than printing a bare property name.
  if (!detail.length) detail.push(finding.message);

  // Two past the line-number column, so the detail reads as subordinate to the
  // row above it rather than as another row. Findings with no line number would
  // otherwise start at exactly the same column as their own heading.
  return [head, `${' '.repeat(9)}${detail.join(' · ')}`];
}

export function formatRecording(recording: Recording, options: FormatOptions = {}): string {
  const perFile = options.perFile ?? 10;
  const out: string[] = [];
  const { scanned, totals } = recording;

  out.push(recording.url);
  out.push(
    `${scanned.analysed} of ${scanned.elements} elements · ${scanned.locations} locations · ${Math.round(scanned.durationMs)}ms`,
  );
  if (scanned.truncated) {
    out.push('sweep hit the element cap; raise --max-elements for the whole page');
  }
  for (const axis of recording.axes) {
    const variants = axis.variants.map((v) => (v === axis.active ? `${v}·` : v)).join(' ');
    // `mixed` is not one of the variants, so nothing gets marked. Say it instead:
    // a page with nested providers is exactly when you want to know.
    const note =
      axis.active === 'mixed'
        ? '  (several in one page)'
        : axis.active === null
          ? '  (none applied)'
          : '';
    out.push(`${axis.name.padEnd(8)} ${variants}${note}`);
  }
  out.push('');

  const byKind = new Map<FindingKind, number>();
  for (const finding of recording.findings) {
    byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
  }
  const summary = [...byKind]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${KIND_LABEL[kind].toLowerCase()}`)
    .join(' · ');
  out.push(summary || 'nothing found');

  if (!recording.findings.length) {
    out.push('');
    out.push('Nothing to report.');
    return out.join('\n');
  }

  for (const [file, findings] of byFile(recording.findings)) {
    out.push('');
    out.push(`${file}  (${findings.length})`);
    for (const finding of findings.slice(0, perFile)) out.push(...row(finding));
    if (findings.length > perFile) {
      out.push(`  … ${findings.length - perFile} more`);
    }
  }

  for (const warning of recording.warnings) {
    out.push('');
    out.push(`warning: ${warning}`);
  }

  return out.join('\n');
}

export function formatDiff(diff: RecordingDiff): string {
  const out: string[] = [];

  if (!diff.added.length && !diff.removed.length && !diff.spread.length) {
    return `No change against the baseline (${diff.unchanged} findings).`;
  }

  if (diff.added.length) {
    out.push(`New (${diff.added.length}):`);
    for (const finding of diff.added) {
      out.push(`  + ${KIND_LABEL[finding.kind].padEnd(LABEL_WIDTH)} ${location(finding)}`);
      out.push(`      ${finding.prop}: ${finding.computed} — ${finding.message}`);
    }
  }

  if (diff.spread.length) {
    if (out.length) out.push('');
    out.push(`Spread to more elements (${diff.spread.length}):`);
    for (const { finding, was, now } of diff.spread) {
      out.push(`  ~ ${location(finding)}  ${finding.prop}: ${was} → ${now} elements`);
    }
  }

  if (diff.removed.length) {
    if (out.length) out.push('');
    out.push(`Fixed (${diff.removed.length}):`);
    for (const finding of diff.removed) {
      out.push(`  - ${location(finding)}  ${finding.prop}: ${finding.computed}`);
    }
  }

  return out.join('\n');
}
