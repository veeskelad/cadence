import { COL, FONT, Paper, Slam, VIDEO, css, ease, esc, fill, interpolate, shakeAt } from "./fx.js";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// stage: paper + SVG layer (characters) + HTML layer (text), sharing one camera shake.
// svg / html / under / bg are markup strings; cam = { x, y, z } pans and zooms the SVG world.
export const Stage = ({ f, hits = [], power = 16, svg = "", html = "", under = "", cam, bg }) => {
  const { width, height } = VIDEO;
  const s = shakeAt(f, hits, power);
  const z = cam?.z ?? 1;
  return fill(
    { overflow: "hidden" },
    (bg ?? Paper()) +
      fill(
        {
          transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg) scale(${z}) translate(${-(cam?.x ?? 0)}px, ${-(cam?.y ?? 0)}px)`,
          transformOrigin: `${width / 2}px ${height / 2}px`,
        },
        `${under}<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="position:absolute;overflow:visible">${svg}</svg>`,
      ) +
      fill({ transform: `translate(${s.x * 0.5}px, ${s.y * 0.5}px)` }, html),
  );
};

// chapter card: black background, slamming number, sliding title (f = frame inside the card, dur = its length)
export const ChapterCard = ({ f, n, title, sub, dur }) => {
  const { width, height } = VIDEO;
  const cy = height / 2;
  const s = shakeAt(f, [6], 22);
  const bar = ease(f, 10, 26);
  const out = interpolate(f, [dur - 8, dur], [1, 0], clamp);
  return fill(
    { background: COL.ink, transform: `translate(${s.x}px, ${s.y}px)`, opacity: out },
    `<div style="${css({ position: "absolute", left: 0, top: cy - 20, height: 14, width: `${bar * 100}%`, background: COL.orange })}"></div>` +
      Slam({ f, at: 4, x: width / 2, y: cy - 140, size: 70, color: COL.orange, font: FONT.title, weight: 800, spacing: 14, children: esc(n) }) +
      `<div style="${css({
        position: "absolute",
        left: 0,
        right: 0,
        top: cy + 20,
        textAlign: "center",
        fontFamily: FONT.title,
        fontWeight: 900,
        fontSize: Math.min(150, width / 12),
        color: "#fff",
        letterSpacing: 2,
        transform: `translateX(${(1 - ease(f, 10, 24)) * -300}px)`,
        opacity: ease(f, 10, 18),
        lineHeight: 1,
        textTransform: "uppercase",
      })}">${esc(title)}</div>` +
      (sub
        ? `<div style="${css({ position: "absolute", left: 0, right: 0, top: cy + 200, textAlign: "center", fontFamily: FONT.body, fontWeight: 500, fontSize: 40, color: "#bdbdbd", opacity: ease(f, 22, 32) })}">${esc(sub)}</div>`
        : ""),
  );
};

// physical word block (falls, bounces, hits): text inside a box (SVG)
export const WordBlock = ({ x, y, r = 0, text, bg = "#fff", color = COL.ink, size = 44, s = 1 }) => {
  const w = text.length * size * 0.56 + 50;
  const h = size + 34;
  return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="10" fill="${bg}" stroke="${COL.ink}" stroke-width="6" /><text y="${size * 0.36}" text-anchor="middle" font-family="${FONT.title}" font-weight="900" font-size="${size}" fill="${color}" letter-spacing="1">${esc(text)}</text></g>`;
};

// gravity fall with damped bounce: returns y
export const fall = (f, at, y0, y1, dur = 12) => {
  if (f < at) return y0;
  const t = (f - at) / dur;
  if (t < 1) return y0 + (y1 - y0) * t * t;
  // small bounces
  const b = f - at - dur;
  const h = Math.abs(Math.sin(b * 0.45)) * 40 * Math.exp(-b * 0.25);
  return y1 - h;
};

// speech/thought bubble (SVG); children = SVG markup inside, centred on the bubble
export const Bubble = ({ x, y, w, h, t, tailX, tailY, children = "" }) => {
  if (t <= 0) return "";
  const tail =
    tailX !== undefined && tailY !== undefined
      ? `<circle cx="${(tailX - x) * 0.55}" cy="${(tailY - y) * 0.55 + h * 0.2}" r="12" fill="#fff" stroke="${COL.ink}" stroke-width="5" /><circle cx="${(tailX - x) * 0.8}" cy="${(tailY - y) * 0.8 + h * 0.1}" r="7" fill="#fff" stroke="${COL.ink}" stroke-width="4" />`
      : "";
  return `<g transform="translate(${x} ${y}) scale(${t})">${tail}<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2.4}" fill="#fff" stroke="${COL.ink}" stroke-width="6" />${children}</g>`;
};

