---
'@stevenmckinnon/xray': patch
---

Point xray at its own playground in CI, and check what it reports.

End to end, with nothing mocked: the Vite plugin stamps source locations, the client
resolves tokens by probing a real browser, the CLI drives Playwright and writes a
recording, and ten expectations assert the recording says what a working engine would
say about a page built to be got wrong.

Properties rather than a committed baseline. A baseline fails on any change whether or
not it is a regression, and one recorded on a developer's machine can fail in CI for
reasons unrelated to the code. Each expectation names the regression it catches — two of
them cover bugs that unit tests missed and the fixtures found: locked spacing values,
which disappeared while `space` scored as a weak affinity, and axis discovery, which the
escaped class-name bug corrupted.

The interesting ones are the properties no unit test can reach: the same CSS class
resolves to a different token inside a nested density provider, and shadow-root content
is swept and attributed to the line where the custom element is used rather than to
where its internals were built.

Verified by breaking the engine three ways and confirming the right expectations fail —
disabling axis discovery trips five of the ten, skipping shadow roots trips exactly one.
