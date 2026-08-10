# xray

A dev-time overlay that maps an element's **computed** styles back to your design tokens, and flags the values that only work in the theme you happen to be looking at.

```
button.hand-button                                    6 locked · 2 drift
src/App.tsx:36:13

mode     [dark] [light·]
density  [high] [low] [medium·] [mobile] [touch]

background-color  rgb(255, 255, 255)                            LOCKED
  is --salt-container-primary-background at light only. That token
  changes with mode — hardcoding it breaks dark.
      dark    rgb(36, 37, 38)
      light · rgb(255, 255, 255)

height            28px                                          LOCKED
  28px is --salt-size-base at medium only. This element is locked to
  one density — it renders wrong at high, low, mobile, touch.
      high     20px
      low      36px
      medium · 28px
      mobile   44px
      touch    44px

padding (right, left)  8px                                      LOCKED
  8px is --salt-spacing-100 at medium only.
      high 4px · low 12px · medium · 8px · mobile 16px · touch 16px

border-width      1px                                            DRIFT
  1px is exactly --salt-size-divider-strokeWidth. Same value today,
  but it will not follow the token.
```

Every other token linter works on source text, so it can tell you that `padding: 8px` isn't a `var()`. None of them can tell you that `8px` **is** `--salt-spacing-100`, that the token resolves to four different values across four densities, and that this element is therefore correct at exactly one of them. That needs the cascade resolved, which needs a browser.

**[xray-styles.vercel.app](https://xray-styles.vercel.app)** runs xray on itself — the page has its own theme and density axes, so you can inspect it and watch it find them.

📖 **[Documentation](https://xray-styles.vercel.app/docs)** — setup, the five verdicts, how discovery works, the CLI, and the changelog.

## Install

```bash
npm install -D @stevenmckinnon/xray
```

**Vite:**

```ts
// vite.config.ts
import xray from "@stevenmckinnon/xray";

export default defineConfig({
  plugins: [xray(), react()],
});
```

**Next.js** takes two lines, because Next has no hook for injecting a script into
the document the way Vite does:

```ts
// next.config.ts
import { withXray } from "@stevenmckinnon/xray/next";

export default withXray({
  // your config
});
```

```tsx
// app/layout.tsx
import { Xray } from "@stevenmckinnon/xray/next/client";

// ...inside <body>, once:
<Xray />;
```

`withXray` wires up the source transform so findings link back to the line of JSX
that produced them; `<Xray />` boots the overlay and renders nothing. Options live
on the component (`<Xray hotkey="alt+f8" />`).

Verified on Next 16.3 with **both** dev bundlers — Turbopack, which is the default,
and `next dev --webpack`. Requires Next 15 or later.

`⇧⌘X` (`Ctrl+Shift+X` off Apple) to toggle. Hover to inspect, click to pin, `Esc` to release. The dev server prints the binding on start, so you never have to guess:

```
  ➜  Local:   http://localhost:5173/
  ➜  xray:    ⇧⌘X
```

Neither integration exists in a production build. The Vite plugin is
`apply: 'serve'`; `withXray` returns your config untouched outside development, and
`<Xray />` loads the client through a dynamic import inside a `NODE_ENV` guard, so
the branch folds away and the 85kB behind it is never bundled.

## What it reports

|                |                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **locked**     | The literal equals a token that _varies_ across a theme, mode or density axis. Correct in the variant you are viewing, wrong in the others.           |
| **off-scale**  | Within a pixel, or perceptually within ΔE 0.02, of a token — but not equal to it. Close enough that nobody sees it, far enough to escape every theme. |
| **drift**      | Equals a token that never varies. Nothing breaks; it just won't follow the token when the token moves.                                                |
| **unresolved** | A `var()` pointing at a custom property that is not in scope at this element. The declaration is silently dropped, or the fallback renders.                                 |
| **ok**         | Tokenised.                                                                                                                                            |

Findings only appear for properties the author actually set — browser defaults are not your problem. Per-side longhands collapse: four identical corners are one `border-radius` row, and `padding: 8px 16px` is two rows, not four.

## Everything else is in the docs

The interesting parts are too long for a README, so they live at
**[xray-styles.vercel.app/docs](https://xray-styles.vercel.app/docs)**:

| | |
| --- | --- |
| [How it works](https://xray-styles.vercel.app/docs/how-it-works) | Why there is no adapter for your design system: tokens resolved by probing the browser, axes discovered from stylesheet disagreement, the cascade modelled rather than guessed. |
| [Not breaking your app](https://xray-styles.vercel.app/docs/safety) | What gets inserted into your DOM and how it is unwound, plus what xray admits it cannot see. |
| [In CI](https://xray-styles.vercel.app/docs/ci) | `xray record`, baselines that survive editing, and exit codes. |
| [Reference](https://xray-styles.vercel.app/docs/reference) | Every option, the console API, and the honest list of limitations. |
| [Changelog](https://xray-styles.vercel.app/docs/changelog) | Generated from `CHANGELOG.md`. |

## The hotkey

`⇧⌘X` toggles the overlay — `Ctrl+Shift+X` off Apple. Hover to inspect, click to
pin, `Esc` to release. The dev server prints the binding on start:

```
  ➜  Local:   http://localhost:5173/
  ➜  xray:    ⇧⌘X
```

Rebind it with `hotkey`, disable it with `hotkey: false`, or bind several at once.
Bindings are parsed when the server starts, so a typo is an error you can see rather
than a key that quietly does nothing — see
[Setup](https://xray-styles.vercel.app/docs/setup#the-hotkey).

## In CI, briefly

```bash
xray record http://localhost:5173 --baseline xray.baseline.json
```

Exit `0` when nothing new appeared, `1` when it did, `2` when the sweep could not
run. Playwright is an optional peer dependency, needed only by this command.
[Full guide](https://xray-styles.vercel.app/docs/ci).

## Console API

```js
__xray.inspect(document.querySelector('.card')); // one element, no overlay needed
__xray.record(); // sweep the page, aggregated by source location
__xray.report(); // the same thing as text
__xray.diagnose(); // what xray can and cannot see
```

## The repo

- [`site/`](site) is the marketing page and the docs, and it is also a fixture: it declares two real variant axes, loads this exact client bundle, and leaves one component hardcoded on purpose. Press `⇧⌘X` on it and you are inspecting the page with the tool it documents.
- [`playground/`](playground) is where the engine is exercised against `@salt-ds/theme`, a shadcn-style `oklch()` sheet, a shadow root, and a cross-origin stylesheet.
- [`playground-next/`](playground-next) is the same idea for App Router, and the only place `withXray` and `<Xray />` are exercised the way a consumer writes them. It found three engine bugs the unit tests did not.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the release flow and the one-time setup behind it.

MIT
