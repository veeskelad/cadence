// Stick-figure engine: shared helpers, text, impacts, camera.
// Everything is a pure function of the frame number f and returns markup (a string): the page redraws the
// whole frame from scratch, so frames can be rendered in any order. No React, no animation library.

// Composition size and frame rate. index.html fills them from the root before the first frame.
export const VIDEO = { width: 1920, height: 1080, fps: 30 };

// Local fonts (copied into the project, no network): Bangers for impact words, Oswald for condensed
// titles and labels, Inter Tight for sentences. Oswald and Inter Tight also carry Cyrillic.
export const FONT = {
  comic: "Bangers",
  title: "'Oswald'",
  body: "'Inter Tight'",
};

export const COL = {
  paper: "#fafaf7",
  ink: "#1a1a1a",
  orange: "#f7941d",
  blue: "#2b7de9",
  green: "#2fa84f",
  red: "#e5322d",
  yellow: "#f2c12e",
  purple: "#8e44ad",
  grey: "#8a8a8a",
  dollar: "#3a8f3e",
  gold: "#f2b705",
};

// ---------- markup helpers ----------

// escape text before putting it into markup
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const UNITLESS = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flex", "flexGrow", "flexShrink", "order", "zoom", "scale"]);
// style object -> CSS text; numbers get px like inline React styles did
export const css = (o = {}) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${typeof v === "number" && !UNITLESS.has(k) ? `${v}px` : v}`)
    .join(";");

// full-frame layer (the old AbsoluteFill)
export const fill = (style, inner = "") => `<div style="position:absolute;left:0;top:0;width:100%;height:100%;${css(style)}">${inner}</div>`;

// join a list of markup pieces, skipping empty ones
export const join = (...parts) => parts.flat(Infinity).filter((p) => p !== null && p !== undefined && p !== false).join("");

// ---------- time helpers ----------

// Cubic bezier easing, the same curve family as CSS cubic-bezier().
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    if (p <= 0 || p >= 1) return sy(p); // extrapolated values keep the curve's ends
    let t = p;
    for (let i = 0; i < 8; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - p) / d;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 20 && Math.abs(sx(t) - p) > 1e-6; i++) {
      t = (lo + hi) / 2;
      if (sx(t) < p) lo = t; else hi = t;
    }
    return sy(t);
  };
}

export const Easing = {
  linear: (t) => t,
  bezier,
  cubic: (t) => t * t * t,
  in: (e) => e,
  out: (e) => (t) => 1 - e(1 - t),
  inOut: (e) => (t) => (t < 0.5 ? e(t * 2) / 2 : 1 - e((1 - t) * 2) / 2),
};

// Map x from input points to output points, piecewise; easing per segment.
// extrapolateLeft / extrapolateRight: "extend" (default), "clamp" or "identity".
export function interpolate(x, input, output, opts = {}) {
  const { easing = (t) => t, extrapolateLeft = "extend", extrapolateRight = "extend" } = opts;
  let i = 1;
  while (i < input.length - 1 && x > input[i]) i++;
  const a = input[i - 1], b = input[i];
  let t = b === a ? 1 : (x - a) / (b - a);
  if (t < 0) {
    if (extrapolateLeft === "clamp") t = 0;
    else if (extrapolateLeft === "identity") return x;
  }
  if (t > 1) {
    if (extrapolateRight === "clamp") t = 1;
    else if (extrapolateRight === "identity") return x;
  }
  return output[i - 1] + (output[i] - output[i - 1]) * easing(t);
}

// Deterministic pseudo-random number in [0, 1) from a seed (same seed, same value on every frame).
export function random(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h += 0x6d2b79f5;
  let t = h;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

export const ease = (f, a, b, from = 0, to = 1, e = bezier(0.2, 0.9, 0.25, 1)) =>
  interpolate(f, [a, b], [from, to], { ...clamp, easing: e });

// camera shake: decays after each hit
export const shakeAt = (f, hits, power = 18, len = 12) => {
  let x = 0, y = 0, r = 0;
  for (const h of hits) {
    const d = f - h;
    if (d >= 0 && d < len) {
      const k = (1 - d / len) ** 2 * power;
      x += (random(`sx${h}-${d}`) - 0.5) * 2 * k;
      y += (random(`sy${h}-${d}`) - 0.5) * 2 * k;
      r += (random(`sr${h}-${d}`) - 0.5) * k * 0.08;
    }
  }
  return { x, y, r };
};

export const Shake = ({ f, hits, power, children = "" }) => {
  const s = shakeAt(f, hits, power);
  return fill({ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)` }, children);
};

