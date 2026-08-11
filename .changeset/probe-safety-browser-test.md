---
'@stevenmckinnon/xray': patch
---

Check the probe-safety invariants in a real browser, in CI.

These were verified by hand-pasting JavaScript into a console, which is a poor way to
guard the property the whole tool rests on: it inserts nodes into a live DOM and reads
computed styles back out. jsdom cannot check it, because the failures are cascade and
layout failures.

The test samples the page *at the moment a probe is inserted*, by intercepting
`appendChild`. That is the only state in which a violation exists — probes live for
microseconds inside a synchronous call, so an assertion afterwards passes no matter what
happened. It compares a style and layout signature for every element in the document,
and allows exactly two windows: structural pseudo-classes among the inspected element's
own children, and the whole page while a variant class is off an ancestor.

Verified by breaking it three ways — probes as siblings, disposal skipped, ancestor
class not restored — and confirming the right assertion fails each time.

Also documents the cost of putting probes inside the element, which the safety page
previously left out: for as long as a probe is present, `:last-child` and friends match
differently among that element's own children.

`pretest` now builds, so the browser test cannot pass against a stale bundle.
