# Assets

Where the picture comes from when the speaker's line needs one. The order below
is the order to try. Stop at the first rung that gives a real answer; do not
generate what already exists.

Never ship a placeholder. A missing asset costs a few seconds; a fake one costs
trust (`rules/proof.md`).

---

## The order

| # | Source | Use it when |
|---|---|---|
| 1 | **Real proof**: capture the actual page | The line names a repo, product, page, number or tweet. Always first. 9:16 pieces are captured in mobile view (`rules/proof.md`). |
| 2 | **Reference clips**: a folder of reference reels the person keeps | A reference reel already shows the screen you need. Screens only, never the other creator's face (`rules/proof.md`, "Borrowed B-roll"). |
| 3 | **Designed scenes**: a flick pattern as a React scene first, a HyperFrames card second | The line describes structure with no real artefact: a mechanism, a comparison, a counter, a payoff. `rules/scenes.md`. |

Generated pictures and video are not part of this module (ask the `cadence-generate` skill). Reaching for them to avoid
looking something up breaks rung 1.

---

## 2. Reference clips

`reel-refs/INDEX.md` lists every reference reel with its media directory. Before
building a beat that wants a screen, check whether a reference already has it.

- Use only windows where the other creator is **not** in frame. Map their
  presence across the whole clip first; the head arrives in the last frames,
  which a spot check at t=0.5 misses. The method is in `rules/proof.md`.
- Crop out any watermark or handle.
- If no clean window exists, the clip is not usable. Move down a rung.

## 3. Designed scenes

**Flick first.** A flick scene pattern, adapted as a React scene, beats a
hand-built HyperFrames card on this material, and it carries the real vendor
logo with a palette taken from it. HyperFrames renders everything: the scenes,
the composition, captions and the simple band and hook cards.

- Write each scene as a React component on `@cadence/frame` (`scripts/scenes.py`, `rules/scenes.md`).
- Panels render to `studio/assets/panels/*.mp4`: 1080×960 half panel,
  1080×1920 full frame.
- A card naming a product carries that product's real logo. No logo and no
  site: the profile palette, never an invented one.
- Hook effects live in `templates/hook/` (shatter text) and `scripts/grade.py`
  (`loss_red` window). Shatter text is a HyperFrames overlay on purpose: it is
  text over the face inside the composition (hard rule 20), not a designed
  scene, so flick-first does not apply to it.

## 4. Generated stills and video

Not in this module. Nothing real and nothing designed fits: say so and ask for the `cadence-generate` skill instead of faking a screenshot.

---

## Naming an entity: face, then logo, then icon

When a hook, headline or card is about a named company, product or person, the
visual for it comes from this ladder. Take the first rung that is suitable.

| # | Visual | Suitable when |
|---|---|---|
| 1 | **A person's face**: the recognised public face of that entity | A clear, front-facing, well-lit photo exists, it reads at 120 px, and the person is genuinely the face of the thing (founder, spokesperson). |
| 2 | **The logo** | No suitable face, or the face would imply the person said or endorsed something. The real vendor mark, never a redraw. |
| 3 | **An icon** | The logo is unusable (a wordmark too wide for the slot, an unreadable mark at small size). A neutral concept icon from `scripts/icons.py`: a key for API keys, a clock for a limit. |

Used on the last reel: nvidia-nim final-v6 took rung 3 (a key icon) for "free
LLM API". For Anthropic, rung 1 is the photo registered in
`assets/people/` (see below).

**Rules for rung 1, because a real person's face is the riskiest asset here:**

- **The mapping is the user's call, never inferred.** Do not work out who is in
  a photo from the face. A face is registered for an entity only when the user
  has said which entity it stands for, in `assets/people/manifest.json`, along
  with where the photo came from.
- **Source and licence are recorded**, or recorded as unknown. Unknown is
  allowed to be used only because the user supplied it; it is never presented
  as cleared.
- **It must not imply the person said the line.** A face beside a headline
  reads as an endorsement or a quote. Keep it as a small chip next to the
  entity name, never a full-frame portrait under their own words, and never
  with text that reads as theirs.
- **Crop, do not alter.** No generated, retouched or composited faces. A
  generated face standing in for a real person is fabrication
  (`rules/proof.md`).
- **If the photo is poor, drop to rung 2.** Low resolution, a hand or object
  covering the face, a profile angle, or a background too busy to crop to a
  circle all count.

The headline chip, entity beats and logo cards all take their accent colour
from the mark that won the ladder.

---

## Standing constraints

- **Memes are desi only**: memes.co.in (Paresh Rawal, Amrish Puri), never US
  meme culture. Crop the bottom-left watermark.
- **Dwell time**: nothing on screen under 1.5s or over 3s.
- **Nothing is added unprompted**: no captions, GIFs or cards the user did not
  ask for.
- **Sound mixes in ffmpeg**, never inside HyperFrames (`rules/sound.md`).
