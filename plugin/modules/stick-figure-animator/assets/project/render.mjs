#!/usr/bin/env node
// Build and render this stick-figure video with the shared Cadence engine (HyperFrames).
//
//   node render.mjs [--output out/video.mp4] [--music 0.35] [--sfx 0.8] [--voice voice.wav] [--captions]
//                   [--quality standard] [--workers 1]
//   node render.mjs --sheet 0-450:45 [120 ...]   contact sheet of single frames → out/sheet.png
//   node render.mjs --build-only                 only fill index.html (for engine check / preview)
//
// Before rendering it writes into index.html: size and length (project.json, src/video.js DURATION),
// the fonts, the props, and the sound: assets/music.* with fades and voice ducking baked in
// (assets/mix/music.wav), one track per SFX cue of SCENES (assets/sfx/<name>.wav), the voiceover
// (assets/<voice>). Frames and cues are global video frames.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const sheetSpec = (() => {
  const i = argv.indexOf("--sheet");
  if (i < 0) return null;
  const out = [];
  for (let k = i + 1; k < argv.length && !argv[k].startsWith("--"); k++) out.push(argv[k]);
  return out;
})();

const project = JSON.parse(readFileSync(join(here, "project.json"), "utf8"));
const fps = project.fps;
const engine = process.env.CADENCE_ENGINE ? resolve(process.env.CADENCE_ENGINE) : join(project.cadenceRoot, "engine");
const props = {
  fps,
  captions: flag("captions"),
  music: Number(opt("music", 0.35)),
  sfx: Number(opt("sfx", 0.8)),
  voice: opt("voice", ""),
};

const { SCENES, DURATION, musicGain } = await import(pathToFileURL(join(here, "src", "video.js")).href);
const seconds = DURATION / fps;
const probe = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
const rel = (p) => p.slice(here.length + 1).split("\\").join("/");

