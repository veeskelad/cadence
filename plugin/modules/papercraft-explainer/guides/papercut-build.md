# Papercut build

Когда: пора собрать эпизод по раскадровке: создать проект, сцены, звук, отрендерить mp4 или переделать одну сцену.

Build every episode on the library instead of writing a project from scratch. Read `library/README.md` once. The episode is a React composition rendered by the Cadence engine (HyperFrames, `engine/`).

## Preflight

- Install: **Standard** or Full. Needs the library and its packages (`python3 scripts/module_setup.py install papercraft-explainer`), the Cadence engine (`python3 scripts/engine_setup.py status`), node 22+, ffmpeg, Python tools (numpy, Pillow, soundfile) and Chrome or Chromium for the audio render. Probe with the commands in `papercut-explainer`; if something is missing, see `papercut-setup.md`.
- Library: `$PAPERCUT_LIB`, which is `modules/papercraft-explainer/library` (absolute path) in Cadence. With no library at all, build from the sketches in `frame-recipes.md`.
- Time comes only from `useCurrentFrame()` of `@cadence/frame` (the kit's `frame.tsx`): no CSS animations, no animation libraries.
- Needs `papercut/STORYBOARD.md` and `narration/script.json` from the earlier stages.
- Smoke test of the whole toolchain: `library/tools/selftest.sh` builds `examples/hello-reel/` in a throwaway folder and renders one still.

## 1. Scaffold

```
$PAPERCUT_LIB/new_episode.sh <series-dir> NN-slug CompId [out-name]
```

It creates `<series>/episodes/NN-slug/{research,narration/voice,papercut}` with the template project and a synced copy of the kit in `src/lib/`. `node_modules` is a link to the library's `papercut/hyperframes/node_modules` (React, esbuild, TypeScript), so a project installs nothing. If `<series>/papercut-assets/` exists, it is laid over the default textures and props.

The folder may already exist, because the earlier stages wrote `research/`, `narration/script.json` and `papercut/STORYBOARD.md` into it. The script merges into it and never overwrites a file that is there. It stops only if `papercut/src/lib/SYNCED.txt` exists (already scaffolded).

Never edit `src/lib/` in a project. It is a snapshot, so an old episode renders the same after the library changes. Fix the library, then re-sync with `papercut/sync_kit.sh`.

## 2. Plan: `episode.json`, voice, timing

From the storyboard, fill `papercut/episode.json`:
- `scenes`: `[["S01Hook", "l1_hook", 0], ["S02Name", "l2_name", "called"], ...]` (scene id, narration line id, first word as an index or the exact word).
- `banners`: `{"S01Hook": "TAKEAWAY IN CAPS"}`. `hook`: see `papercut-hook`. `cuts`: the Camera / Cut table's cut column. `bed`, `whipScene`, `cutSfx`, `gaps` (extra beat after a line, in seconds).

Then run `papercut-voice` through its timing step (it ends with `build_vo.py` and `timing_md.py`). Then, from `papercut/`:

```
python3 $PAPERCUT_LIB/papercut/stubs.py        # src/scenes/index.ts + a stub per scene
```

`build_vo.py` flags any scene under 1.2 s; merge it into a neighbour. `timing_md.py` writes the Timing section of `STORYBOARD.md` (absolute frames and word cues), so agents never open `plan.json`.

## 3. Assets

Follow `asset-prompts.md`: an image tool (anything that outputs transparent PNGs) for backgrounds and complex static props, code for characters, all text, tags, gauges, buttons and UI. No text inside generated images. With no image tool, build every prop in code with the paper filter; the style holds up. Backdrops: use the library's `<Backdrop>` set (`library/papercut/public/bg/backdrops/_sheet.jpg`); generate a new one only when an episode needs a place the library lacks. The proof screenshot: `node $PAPERCUT_LIB/tools/capture.mjs <url> public/proof/x.png`, shown with the kit's `RealShot`.

## 4. Scenes

1. Build `S01Hook` yourself first, from the HOOK block. It is the reference scene the agents match (cue constants, the camera, clamped `interpolate`).
2. Hand the rest to scene agents in parallel, grouped by scene (2-3 scenes each; more agents cost more startup context). Any general-purpose agent works: give it the brief and tell it to follow `library/papercut/AGENT_BRIEF.md`, touching only the files it owns and checking its own work. **If you cannot spawn subagents, build the scenes yourself one at a time**, in the same order and with the same brief; it is slower, not different. The brief is `library/papercut/AGENT_BRIEF.md`. The spawn message gives the project path, each agent's scenes with absolute frame ranges, a QA folder name and the value of `$PAPERCUT_LIB`.
3. File ownership: an agent writes only `src/scenes/<Scene>.tsx`, an optional `<Scene>.parts.tsx` and `tools/cue_sheet.d/<Scene>.json`. Never `src/lib/**`, other scenes, `index.ts`, `plan.json`, `episode.json` or the storyboard.
4. Agents read `library/papercut/CATALOG.md` and `library/audio/CATALOG.md`, not the kit source, and reuse components, prop sets and scene templates (`kit/scenes/`, for example `CtaPhoneDM` for the CTA) before drawing anything new.

Build rules: 1080x1920, 30 fps, scenes chained in the kit's transition series. Global layers: the taped banner with `<Boil>`, `<WordTagCaptions>`, `<GrainOverlay>`. Every prop is wrapped in `<Paper>`, entrances use `<PopIn>`, each scene runs inside its storyboard camera. No CSS animations. The composition is silent: VO, music and effects are mixed by `tools/mix.py` and muxed in by `render.sh`. Keep the bottom 20% clear. Neighbouring scenes never share a backdrop. The default hero is a boxy orange critter (token `C.hero` `#D67354`, shade `C.heroLo` `#A9553B`, alias `you`); accessories and name pills tell the cast apart.

## 5. Sound

Pick SFX by name from `library/audio/sfx/*.js` and the bed by preset from `library/audio/beds/*.json`. From `papercut/`:

```
python3 $PAPERCUT_LIB/tools/cues.py && node $PAPERCUT_LIB/audio/render.mjs
```

`cues.py` merges the agents' rows into `tools/cues.json` and prints a note if air sounds exceed one per 2.5 s. `render.mjs` writes `public/audio/music.wav` and `fx.wav`.

## 6. Render

Preview: stills with `$PAPERCUT_LIB/tools/qa.sh NAME` (see `papercut-qa`), or the engine's live preview of the built project (`node $PAPERCUT_LIB/papercut/hyperframes/build.mjs . --out out/hf`, then `npm --prefix <cadence>/engine run preview -- "$PWD/out/hf"`). Render only when asked:

```
$PAPERCUT_LIB/tools/render.sh        # -> out/<out>.mp4
```

Flags: `--workers N` (Chrome workers inside each engine render, default 1), `--force`. The project is built into `out/hf` and each scene is an engine render of its span, cached in `out/cache/seg/`, so after a fix only the changed scene re-renders; a change to the kit, plan, voice or captions re-renders everything. The engine renders one job at a time per user and waits for any other render on the machine.

To fix or rebuild one scene: edit `src/scenes/<Scene>.tsx`, check it with `papercut-qa`, then run `render.sh` again.

## 7. Harvest (after the episode)

```
python3 $PAPERCUT_LIB/tools/harvest.py .       # from papercut/; read-only report
python3 $PAPERCUT_LIB/tools/catalog.py         # regenerate both catalogs
```

Promote kit fixes, reusable components, new SFX and recurring beats as `library/HARVEST.md` describes, and add an entry to `library/CHANGELOG.md`.

- When a move looks stiff or muddy, check `motion-principles.md` for the matching principle and its kit helper.

## Hand-off

Next is `papercut-qa`, which reads stills from the project and `STORYBOARD.md`. Run it per scene while building and once on the whole reel before the final render. After posting, `papercut-strategy` runs the autopsy.
