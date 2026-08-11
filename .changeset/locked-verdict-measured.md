---
'@stevenmckinnon/xray': patch
---

Fix a false `locked` verdict on values whose token is pinned by a local override, and
stop the variant table coming from a different token than the message names.

Three bugs, one symptom. On the playground, `padding: 20px` inside
`.override { --salt-spacing-100: 20px }` was reported at high severity as "20px is
`--salt-spacing-250` at medium only … it renders wrong at high, low, mobile, touch". The
override pins the token to a literal, so that element renders identically at every
density and is correct everywhere.

- **The index cache could not see an override.** Its signature described which tokens
  were in scope, not what they resolved to, so a subtree that *replaced* a value without
  changing the token count produced a signature identical to the theme's and reused the
  theme's index. Overridable tokens — those declared by any rule that does not apply to
  the whole document — now contribute their values, and a per-element signature cache
  keeps that affordable.
- **Probing a variant discarded the override.** Values for other variants came from a
  wrapper *inside* the element carrying the axis owner's classes, which re-declared the
  theme below the override. When a token is overridden between the element and where the
  axis is declared, the variant is now applied to that ancestor instead — falling back to
  `documentElement`, so a page sitting at the base variant still gets probed correctly.
- **The name and the evidence could disagree.** `variantBreakdown` tried every
  exact-matching token and reported the first that moved, so the token in the message and
  the "renders wrong at …" list could belong to different tokens. It now measures the
  token it names, across every axis, rather than consulting the axis index — which also
  catches tokens that vary only through an indirection, like a spacing scale defined as a
  multiple of a density unit.

On the playground this corrects two findings from high severity to drift and fixes the
variant table on eight more; no finding is lost. Restricting the breakdown to the named
token without measuring turned 19 real locks into drift, so that path is measured
deliberately. A sweep costs about 20% more.
