# Cadence 2.3.2

Archive SHA256: 8df997598d81e53d42885d769e7ba4468f29d58a414528d53a6f985a4db861c4. 1614 payload files. Source tag `cadence-2.3.2`. Same tree in `plugin/`.

Heavy module parts stay in the GitHub release `modules-2.0`: no module package changed.

Passed: release verify (1614/1614 hashes, skill mirrors identical); `tests/release_install_check.py` 2.3.1 → 2.3.2; dev tests (two `test_internal_boundary` checks need external `dist/` checkouts, same as on the previous main); site tests and install-prompt smoke. Changes: board explainer scene changes in one motion without two scenes on top of each other (sequential `push`, narrow `tear` wipe), next scene arrives already assembled, scenes centred on the frame within the safe zone, typed text reserves its space, new checks in `board-check` (empty screen, blink, off-centre, overlapping scenes) and new `video-check` for finished MP4 (flash, full-frame dim, blink).
