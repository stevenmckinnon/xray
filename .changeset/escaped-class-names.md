---
'@stevenmckinnon/xray': patch
---

Stop inventing axes from Tailwind's escaped class names.

Tailwind escapes the punctuation in its variant classes, and the selector parser
stopped at the backslash — reading `.md\\:ms-4` as a class called `md`, and
`.hover\\:bg-red-500` as `hover`. Unrelated selectors collapsed into one
condition, so a page using Tailwind could grow an axis that exists nowhere in its
stylesheet.

`diagnose().dismissedAxes` now lists only near misses rather than everything the
threshold rejected, which on a Tailwind page was dozens of single-token entries.
