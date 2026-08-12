---
'@stevenmckinnon/xray': patch
---

Site: keep theme and density across the whole app, and make the demo panel a live report
of the page it is on.

The switches wrote `<html data-theme data-density>` and watched it for changes, so two
copies on one page agreed — but they never *read* it at mount. Each fresh copy started
from hardcoded defaults and wrote those out in an effect, so arriving on /docs, where the
sidebar mounts its own copy, silently reset the page to blueprint/regular. Nothing was
persisted either, so a reload lost the choice.

The attributes are now the store, since three things write them — both copies of the
switches and xray's own overlay chips — and none of them can be the owner. Everything
subscribes through `useSyncExternalStore`, which is the one hook that reads external
state during hydration without lying about it. A small inline script restores the saved
choice before the first paint, so there is no flash of the default theme, and the
`storage` event keeps two open tabs together.

The demo panel was a report captured from the playground: real output, but frozen, and
about a different design system than the page it sat on. It now inspects this page's own
`.btn-forked` with the client the layout already loads, and re-inspects when you flip
either switch. Flip density to tight and `height: 36px` stops being `--control-height`
and the verdict changes from locked to untokenized; flip to paper and the hardcoded dark
background becomes off-scale. The captured report is still what the server renders and
what stays if the client never arrives, so the panel is never blank and never a spinner.
