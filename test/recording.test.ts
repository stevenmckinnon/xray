import { describe, expect, it } from 'vitest';
import {
  diffFails,
  diffRecordings,
  findingIdentity,
  formatDiff,
  formatRecording,
  RECORDING_VERSION,
  type RecordedFinding,
  type Recording,
} from '../src/shared/recording';
import type { Severity } from '../src/shared/types';

function finding(overrides: Partial<RecordedFinding> = {}): RecordedFinding {
  return {
    file: 'src/App.tsx',
    line: 36,
    column: 13,
    exact: true,
    prop: 'padding-left',
    kind: 'variant-locked',
    severity: 'high',
    computed: '8px',
    authored: '8px',
    token: '--salt-spacing-100',
    nearest: null,
    axis: 'density',
    wrongIn: ['high', 'low'],
    message: '8px is --salt-spacing-100 at medium only.',
    elements: 1,
    example: 'button.hand-button',
    ...overrides,
  };
}

function recording(findings: RecordedFinding[], overrides: Partial<Recording> = {}): Recording {
  const totals: Record<Severity, number> = { high: 0, medium: 0, low: 0, ok: 0 };
  for (const f of findings) totals[f.severity]++;
  return {
    version: RECORDING_VERSION,
    url: 'http://localhost:5173/',
    createdAt: '2026-08-09T00:00:00.000Z',
    axes: [{ name: 'density', variants: ['high', 'medium', 'low'], active: 'medium' }],
    scanned: { elements: 120, analysed: 40, locations: 12, truncated: false, durationMs: 210 },
    findings,
    totals,
    warnings: [],
    ...overrides,
  };
}

describe('findingIdentity', () => {
  it('ignores line and column so editing a file above a finding does not rename it', () => {
    const before = finding({ line: 36, column: 13 });
    const after = finding({ line: 91, column: 5 });
    expect(findingIdentity(after)).toBe(findingIdentity(before));
  });

  it('separates findings that differ in anything that matters', () => {
    const base = finding();
    const ids = [
      base,
      finding({ file: 'src/Other.tsx' }),
      finding({ prop: 'padding-right' }),
      finding({ kind: 'off-scale' }),
      finding({ token: '--salt-spacing-200' }),
      finding({ computed: '16px' }),
    ].map(findingIdentity);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps unattributed findings apart from a file called <unattributed>', () => {
    const nameless = findingIdentity(finding({ file: null }));
    expect(nameless.startsWith('<unattributed>|')).toBe(true);
  });
});

describe('diffRecordings', () => {
  it('reports a finding that appeared', () => {
    const diff = diffRecordings(recording([]), recording([finding()]));
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toBe(0);
  });

  it('reports a finding that went away', () => {
    const diff = diffRecordings(recording([finding()]), recording([]));
    expect(diff.removed).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
  });

  it('treats a moved finding as unchanged', () => {
    const diff = diffRecordings(recording([finding({ line: 36 })]), recording([finding({ line: 200 })]));
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });

  it('notices the same finding spreading to more elements', () => {
    const diff = diffRecordings(
      recording([finding({ elements: 2 })]),
      recording([finding({ elements: 9 })]),
    );
    expect(diff.added).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
    expect(diff.spread).toEqual([{ finding: expect.objectContaining({ elements: 9 }), was: 2, now: 9 }]);
  });

  it('does not call a shrinking count a spread', () => {
    const diff = diffRecordings(
      recording([finding({ elements: 9 })]),
      recording([finding({ elements: 2 })]),
    );
    expect(diff.spread).toHaveLength(0);
  });

  it('folds several locations in one file into a single comparison', () => {
    // A recording lists findings per line; the diff compares at file level, so
    // the same mistake on three lines is one thing that either regressed or did
    // not. Element counts add up across the lines.
    const spreadOverLines = recording([
      finding({ line: 14, elements: 3 }),
      finding({ line: 34, elements: 1 }),
      finding({ line: 36, elements: 1 }),
    ]);
    const diff = diffRecordings(recording([finding({ line: 14, elements: 5 })]), spreadOverLines);
    expect(diff.added).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
    // 3 + 1 + 1 is the same five elements as before: moving code around a file is
    // not a regression.
    expect(diff.spread).toHaveLength(0);
  });

  it('counts a finding appearing on a new line as spreading, not as new', () => {
    const diff = diffRecordings(
      recording([finding({ line: 14, elements: 3 })]),
      recording([finding({ line: 14, elements: 3 }), finding({ line: 51, elements: 2 })]),
    );
    expect(diff.added).toHaveLength(0);
    expect(diff.spread).toEqual([{ finding: expect.objectContaining({ elements: 5 }), was: 3, now: 5 }]);
  });

  it('points a folded finding at the earliest line', () => {
    const diff = diffRecordings(
      recording([]),
      recording([finding({ line: 90 }), finding({ line: 12 }), finding({ line: 45 })]),
    );
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.line).toBe(12);
  });

  it('sorts additions worst first', () => {
    const diff = diffRecordings(
      recording([]),
      recording([
        finding({ severity: 'low', prop: 'border-width' }),
        finding({ severity: 'high', prop: 'padding-left' }),
        finding({ severity: 'medium', prop: 'height' }),
      ]),
    );
    expect(diff.added.map((f) => f.severity)).toEqual(['high', 'medium', 'low']);
  });
});

