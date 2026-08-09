# @stevenmckinnon/xray

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
