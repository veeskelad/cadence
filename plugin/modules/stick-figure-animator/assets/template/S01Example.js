import { Actor, P, SMOOTH, groundY, solve, STAND } from "./stickman/stick.js";
import { Burst, COL, Caption, Cursor, Dust, FONT, Slam, interpolate } from "./stickman/fx.js";
import { Stage, fall } from "./stickman/common.js";
import { TIMELINE } from "./timeline.js";
import { beat } from "./cues.js";

// Example scene: the cursor draws the hero, a title falls and slams, the hero dodges it.
// It shows the core patterns: timeline-anchored beats, Actor keyframes, Stage hits,
// physical text, and SFX cues on the same frames as the action.

export const S01_SFX = [
  [20, "scribble", 0.5],
  [90, "missile", 0.4],
  [104, "impact", 1],
  [112, "thud", 0.6],
  [120, "slam", 0.8],
];

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

export const S01Example = ({ f, from }) => {
  const S = 1.2;
  const GY = groundY(S);
  const draw = interpolate(f, [20, 70], [0, 1], clamp);
  const j = solve({ ...STAND, x: 960, y: GY }, S, 1);
  const cx = interpolate(f, [0, 20, 45, 70, 90], [1750, j.headC[0], j.hip[0], j.rFoot[0], 1820], { ...clamp, easing: SMOOTH });
  const cy = interpolate(f, [0, 20, 45, 70, 90], [1050, j.headC[1] - 30, j.hip[1], j.rFoot[1], 120], { ...clamp, easing: SMOOTH });
  const titleY = fall(f, 92, -300, 700, 12);
  // show the caption when the second line is spoken (falls back to frame 130 with no cues)
  const caption = TIMELINE.cues.length > 1 ? beat(from, 1) : 130;

  return Stage({
    f,
    hits: [104],
    power: 26,
    svg: [
      f >= 92 ? `<text x="960" y="${titleY}" text-anchor="middle" font-family="${FONT.comic}" font-size="220" fill="${COL.ink}">TITLE</text>` : "",
      Burst({ x: 960, y: 640, at: 104, f, size: 260 }),
      Dust({ x: 960, y: 850, at: 104, f, spread: 300 }),
      Actor({
        f,
        color: COL.orange,
        scale: S,
        draw,
        base: { x: 960, y: GY },
        keys: [
          { f: 70, p: {} },
          { f: 80, p: { head: -15 } },
          { f: 88, p: { ...P.shock } },
          { f: 92, p: { ...P.crouch, y: GY + 30 } },
          { f: 104, p: { x: 1250, y: GY - 200, rot: -200, la1: -60, ra1: 60, ll1: -40, ll2: 120, rl1: 30, rl2: 120 }, e: SMOOTH },
          { f: 114, p: { ...P.crouch, x: 1420, y: GY + 30, rot: -360 }, e: SMOOTH },
          { f: 126, p: { y: GY, rot: -360, ll1: -12, ll2: 4, rl1: 12, rl2: -4, lean: 0, la1: -18, la2: 8, ra1: 18, ra2: -8 } },
          { f: 140, p: { ...P.pointL } },
        ],
        facing: (t) => (t < 114 ? 1 : -1),
      }),
      f < 90 ? Cursor({ x: cx, y: cy, pressed: f > 20 && f < 70 }) : "",
    ].join(""),
    // keep the bottom band free: burned-in captions (--captions) live there
    html:
      Slam({ f, at: 120, x: 960, y: 300, size: 60, font: FONT.title, weight: 900, spacing: 6, children: "A SUBTITLE THAT SLAMS IN" }) +
      Caption({ f, at: caption, y: 400, size: 30, bg: COL.orange, color: COL.ink, children: "This pill appears when line 2 is spoken" }),
  });
};
