/**
 * A small live box in each verdict card, in the "kinds" section.
 *
 * The card next to it makes a claim in prose — "the literal equals a token that
 * varies," say. This is that claim, as an actual DOM node carrying an actual
 * hardcoded value, sitting in the actual page. With the overlay open, hovering it
 * gives the real verdict, not a screenshot of one.
 *
 * Everything else on the card is illustrative copy about Salt or a shadcn sheet —
 * design systems this page is not running. These four run on this page's own two
 * axes, `theme` and `density`, the same ones the switches above control.
 *
 * Presentational only, deliberately: the overlay discovers elements by walking the
 * live DOM, so a plain node is enough. No hover handler, no state, nothing that
 * could drift from what the engine actually sees.
 *
 * ## Why these four values
 *
 * Each was checked against the real engine, at every combination of the two axes,
 * before being written here — the numbers are not a guess:
 *
 * | kind      | property      | value  | at blueprint/regular | elsewhere               |
 * | --------- | ------------- | ------ | --------------------- | ------------------------ |
 * | locked    | `height`      | `36px` | `--control-height`, exactly | reads as untokenized — the literal does not coincide with any other density's value |
 * | off-scale | `height`      | `18px` | 1px off `--kbd-height` | off-scale at loose too, against a different token by coincidence; untokenized at tight |
 * | drift     | `border-width`| `1px`  | exactly `--border-width-hairline` | identical everywhere — the token never varies, which is the whole point |
 * | ok        | `padding`     | `var(--spacing-2)` | tokenized | tokenized everywhere — it is a `var()`, not a literal |
 *
 * `locked` and `off-scale` are only exactly that at the page's default density.
 * Left alone rather than fought: flipping density and watching a specimen's own
 * label stop matching it is a smaller version of the point the Bench section
 * already makes on purpose.
 */
export function VerdictSpecimen({
  css,
  code,
}: {
  /** Inline styles, in the exact property: value pairs a reader can read off the box. */
  css: React.CSSProperties;
  /** What that resolves to, shown as the card's own caption. */
  code: string;
}) {
  return (
    <div className="verdict-specimen-row">
      <div className="verdict-specimen" style={css} aria-hidden="true" />
      <p className="specimen-code">{code}</p>
    </div>
  );
}
