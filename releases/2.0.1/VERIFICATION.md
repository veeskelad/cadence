# Cadence 2.0.1

Archive SHA256: df6a1a6150060a00ba0d96586a79cde5dde48a14e4f898db37955221728a6754. 1586 payload files. Source tag `cadence-2.0.1`. Same tree in `plugin/`.

Heavy module parts stay in the GitHub release `modules-2.0`: no module package changed.

Passed: release verify (1586/1586 hashes, skill mirrors identical); fresh install with 2.0.1 code; update 2.0 → 2.0.1 with the update code of 2.0 itself (old release kept, receipt switched); a 2.0 plugin install sees `plugin-update`; dev tests; site tests (copy, landing contract, current archive, plugin version, install-prompt smoke 14/14). Update from older releases uses the same install code as 2.0, which was checked from every release in `tested_update_from` on 17.11.
