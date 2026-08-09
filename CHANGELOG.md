# @stevenmckinnon/xray

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
