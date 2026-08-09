---
'@stevenmckinnon/xray': minor
---

Stop reporting the wrong verdict when an axis moves only a couple of tokens.

A selector has to move at least three tokens to count as a variant axis, which
misses a small system's `:root`/`.dark` pair — and a missed axis is worse than a
gap, because values matching those tokens are reported as constant `drift` rather
than locked to a variant.

The threshold stays at three, because nothing in a stylesheet tells a two-token
dark mode apart from a two-token `.promo` modifier and this tool would rather be
quiet than wrong. Instead there is now `axisMinTokens` to lower it, and
`__xray.diagnose().dismissedAxes` to say what the current setting threw away, so
the trade is visible rather than silent.

Also: a spacing scale named `--space-100` now explains a padding. It scored a weak
keyword hit, which can never clear the plausibility bar, so systems using that name
had every padding reported as untokenised.
