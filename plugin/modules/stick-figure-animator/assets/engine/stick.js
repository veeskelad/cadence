import { bezier, esc, interpolate } from "./fx.js";

// Stick-figure animation engine (snappy, physical, cartoon-action style).
// Angles in degrees. Convention: dir(a) = (sin a, cos a) in screen coordinates,
// so 0 = down, 90 = right, -90 = left, 180 = up.
// Upper limbs are relative to the torso (0 = hanging down); forearms/shins are relative to the upper limb.
//
// Pose = { x, y (hip), lean, head, la1, la2, ra1, ra2, ll1, ll2, rl1, rl2, rot }

export const STAND = {
  x: 960,
  y: 760,
  lean: 0,
  head: 0,
  la1: -18,
  la2: 8,
  ra1: 18,
  ra2: -8,
  ll1: -12,
  ll2: 4,
  rl1: 12,
  rl2: -4,
  rot: 0,
};

export const P = {
  stand: {},
  armsUp: { la1: -160, la2: -10, ra1: 160, ra2: 10 },
  cheer: { la1: -150, la2: -30, ra1: 150, ra2: 30, head: -6 },
  pointR: { ra1: 95, ra2: 0, la1: -15, la2: 10 },
  pointL: { la1: -95, la2: 0, ra1: 15, ra2: -10 },
  shrug: { la1: -55, la2: -100, ra1: 55, ra2: 100, head: 8 },
  think: { ra1: 30, ra2: 145, la1: 25, la2: 80, head: 10 },
  crouch: { y: 790, ll1: -60, ll2: 95, rl1: 50, rl2: 90, lean: 10, la1: -40, la2: -30, ra1: 40, ra2: 30 },
  punchR: { lean: 14, ra1: 92, ra2: 0, la1: -40, la2: -110, ll1: -30, ll2: 10, rl1: 35, rl2: -5 },
  kickR: { lean: -30, rl1: 105, rl2: 0, ll1: -10, ll2: 5, la1: -100, la2: 20, ra1: -20, ra2: -40 },
  carry: { la1: -160, la2: -30, ra1: 160, ra2: 30, lean: 0, ll1: -15, ll2: 15, rl1: 15, rl2: -10 },
  hold: { la1: 50, la2: 60, ra1: 70, ra2: 40 },
  facepalm: { ra1: 160, ra2: 120, head: 20, lean: 5 },
  sit: { y: 800, ll1: 80, ll2: -80, rl1: 95, rl2: -85, lean: -5 },
  handshake: { ra1: 70, ra2: 10, la1: -15, la2: 10 },
  sad: { lean: 12, head: 25, la1: -5, la2: 0, ra1: 5, ra2: 0 },
  shock: { la1: -120, la2: -40, ra1: 120, ra2: 40, head: -10, lean: -8 },
};

const rad = (d) => (d * Math.PI) / 180;
const dir = (a) => [Math.sin(rad(a)), Math.cos(rad(a))];

// joints of a pose: { hip, neck, headC, lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot, headR }
export const solve = (p, s = 1, facing = 1) => {
  const T = 78 * s, UA = 40 * s, FA = 38 * s, TH = 48 * s, SH = 46 * s, R = 24 * s;
  // every offset is relative to the hip, then rotated by rot and mirrored by facing
  const body = -p.lean;
  const up = dir(180 - p.lean);
  const neck = [up[0] * T, up[1] * T];
  const hd = dir(180 - p.lean + p.head);
  const headC = [neck[0] + hd[0] * (R + 3), neck[1] + hd[1] * (R + 3)];
  const limb = (o, a1, a2, L1, L2, ref = body) => {
    const d1 = dir(ref + a1);
    const e = [o[0] + d1[0] * L1, o[1] + d1[1] * L1];
    const d2 = dir(ref + a1 + a2);
    return [e, [e[0] + d2[0] * L2, e[1] + d2[1] * L2]];
  };
  const sh = [neck[0] * 0.92, neck[1] * 0.92];
  const [lE, lH] = limb(sh, p.la1, p.la2, UA, FA);
  const [rE, rH] = limb(sh, p.ra1, p.ra2, UA, FA);
  // legs use the vertical reference, not the torso's
  const [lK, lF] = limb([0, 0], p.ll1, p.ll2, TH, SH, 0);
  const [rK, rF] = limb([0, 0], p.rl1, p.rl2, TH, SH, 0);
  const c = Math.cos(rad(p.rot)), sn = Math.sin(rad(p.rot));
  const tr = (v) => {
    const x = v[0] * c - v[1] * sn;
    const y = v[0] * sn + v[1] * c;
    return [p.x + x * facing, p.y + y];
  };
  return {
    hip: [p.x, p.y],
    neck: tr(neck),
    headC: tr(headC),
    lElbow: tr(lE),
    lHand: tr(lH),
    rElbow: tr(rE),
    rHand: tr(rH),
    lKnee: tr(lK),
    lFoot: tr(lF),
    rKnee: tr(rK),
    rFoot: tr(rF),
    headR: R,
  };
};

