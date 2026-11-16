# Cadence 1.10.2

Archive SHA256: de09c76fcacb10daebe7bca5efb6daaf0fbed6a14c426c7d4debcfa8e10e698a. 1586 payload files. Source tag `cadence-1.10.2`. Same tree in `plugin/`.

Changes: the animation engine ships as `engine/lib/cadence-tween.min.js` (same bytes, Cadence Tween 1.1.0), so the HyperFrames project check before every render skips it as a vendored build; renders are 0.1 s faster. Changed heavy module parts are in the GitHub release `modules-1.10.2`, the rest stay in `modules-1.10.1` and `modules-1.10`.

Passed: release verify; fresh install; update contract from 1.6, 1.6.1, 1.7, 1.8, 1.9, 1.9.1, 1.9.2, 1.10 and 1.10.1 to 1.10.2 with each release's own updater; all 18 module payloads downloaded and checked by SHA-256; dev tests and smoke tests of the 7 affected modules; frame parity sample of 10 compositions against the GSAP reference; alternating render benchmark at parity or faster than the reference.
