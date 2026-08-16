---
'@stevenmckinnon/xray': patch
---

Site: give each of the four verdict cards a real, live example instead of prose alone,
and fix two messages that assumed context the reader did not have yet.

Each card in "Four verdicts, ranked by whether they can actually hurt you." now sits next
to a small box that is an actual element on the page, carrying an actual hardcoded value.
With the overlay open, hovering it gets the same report the panel above is already
showing — not a screenshot of one. All four were checked against the real engine at every
combination of the page's two axes before being written down:

- **locked** — `height: 36px`, exactly `--control-height` at blueprint/regular. Reads as
  untokenized at the other two densities rather than something confusingly close, which is
  why it isn't the same token the Bench section already uses.
- **off-scale** — `color: #7ed4fd`, 0.003 ΔE from `--text-accent`. Off-scale at every
  density (color doesn't move with density here), falls back to a harmless untokenized on
  paper theme rather than colliding with anything misleading.
- **drift** — `border-width: 1px`, exactly `--border-width-hairline`. Identical at every
  combination of both axes, because the token itself never varies.
- **ok** — `padding: var(--spacing-2)`. Tokenized everywhere, trivially, since it is a
  `var()` rather than a literal.

Also: the caption under the hero panel still described a captured Salt Design System
report after the panel became a live inspection of this page's own button, and the hint
under the Bench section told a reader to hover "with the overlay open" without saying how
to open it. Both now point at the `Inspect this page` control (click or shortcut)
explicitly.
