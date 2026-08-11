# Contributing

## Local setup

```bash
pnpm install
pnpm build      # dist/, which the playground and the docs both read
pnpm test
pnpm typecheck
```

Both playgrounds are workspace members, so the root `pnpm install` covers them. Do not
run `npm install` inside either one — it builds a second, competing `node_modules`, and
two copies of Vite is what made the plugin's own types incompatible with itself.

```bash
pnpm --filter xray-playground dev              # Vite: Salt's theme, an oklch() sheet,
                                               # a shadow root, a cross-origin sheet
pnpm --filter xray-playground-next dev         # App Router, Turbopack
pnpm --filter xray-playground-next dev:webpack # App Router, next dev --webpack
```

## What checks what

Three of these exist because unit tests could not have caught the bugs they found.

| | |
| --- | --- |
| `pnpm test` | 185 unit tests, plus `probe-safety.browser.test.ts`, which drives Chromium. Skipped without a browser; set `XRAY_REQUIRE_BROWSER=1` to make the skip an error, as CI does. |
| `pnpm guard:playground` | Points the CLI at the Vite playground and asserts what the recording says. Starts and stops the dev server itself. |
| `pnpm --filter xray-playground-next build` | Asserts the client is absent from a production build. Run `build:webpack` too — the bundlers fail this differently. |

`guard:playground` checks properties rather than comparing against a committed baseline.
A baseline fails on any change, regression or not, and one recorded on a laptop can fail
in CI for reasons unrelated to the code. Each expectation in
`scripts/guard-playground.mjs` names the regression it catches; if you change a verdict
deliberately, change the expectation and say why.

When adding a check to any of the three, break the thing it guards and confirm it fails.
Every one of these has, at some point, passed while checking nothing.

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

The site runs the real engine on itself, and copies the client bundle out of the
installed package rather than a sibling build, so the live demo is exactly what a
user installing xray would get.

### One-time setup

**Publishing uses trusted publishing (OIDC), not a token.** npm is
[deprecating 2FA-bypass tokens](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/):
they stop bypassing 2FA for account changes in August 2026 and lose direct
publishing around January 2027. So there is no `NPM_TOKEN` anywhere in this repo.
`release.yml` authenticates with the OIDC token minted by `id-token: write`, and
npm attaches provenance attestations automatically.

Trusted publishing is configured per package, on a package that already exists,
so the very first publish has to come from a laptop. Once:

```bash
pnpm changeset:version   # 0.0.1 -> 0.1.0, writes CHANGELOG.md
pnpm release             # builds, then publishes with an interactive 2FA prompt
```

Commit that, then on npmjs.com open the package's **Settings → Trusted
publisher** and add:

| Field | Value |
|---|---|
| Provider | GitHub Actions |
| Repository | `stevenmckinnon/xray` |
| Workflow | `release.yml` |

Every release after that is automatic: changeset, release PR, merge, published.

Requirements the workflow already satisfies: `id-token: write`, Node >= 22.14,
and npm >= 11.5.1 (Node 22 ships npm 10, so the workflow upgrades npm first).

### Site deploys

The site is not deployed from CI. It depends on the published package like any
other consumer, so it has no build-time relationship with this repo and any
static host can build it: connect the repository, set the root directory to
`site`, done. No tokens, no ids.

The consequence worth knowing: the site tracks the last *release*, not the last
commit. A package change shows up on the site once it is published and the site's
dependency is bumped.

