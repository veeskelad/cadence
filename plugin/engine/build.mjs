#!/usr/bin/env node
// Шаблон из engine/templates/<id>/ → самостоятельный проект HyperFrames в папке сборки.
// Рендер не пускает пути выше корня проекта ("../"), поэтому общий код, three.js, шрифты,
// звуки и файлы сценария копируются внутрь, а цвета пака и формат подставляются в копию.
//
//   node engine/build.mjs <template> [--film film.json] [--pack <id>] [--format WxH]
//                         [--out <папка>] [--set key=value ...]
//
// Сценарий с музыкой (beat-reel): трек разбирается локально (scripts/track_structure.py) —
// темп, первая доля, дроп; ролик входит в трек так, чтобы хук закончился ровно на дропе.
// Огибающая бочки (низ до 140 Гц, 16 окон на долю) уходит в сценарий: по ней кадры
// сменяются на удар и растут столбики.

import {execFileSync} from 'node:child_process';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const engine = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(engine, '..');
const templates = path.join(engine, 'templates');
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const list = async () => (await readdir(templates, {withFileTypes: true})).filter((e) => e.isDirectory()).map((e) => e.name);

const id = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!id || args.includes('--help')) {
  console.error(`node engine/build.mjs <template> [--film film.json] [--pack id] [--format WxH] [--out dir] [--set key=value]
Шаблоны: ${(await list()).join(', ')}`);
  process.exit(id ? 0 : 2);
}
if (!(await list()).includes(id)) throw new Error(`Нет шаблона ${id}; есть: ${(await list()).join(', ')}`);

// Рабочая папка человека — вне выпуска, как в scripts/cadence_paths.py:work_root:
// CADENCE_WORK → ../../work рядом с releases/ → ~/.config/cadence/config.json → ~/Cadence/work для плагина → ./work.
const configured = (() => {
  try { return JSON.parse(readFileSync(path.join(os.homedir(), '.config/cadence/config.json'), 'utf8')).work || ''; } catch { return ''; }
})().replace(/^~(?=\/|$)/, os.homedir());
const workDir = process.env.CADENCE_WORK
  ?? (path.basename(path.dirname(root)) === 'releases' ? path.resolve(root, '../../work')
    : configured ? path.resolve(configured)
    : root.split(path.sep).join('/').includes('/plugins/cache/') ? path.join(os.homedir(), 'Cadence/work')
    : path.join(root, 'work'));
const out = path.resolve(process.cwd(), option('--out') ?? path.join(workDir, id, 'build'));
if (out === root || root.startsWith(out + path.sep)) throw new Error(`--out ${out} перекрывает сам набор`);

// Свой пак человека лежит в work/packs/<id>/ и переживает обновление выпуска; встроенные — в design/packs/.
function packFile(packId) {
  const own = path.join(workDir, 'packs', packId, 'pack.json');
  const file = existsSync(own) ? own : path.join(root, 'design/packs', packId, 'pack.json');
  if (!existsSync(file)) throw new Error(`Нет пака ${packId}: ищу в ${path.join(workDir, 'packs')} и design/packs`);
  return file;
}

// Шоурил одним дублем собирается своим модулем: экраны-видео, огибающая, звук по сетке 55 долей.
if (id === 'one-take-showreel') {
  if (!option('--film')) throw new Error('Шоурилу нужен --film film.json (пример — examples/one-take-showreel/film.json)');
  const {buildOneTake} = await import('./onetake.mjs');
  let packColors;
  if (option('--pack')) {
    const c = JSON.parse(await readFile(packFile(option('--pack')), 'utf8')).colors;
    packColors = {coral: c.signal, hot: c.positive ?? c.signal, amber: c.signalSecondary ?? c.signal, cream: c.ink, ash: c.muted, ink: c.canvas, panel: c.surface, line: c.line ?? c.muted};
  }
  await buildOneTake({root, engine, template: path.join(templates, id), filmPath: path.resolve(option('--film')), out, packColors});
  console.log(`${id} → ${path.relative(process.cwd(), out) || '.'}`);
  process.exit(0);
}

