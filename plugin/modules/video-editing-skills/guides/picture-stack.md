
# picture-stack (справка по приёму)

Когда: A small cluster of photographs floats above the speaker in the original room, then one photograph takes focus. Use to apply this specific portrait-video treatment.

Apply this treatment to a portrait clip using the included 4.2-second, 1080x1920, 30fps starter. The style and images are independent of the sample speaker’s words; follow the user’s chosen topic.

## Use

Run from the Cadence root (module dependencies and the engine are installed once with the person's consent):

```bash
python3 modules/video-editing-skills/styles/picture-stack/build.py work/<project>/picture-stack.json
```

A spec is required: the module ships no sample photos or footage, so give your own files under `assets` with the keys listed below (see `example.json`). `--prepare-only` builds an editable composition without rendering. Python 3.9+, ffmpeg/ffprobe and Node.js 22+ are required. GSAP comes from the module dependencies, rendering uses the shared Cadence engine. No transcript or API key is needed for these short templates. The result lands in `work/<project>/out/`. [Spec and your own footage](five-photo-styles.md).

## Adapt the treatment

Keep the original room and speaker continuous. Three photographic cards collect above the head; at 2.05s the first two leave and the third grows into the focus image. Tune `#p0`, `#p1`, `#p2` and `#q1` in the template. Preserve visible headroom and use small, purposeful rotations.

Asset keys: `banana-heels.jpg`, `explainer.mp4`, `pixel-burger.jpg`, `pixel-fruit.jpg`.

This style uses the original room and requires no alpha cutout.

Keep the presenter visible from the first result frame. Use sharp photographs and clean type. Essential text and the face should clear platform overlays; let decorative imagery bleed rather than shrinking the entire composition. The sample’s captions and image anchors are starting points, not automatic tracking.

## Review and deliver

The helper validates media dimensions/duration, prepares the composition, runs the renderer check, renders and fully decodes the MP4. Inspect the first frame, the main change and the ending. Check crop anchors, text readability. The default is silent; preserve or add speech, SFX or music only when the user requests them. Longer edits require extending the HTML timeline and source windows; changing only the duration is insufficient.
