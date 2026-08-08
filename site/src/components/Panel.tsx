import report from '@/data/report.json';

/**
 * The overlay panel, rebuilt in HTML.
 *
 * Rebuilt rather than screenshotted so it stays sharp at any density, follows the
 * page's theme, and keeps its text selectable and searchable. A screenshot of the
 * same thing is illegible at this column width and drags a light-mode rectangle
 * into a dark page.
 *
 * The content is not hand-typed. `src/data/report.json` is generated from the
 * real tool by `?xray-dump=` in the playground (see the site README), so "real
 * output" is a claim you can re-check rather than one you have to take on trust.
 */
export function Panel() {
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

      <span className="panel-src">{report.source}</span>

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
          {'variants' in finding && Array.isArray(finding.variants) && (
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
    </figure>
  );
}
