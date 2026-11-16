# Third-party notices

This module is part of Cadence, under the Cadence license (`LICENSE.txt` at the Cadence root). It includes or builds on:

| Part | Where | Origin | License |
|---|---|---|---|
| Talking-head prep scripts (`clean_audio.sh`, `common.py`, `lines.py`, `tighten.py`, `cut.py`, `qa.py`), adapted | `talking-head/prep/` | [nicolapocock/claude-reel-editor](https://github.com/nicolapocock/claude-reel-editor) © 2026 Nicola Pocock (getgitgirl) | MIT — `talking-head/prep/LICENSE-claude-reel-editor` |
| Playfair Display, Manrope, JetBrains Mono (woff2 subsets) | `engine/fonts/` | Google Fonts / their authors | SIL Open Font License 1.1 — `engine/fonts/OFL.txt` |
| Playwright (installed by `module_setup.py install reels-crafter`) | `node_modules/` | Microsoft | Apache-2.0 |
| three.js (installed by `module_setup.py install reels-crafter`) | `node_modules/` | three.js authors | MIT |
| faster-whisper, NumPy, OpenCV (installed into the venv) | data folder | their authors | MIT / BSD / Apache-2.0 |

Not included, installed by the user if they want it: FFmpeg.

