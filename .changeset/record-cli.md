---
'@stevenmckinnon/xray': minor
---

Add the `xray record` CLI, for running a sweep in CI.

```bash
xray record http://localhost:5173 --baseline xray.baseline.json
```

Exits `0` when nothing new appeared, `1` when it did, `2` when the sweep could not
run. Create the baseline with `--update-baseline` and commit it.

Playwright is an optional peer dependency, needed only by this command — the Vite
plugin does not pull a browser into anyone's install.

Findings are compared by file, property, kind, token and value rather than by line
number, so a baseline survives editing the files it describes.
