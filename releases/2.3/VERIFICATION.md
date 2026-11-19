# Cadence 2.3

Archive SHA256: 63e56c301de5df486f5fbc1244597a374934a1e2c5230b983de6a8e0a2e61fe6. 1613 payload files. Source tag `cadence-2.3`. Same tree in `plugin/`.

Heavy module parts stay in the GitHub release `modules-2.0`: no module package changed.

Passed: release verify (1613/1613 hashes, skill mirrors identical); `tests/release_install_check.py` 2.2 → 2.3; dev tests (two `test_internal_boundary` checks fail the same way on the previous main: they compare against external source checkouts); site tests and install-prompt smoke. Changes: board explainer over footage (`film.over`, per-scene `safe`, `film.exit`, scene length check), `board-check` layout check, stamps off text, proof inserts rise in and fly out, `cadence-motion` asks for style and additions when none is given.
