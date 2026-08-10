---
'@stevenmckinnon/xray': patch
---

Check the Next.js fixture into the repo as `playground-next/`, and build it in CI.

No change to the published package. It is here because the throwaway version of this
app found three engine bugs that the unit tests did not — escaped class names read as
axis names, dismissed axes reported as noise, and `space` scoring as a weak affinity —
and none of them are reachable from a hand-written stylesheet in a test.

CI now type-checks *and* builds it. Those are different checks: a wrong
`outputFileTracingRoot` type-checks perfectly and then stops Turbopack resolving
`next` at all.
