---
'@stevenmckinnon/xray': minor
---

**Breaking, narrowly:** the `force` prop is gone from `<Xray />`.

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
