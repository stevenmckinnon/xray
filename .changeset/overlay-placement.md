---
'@stevenmckinnon/xray': patch
---

Fix overlay placement.

The panel now sits next to the element it describes instead of docking to a screen
edge, and it can no longer run off the bottom of the window — its height is
measured rather than guessed at.

Scrolling repositions the panel instead of re-rendering it, so scrolling the page
no longer discards the panel's own scroll position.
