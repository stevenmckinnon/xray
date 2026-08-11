# @stevenmckinnon/xray

## 0.4.1

### Patch Changes

- aed6dc6: Point xray at its own playground in CI, and check what it reports.

  End to end, with nothing mocked: the Vite plugin stamps source locations, the client
  resolves tokens by probing a real browser, the CLI drives Playwright and writes a
  recording, and ten expectations assert the recording says what a working engine would
  say about a page built to be got wrong.

  Properties rather than a committed baseline. A baseline fails on any change whether or
  not it is a regression, and one recorded on a developer's machine can fail in CI for
  reasons unrelated to the code. Each expectation names the regression it catches — two of
  them cover bugs that unit tests missed and the fixtures found: locked spacing values,
  which disappeared while `space` scored as a weak affinity, and axis discovery, which the
  escaped class-name bug corrupted.

  The interesting ones are the properties no unit test can reach: the same CSS class
  resolves to a different token inside a nested density provider, and shadow-root content
  is swept and attributed to the line where the custom element is used rather than to
  where its internals were built.

  Verified by breaking the engine three ways and confirming the right expectations fail —
  disabling axis discovery trips five of the ten, skipping shadow roots trips exactly one.

- a6293d1: Fix a false `locked` verdict on values whose token is pinned by a local override, and
  stop the variant table coming from a different token than the message names.

  Three bugs, one symptom. On the playground, `padding: 20px` inside
  `.override { --salt-spacing-100: 20px }` was reported at high severity as "20px is
  `--salt-spacing-250` at medium only … it renders wrong at high, low, mobile, touch". The
  override pins the token to a literal, so that element renders identically at every
  density and is correct everywhere.

  - **The index cache could not see an override.** Its signature described which tokens
    were in scope, not what they resolved to, so a subtree that _replaced_ a value without
    changing the token count produced a signature identical to the theme's and reused the
    theme's index. Overridable tokens — those declared by any rule that does not apply to
    the whole document — now contribute their values, and a per-element signature cache
    keeps that affordable.
  - **Probing a variant discarded the override.** Values for other variants came from a
    wrapper _inside_ the element carrying the axis owner's classes, which re-declared the
    theme below the override. When a token is overridden between the element and where the
    axis is declared, the variant is now applied to that ancestor instead — falling back to
    `documentElement`, so a page sitting at the base variant still gets probed correctly.
  - **The name and the evidence could disagree.** `variantBreakdown` tried every
    exact-matching token and reported the first that moved, so the token in the message and
    the "renders wrong at …" list could belong to different tokens. It now measures the
    token it names, across every axis, rather than consulting the axis index — which also
    catches tokens that vary only through an indirection, like a spacing scale defined as a
    multiple of a density unit.

  On the playground this corrects two findings from high severity to drift and fixes the
  variant table on eight more; no finding is lost. Restricting the breakdown to the named
  token without measuring turned 19 real locks into drift, so that path is measured
  deliberately. A sweep costs about 20% more.

- 2f0f981: Check the probe-safety invariants in a real browser, in CI.

  These were verified by hand-pasting JavaScript into a console, which is a poor way to
  guard the property the whole tool rests on: it inserts nodes into a live DOM and reads
  computed styles back out. jsdom cannot check it, because the failures are cascade and
  layout failures.

  The test samples the page _at the moment a probe is inserted_, by intercepting
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

## 0.4.0

### Minor Changes

- cb67189: **Breaking, narrowly:** the `force` prop is gone from `<Xray />`.

  It was the reason the client ended up in production builds. `force` is a runtime
  value, so `NODE_ENV === 'production' && !force` could not fold at build time, and
  `dist/client.mjs` was emitted as a 48,338-byte lazy chunk plus two server files into
  every production build that rendered `<Xray />`. Nothing ever fetched it — it was
  absent from the build manifest — but it was shipped, and the README said it was not
  bundled at all.

  With the guard back to `NODE_ENV` alone, and the `import()` inside the branch rather
  than after an early return, both bundlers emit nothing. Both halves are needed:
  Turbopack drops it either way once the condition folds, webpack only drops it when the
  import sits inside the dead block.

  If you were using `force` to run the overlay on a deployed site, serve `dist/client.js`
  yourself and call `__xrayClient.start()`. That is what this project's own site does,
  and it needs no API here.

  CI now builds `playground-next` on both bundlers and searches the output for strings
  only the client contains, because an unfetched chunk is invisible from the page.