const run = (cmd, a) => execFileSync(cmd, a, {stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28});
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
let html = await readFile(path.join(templates, id, 'index.html'), 'utf8');
// Длина ролика — корню и секциям; у <video> и <audio> своя длительность клипа.
const setDuration = (s) => {
  html = html.replaceAll(/<(?!video|audio)[^>]*?data-duration="[\d.]+"/g, (tag) => tag.replace(/data-duration="[\d.]+"/, `data-duration="${s}"`));
};

const format = option('--format');
if (format) {
  const [w, h] = format.split('x').map(Number);
  if (!w || !h) throw new Error(`--format ${format}: нужно WxH`);
  html = html
    .replace(/data-width="\d+"/, `data-width="${w}"`)
    .replace(/data-height="\d+"/, `data-height="${h}"`)
    .replace(/<meta name="viewport" content="[^"]*"/, `<meta name="viewport" content="width=${w}, height=${h}"`)
    .replace(/#root \{([^}]*?)width: \d+px; height: \d+px;/, `#root {$1width: ${w}px; height: ${h}px;`);
}

// Сценарий: JSON в #film. Локальные файлы (ключи src, bg, darkBg) копируются в assets/.
const filmPath = option('--film');
const filmAssets = [];
let audioHtml = '';
if (filmPath) {
  if (!html.includes('id="film"')) throw new Error(`У шаблона ${id} нет сценария #film`);
  const film = JSON.parse(await readFile(filmPath, 'utf8'));
  const localFile = (v) => typeof v === 'string' && !/^(https?:|data:|assets\/)/.test(v);
  const origin = new Map();
  const collect = (node) => {
    for (const [key, value] of Object.entries(node)) {
      if (['src', 'bg', 'darkBg'].includes(key) && localFile(value)) {
        const from = path.resolve(path.dirname(filmPath), value);
        if (!existsSync(from)) throw new Error(`В сценарии нет файла: ${value}`);
        const name = `film-${filmAssets.length}${path.extname(from)}`;
        filmAssets.push([from, name]);
        origin.set(`assets/${name}`, from);
        node[key] = `assets/${name}`;
      } else if (value && typeof value === 'object') collect(value);
    }
  };
  collect(film);

  let seconds;
  if (film.music && film.reel !== false && ['beat-reel', 'one-shape'].includes(id)) {
    // Ролик в бит: сетка — от трека.
    const track = origin.get(film.music.src);
    const map = JSON.parse(run('python3', [path.join(root, 'scripts/track_structure.py'), track, '--quiet-json']).toString());
    const beat = map.beat;
    const hook = film.hookBeats ?? Math.max(2, Math.ceil(1.9 / beat));
    const cuts = film.cutBeats ?? Math.max(8, Math.round(8 / beat / 4) * 4);
    const mark = film.markBeats ?? Math.max(3, Math.ceil(2.8 / beat));
    const dropBeat = map.drops.length ? map.drops[0].beat : 8;
    const musicIn = film.music.start ?? Math.max(0, map.firstBeat + (dropBeat - hook) * beat);
    const total = hook + cuts + mark;
    seconds = total * beat;
    // огибающая бочки на отрезке ролика
    const pcm = run('ffmpeg', ['-v', 'error', '-ss', String(musicIn), '-t', seconds.toFixed(3), '-i', track, '-af', 'lowpass=f=140,lowpass=f=140', '-ac', '1', '-ar', '8000', '-f', 's16le', '-']);
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
    const perBeat = 16, n = total * perBeat, win = (beat * 8000) / perBeat;
    const rms = Array.from({length: n}, (_, i) => {
      let s = 0, c = 0;
      for (let k = Math.floor(i * win); k < Math.floor((i + 1) * win) && k < samples.length; k++) { s += samples[k] * samples[k]; c++; }
      return Math.sqrt(s / Math.max(1, c));
    });
    const sorted = [...rms].sort((a, b) => a - b);
    const lo = sorted[Math.floor(n * 0.1)], hi = sorted[Math.floor(n * 0.995)] || 1;
    const kick = rms.map((v) => +Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))), 1.6).toFixed(3));
    film.reel = {bpm: map.bpm, beat, total, hook, cuts, mark, perBeat, kick, musicIn};
    film.music.start = musicIn;
    film.bpm = map.bpm;
    console.log(`трек: ${map.bpm} BPM, дроп на ${(map.firstBeat + dropBeat * beat).toFixed(2)} с → ролик ${seconds.toFixed(1)} с (хук ${hook}, кадры ${cuts}, знак ${mark} долей)`);
  } else if (film.scenes) {
    seconds = film.scenes.reduce((sum, s) => sum + s.beats, 0) * (60 / film.bpm);
  }
  html = html.replace(/(<script type="application\/json" id="film">)[\s\S]*?(<\/script>)/, (_, open, close) =>
    `${open}\n${JSON.stringify(film).replaceAll('<', '\\u003c')}\n    ${close}`);
  // Живое видео человека: <video> прямо в #root (вне секций), иначе рендер не перематывает его по кадрам.
  if (film.videos && html.includes('<!-- cadence:videos -->')) {
    html = html.replace('<!-- cadence:videos -->', film.videos.map((v, i) =>
      `<video id="${v.id}" class="clip" src="${v.src}" data-start="${v.start ?? 0}" data-duration="${v.duration}" data-media-start="${v.mediaStart ?? 0}" data-track-index="${2 + i}" muted playsinline></video>`).join('\n      '));
  }
  if (seconds) setDuration(seconds.toFixed(3));

  // Звук: музыка на всю длину и эффекты по событиям шаблона (cues.json). Пик файла — на событие.
  const cuesFile = path.join(templates, id, 'cues.json');
  if ((film.music || film.sfx) && existsSync(cuesFile)) {
    if (!html.includes('<!-- cadence:audio -->')) throw new Error(`У шаблона ${id} нет метки звука`);
    const cueSpec = JSON.parse(await readFile(cuesFile, 'utf8'));
    const sfx = {...(cueSpec.defaultSfx ?? {}), ...(film.sfx ?? {})};
    for (const fx of Object.values(sfx)) {
      if (fx.src.startsWith('sounds/')) {
        const from = path.join(root, fx.src);
        const name = `sfx-${path.basename(from)}`;
        if (!filmAssets.some(([, n]) => n === name)) filmAssets.push([from, name]);
        origin.set(`assets/${name}`, from);
        fx.src = `assets/${name}`;
      }
    }
    const length = (src) => probe(origin.get(src) ?? src);
    const clips = [];
    if (film.music) clips.push({src: film.music.src, start: 0, mediaStart: film.music.start ?? 0, duration: seconds, volume: film.music.volume ?? 0.6});
    const events = [];
    if (film.reel) {
      // события в долях ролика; имена — из cues.json шаблона
      const {hook, cuts, mark} = film.reel;
      for (const [name, at] of cueSpec.events ?? []) {
        const beatAt = eval_(at, {hook, cuts, mark});
        if (Array.isArray(beatAt)) beatAt.forEach((x) => events.push([name, x])); else events.push([name, beatAt]);
      }
    } else {
      const scale = (cueSpec.refBpm ?? film.bpm) / film.bpm;
      let at = 0;
      for (const scene of film.scenes ?? []) {
        for (const [name, anchor, cut] of cueSpec.cues?.[scene.type] ?? []) events.push([name, (at + anchor * scale) / (60 / film.bpm), cut ? cut * scale : 0]);
        at += scene.beats * (60 / film.bpm);
      }
    }
    const beatSec = 60 / film.bpm;
    for (const [name, beatAt, cut] of events) {
      const fx = sfx[name];
      if (!fx) continue;
      const onset = fx.onset ?? 0;
      let start = beatAt * beatSec - (cut ? 0 : (fx.peak ?? 0) - onset);
      let mediaStart = onset;
      if (start < 0) { mediaStart -= start; start = 0; }
      const available = length(fx.src) - mediaStart;
      const len = Math.min(cut || available, available, seconds - start);
      if (len > 0.05) clips.push({src: fx.src, start, mediaStart, duration: len, volume: fx.volume ?? 0.5});
    }
    audioHtml = clips.map((c, i) => `<audio id="a${i}" class="clip" src="${c.src}" data-start="${c.start.toFixed(3)}" data-duration="${c.duration.toFixed(3)}" data-media-start="${c.mediaStart.toFixed(3)}" data-volume="${c.volume}" data-track-index="${10 + i}"></audio>`).join('\n      ');
  }
}
// Выражения событий из cues.json: числа или строки вида "hook", "hook + cuts", "range(hook, hook + cuts, 4)".
function eval_(expr, v) {
  if (typeof expr === 'number') return expr;
  const range = /^range\((.+),(.+),(.+)\)$/.exec(expr.replace(/\s/g, ''));
  if (range) {
    const [a, b, s] = range.slice(1).map((x) => eval_(x, v));
    const xs = []; for (let x = a; x < b - 1e-6; x += s) xs.push(x); return xs;
  }
  return expr.split('+').map((p) => p.trim()).reduce((sum, p) => sum + (p in v ? v[p] : Number(p)), 0);
}
const duration = option('--duration');
if (duration) setDuration(Number(duration));
html = html.replace('<!-- cadence:audio -->', audioHtml).replace('<!-- cadence:videos -->', '');

