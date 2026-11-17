
# storytelling (справка по приёму)

Когда: Edits a talking-head clip into a storytelling reel. Three simple image cards run across the top, with a bold black-box title and a small white subtitle under them, all landing together over one continuous take with simple TikTok-style captions (white, black outline, 1 to 3 words). Use when asked for a story or proof reel, "three images and a title", or a lead-magnet style edit on a 9:16 clip.

```
┌──────────────────────┐
│ [4:12] [cover] [comments] │  three cards, all at once
│  I made this carousel │  black-box title, 1-2 lines
│   in a few minutes    │
│ and it's doing well   │  small white subtitle
│        (face)         │  one continuous take, punched in a little
│     entire carousel   │  TikTok captions
└──────────────────────┘
```

## First use
Variables (from the Cadence root). The module is installed once, with the person's consent: `python3 scripts/module_setup.py install video-editing-skills`.
```bash
KIT="$(pwd)/modules/video-editing-skills/kit"
SKILL_DIR="$(pwd)/modules/video-editing-skills/styles/storytelling"
PY="$(python3 scripts/module_setup.py python video-editing-skills | python3 -c 'import json,sys;print(json.load(sys.stdin)["python"])')"
```
Words are transcribed locally with Whisper (no key, no network). The model is read from disk; downloading it needs `ALLOW_MODEL_DOWNLOAD=1` in front of the command (or `kit/transcribe.py --allow-download`) and the person's consent. Rendering uses the shared Cadence engine (`python3 scripts/engine_setup.py status`). Needs ffmpeg and Node.

## Steps
1. **Clip.** Any 9:16 talking head.
2. **Words.** Run `"$PY" "$KIT/reel.py" words <video>`. It prints one sentence per line with `[ends …]` (when its last word ends), so use that as `end`. Pick ONE continuous stretch of 4 to 8 seconds that tells a small story or shows proof. Don't stitch pieces together, because the jump cuts read as weird here.
3. **Spec.** Write `<clip>.storytelling.json` (below). Paths in a spec are relative to the spec file. The three cards are the story in pictures: the effort, the thing and the result.
4. **Build.** Run `"$PY" "$SKILL_DIR/build.py" <spec.json>`.
5. **Check.** Look at `<out>.sheet.jpg`:
   - The cards and title clear the top 220 px.
   - The captions don't cover the mouth (move `caption_top`, 1385 by default).
   - The title fits on its lines.
6. **Hand over** the mp4 path.

## Spec
```json
{
  "video": "my-clip.mp4", "start": 42.3, "end": 47.8,
  "zoom": 1.3,
  "cards": [
    {"type": "stat", "label": "TIME SPENT", "value": "4:12", "unit": "minutes"},
    {"type": "cover", "image": "my-photo.jpg", "text": "the best *ai tools*\nto use when\nyou're *young and broke*"},
    {"type": "comments", "title": "Comments", "rows": [["sarah.creates", "CAROUSEL"], ["mike.builds", "CAROUSEL!!"]]}
  ],
  "title": ["I made this carousel", "in a few minutes"],
  "subtitle": "and it's doing extremely well"
}
```
`cards` takes exactly 3, each one of:
- **`image`**: `{"src": "photo.jpg"}`, a square photo.
- **`cover`**: a carousel cover, `image` plus `text` (`*word*` turns yellow, `\n` breaks the line). It drifts slowly.
- **`stat`**: `label`, `value`, `unit` and a ring.
  - The `value` counts up when it is a number (`"250"`, `"10,000"`) or a time (`"4:12"`).
  - `ring` (0 to 1) is how full the ring gets.
- **`comments`**: up to 4 `[handle, text]` rows.
- **`text`**: `{"big": "3×", "small": "more saves"}`.

The other fields:
- **`title`**: 1 or 2 lines, each about 22 characters at most.
- **`subtitle`**: one short line.
- **`zoom`**: how far the take is punched in. 1.3 by default, 1 for none.

## Taste
- Everything lands at once, in the first third of a second. Never one at a time.
- The title is the story in one breath. The subtitle is the payoff.
- Cards show real things: the user's own post, numbers, screenshots. Comment rows and handles must be real ones the user gave you. If they have none, use a `text` or `stat` card instead of inventing people.
