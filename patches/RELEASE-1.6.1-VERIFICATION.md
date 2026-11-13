# Cadence 1.6.1

Archive SHA256: e2d3f106984e3dbb7e74816dc0364a5d94c4ded84b9a8ece628d7e8cd83f9582. 523 payload files. Source tag `cadence-1.6.1`.

Changes: removed the Unbounded Vietnamese @font-face whose file was never shipped (engine check failed with 404 in the first-result guide since 1.5); update script reports malformed pointers without tracebacks; directory fsync is best-effort.

Passed: release verify; install contract from 1.6 (live), 1.5 and 1.4 to 1.6.1 (fresh, update, work preserved, old release preserved, no-op, fresh 1.6.1).
