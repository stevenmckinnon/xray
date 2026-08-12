/**
 * The overlay panel, rebuilt in HTML.
 *
 * Rebuilt rather than screenshotted so it stays sharp at any density, follows the
 * page's theme, and keeps its text selectable and searchable. A screenshot of the same
 * thing is illegible at this column width and drags a light-mode rectangle into a dark
 * page.
 *
 * Presentation only. Two things supply it: a report captured from the playground, which
 * is what the server renders, and a live report of this page's own forked button, which
 * replaces it once the real client has loaded. See `LivePanel`.
 */

export interface PanelVariant {
  label: string;
  value: string;
  active?: boolean;
  wrong?: boolean;
}

export interface PanelFinding {
  prop: string;
  value: string;
  kind: string;
  message: string;
  tokens: string[];
  variants?: PanelVariant[];
}

export interface PanelReport {
  tag: string;
  /** Where the element was written. Null when nothing in the tree carried a stamp. */
  source: string | null;
  counts: Record<string, number>;
  axes: { name: string; variants: { label: string; active?: boolean }[] }[];
  findings: PanelFinding[];
  /** Findings the element has that this panel is not showing. Counted, never hidden. */
  hidden?: number;
}

export function PanelView({ report, live }: { report: PanelReport; live?: boolean }) {
  const hidden = report.hidden ?? 0;
  return (
    <figure className="panel m-0" aria-label={`An xray report for ${report.tag}`}>
      <div className="panel-head">
        <span className="panel-tag">{report.tag}</span>
        <span className="flex-1" />
        {Object.entries(report.counts).map(([kind, count]) => (
          <span className="badge" data-kind={kind} key={kind}>
            {count} {kind}
          </span>
        ))}
      </div>

      {/* Only when a source location exists. The live report has none: this site is a
          Next app without the plugin, so nothing stamps `data-xray-src` here, and
          inventing a line number would be the one dishonest thing on the page. */}
      {report.source && <span className="panel-src">{report.source}</span>}

      {report.axes.map((axis) => (
        <div className="panel-axes" key={axis.name}>
          <span className="instrument-label">{axis.name}</span>
          {axis.variants.map((variant) => (
            <span className="panel-chip" data-on={variant.active || undefined} key={variant.label}>
              {variant.label}
            </span>
          ))}
        </div>
      ))}

      {report.findings.map((finding) => (
        <div className="finding" key={finding.prop}>
          <div className="finding-row">
            <span>{finding.prop}</span>
            <span className="finding-val">{finding.value}</span>
            <span className="badge" data-kind={finding.kind}>
              {finding.kind}
            </span>
          </div>
          <div className="finding-msg">{finding.message}</div>
          {finding.tokens.length > 0 && <div className="finding-tokens">{finding.tokens.join('  ')}</div>}
          {finding.variants && finding.variants.length > 0 && (
            <table className="variant-table">
              <tbody>
                {finding.variants.map((variant) => (
                  <tr key={variant.label} data-active={variant.active || undefined} data-wrong={variant.wrong || undefined}>
                    <td>
                      {variant.label}
                      {variant.active ? ' ·' : ''}
                    </td>
                    <td className="v">{variant.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Says which of the two it is, because "this updates as you flip the switches"
          is only worth claiming if the page also admits when it is a recording. */}
      <figcaption className="panel-foot" data-live={live || undefined}>
        {live ? 'live — inspecting .btn-forked on this page' : 'captured from the playground'}
        {hidden > 0 && ` · ${hidden} more not shown`}
      </figcaption>
    </figure>
  );
}