// Accessory: "tie" | "scarf" | "tophat" | "crown" | "cap" | "glasses" | "none"
const pts = (...a) => a.map((v) => v.join(",")).join(" ");

// static figure (SVG). children / behind: (joints) => SVG markup drawn above / under the body.
export const Figure = ({ pose, color, scale = 1, facing = 1, accessory = "none", opacity = 1, face = "none", label, labelColor, draw = 1, children, behind }) => {
  const j = solve(pose, scale, facing);
  const w = 12 * scale;
  const st = `stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const R = j.headR;
  const [hx, hy] = j.headC;
  // stroke progress per part: head, torso, arms, legs
  const seg = (a, b) => Math.max(0, Math.min(1, (draw - a) / (b - a)));
  const dash = (t) => (draw >= 1 ? "" : ` pathLength="1" stroke-dasharray="${t} 2" opacity="${t > 0 ? 1 : 0}"`);
  const dHead = seg(0, 0.3), dTorso = seg(0.3, 0.45), dArms = seg(0.45, 0.72), dLegs = seg(0.72, 1);
  // head "up" direction, used to orient accessories
  const ux = (hx - j.neck[0]) / (R + 3);
  const uy = (hy - j.neck[1]) / (R + 3);
  const ang = (Math.atan2(uy, ux) * 180) / Math.PI + 90;
  const s = scale;
  const out = [];
  if (behind) out.push(behind(j));
  out.push(`<polyline points="${pts(j.lFoot, j.lKnee, j.hip, j.rKnee, j.rFoot)}" ${st}${dash(dLegs)} />`);
  out.push(`<polyline points="${pts(j.lHand, j.lElbow, j.neck, j.rElbow, j.rHand)}" ${st}${dash(dArms)} />`);
  out.push(`<line x1="${j.neck[0]}" y1="${j.neck[1]}" x2="${j.hip[0]}" y2="${j.hip[1]}" ${st}${dash(dTorso)} />`);
  if (accessory === "tie") {
    out.push(
      `<polygon points="${pts(
        [j.neck[0] * 0.85 + j.hip[0] * 0.15 - 6 * s, j.neck[1] * 0.85 + j.hip[1] * 0.15],
        [j.neck[0] * 0.85 + j.hip[0] * 0.15 + 6 * s, j.neck[1] * 0.85 + j.hip[1] * 0.15],
        [j.neck[0] * 0.45 + j.hip[0] * 0.55, j.neck[1] * 0.45 + j.hip[1] * 0.55],
      )}" fill="#d6263b" stroke="#1a1a1a" stroke-width="${2.5 * s}" stroke-linejoin="round" />`,
    );
  }
  out.push(
    draw >= 1
      ? `<circle cx="${hx}" cy="${hy}" r="${R}" fill="${color}" />`
      : `<circle cx="${hx}" cy="${hy}" r="${R - w / 2}" ${st.replace('fill="none"', `fill="${dHead >= 1 ? color : "none"}"`)}${dash(dHead)} />`,
  );
  const head = [];
  if (face !== "none" && draw >= 1) {
    head.push(`<ellipse cx="${7 * s}" cy="${-3 * s}" rx="${3.2 * s}" ry="${4.6 * s}" fill="#fff" />`);
    head.push(`<ellipse cx="${15 * s}" cy="${-3 * s}" rx="${3.2 * s}" ry="${4.6 * s}" fill="#fff" />`);
    if (face === "angry") head.push(`<path d="M${3 * s},${-11 * s} L${19 * s},${-7 * s}" stroke="#fff" stroke-width="${3 * s}" stroke-linecap="round" />`);
    if (face === "sad") head.push(`<path d="M${3 * s},${-8 * s} L${19 * s},${-12 * s}" stroke="#fff" stroke-width="${3 * s}" stroke-linecap="round" />`);
    if (face === "happy") head.push(`<path d="M${6 * s},${7 * s} Q${11 * s},${12 * s} ${16 * s},${7 * s}" stroke="#fff" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round" />`);
  }
  if (accessory === "scarf") {
    // headscarf: cap on the head plus cloth falling behind the neck
    head.push(
      `<path d="M${R + 3 * s},${-9 * s} Q${R + 3 * s},${-R - 7 * s} 0,${-R - 7 * s} Q${-R - 4 * s},${-R - 7 * s} ${-R - 5 * s},${-2 * s} L${-R - 12 * s},${R + 24 * s} L${-R + 8 * s},${R + 16 * s} L${-R + 6 * s},${-9 * s} Z" fill="#ffffff" stroke="#1a1a1a" stroke-width="${3 * s}" stroke-linejoin="round" />`,
      `<rect x="${-R - 3 * s}" y="${-R * 0.62}" width="${2 * R + 6 * s}" height="${6 * s}" rx="${3 * s}" fill="#1a1a1a" />`,
    );
  }
  if (accessory === "tophat") {
    head.push(
      `<rect x="${-R - 8 * s}" y="${-R - 2 * s}" width="${2 * R + 16 * s}" height="${7 * s}" rx="${3 * s}" fill="#1a1a1a" />`,
      `<rect x="${-R + 2 * s}" y="${-R - 34 * s}" width="${2 * R - 4 * s}" height="${34 * s}" rx="${3 * s}" fill="#1a1a1a" />`,
      `<rect x="${-R + 2 * s}" y="${-R - 10 * s}" width="${2 * R - 4 * s}" height="${6 * s}" fill="#d6263b" />`,
    );
  }
  if (accessory === "crown") {
    head.push(
      `<polygon points="${-R},${-R + 6 * s} ${-R},${-R - 18 * s} ${-R / 2},${-R - 6 * s} 0,${-R - 22 * s} ${R / 2},${-R - 6 * s} ${R},${-R - 18 * s} ${R},${-R + 6 * s}" fill="#f2c12e" stroke="#1a1a1a" stroke-width="${3 * s}" stroke-linejoin="round" />`,
    );
  }
  if (accessory === "cap") {
    head.push(
      `<path d="M${-R},${-4 * s} Q0,${-R - 16 * s} ${R},${-4 * s} Z" fill="#1a1a1a" />`,
      `<rect x="0" y="${-8 * s}" width="${R + 16 * s}" height="${6 * s}" rx="${3 * s}" fill="#1a1a1a" />`,
    );
  }
  if (accessory === "glasses") {
    head.push(
      `<rect x="${1 * s}" y="${-9 * s}" width="${11 * s}" height="${9 * s}" rx="${3 * s}" fill="#111" />`,
      `<rect x="${13 * s}" y="${-9 * s}" width="${11 * s}" height="${9 * s}" rx="${3 * s}" fill="#111" />`,
    );
  }
  out.push(`<g transform="translate(${hx} ${hy}) rotate(${ang}) scale(${facing} 1)">${head.join("")}</g>`);
  if (label) {
    const lift = (accessory === "tophat" ? 52 : accessory === "scarf" || accessory === "crown" ? 36 : 16) * s;
    out.push(
      `<text x="${hx}" y="${hy - R - lift}" text-anchor="middle" font-family="Bangers" font-size="${30 * s}" letter-spacing="1.5" fill="${labelColor ?? color}" stroke="#fafaf7" stroke-width="6" paint-order="stroke">${esc(label)}</text>`,
    );
  }
  if (children) out.push(children(j));
  return `<g opacity="${opacity}">${out.join("")}</g>`;
};

