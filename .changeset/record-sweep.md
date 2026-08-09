---
'@stevenmckinnon/xray': minor
---

Add `__xray.record()`: sweep a whole page instead of one element.

Findings are aggregated by the source location that produced them, so the output
is a work list per file rather than a pile of DOM nodes. `__xray.report()` renders
the same data as text.

Elements are sampled per source location — the fiftieth row of a list is the same
JSX line as the first — and token resolution is already cached per theme context,
which is what keeps a full sweep in the tens of milliseconds.

Also exposes `diffRecordings()` and `diffFails()` for comparing a sweep against a
committed baseline. Identity is file-level and ignores line numbers, so a baseline
survives editing the file it describes.
