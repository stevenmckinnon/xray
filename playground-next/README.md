# playground-next

The Next.js half of the fixture set. [`playground/`](../playground) covers Vite; this
covers App Router, and it is the only place `withXray` and `<Xray />` are exercised
through the package's export map the way a consumer writes them.

```bash
pnpm --filter xray-playground-next dev           # Turbopack, the Next 16 default
pnpm --filter xray-playground-next dev:webpack   # next dev --webpack
```

Then `⇧⌘X`. Both bundlers matter: the transform is wired twice, once as a webpack
loader and once as a Turbopack rule, and the two have failed independently.

## Why it is checked in

This started as a throwaway app in a temp directory and found three engine bugs that
the unit tests did not, all of them from being a real page rather than a fixture
string:

- **Escaped class names.** `CLASS_IN_SELECTOR` stopped at the backslash, so
  `.md\:ms-4` was read as a class named `md` and a spurious `md` axis was announced.
- **Dismissed axes were silent.** On a Tailwind page `dismissedAxes()` returned
  twenty-one single-token entries, which is the same as returning nothing.
- **`space` affinity.** `padding: 8px` matching `--space-100` scored as a weak
  affinity, below the threshold that makes a finding plausible at all.

None of those are reachable from a hand-written stylesheet in a test. Keeping the app
means the next one is reachable too.

## What it is deliberately

- **Two axes, one of them two tokens wide** — `mode` moves two custom properties, so
  it only appears when `axisMinTokens` is lowered. That is the option's only test.
- **A class axis and an attribute axis** — `.dark` and `[data-density]`. Both shapes
  occur in the wild.
- **One element hardcoded** — `.hardcoded` is `8px` / `4px`, which equals
  `--space-100` and `--radius-100` at the default density and nothing else. It should
  report `locked`, twice.
- **A server component and a client component** — `<Xray />` renders in the root
  layout, next to a `'use client'` island. The source transform runs on both, which
  is not optional: App Router renders on the server first, and stamping only the
  client build is a hydration mismatch.