// numbered card that pops in with a bounce (HTML); x = centre, y = top
export const Card = ({ f, at, x, y, n, w = 540, children = "", accent = COL.orange, out, size = 36 }) => {
  if (f < at) return "";
  const t = ease(f, at, at + 12, 0, 1);
  const s = interpolate(f - at, [0, 6, 10, 14], [0.3, 1.08, 0.97, 1], { extrapolateRight: "clamp" });
  let o = t;
  if (out !== undefined) o *= interpolate(f, [out, out + 8], [1, 0], clamp);
  const badge = n
    ? `<div style="${css({ flex: "0 0 auto", width: 64, height: 64, borderRadius: 32, background: accent, color: "#fff", fontFamily: FONT.comic, fontSize: 44, display: "flex", alignItems: "center", justifyContent: "center", border: `5px solid ${COL.ink}` })}">${esc(n)}</div>`
    : "";
  return `<div style="${css({
    position: "absolute",
    left: x - w / 2,
    top: y,
    width: w,
    transform: `scale(${s}) rotate(${(1 - t) * -6}deg)`,
    opacity: o,
    background: "#fff",
    border: `6px solid ${COL.ink}`,
    borderRadius: 18,
    boxShadow: `8px 8px 0 ${COL.ink}`,
    padding: "18px 24px 18px 24px",
    display: "flex",
    alignItems: "center",
    gap: 18,
    fontFamily: FONT.body,
    fontWeight: 700,
    fontSize: size,
    lineHeight: 1.15,
    color: COL.ink,
  })}">${badge}<div>${children}</div></div>`;
};

// rubber stamp (TOP SECRET, etc.) (HTML)
export const Stamp = ({ f, at, x, y, text, color = COL.red, size = 110, r = -12 }) => {
  if (f < at) return "";
  const s = interpolate(f - at, [0, 5, 8, 11], [2.6, 0.9, 1.04, 1], { extrapolateRight: "clamp" });
  return `<div style="${css({
    position: "absolute",
    left: x,
    top: y,
    transform: `translate(-50%,-50%) rotate(${r}deg) scale(${s})`,
    border: `10px solid ${color}`,
    borderRadius: 16,
    padding: "6px 34px",
    color,
    fontFamily: FONT.title,
    fontWeight: 900,
    fontSize: size,
    letterSpacing: 8,
    whiteSpace: "nowrap",
    background: "rgba(255,255,255,0.85)",
    opacity: interpolate(f - at, [0, 3], [0, 1], { extrapolateRight: "clamp" }),
  })}">${esc(text)}</div>`;
};

// burned-in subtitles driven by the timeline cues (f and cue frames are global video frames)
export const Captions = ({ f, cues, bottom = 60, size = 40 }) => {
  const c = cues.find((q) => f >= q.startFrame && f < q.endFrame);
  if (!c) return "";
  const o = interpolate(f, [c.startFrame, c.startFrame + 4, c.endFrame - 4, c.endFrame], [0, 1, 1, 0], clamp);
  return fill(
    { display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" },
    `<div style="${css({
      marginBottom: bottom,
      maxWidth: VIDEO.width * 0.8,
      textAlign: "center",
      background: "rgba(20,20,20,0.82)",
      color: "#fff",
      fontFamily: FONT.body,
      fontWeight: 700,
      fontSize: size,
      lineHeight: 1.25,
      padding: "10px 26px",
      borderRadius: 12,
      opacity: o,
    })}">${esc(c.text)}</div>`,
  );
};