// paper background with soft vignette and a faint ground line
export const Paper = ({ tint = COL.paper, ground = 862 } = {}) => {
  const { width, height } = VIDEO;
  return fill(
    { background: `radial-gradient(ellipse at 50% 45%, ${tint} 55%, #e9e7df 100%)` },
    `<svg width="${width}" height="${height}" style="position:absolute;opacity:0.35"><line x1="0" y1="${ground}" x2="${width}" y2="${ground}" stroke="#cfccc2" stroke-width="3" /></svg>`,
  );
};

// comic-style impact starburst (SVG)
export const Burst = ({ x, y, at, f, color = COL.ink, size = 160, n = 14 }) => {
  const d = f - at;
  if (d < 0 || d > 14) return "";
  const t = d / 14;
  const r0 = size * (0.25 + t * 0.9);
  const r1 = size * (0.45 + t * 1.25);
  const rays = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + random(`b${at}${i}`) * 0.3;
    const k = 0.7 + random(`bl${at}${i}`) * 0.6;
    return `<line x1="${x + Math.cos(a) * r0}" y1="${y + Math.sin(a) * r0}" x2="${x + Math.cos(a) * r1 * k}" y2="${y + Math.sin(a) * r1 * k}" stroke="${color}" stroke-width="${10 * (1 - t) + 2}" stroke-linecap="round" />`;
  }).join("");
  const core = d < 3 ? `<circle cx="${x}" cy="${y}" r="${size * 0.55}" fill="#fff" stroke="${color}" stroke-width="8" />` : "";
  return `<g opacity="${1 - t}">${core}${rays}</g>`;
};

// dust puffs when something lands (SVG)
export const Dust = ({ x, y, at, f, spread = 120 }) => {
  const d = f - at;
  if (d < 0 || d > 22) return "";
  const t = d / 22;
  const puffs = Array.from({ length: 8 }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const k = 0.4 + random(`d${at}${i}`) * 0.8;
    return `<circle cx="${x + side * spread * k * Math.sqrt(t)}" cy="${y - 30 * k * t - 6}" r="${(10 + 18 * k) * (0.6 + t)}" fill="none" stroke="#b9b5aa" stroke-width="5" />`;
  }).join("");
  return `<g opacity="${1 - t}">${puffs}</g>`;
};

// horizontal speed lines (SVG)
export const SpeedLines = ({ f, from, to, dir = 1, color = "#d8d4c8" }) => {
  if (f < from || f > to) return "";
  const o = interpolate(f, [from, from + 4, to - 4, to], [0, 1, 1, 0], clamp);
  const lines = Array.from({ length: 18 }, (_, i) => {
    const y = 80 + random(`sl${i}`) * 920;
    const len = 200 + random(`sll${i}`) * 500;
    const x = ((((random(`slx${i}`) * 2400 - f * 90 * dir) % 2400) + 2400) % 2400) - 240;
    return `<line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="${color}" stroke-width="${4 + random(`slw${i}`) * 6}" stroke-linecap="round" />`;
  }).join("");
  return `<g opacity="${o}">${lines}</g>`;
};

