# xray playground

Fixtures for developing xray. Every "bug" in here is real: the values are the
actual `@salt-ds/theme` scale, so a finding that looks wrong *is* wrong.

```bash
npm install
npx vite --port 5199
```

The plugin is loaded from `../dist/index.js`, so run `pnpm build` in the repo
root first (and again after changing `src/`).

| Page | What it covers |
|---|---|
| `/` | Salt density + `[data-mode]` axes, hand-rolled vs tokenised button, off-by-one values, a typo'd token, novel values, inline styles, a local token override, a nested density provider, a shadow-DOM component, and selectors (`:last-child`, `:nth-child`, flex `gap`) that break if probes are inserted carelessly |
| `/shadcn.html` | A `:root`/`.dark` token set in `oklch()` — the base-variant axis case, with no Salt involved |
| `/crossorigin.html` | An unreadable stylesheet, and a token declared only inside it. Needs a second origin: `cd public && python3 -m http.server 5299` |
