# xray site

The marketing page for [xray](../README.md). Next.js, static export, no component library.

```bash
npm install
npm run dev     # http://localhost:5300
npm run build   # static export to out/
```

`predev` / `prebuild` copy `../dist/client.js` into `public/xray-client.js`, so run
`pnpm build` in the repo root first.

## The page is the fixture

Nothing here is a mock. `src/app/globals.css` declares two real variant axes —
`[data-theme]` (blueprint / paper) and `[data-density]` (tight / regular / loose) —
and the page loads the actual xray client and starts it. Press `⇧⌘X`, or tap
shift twice, and you are inspecting the marketing page with the tool it markets.

Two things are deliberate:

- **`.btn-forked` hardcodes its values.** `height: 36px`, `border-radius: 3px`,
  `#0f131a`, `#2b3341`, `#e6e9ef` — each one equals a token at `regular` density
  in the `blueprint` theme, and none of them follow. xray reports five
  variant-locked findings on it. Do not "fix" it.
- **Token names are semantic** (`--control-height`, `--radius-control`,
  `--surface-raised`, `--text-primary`) because xray ranks candidate tokens by how
  well the name fits the property. Rename them to `--c-h` and the panel output
  gets noticeably worse — which is itself a useful thing to know.

Because the demo *is* the tool, it cannot drift from it.

## The panel is generated, not typed

`src/data/report.json` is real output, lifted out of the running tool rather than
transcribed by hand. With the xray playground running on :5199:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom \
  "http://localhost:5199/?xray-dump=.hand-button" > /tmp/dom.html
# then lift the <pre id="xray-dump"> payload into src/data/report.json
```

The `?xray-dump=<selector>` hook lives in `playground/src/main.tsx`. It renders the
real `inspect()` report into the DOM so a headless run can extract it. There is a
sibling `?xray-demo=<selector>` hook that just opens the overlay, useful for
capturing images.

`Panel.tsx` renders that JSON. A screenshot was tried instead and reverted: at this
column width the panel text is illegible, a light-mode capture fights a dark page,
and it cannot follow the theme switch. Rebuilt HTML keeps it sharp, selectable and
themed, and generating the content from the tool is what keeps it honest.

## Design notes

Engineering spec sheet, not SaaS landing page: Archivo (variable width) for
display, Newsreader for body prose, IBM Plex Mono for every measured value.
Blueprint grid, paper grain, and CAD-style dimension lines — including the delta
bracket in section 02, which measures the disputed pixels between the two buttons
rather than describing them.
