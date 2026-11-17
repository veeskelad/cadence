# Effects catalogue

Every effect is a key in `reel.json`; exact fields are in `guides/reel-builder.md`.

| Effect | Key | What it does |
|---|---|---|
| Cover story + frame break | `cover` + segment `cut` | magazine masthead, letters drop in, the person stands in front of the title (macOS Vision mask) |
| Orbit | `orbit` | a phrase circling the head; the back half passes behind the person |
| Doodle boil | `doodles` | handwritten notes written on stroke by stroke, wobbling every 3 frames |
| Strike-through | `doodles` kind `strike` | crossing out a price or a promise |
| Headline wall | `wall` | tiles (file names, headlines, notifications) pile up |
| Glass type | `glass` | a title on frosted glass over the footage |
| Black and white + stamp | `look: "bw"` + `stamps` | "someone else's story"; music muffles |
| Checklist | `checklist` | steps tick on as they are said; replaces subtitles while up |
| Zoom-through cut | segment `in: "zoom"` or `"whip"` | the outgoing shot rushes in, the next lands from a zoom |
| End card | `end` | question + call to action + handle over a calm final shot |

Also built in: hook card (`hook`), subtitles with accent words (automatic from `script`), punch-ins on accent words (`punch`, automatic), grey → colour burst (`look: "burst"`), photo montage with camera date stamp (`look: "memory"`, `date`), slow push / tilt / pull-out moves, slow motion (`rate`), crop punch-ins (`crop`).

## Choosing effects
Use 3–5 per reel, each on the beat it explains — see the table in `guides/reel-director.md`. Effects must read at phone size on the first watch.

## Not built yet
couch wall · UI world · phone mockup · green screen · paper cut · vertigo (dolly zoom) · chart grow as an engine key.

## Typewriter, counter, timeline (v0.2.1)
Visualise what the voice says: `type` types a prompt into a chat bar ("I typed one sentence"), `counter` counts a number up ("a hundred tiny rules"), `timeline` drops the spoken words onto an editor timeline with cut marks ("cuts them to my words"). Keys: guides/reel-builder.md.
