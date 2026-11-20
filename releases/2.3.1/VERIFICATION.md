# Cadence 2.3.1

Archive SHA256: 9fc4e4cb573135dbfae3a110f022289527e063261c2a9af1685dc73c1062cca0. 1613 payload files. Source tag `cadence-2.3.1`. Same tree in `plugin/`.

Heavy module parts stay in the GitHub release `modules-2.0`: no module package changed.

Passed: release verify (1613/1613 hashes, skill mirrors identical); `tests/release_install_check.py` 2.3 → 2.3.1; dev tests (two `test_internal_boundary` checks need external `dist/` checkouts, same as on the previous main); site tests and install-prompt smoke. Changes: board explainer enters and leaves with motion (hook in motion on frame 0, last scene leaves item by item), softer scene changes, `--fps 60`, amount field sized by the widest value with currency, explanation scenes on one centred axis with the stamp under the card, scene labels by film language, stricter `board-check`.
