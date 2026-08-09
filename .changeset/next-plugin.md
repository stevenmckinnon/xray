---
'@stevenmckinnon/xray': minor
---

Add a Next.js integration.

`withXray(nextConfig)` from `@stevenmckinnon/xray/next` wires up the source
transform; `<Xray />` from `@stevenmckinnon/xray/next/client` boots the overlay.
Two pieces because Next has no hook for injecting a script into the document.

Verified on Next 16.3 with both dev bundlers — Turbopack, which is the default, and
`next dev --webpack`. Neither piece exists in a production build.