describe('diffFails', () => {
  it('fails on a new finding at or above the threshold', () => {
    const diff = diffRecordings(recording([]), recording([finding({ severity: 'high' })]));
    expect(diffFails(diff, 'high')).toBe(true);
    expect(diffFails(diff, 'medium')).toBe(true);
  });

  it('ignores a new finding below the threshold', () => {
    const diff = diffRecordings(recording([]), recording([finding({ severity: 'low' })]));
    expect(diffFails(diff, 'high')).toBe(false);
    expect(diffFails(diff, 'low')).toBe(true);
  });

  it('never fails because findings were fixed', () => {
    const diff = diffRecordings(recording([finding()]), recording([]));
    expect(diffFails(diff, 'high')).toBe(false);
  });

  it('does not block on a finding merely spreading', () => {
    const diff = diffRecordings(
      recording([finding({ elements: 1 })]),
      recording([finding({ elements: 40 })]),
    );
    expect(diff.spread).toHaveLength(1);
    expect(diffFails(diff, 'high')).toBe(false);
  });
});

describe('formatRecording', () => {
  it('says so plainly when there is nothing wrong', () => {
    const text = formatRecording(recording([]));
    expect(text).toContain('Nothing to report.');
  });

  it('marks the active variant on each axis', () => {
    const text = formatRecording(recording([]));
    expect(text).toContain('medium·');
  });

  it('says when an axis has several providers in one page', () => {
    const text = formatRecording(
      recording([], { axes: [{ name: 'density', variants: ['high', 'medium'], active: 'mixed' }] }),
    );
    expect(text).toContain('several in one page');
  });

  it('says when an axis is not applied at all', () => {
    const text = formatRecording(
      recording([], { axes: [{ name: 'mode', variants: ['dark', 'light'], active: null }] }),
    );
    expect(text).toContain('none applied');
  });

  it('labels rows by kind, not by severity', () => {
    // An untokenised value is low severity, but calling the row DRIFT would say
    // something false about it.
    const text = formatRecording(recording([finding({ kind: 'untokenized', severity: 'low' })]));
    expect(text).toContain('UNTOKENIZED');
    expect(text).not.toContain('DRIFT');
  });

  it('builds the detail from structured fields rather than the prose message', () => {
    const text = formatRecording(
      recording([finding({ message: 'a long sentence nobody needs sixty times' })]),
    );
    expect(text).toContain('is --salt-spacing-100 · wrong at high, low');
    expect(text).not.toContain('nobody needs');
  });

  it('says a near miss is "off" a token, never that it "is" one', () => {
    const text = formatRecording(
      recording([
        finding({
          kind: 'off-scale',
          severity: 'medium',
          token: null,
          nearest: { name: '--salt-spacing-100', delta: 0.4, unit: 'px' },
          axis: null,
          wrongIn: [],
        }),
      ]),
    );
    expect(text).toContain('0.4px off --salt-spacing-100');
    expect(text).not.toContain('is --salt-spacing-100');
  });

  it('rounds a delta rather than printing float noise', () => {
    const text = formatRecording(
      recording([
        finding({
          kind: 'off-scale',
          token: null,
          nearest: { name: '--primary-foreground', delta: 0.003087396383829006, unit: 'ΔE' },
          axis: null,
          wrongIn: [],
        }),
      ]),
    );
    expect(text).toContain('0.003ΔE off --primary-foreground');
  });

  it('does not attach a nearest token to an untokenised value', () => {
    // The closest token to a value nothing matches is not information, and
    // printing it as though it were the answer is worse than silence.
    const text = formatRecording(
      recording([
        finding({
          kind: 'untokenized',
          severity: 'low',
          token: null,
          nearest: { name: '--primary', delta: 12, unit: 'ΔE' },
          axis: null,
          wrongIn: [],
          message: 'rgb(52, 52, 52) matches no colour token.',
        }),
      ]),
    );
    expect(text).not.toContain('--primary');
    expect(text).toContain('matches no colour token.');
  });

  it('does not claim an unresolved value "is" the token it points at', () => {
    const text = formatRecording(
      recording([
        finding({
          kind: 'unresolved',
          token: '--cross-token',
          axis: null,
          wrongIn: [],
          message: 'var(--cross-token) is not in scope on this element.',
        }),
      ]),
    );
    expect(text).not.toContain('is --cross-token');
    expect(text).toContain('not in scope');
  });

  it('falls back to the message when there is nothing structured to say', () => {
    const text = formatRecording(
      recording([
        finding({ kind: 'unresolved', token: null, axis: null, wrongIn: [], message: 'var(--nope) is not in scope here.' }),
      ]),
    );
    expect(text).toContain('var(--nope) is not in scope here.');
  });

  it('notes when a finding is really about a child element', () => {
    const text = formatRecording(recording([finding({ exact: false })]));
    expect(text).toContain('on a child of this element');
  });

  it('groups by file and puts the worst file first', () => {
    const text = formatRecording(
      recording([
        finding({ file: 'src/Quiet.tsx', severity: 'low' }),
        finding({ file: 'src/Loud.tsx', severity: 'high' }),
      ]),
    );
    expect(text.indexOf('src/Loud.tsx')).toBeLessThan(text.indexOf('src/Quiet.tsx'));
  });

  it('collapses a long file down to a count', () => {
    const many = Array.from({ length: 14 }, (_, i) => finding({ prop: `padding-${i}` }));
    const text = formatRecording(recording(many), { perFile: 10 });
    expect(text).toContain('… 4 more');
  });

  it('shows an element count only when a finding covers several', () => {
    expect(formatRecording(recording([finding({ elements: 1 })]))).not.toContain('×1');
    expect(formatRecording(recording([finding({ elements: 7 })]))).toContain('×7');
  });

  it('flags a truncated sweep rather than pretending it was complete', () => {
    const text = formatRecording(
      recording([], { scanned: { elements: 2000, analysed: 500, locations: 90, truncated: true, durationMs: 900 } }),
    );
    expect(text).toContain('element cap');
  });

  it('surfaces warnings', () => {
    const text = formatRecording(recording([finding()], { warnings: ['2 stylesheets could not be read'] }));
    expect(text).toContain('warning: 2 stylesheets could not be read');
  });
});

describe('formatDiff', () => {
  it('is quiet when nothing moved', () => {
    const diff = diffRecordings(recording([finding()]), recording([finding()]));
    expect(formatDiff(diff)).toBe('No change against the baseline (1 findings).');
  });

  it('separates new, spread and fixed', () => {
    const before = recording([finding({ prop: 'gone' }), finding({ prop: 'wider', elements: 1 })]);
    const after = recording([finding({ prop: 'fresh' }), finding({ prop: 'wider', elements: 5 })]);
    const text = formatDiff(diffRecordings(before, after));
    expect(text).toContain('New (1):');
    expect(text).toContain('Spread to more elements (1):');
    expect(text).toContain('Fixed (1):');
  });

  it('says when a location is only approximate', () => {
    const diff = diffRecordings(recording([]), recording([finding({ exact: false })]));
    expect(formatDiff(diff)).toContain('(in a child)');
  });
});