// text that slams onto the screen with overshoot (HTML)
export const Slam = ({ f, at, children = "", x = 960, y = 540, size = 120, color = COL.ink, font = FONT.comic, rotate = 0, out, stroke, weight = 400, spacing = 2 }) => {
  const d = f - at;
  if (d < 0) return "";
  const s = interpolate(d, [0, 5, 9, 13], [3.2, 0.92, 1.05, 1], clamp);
  let o = interpolate(d, [0, 3], [0, 1], clamp);
  if (out !== undefined) o *= interpolate(f, [out, out + 8], [1, 0], clamp);
  const blur = interpolate(d, [0, 5], [8, 0], clamp);
  return `<div style="${css({
    position: "absolute",
    left: x,
    top: y,
    transform: `translate(-50%, -50%) scale(${s}) rotate(${rotate}deg)`,
    opacity: o,
    filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
    fontFamily: font,
    fontSize: size,
    fontWeight: weight,
    color,
    whiteSpace: "nowrap",
    letterSpacing: spacing,
    lineHeight: 1,
    WebkitTextStroke: stroke,
    paintOrder: "stroke fill",
    textAlign: "center",
  })}">${children}</div>`;
};

// pill-shaped caption that slides in (HTML)
export const Caption = ({ f, at, out, x = 960, y = 980, children = "", bg = COL.ink, color = "#fff", size = 40, align = "center" }) => {
  const d = f - at;
  if (d < 0) return "";
  const t = ease(f, at, at + 10);
  let o = t;
  if (out !== undefined) o *= interpolate(f, [out, out + 8], [1, 0], clamp);
  return `<div style="${css({
    position: "absolute",
    left: x,
    top: y,
    transform: `translate(${align === "center" ? "-50%" : "0"}, -50%) translateY(${(1 - t) * 40}px)`,
    opacity: o,
    background: bg,
    color,
    fontFamily: FONT.body,
    fontWeight: 700,
    fontSize: size,
    padding: "14px 30px",
    borderRadius: 14,
    whiteSpace: "nowrap",
    boxShadow: "0 8px 0 rgba(0,0,0,0.12)",
  })}">${children}</div>`;
};

// typewriter (HTML span); style is a style object
export const Type = ({ f, at, text, cps = 1.4, style, caret = true }) => {
  const n = Math.max(0, Math.floor((f - at) * cps));
  if (f < at) return "";
  const blink = caret && n < text.length + 10 && Math.floor(f / 8) % 2 === 0;
  return `<span style="${css(style)}">${esc(text.slice(0, n))}<span style="opacity:${blink ? 1 : 0}">▌</span></span>`;
};

// mouse cursor (SVG): the animator's hand that draws characters, grabs and throws them
export const Cursor = ({ x, y, scale = 1.6, pressed }) =>
  `<g transform="translate(${x} ${y}) scale(${scale * (pressed ? 0.88 : 1)})"><path d="M0,0 L0,34 L8,26 L14,40 L20,37 L14,24 L25,24 Z" fill="#fff" stroke="#000" stroke-width="2.4" stroke-linejoin="round" /></g>`;

// counting number
export const countUp = (f, a, b, to, from = 0) => Math.round(interpolate(f, [a, b], [from, to], { ...clamp, easing: Easing.out(Easing.cubic) }));

export const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// diagonal black wipe transition (HTML)
export const Wipe = ({ f, dur, color = COL.ink }) => {
  const inT = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const outT = interpolate(f, [dur - 10, dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  // in: the wipe exits to the right; out: it enters from the left
  const showIn = f < 10;
  const showOut = f > dur - 10;
  if (!showIn && !showOut) return "";
  const x = showIn ? inT * 2600 : -2600 + outT * 2600;
  return fill(
    { pointerEvents: "none" },
    `<div style="${css({ position: "absolute", left: x - 300, top: -200, width: 2600, height: 1500, background: color, transform: "skewX(-14deg)" })}"></div>`,
  );
};
