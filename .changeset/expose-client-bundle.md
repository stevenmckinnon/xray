---
'@stevenmckinnon/xray': patch
---

Publish `./client` and `./package.json` in the export map.

The README tells you to embed `dist/client.js` directly, but the export map did
not allow resolving it, so `require.resolve('@stevenmckinnon/xray/client')` failed.
`./package.json` is blocked by default too, which is the usual reason reading a
dependency's version throws. Both surfaced by consuming the package from the
marketing site the same way anyone else would.
