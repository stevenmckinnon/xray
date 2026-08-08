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

## Install

```bash
npm install -D @stevenmckinnon/xray
```

```ts
// vite.config.ts
import xray from "@stevenmckinnon/xray";

export default defineConfig({
  plugins: [xray(), react()],
});
```

`⇧⌘X` (`Ctrl+Shift+X` off Apple) to toggle. Hover to inspect, click to pin, `Esc` to release. The dev server prints the binding on start, so you never have to guess:

```
  ➜  Local:   http://localhost:5173/
  ➜  xray:    ⇧⌘X
```

The plugin is `apply: 'serve'` — it does not exist in a production build.

## What it reports

|                |                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **locked**     | The literal equals a token that _varies_ across a theme, mode or density axis. Correct in the variant you are viewing, wrong in the others.           |
| **off-scale**  | Within a pixel, or perceptually within ΔE 0.02, of a token — but not equal to it. Close enough that nobody sees it, far enough to escape every theme. |
| **drift**      | Equals a token that never varies. Nothing breaks; it just won't follow the token when the token moves.                                                |
| **unresolved** | A `var()` pointing at a custom property that is not in scope at this element. The declaration is silently dropped, or the fallback renders.                                 |
| **ok**         | Tokenised.                                                                                                                                            |

Findings only appear for properties the author actually set — browser defaults are not your problem. Per-side longhands collapse: four identical corners are one `border-radius` row, and `padding: 8px 16px` is two rows, not four.

## Zero configuration

There is no adapter for your design system, and no token manifest to maintain.

**Tokens** are resolved by asking the browser. The computed value of a custom property is the substituted token stream — `calc(0.5 * 8px)`, not `4px` — so instead of writing a calc evaluator, xray puts a probe element inside the element you are inspecting, declares `letter-spacing: var(--token)` on it, and reads back the computed length. Anything the engine can resolve, xray can read: nested `var()` chains, `calc()`, `rem`, `em`, `oklch()`. Probes live inside the inspected element, so every token resolves in that element's real context.

**Variant axes** are discovered the same way. A token declared once is a constant. A token declared under several selectors with _different_ values varies — and the conditions those selectors disagree on are the axis:

- `.salt-theme.salt-density-high` vs `.salt-theme.salt-density-medium` → a **density** axis (`.salt-theme` is common to both, so it is context, not axis)
- `.salt-theme[data-mode=light]` vs `[data-mode=dark]` → a **mode** axis, from an attribute rather than a class
- `:root` vs `.dark` → a **dark** axis, where the bare `:root` block is the base variant

Verified against `@salt-ds/theme` (1,831 tokens, five densities, `[data-mode]`) and a shadcn-style `:root`/`.dark` sheet in `oklch()`. Neither needed a line of config.

**Authored values** come from a working model of the cascade: xray collects every readable style rule, matches them against the element itself, and sorts by importance, origin, `@layer`, specificity and document order. That is the only way to know whether the author wrote `8px` or `var(--spacing-100)`, since `getComputedStyle` has already erased the difference.

**The token universe** comes from `getComputedStyle`, which enumerates every custom property in scope for an element. That is stricter than harvesting names from parsed rules: it sees tokens declared in stylesheets xray is not allowed to read, it sees tokens declared inside a shadow root, and it lists what is in scope *here* rather than everything declared anywhere. Engines that do not enumerate custom properties fall back to the parsed names — `__xray.diagnose()` tells you which happened.

## Not breaking your app

The tool has to insert nodes into your page to resolve tokens in context, which is the sort of thing that quietly corrupts what it is measuring. So:

- **Probes go inside the inspected element, never beside it.** A sibling changes that element's own `:nth-child`/`:last-child` matching, which would corrupt the values being read off it.
- **Everything injected is `position: absolute`**, so it is not a flex or grid item and adds no gap, no track and no reordering.
- **Everything is removed in a `finally`.** The one path that must touch your DOM — swapping a theme class on an ancestor, for a token declared with a selector only that ancestor can match — is synchronous, so no frame is painted in the wrong variant, and it is unwound even if something throws.
- **A failure shows up as a message in the panel**, not as a broken page. Inspecting every element on the playground page, twice, produces zero layout differences and zero leftover nodes.

Matching is bucketed by the rightmost compound selector, the way a browser does it, so hovering an element does not test it against every rule in the document — which matters the moment you point this at a Tailwind dev build.

## Trust and diagnostics

```js
__xray.diagnose();
// { rules: 134, tokensInScope: 1831, enumeratesCustomProperties: true,
//   axes: [{ name: 'mode', variants: ['dark','light'], tokens: 182 }, …],
//   unreadableStylesheets: [], shadowRoots: 1 }
```

Cross-origin stylesheets cannot be read. Rather than guess, xray says so: the panel shows a warning, and rules from those sheets are not considered. Token *values* still resolve correctly, because the browser resolves them — a `var()` pointing at a token declared only in an unreadable sheet is reported as fine, not as missing.

The same rule applies to unresolved tokens generally: the claim is "not in scope at this element", checked against the element's own computed style, rather than "not declared anywhere" inferred from rules xray happened to parse.

## Flipping axes

The chips at the top of the panel switch the axis on the nearest ancestor that owns it. This is the part that ends arguments: put a hand-rolled button next to the real one, click `high`, and watch one of them resize.

## Naming the right token

At medium density, `8px` is `--salt-spacing-100`, `--salt-curve-200`, `--salt-size-adornment` and several others. Naming the wrong one makes a correct finding look like a guess, so candidates are ranked by how well the token's name fits the property: `--salt-spacing-100` for padding, `--salt-curve-200` for a corner radius, `--salt-size-base` for height, and the semantic colour token over the raw palette entry it points at.

