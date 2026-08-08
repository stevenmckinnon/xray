# @stevenmckinnon/xray

## 0.1.0

### Minor Changes

- cc7a870: First release.

  A dev-time overlay that maps an element's computed styles back to the design
  tokens they came from, and flags the values that only resolve correctly in the
  variant you happen to be looking at.

  Tokens resolve by probing the browser rather than by evaluating CSS, variant axes
  are discovered from the stylesheet instead of configured, and the cascade is
  modelled so authored values can be told apart from computed ones. Ships a Vite
  plugin and a standalone client bundle for embedding directly.
