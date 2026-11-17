
# ranking-list (справка по приёму)

Когда: Edits a talking-head clip into a tier-list ranking reel. An S-to-F tier table sits on the speaker's chest, each item pops up as it is named and drops into its tier when the verdict lands, with an orange title on top and spoken captions just under the chin. Use when asked for a tier list, a ranking reel or "rank these" on a 9:16 clip.

```
┌──────────────────────┐
│  BEST CONTENT FORMATS│  orange skewed title
│        (face)        │
│     at c tier        │  caption just under the chin
│ S ▓▓  ┌──────────┐   │
│ A     │ FACEBOOK │   │  item pops on the chest, then drops into its row
│ B     └──────────┘   │
│ … F                  │
└──────────────────────┘
```

## First use
Variables (from the Cadence root). The module is installed once, with the person's consent: `python3 scripts/module_setup.py install video-editing-skills`.
```bash
KIT="$(pwd)/modules/video-editing-skills/kit"
SKILL_DIR="$(pwd)/modules/video-editing-skills/styles/ranking-list"
PY="$(python3 scripts/module_setup.py python video-editing-skills | python3 -c 'import json,sys;print(json.load(sys.stdin)["python"])')"
```
Words are transcribed locally with Whisper (no key, no network). The model is read from disk; downloading it needs `ALLOW_MODEL_DOWNLOAD=1` in front of the command (or `kit/transcribe.py --allow-download`) and the person's consent. Rendering uses the shared Cadence engine (`python3 scripts/engine_setup.py status`). Needs ffmpeg and Node.

## Steps
1. **Clip.** A 9:16 talking head where the speaker names things and judges them ("carousels are S tier… reels, B").
2. **Words.** Run `"$PY" "$KIT/reel.py" words <video>`. It prints one sentence per line with `[ends …]` (when its last word ends). Find each item's name and its verdict. The item pops on its name and drops on its verdict. Pick a stretch that holds 1 to 5 items, and keep `end` at least 0.4 s after the last drop.
3. **Chin.** Run `"$PY" "$KIT/reel.py" frame <video> <t> frame.jpg` and read the y of the chin.
   - Set `caption_top` about 40 px under the chin.
   - Set `table_top` 80 px under that.
   - On a close-up (chin below about y 1150), use 3 or 4 `tiers` so the table stays above y 1500. The item card shrinks itself to fit.
   - Captions must never sit on the face.
4. **Spec.** Write `<clip>.ranking-list.json` (below). Paths in a spec are relative to the spec file. Times are seconds from `start`, or spoken words.
5. **Build.** Run `"$PY" "$SKILL_DIR/build.py" <spec.json>`.
6. **Check.** Look at `<out>.sheet.jpg`:
   - The caption is under the chin.
   - The table and items sit on the chest, above the red bottom zone.
   - Each drop lands on its verdict word.
7. **Hand over** the mp4 path.

## Spec
```json
{
  "video": "my-clip.mp4", "start": 0, "end": 7.1,
  "title": "BEST CONTENT\nFORMATS",
  "table_top": 1100, "caption_top": 1022,
  "items": [
    {"name": "CAROUSELS", "tier": "S", "pop": 0.06, "drop": "cheat", "images": ["c1.jpg", "c2.jpg", "c3.jpg"]},
    {"name": "REELS", "tier": "B", "pop": "twice", "drop": "reels", "icon": "play", "color": "#7a2fb0"}
  ]
}
```
- **`items`**: each item gets a `name` (keep it short and uppercase), a `tier` (S, A, B, C, D, E or F), and `pop` and `drop` times. Its picture is one of:
  - `images`: 2 or 3 images fan out, or 1 image fills the card.
  - `icon: "play"`: a reel icon.
  - nothing: just the name on a coloured card (`color`).
- Items in the same tier line up left to right in the order they drop.
- **`tiers`** (optional) replaces S to F: `[["GOAT", "#FF7F7F"], ["MID", "#FFDF7F"], ["NO", "#7FBFFF"]]`.

## Taste
- Pop on the name, drop on the verdict. If they are said together, drop 1 s after the pop.
- Title in 2 short lines, 2 to 3 words each.
- Logos and images must be ones the user is allowed to show. A plain name card is always fine.