The same ranking suppresses coincidences. There are enough tokens between 1px and 48px that _every_ literal collides with one, so a match whose name has nothing to do with the property is reported as untokenized rather than as a bug — `padding: 13px` equalling a `lineHeight` token is arithmetic, not intent.

## Source links

With `source: true` (the default) xray stamps `data-xray-src="file:line:col"` onto DOM-producing JSX in dev, and the panel's file link opens your editor through Vite's `/__open-in-editor`. Only lowercase tags are stamped, so component props are never touched. React 19 removed `_debugSource`, which is why this is its own transform.

## Hotkey

The default is `mod+shift+x`, where `mod` is Cmd on Apple platforms and Ctrl elsewhere — one binding, both platforms.

```ts
xray({ hotkey: 'mod+shift+x' })          // the default
xray({ hotkey: 'alt+f8' })               // any chord
xray({ hotkey: 'f8' })                   // a function key may go bare
xray({ hotkey: 'shift shift' })          // tap a modifier twice
xray({ hotkey: ['mod+shift+x', 'f8'] })  // bind several
xray({ hotkey: false })                  // none; use __xray.start()
```

Modifiers are `mod`, `cmd`/`meta`, `ctrl`, `alt`/`option`, `shift`. Keys can be letters, digits, function keys, punctuation (`/`, `` ` ``, `-`) or names (`period`, `backtick`, `escape`, `space`, `up`).

Four decisions worth knowing about:

**Modifier state must match exactly.** A binding of `mod+shift+x` does not fire on `mod+shift+alt+x`, so xray cannot swallow a keystroke that belongs to something else.

**Chords match the physical key, not the character.** With a modifier held, `event.key` is not the letter you pressed — shift+x reports `X`, and on macOS alt+x reports `≈`. Matching `event.code` makes a chord modifier-independent. The trade-off is that it is physical: on a Dvorak layout, `KeyX` is wherever X sits on the board. Punctuation bindings also match on the character, so `mod+/` works either way.

**A bare letter is rejected.** `hotkey: 'x'` would open the overlay whenever someone typed an x, and xray runs inside a real app where people type. The error tells you what to do instead. Function keys are allowed bare because nobody types them.

**A double tap never calls `preventDefault`.** `shift shift` has to leave Shift alone or you could not type capitals — and the sequence only counts when the key is tapped by itself, so shift-then-letter resets it.

Bindings are parsed when the dev server starts, not in the browser, so a typo is an error you see immediately:

```
[xray] Hotkey "x" has no modifier, so it would fire whenever someone types "x".
Add a modifier ("mod+shift+x"), use a function key ("f8"), or use a double tap ("shift shift").
```

Regardless of the binding, `Esc` releases a pinned element and then closes the overlay, and the hotkey keeps working while focus is in a text field once the overlay is up.

## Options

```ts
xray({
  hotkey: 'mod+shift+x',  // string, array of strings, or false — see above
  source: true, // stamp data-xray-src on JSX
  lengthTolerance: 1, // px within which a literal counts as off-scale
  colorTolerance: 0.02, // OKLab distance for the same
  axes: null, // ['[data-mode=light]', '[data-mode=dark]'] etc, if discovery misses one
});
```

## Limitations

- **Vite dev server only.** No Next.js or webpack plugin yet.
- Rules in cross-origin stylesheets are invisible, so a value they set may look untokenised. The panel warns when this applies. Token values are unaffected.
- Container queries are collected but their conditions are not evaluated, so a rule inside one may be considered when it does not apply. Findings that depend on one are flagged.
- `!important` inside `@layer` inverts layer order; xray does not model that inversion.
- Shorthands carrying a `var()` (`padding: 0 var(--x)`) cannot be split by the CSSOM, so they are reported against the shorthand rather than a side.
- Flipping an axis is a DOM-level override, so a framework re-render will snap it back.
- Only lengths and colours are analysed. Shadows, gradients, transitions and font stacks are not.

## The site

[`site/`](site) is the marketing page, and it is also a fixture: it declares two real
variant axes, loads this exact client bundle, and leaves one component hardcoded on
purpose. Press `⇧⌘X` on it and you are inspecting the page with the tool it markets.

## Releasing

Versions are driven by [changesets](https://github.com/changesets/changesets). The
flow has three steps and none of them involve editing a version by hand:

```bash
pnpm changeset          # describe the change and pick patch/minor/major
```

Commit that file with your work. When it lands on `main`, CI opens a release PR
that bumps the version and writes the changelog. Merging *that* PR publishes to
npm and deploys the site.

If a change genuinely needs no release, `pnpm changeset add --empty` records that
decision so CI stops asking.

### What runs where

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PRs and `main` | Typecheck, tests, package build, site build. On PRs it also fails when no changeset is present. |
| `release.yml` | `main` | Opens or updates the release PR, or publishes when the release PR merges. Gated behind the same checks. |
| `deploy-site.yml` | PRs and `main` | Preview deploy per PR, production on `main`. |

The site build always builds the package first, because the site copies
`dist/client.js` into its own assets and runs the real engine on itself. A site
built against a stale bundle would make the live demo quietly disagree with the
released tool.

### One-time setup

Repository secrets:

| Secret | For |
|---|---|
| `NPM_TOKEN` | Publishing. An automation token, so it works with 2FA enabled. |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Site deploys. From `vercel link` in `site/`, which writes the ids to `.vercel/project.json`. |

The deploy workflow skips itself rather than failing while the Vercel secrets are
unset, so nothing goes red before the project exists.

The npm account must own the `@stevenmckinnon` scope, and `publishConfig.access`
is set to `public` because scoped packages default to restricted.

## Console API

```js
__xray.inspect(document.querySelector(".card")); // ElementReport, no overlay needed
__xray.start();
__xray.stop();
```

MIT
