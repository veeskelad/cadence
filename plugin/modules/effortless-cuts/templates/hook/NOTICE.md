# Notice

Nothing in this directory is copied from a third-party source. `shatter.py` and
`demo.py` are original to this project; they follow the integration conventions
of `scripts/compose.py` (a CSS block, `<div class="clip">` elements, Cadence Tween
statements appended to `tl`).

Sources examined before writing code, and why none was copied:

| Source | Licence | File(s) examined | Outcome |
|---|---|---|---|
| a third-party motion-skill repository | MIT (Copyright 2026 Shunit Haviv Hakimi) | its skill file, `references/*.md`, `examples/*/styles.css`, `assets/sfx/*` | No shatter, split, glitch or kinetic-type code. Only SFX picks (`glitch_002`, `impactGlass_heavy_002`) that are Kenney-style audio assets, not code. Nothing copied. |
| Creatorberry/flick (`~/ai-me/research/flick`) | MIT (Copyright 2026 CreatorBerry) | all of `skills/flick/saved-animations/*`, `references/*` | No shatter, glitch or kinetic-type scene. Only a per-letter `split("")` in `SceneKarpathyGithubRepoHighlight.tsx`, unrelated. Nothing copied. |
| heygen-com/hyperframes registry block `vfx-shatter` | Apache-2.0 (repo LICENSE) | `registry/blocks/vfx-shatter/vfx-shatter.html` | Not used: a 1920x1080 WebGL/three.js "html-in-canvas" panel shatter that needs a WebGPU-flagged Chrome (`layoutsubtree`, `drawElementImage`), marked experimental. It cannot sit over a 1080x1920 face video or be placed by a zone box. Nothing copied. |

Source file -> our file: none.

Third-party runtime dependencies: none. Animation runs on Cadence Tween
(`engine/lib/cadence-tween.min.js`, copied next to the page by `compose.py`), rendering on
the shared Cadence engine (`engine/`).