for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--set') continue;
  const [key, ...rest] = args[i + 1].split('=');
  const value = rest.join('=').replaceAll('"', '&quot;');
  const attr = new RegExp(`data-${key}="[^"]*"`);
  if (!attr.test(html)) throw new Error(`У шаблона ${id} нет data-${key}`);
  html = html.replace(attr, `data-${key}="${value}"`);
}

// Цвета пака → CSS-переменные между метками tokens.
const packId = option('--pack');
if (packId) {
  const pack = JSON.parse(await readFile(packFile(packId), 'utf8'));
  const c = pack.colors;
  const vars = {'--canvas': c.canvas, '--surface': c.surface, '--ink': c.ink, '--muted': c.muted, '--signal': c.signal, '--signal-2': c.signalSecondary ?? c.signal, '--line': c.line ?? c.muted};
  const block = Object.entries(vars).map(([k, v]) => `        ${k}: ${v};`).join('\n');
  html = html.replace(/\/\* cadence:tokens[^*]*\*\/[\s\S]*?\/\* \/cadence:tokens \*\//, `/* cadence:tokens pack ${packId} */\n${block}\n        /* /cadence:tokens */`);
}

const fontCss = (await readFile(path.join(engine, 'fonts/fonts.css'), 'utf8')).replaceAll('url(./', 'url(fonts/');
html = html.replace('<!-- cadence:fonts -->', `<style>\n${fontCss}\n    </style>`);

await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
await writeFile(path.join(out, 'index.html'), html);
await cp(path.join(engine, 'lib'), path.join(out, 'lib'), {recursive: true});
await cp(path.join(engine, 'fonts'), path.join(out, 'fonts'), {recursive: true});
if (html.includes('vendor/three/')) await cp(path.join(engine, 'vendor/three'), path.join(out, 'vendor/three'), {recursive: true});
await cp(path.join(templates, id, 'assets'), path.join(out, 'assets'), {recursive: true}).catch(() => {});
if (filmAssets.length) await mkdir(path.join(out, 'assets'), {recursive: true});
for (const [from, name] of filmAssets) await cp(from, path.join(out, 'assets', name));
console.log(`${id} → ${path.relative(process.cwd(), out) || '.'}`);
