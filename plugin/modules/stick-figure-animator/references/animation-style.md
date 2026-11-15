# Animation style and scene recipes

The goal is the energy of classic stick-figure action animation:
characters with weight and attitude, text that is a physical object, impacts you can feel,
and one clear idea per beat. It is an explainer, so every gag must carry the content.

## Contents
- [Principles](#principles)
- [Turning abstract ideas into action](#turning-abstract-ideas-into-action)
- [Scene recipes](#scene-recipes)
- [Text on screen](#text-on-screen)
- [Sound design](#sound-design)

## Principles

1. **Snap, then hold.** Moves take 4–10 frames (`SNAP` easing overshoots), then hold the pose
   10–30 frames so the eye reads it. Constant slow motion looks like a slideshow.
2. **Anticipation → action → reaction.** Crouch before a jump, wind up before a punch, flinch
   after a hit. Three keys: prepare (6–8 f), act (3–6 f), settle (10+ f).
3. **Impacts get the full treatment**, all on the same frame: `Burst` at the contact point,
   `hits` camera shake, `Dust` if it touches the ground, an SFX cue. Big ones also get a slam word.
4. **Physical text.** Titles fall letter by letter and land with dust; problem words drop on a
   character's head; a list item gets punched into place; a stamp hits the screen.
5. **Characters react.** Whoever is not acting idles (`idle`) and turns the head toward the action.
   Shock, facepalm, shrug, cheer: one clear emotion per beat.
6. **Gags with meaning.** The money wheel spins faster until the runner is flung off (a loop
   that can't last); a debt tower wobbles and collapses on its carrier; the hero kicks SWIFT off
   screen (bypassing a system); the hero grabs the animator's cursor and throws it (the ending).
7. **Colour = identity.** One colour per actor for the whole video, a label above the head the
   first time (and when it matters). Grey for generic or anonymous figures.
8. **Real people and violence.** Depict real people only as labelled generic figures (a name or
   country label), never their likeness. Keep violence cartoonish and off-body: the symbol
   shatters, the figure is launched off screen; no executions, blood or suffering.

## Turning abstract ideas into action

| Idea | Visual metaphor |
|---|---|
| a deal / agreement | two figures walk in, handshake + burst + "DEAL!" slam, clauses pop as numbered cards |
| a secret | TOP SECRET stamp; later the stamp is torn off |
| a cycle / feedback loop | a spinning wheel with the steps on it, a runner on top that speeds up |
| exploitation / imbalance | one figure carries heavy crates, the other hands back a single paper bill |
| growing debt / risk | a tower of bills held overhead, wobbling more and more, then collapsing |
| a big number | `countUp` in huge type, with a one-line caption saying what it means |
| a pattern repeating | camera pans across stations on one ground line, then zooms out: "SAME PATTERN" |
| protection breaking | a shield over a character cracks hit by hit (`Shield crack`) and shatters |
| frozen / blocked | the object gets encased in an `Ice` block |
| an alternative system | chains connecting nodes around the old centre, which gets kicked away |
| a promotion / upgrade | stamp "TIER 3" replaced by "TIER 1" + crown dropping on the object |
| a spiral / trap | rotating spiral that sucks the character in (scale↓ + rotate) |
| comparison | two bars growing side by side, then a slam with the verdict |
| advice / takeaways | the hero punches numbered cards into a column, one per line |
| historical flashback | sepia paper, dark-brown figures, then a page turn back to the present |

## Scene recipes

**Cold open (6–9 s).** Cursor enters, draws the hero (`draw` 0→1 while the cursor follows
head→torso→hands→feet), the hero blinks and looks around, the title letters fall one by one
(`fall` per letter, 3-frame stagger, a light shake per landing), a big symbol falls on the
hero who backflips away (`rot: -360`, SMOOTH), impact, subtitle slams in.

**Chapter card (2–2.5 s).** `chapter()` scene with the `CARD` SFX; the music changes style after it.

**Explainer with clauses.** Two actors + three `Card`s at the top (x 330/960/1590), each paired
with a prop that drops into the scene (shield, barrel, building) and a `pop` + `thud`.

**Station pan.** Stations at x = 960 + i·1920 on one ground line, 5–6 s each: setup (character
proud with its object) → threat flies in → impact → consequence card. Pan `cam.x` in 25 frames
between stations. Finish with a zoom-out on all of them and a slam.

**Data beat.** Chart in a white rounded box: polyline revealed over ~60 frames, an icon riding
the tip, slam of the key numbers above it, caption with the cause below.

**Lessons list.** Hero on the left; every 60–80 frames: crouch (wind-up) → `punchR` → card slides
in from the fist side; burst at the fist; cheer at the end; disclaimer in small grey text.

**Ending.** Flashback to the opening scene in sepia, a quote, page turn (clip-path sweep with a
shadow edge), "the page turns" line, the cursor comes back, the hero jumps, grabs it, throws it
off screen, waves; credits.

## Text on screen

- One idea per text element; a sentence ≤ ~12 words; numbers big and alone.
- Reading time: at least ~0.3 s per word plus 0.5 s; a slam word needs ~1 s on screen.
- Keep text away from where the action happens (top band for titles/cards, bottom band for
  captions). Check overlaps on the contact sheet (see pitfalls.md).
- If the video has captions (`captions: true`) keep the bottom ~140 px free of other text.
- Credit the source of the content in the end titles (and in the description of the video).

## Sound design

Every visible event gets a sound on the same frame: walk-ins → `whoosh`, cards → `pop`,
landings → `thud`, hits → `impact`/`punch`, slam words → `slam`, money → `kaching`,
breaking → `shatter`, freezing → `freeze`, page turn → `page`, gags → `boing`.
Volumes: background details 0.3–0.5, normal events 0.6–0.8, the big hit of a scene 1.0.
Don't stack more than ~3 sounds in the same 5 frames.
Music styles for gen_audio.py: `intro` (light), `play` (bouncy, default), `tense` (minor, driving),
`mystery` (minor, hypnotic), `hope` (warm), `finale` (slow, no drums), `card` (silence + hit).
One style per chapter; `card` for every chapter card.
