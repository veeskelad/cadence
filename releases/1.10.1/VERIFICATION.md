# Cadence 1.10.1

Archive SHA256: 264fd4d13a00422a1edf5a493ed6cf7e6010561f8768a80af5e8298ff7d420bd. 1586 payload files. Source tag `cadence-1.10.1`. Same tree in `plugin/`.

Changes: own animation engine Cadence Tween 1.1.0 instead of GSAP (pinned build with SHA-256 in `engine/lib/cadence-tween.version`); modules that used Remotion render with the shared HyperFrames engine; poster motion looks and ASCII render; HyperFrames 0.9.55. From this version Cadence is distributed under its own proprietary license (`LICENSE.txt`); releases up to 1.10 stay MIT. Changed heavy module parts are in the GitHub release `modules-1.10.1`, the rest stay in `modules-1.10`.

Passed: release verify; fresh install; update contract from 1.6, 1.6.1, 1.7, 1.8, 1.9, 1.9.1, 1.9.2 and 1.10 to 1.10.1 with each release's own updater; all 18 module payloads downloaded from the published releases and checked by SHA-256; dev tests; frame parity of 839 compositions against the GSAP reference (826 equal, 9 expected, 4 blank references, no new differences).
