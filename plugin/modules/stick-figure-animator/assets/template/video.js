import { COL, fill, interpolate } from "./stickman/fx.js";
import { Captions, ChapterCard } from "./stickman/common.js";
import { CARD } from "./sfx.js";
import { TIMELINE } from "./timeline.js";
import { S01Example, S01_SFX } from "./S01Example.js";

// Scene = { c: ({ f, from, dur }) => markup, from: global start frame, sfx?: [[frame, name, volume], ...] }
// f is the frame inside the scene (0 at its start), from and dur are its global start and length.

const chapter = (n, title, sub, from) => ({
  c: ({ f, dur }) => ChapterCard({ f, n, title, sub, dur }),
  from,
  sfx: CARD,
});

// Each scene lasts until the next one starts.
// WITH a voiceover: start scenes on timeline frames (a cue's startFrame) so the picture
// stays in sync with the voice. WITHOUT a voiceover: pick the starts freely (pacing is
// set by the animation and the on-screen text) and set DURATION below.
export const SCENES = [
  { c: S01Example, from: 0, sfx: S01_SFX },
  // chapter("CHAPTER 1", "Title", "subtitle", TIMELINE.chapters[0].startFrame),
];

// With a voiceover this must stay = the narration length. Without one, use the end of the last scene.
export const DURATION = TIMELINE.durationInFrames;

// Music gain at global frame f (render.mjs bakes it into the music track):
// fade in over 10 frames, fade out over the last 45, ducked to 0.4 while the narrator speaks.
const duck = (f) => {
  let g = 1;
  for (const c of TIMELINE.cues) {
    if (f < c.startFrame - 10) break;
    g = Math.min(
      g,
      interpolate(f, [c.startFrame - 8, c.startFrame, c.endFrame, c.endFrame + 10], [1, 0.4, 0.4, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    );
  }
  return g;
};
export const musicGain = (f, { music, voice }) =>
  music * (voice ? duck(f) : 1) * interpolate(f, [0, 10, DURATION - 45, DURATION], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

// One frame of the video (F = global frame). props: { captions } from render.mjs.
export const Video = (F, { captions = false } = {}) => {
  let i = 0;
  while (i + 1 < SCENES.length && F >= SCENES[i + 1].from) i++;
  const { c, from } = SCENES[i];
  const dur = (SCENES[i + 1]?.from ?? DURATION) - from;
  const scene = F >= from && F < from + dur ? c({ f: F - from, from, dur }) : "";
  return fill({ background: COL.paper }, scene + (captions ? Captions({ f: F, cues: TIMELINE.cues }) : ""));
};

// keep the helper referenced until the first chapter is added
export const _chapter = chapter;
