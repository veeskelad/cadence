
# orbit-reel (справка по приёму)

Когда: Portrait image cards travel around the speaker in a 3D ring, passing behind the head and across the foreground. Use to apply this specific portrait-video treatment.

Apply this treatment to a portrait clip using the included 4.2-second, 1080x1920, 30fps starter. The style and images are independent of the sample speaker’s words; follow the user’s chosen topic.

## Use

Run from the Cadence root (module dependencies and the engine are installed once with the person's consent):

```bash
python3 modules/video-editing-skills/styles/orbit-reel/build.py work/<project>/orbit-reel.json
```

A spec is required: the module ships no sample photos or footage, so give your own files under `assets` with the keys listed below (see `example.json`). `--prepare-only` builds an editable composition without rendering. Python 3.9+, ffmpeg/ffprobe and Node.js 22+ are required. GSAP comes from the module dependencies, rendering uses the shared Cadence engine. No transcript or API key is needed for these short templates. The result lands in `work/<project>/out/`. [Spec and your own footage](five-photo-styles.md).

## Adapt the treatment

Maintain a single preserve-3d scene with perspective and a frame-matched alpha presenter at z=0. Cards with negative z pass behind the speaker; positive-z cards pass across the foreground. Keep both base video and cutout on the same source offset. The example uses eight cards, a 570px horizontal orbit and 290px depth; adjust the ring to the new speaker crop. Every card’s initial pose must use an explicit timeline position of 0, so all cards exist on frame zero.

Asset keys: `banana-heels.jpg`, `blue-stairs.jpg`, `cactus.jpg`, `explainer.mp4`, `explainer_cut.webm`, `pixel-burger.jpg`, `pixel-fruit.jpg`, `red-stairs.jpg`.

Supply a same-size, frame-matched alpha cutout when changing the presenter. `kit/cutout.py` can create it; see [five-photo-styles.md](five-photo-styles.md). Inspect hair and hands over both bright and dark imagery. The build helper does not perform segmentation automatically.

Keep the presenter visible from the first result frame. Use sharp photographs and clean type. Essential text and the face should clear platform overlays; let decorative imagery bleed rather than shrinking the entire composition. The sample’s captions and image anchors are starting points, not automatic tracking.

## Review and deliver

The helper validates media dimensions/duration, prepares the composition, runs the renderer check, renders and fully decodes the MP4. Inspect the first frame, the main change and the ending. Check crop anchors, text readability and matching source/cutout timing. The default is silent; preserve or add speech, SFX or music only when the user requests them. Longer edits require extending the HTML timeline and source windows; changing only the duration is insufficient.