// Music with its gain curve baked in: the engine gives a track one constant volume.
function bakeMusic() {
  const src = ["music.mp3", "music.wav"].map((n) => join(here, "assets", n)).find(existsSync);
  if (!src || props.music <= 0) return null;
  const rate = 48000;
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", src, "-t", seconds.toFixed(3), "-f", "f32le", "-ac", "2", "-ar", String(rate), "-"], { maxBuffer: 1 << 30 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const frames = x.length / 2;
  const gains = Array.from({ length: DURATION + 1 }, (_, f) => musicGain(f, { music: props.music, voice: props.voice }));
  const pcm = Buffer.alloc(44 + frames * 4);
  for (let i = 0; i < frames; i++) {
    const pos = (i / rate) * fps;
    const f0 = Math.min(DURATION, Math.floor(pos));
    const g = gains[f0] + (gains[Math.min(DURATION, f0 + 1)] - gains[f0]) * (pos - f0);
    for (let c = 0; c < 2; c++) {
      const v = Math.max(-1, Math.min(1, x[i * 2 + c] * g));
      pcm.writeInt16LE(Math.round(v * 32767), 44 + (i * 2 + c) * 2);
    }
  }
  pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + frames * 4, 4); pcm.write("WAVE", 8); pcm.write("fmt ", 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(rate, 24);
  pcm.writeUInt32LE(rate * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(frames * 4, 40);
  mkdirSync(join(here, "assets", "mix"), { recursive: true });
  const out = join(here, "assets", "mix", "music.wav");
  writeFileSync(out, pcm);
  return { src: rel(out), start: 0, duration: Math.min(seconds, frames / rate), volume: 1 };
}

function soundTracks() {
  const tracks = [];
  const music = bakeMusic();
  if (music) tracks.push(music);
  if (props.voice) {
    const file = join(here, "assets", props.voice);
    if (!existsSync(file)) throw new Error(`voiceover not found: assets/${props.voice}`);
    tracks.push({ src: rel(file), start: 0, duration: Math.min(seconds, probe(file)), volume: 1 });
  }
  const missing = new Set();
  const lengths = new Map();
  SCENES.forEach(({ from, sfx = [] }, i) => {
    const end = SCENES[i + 1]?.from ?? DURATION;
    for (const [f, name, v = 1] of sfx) {
      if (f < 0 || from + f >= end) continue; // a cue plays inside its own scene only
      const file = join(here, "assets", "sfx", `${name}.wav`);
      if (!existsSync(file)) { missing.add(name); continue; }
      if (!lengths.has(file)) lengths.set(file, probe(file));
      const duration = Math.min(lengths.get(file), (end - from - f) / fps);
      if (duration > 0.02 && props.sfx * v > 0) tracks.push({ src: rel(file), start: (from + f) / fps, duration, volume: +(v * props.sfx).toFixed(3) });
    }
  });
  if (missing.size) console.error(`SFX without a file in assets/sfx (skipped): ${[...missing].join(", ")}; run gen_audio.py`);
  return tracks;
}

function fontsCss() {
  const css = readFileSync(join(here, "fonts", "fonts.css"), "utf8").replaceAll("url(./", "url(fonts/");
  return `<style>\n${css}\n    </style>`;
}

function fillIndex(tracks) {
  const file = join(here, "index.html");
  let html = readFileSync(file, "utf8");
  const block = (name, body) => {
    const re = new RegExp(`(<!-- stickman:${name} -->)[\\s\\S]*?(<!-- /stickman:${name} -->)`);
    if (!re.test(html)) throw new Error(`index.html: no stickman:${name} block`);
    html = html.replace(re, (_, a, b) => `${a}\n${body}\n    ${b}`);
  };
  block("fonts", fontsCss());
  block("audio", tracks
    .map((t, i) => `      <audio id="a${i}" class="clip" src="${t.src}" data-start="${t.start.toFixed(3)}" data-duration="${t.duration.toFixed(3)}" data-media-start="0" data-volume="${t.volume}" data-track-index="${i + 1}"></audio>`)
    .join("\n"));
  html = html
    .replace(/(data-composition-id="stickman"[^>]*?data-width=")\d+(" data-height=")\d+(" data-duration=")[\d.]+"/, `$1${project.width}$2${project.height}$3${seconds.toFixed(3)}"`)
    .replace(/(<script type="application\/json" id="props">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}\n      ${JSON.stringify({ fps, captions: props.captions })}\n    ${b}`);
  writeFileSync(file, html);
}

function npmEngine(script, args) {
  if (!existsSync(join(engine, "node_modules", "hyperframes"))) {
    throw new Error("Cadence engine is not installed: python3 scripts/engine_setup.py status (from the Cadence root); install only with consent");
  }
  const r = spawnSync("npm", ["--prefix", engine, "run", script, "--", here, ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`engine ${script} failed (exit ${r.status})`);
}

// frames: single numbers (120) or ranges with a step (300-600:60)
const parseFrames = (spec) =>
  spec.flatMap((s) => {
    const m = s.match(/^(\d+)-(\d+)(?::(\d+))?$/);
    if (!m) return [Number(s)];
    const [a, b, st] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 30)];
    const r = [];
    for (let f = a; f <= b; f += st) r.push(f);
    return r;
  }).filter((f) => Number.isFinite(f) && f >= 0 && f < DURATION);

if (sheetSpec) {
  fillIndex([]);
  const frames = parseFrames(sheetSpec);
  if (!frames.length) throw new Error("--sheet: no frame inside the video");
  const dir = join(here, "out", "_frames");
  // frame f starts at f / fps; a quarter frame later still rounds to f
  npmEngine("snapshot", ["--at", frames.map((f) => ((f + 0.25) / fps).toFixed(4)).join(","), "--no-end", "--output", dir]);
  const shots = readdirSync(dir).filter((n) => n.endsWith(".png")).sort((a, b) => parseFloat(a.replace(/[^\d.]/g, "")) - parseFloat(b.replace(/[^\d.]/g, "")));
  const out = resolve(here, opt("output", "out/sheet.png"));
  const cols = Math.min(2, shots.length);
  const rows = Math.ceil(shots.length / cols);
  const chain = `${shots.map((_, k) => `[${k}:v]scale=iw/2:-1,setsar=1[s${k}]`).join(";")};${shots.map((_, k) => `[s${k}]`).join("")}concat=n=${shots.length}:v=1:a=0,tile=${cols}x${rows}`;
  execFileSync("ffmpeg", ["-v", "error", "-y", ...shots.flatMap((n) => ["-i", join(dir, n)]), "-filter_complex", chain, "-frames:v", "1", out]);
  console.log(`contact sheet: ${out} (frames ${frames.join(", ")}, left to right, top to bottom)`);
  process.exit(0);
}

const tracks = soundTracks();
fillIndex(tracks);
console.log(`index.html: ${project.width}x${project.height}, ${seconds.toFixed(2)} s, ${tracks.length} sound tracks${props.captions ? ", captions" : ""}`);
if (flag("build-only")) process.exit(0);
const output = resolve(here, opt("output", `out/${project.slug || "video"}.mp4`));
mkdirSync(dirname(output), { recursive: true });
npmEngine("render", ["--quality", opt("quality", "standard"), "--fps", String(fps), "--workers", opt("workers", "1"), "--output", output]);
console.log(`rendered: ${output}`);