// ---------- pose animation -----------

// Key = { f, p: partial pose, e?: easing }
export const SNAP = bezier(0.2, 0.9, 0.25, 1.15); // snap with slight overshoot
export const SMOOTH = bezier(0.45, 0, 0.55, 1);
export const HOLD = () => 0;

const lerp = (a, b, t) => a + (b - a) * t;

// keys are cumulative: each key inherits unspecified values from the previous one
export const poseAt = (f, keys, base = STAND) => {
  const full = [];
  let acc = { ...base };
  for (const k of keys) {
    acc = { ...acc, ...k.p };
    full.push(acc);
  }
  if (keys.length === 0) return base;
  if (f <= keys[0].f) return full[0];
  for (let i = 1; i < keys.length; i++) {
    if (f <= keys[i].f) {
      const a = keys[i - 1].f;
      const b = keys[i].f;
      const t = (keys[i].e ?? SNAP)(interpolate(f, [a, b], [0, 1]));
      const A = full[i - 1];
      const B = full[i];
      const out = {};
      Object.keys(A).forEach((n) => {
        out[n] = lerp(A[n], B[n], t);
      });
      return out;
    }
  }
  return full[full.length - 1];
};

// run cycle, added on top of a pose
export const runCycle = (f, speed = 0.45, amp = 1) => {
  const s = Math.sin(f * speed);
  const c = Math.cos(f * speed);
  return {
    lean: 14 * amp,
    ll1: -45 * s * amp,
    ll2: (35 + 35 * Math.max(0, -c)) * amp,
    rl1: 45 * s * amp,
    rl2: (35 + 35 * Math.max(0, c)) * amp,
    la1: 50 * s * amp,
    la2: -70 * amp,
    ra1: -50 * s * amp,
    ra2: -70 * amp,
  };
};

