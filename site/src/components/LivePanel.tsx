'use client';

import { useEffect, useState } from 'react';

import { useDensity, useTheme } from '@/lib/appearance';
import { PanelView, type PanelFinding, type PanelReport } from './PanelView';

/**
 * The demo, inspecting this page.
 *
 * The layout already loads the real client bundle, so the page has the actual engine on
 * it — this points that engine at `.btn-forked`, the forked button in the bench below,
 * and renders what comes back. Flip theme or density in the nav and the report is taken
 * again: the active chips move, and so do the values, because they are measured rather
 * than written down.
 *
 * The server renders a report captured from the playground, which is also what stays on
 * screen if the client never arrives — blocked, offline, or still loading. So the panel
 * is never empty and never a spinner; it either upgrades or it does not.
 */

/** Only what this component calls, so the page needs no global declaration. */
interface XrayClient {
  inspect(el: Element): {
    tag: string;
    source: string | null;
    findings: {
      prop: string;
      computed: string;
      kind: string;
      message: string;
      tokens: string[];
      variants: { values: { label: string; value: string; active: boolean; wrong: boolean }[] } | null;
    }[];
  };
  diagnose(): { axes: { name: string; variants: string[] }[] };
}

/**
 * The tool's kinds, in the vocabulary the page uses everywhere else.
 *
 * `locked`, `off-scale`, `drift` and `ok` are what the badges are styled for and what
 * the docs table calls them; the engine's own names are more precise and less readable.
 */
const LABELS: Record<string, string> = {
  'variant-locked': 'locked',
  'off-scale': 'off-scale',
  literal: 'drift',
  tokenized: 'ok',
  untokenized: 'untokenized',
  unresolved: 'unresolved',
};

/** Badge order in the header — worst first, and only what is actually present. */
const ORDER = ['locked', 'off-scale', 'unresolved', 'drift', 'untokenized', 'ok'];

const TARGET = '.btn-forked';

/**
 * How many findings the panel shows.
 *
 * The element has seven set properties and the engine reports all of them, worst first.
 * The captured report this replaces had five, and at five the panel sits inside the fold
 * next to the headline; at seven it does not. So the shop window shows the five that
 * matter and says how many it is not showing — the overlay itself, and `xray record`,
 * show everything.
 */
const SHOWN = 5;

/** How long to wait for the client bundle before giving up and keeping the capture. */
const TRIES = 40;
const EVERY_MS = 50;

function toPanelReport(client: XrayClient, el: Element, theme: string, density: string): PanelReport {
  const report = client.inspect(el);

  const findings: PanelFinding[] = report.findings.map((finding) => ({
    prop: finding.prop,
    value: finding.computed,
    kind: LABELS[finding.kind] ?? finding.kind,
    message: finding.message,
    tokens: finding.tokens,
    variants: finding.variants?.values.map((variant) => ({
      label: variant.label,
      value: variant.value,
      active: variant.active,
      wrong: variant.wrong,
    })),
  }));

  // Counted over everything, not over what is shown. The badges are a summary of the
  // element, and a summary that silently omitted two findings would be a lie about it.
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
  const ordered: Record<string, number> = {};
  for (const kind of ORDER) if (counts[kind]) ordered[kind] = counts[kind];

  // Axes come from discovery, and which variant is current is simply what the page is
  // set to — the same two values the switches write.
  const current = new Set([theme, density]);
  const axes = client.diagnose().axes.map((axis) => ({
    name: axis.name,
    variants: axis.variants.map((label) => ({ label, active: current.has(label) })),
  }));

  return {
    tag: report.tag,
    source: report.source,
    counts: ordered,
    axes,
    findings: findings.slice(0, SHOWN),
    hidden: Math.max(0, findings.length - SHOWN),
  };
}

export function LivePanel({ initial }: { initial: PanelReport }) {
  const theme = useTheme();
  const density = useDensity();
  const [report, setReport] = useState<PanelReport>(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const attempt = (tries: number) => {
      if (cancelled) return;
      const client = (window as unknown as { __xray?: XrayClient }).__xray;
      const el = document.querySelector(TARGET);

      if (client && el) {
        try {
          const next = toPanelReport(client, el, theme, density);
          // A report with nothing in it would be a worse demo than the capture, and it
          // is the shape a half-loaded page produces.
          if (!cancelled && next.findings.length > 0) {
            setReport(next);
            setLive(true);
          }
        } catch (error) {
          // Never break the page over the demo. The capture is already on screen.
          console.warn('[xray site] live inspection failed, keeping the captured report', error);
        }
        return;
      }

      if (tries > 0) timer = setTimeout(() => attempt(tries - 1), EVERY_MS);
    };

    attempt(TRIES);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [theme, density]);

  return <PanelView report={report} live={live} />;
}