### Patch Changes

- 3d70a94: Check the Next.js fixture into the repo as `playground-next/`, and build it in CI.

  No change to the published package. It is here because the throwaway version of this
  app found three engine bugs that the unit tests did not — escaped class names read as
  axis names, dismissed axes reported as noise, and `space` scoring as a weak affinity —
  and none of them are reachable from a hand-written stylesheet in a test.

  CI now type-checks _and_ builds it. Those are different checks: a wrong
  `outputFileTracingRoot` type-checks perfectly and then stops Turbopack resolving
  `next` at all.

## 0.3.0

### Minor Changes

- 22c91d4: Stop reporting the wrong verdict when an axis moves only a couple of tokens.

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

- c708366: Add a Next.js integration.

  `withXray(nextConfig)` from `@stevenmckinnon/xray/next` wires up the source
  transform; `<Xray />` from `@stevenmckinnon/xray/next/client` boots the overlay.
  Two pieces because Next has no hook for injecting a script into the document.

  Verified on Next 16.3 with both dev bundlers — Turbopack, which is the default, and
  `next dev --webpack`. Neither piece exists in a production build.

### Patch Changes

- 047adbf: Stop inventing axes from Tailwind's escaped class names.

  Tailwind escapes the punctuation in its variant classes, and the selector parser
  stopped at the backslash — reading `.md\\:ms-4` as a class called `md`, and
  `.hover\\:bg-red-500` as `hover`. Unrelated selectors collapsed into one
  condition, so a page using Tailwind could grow an axis that exists nowhere in its
  stylesheet.

  `diagnose().dismissedAxes` now lists only near misses rather than everything the
  threshold rejected, which on a Tailwind page was dozens of single-token entries.

## 0.2.0

### Minor Changes

- eab196f: Add the `xray record` CLI, for running a sweep in CI.

  ```bash
  xray record http://localhost:5173 --baseline xray.baseline.json
  ```

  Exits `0` when nothing new appeared, `1` when it did, `2` when the sweep could not
  run. Create the baseline with `--update-baseline` and commit it.

  Playwright is an optional peer dependency, needed only by this command — the Vite
  plugin does not pull a browser into anyone's install.

  Findings are compared by file, property, kind, token and value rather than by line
  number, so a baseline survives editing the files it describes.

- c8666af: Add `__xray.record()`: sweep a whole page instead of one element.

  Findings are aggregated by the source location that produced them, so the output
  is a work list per file rather than a pile of DOM nodes. `__xray.report()` renders
  the same data as text.

  Elements are sampled per source location — the fiftieth row of a list is the same
  JSX line as the first — and token resolution is already cached per theme context,
  which is what keeps a full sweep in the tens of milliseconds.

  Also exposes `diffRecordings()` and `diffFails()` for comparing a sweep against a
  committed baseline. Identity is file-level and ignores line numbers, so a baseline
  survives editing the file it describes.

### Patch Changes

- a7a176c: Fix overlay placement.

  The panel now sits next to the element it describes instead of docking to a screen
  edge, and it can no longer run off the bottom of the window — its height is
  measured rather than guessed at.

  Scrolling repositions the panel instead of re-rendering it, so scrolling the page
  no longer discards the panel's own scroll position.

## 0.1.1

### Patch Changes

- f6bcd86: Publish `./client` and `./package.json` in the export map.

  The README tells you to embed `dist/client.js` directly, but the export map did
  not allow resolving it, so `require.resolve('@stevenmckinnon/xray/client')` failed.
  `./package.json` is blocked by default too, which is the usual reason reading a
  dependency's version throws. Both surfaced by consuming the package from the
  marketing site the same way anyone else would.

## 0.1.0

### Minor Changes

- cc7a870: First release.

  A dev-time overlay that maps an element's computed styles back to the design
  tokens they came from, and flags the values that only resolve correctly in the
  variant you happen to be looking at.

  Tokens resolve by probing the browser rather than by evaluating CSS, variant axes
  are discovered from the stylesheet instead of configured, and the cascade is
  modelled so authored values can be told apart from computed ones. Ships a Vite
  plugin and a standalone client bundle for embedding directly.