export const walkCycle = (f, speed = 0.22) => {
  const s = Math.sin(f * speed);
  return {
    ll1: -22 * s,
    ll2: 10 + 12 * Math.max(0, s),
    rl1: 22 * s,
    rl2: 10 + 12 * Math.max(0, -s),
    la1: 20 * s - 6,
    la2: -10,
    ra1: -20 * s + 6,
    ra2: 10,
  };
};

// idle "breathing": small continuous motion that keeps characters alive
export const idle = (f, seed = 0) => ({
  y: Math.sin(f * 0.12 + seed) * 1.6,
  la1: Math.sin(f * 0.1 + seed) * 2,
  ra1: -Math.sin(f * 0.1 + seed) * 2,
});

export const addPose = (p, d, replace = false) => {
  const o = { ...p };
  Object.keys(d).forEach((k) => {
    o[k] = replace ? d[k] : o[k] + d[k];
  });
  return o;
};

// animated figure with motion trails (smears) when it moves fast (SVG)
export const Actor = ({ f, keys, color, base, scale = 1, facing = 1, accessory, face = "eyes", label, mod, trails = true, opacity = 1, draw, children, behind }) => {
  const b = { ...STAND, ...base };
  const get = (t) => {
    const p = poseAt(t, keys, b);
    return mod ? mod(t, p) : p;
  };
  const fc = (t) => (typeof facing === "function" ? facing(t) : facing);
  const now = get(f);
  const ghosts = [];
  if (trails) {
    [3, 2, 1].forEach((d) => {
      const g = get(f - d);
      const dist = Math.hypot(g.x - now.x, g.y - now.y) + Math.abs(g.rot - now.rot) * 1.5;
      if (dist > 26) ghosts.push(Figure({ pose: g, color, scale, facing: fc(f - d), opacity: (0.32 - d * 0.08) * opacity }));
    });
  }
  return ghosts.join("") + Figure({ pose: now, color, scale, facing: fc(f), accessory, face, label, opacity, draw, behind, children });
};

// hip y so the feet touch the ground (ground line ~852)
export const groundY = (s = 1, ground = 852) => ground - 92.5 * s;
