
# shape-shift (справка по приёму)

Когда: A photographic match cut aligns circular subjects at one fixed anchor while the speaker stays established below. Use to apply this specific portrait-video treatment.

Apply this treatment to a portrait clip using the included 4.2-second, 1080x1920, 30fps starter. The style and images are independent of the sample speaker’s words; follow the user’s chosen topic.

## Use

Run from the Cadence root (module dependencies and the engine are installed once with the person's consent):

```bash
python3 modules/video-editing-skills/styles/shape-shift/build.py work/<project>/shape-shift.json
```

A spec is required: the module ships no sample photos or footage, so give your own files under `assets` with the keys listed below (see `example.json`). `--prepare-only` builds an editable composition without rendering. Python 3.9+, ffmpeg/ffprobe and Node.js 22+ are required. Animation runs on the Cadence Tween engine shipped with Cadence, rendering uses the shared Cadence engine. No transcript or API key is needed for these short templates. The result lands in `work/<project>/out/`. [Spec and your own footage](five-photo-styles.md).

## Adapt the treatment

Align the circular subject in every replacement photograph to the same anchor in `#photo-stage`. The example moves from an orange slice to a record and camera lens. Adjust each image’s width, left and top together; swapping an image without re-aligning its circle breaks the match cut. The speaker is a continuous alpha layer below the photographic panel.

Asset keys: `camera.jpg`, `explainer_cut.webm`, `orange.jpg`, `record.jpg`.

Supply a same-size, frame-matched alpha cutout when changing the presenter. `kit/cutout.py` can create it; see [five-photo-styles.md](five-photo-styles.md). Inspect hair and hands over both bright and dark imagery. The build helper does not perform segmentation automatically.

Keep the presenter visible from the first result frame. Use sharp photographs and clean type. Essential text and the face should clear platform overlays; let decorative imagery bleed rather than shrinking the entire composition. The sample’s captions and image anchors are starting points, not automatic tracking.

## Review and deliver

The helper validates media dimensions/duration, prepares the composition, runs the renderer check, renders and fully decodes the MP4. Inspect the first frame, the main change and the ending. Check crop anchors, text readability and matching source/cutout timing. The default is silent; preserve or add speech, SFX or music only when the user requests them. Longer edits require extending the HTML timeline and source windows; changing only the duration is insufficient.
