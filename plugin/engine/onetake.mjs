// Сборка шоурила одним дублем (шаблон one-take-showreel): клипы двух экранов по сетке долей,
// огибающая бочки, музыка и звук по событиям, window.REEL со сценарием. Вызывается из build.mjs.
//
// Сетка шаблона — 55 долей: хук 0–3, дроп на доле 3, экран A 4–10, экран моушна 12–25,
// строка → шар 29–40, код 41–44, экран B 45–47, знак с доли 51. В секундах длина зависит от темпа:
// 91 BPM — 36 с, 120 BPM — 27,5 с.

import {execFileSync} from 'node:child_process';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';

const HOOK = 3, TOTAL_BEATS = 55, FPS = 30;
// [звук, доля, громкость] — пик файла ложится на долю
const CUES = [
  ...[0.15, 0.35, 0.55, 0.8, 1.0, 1.2].map((k, i) => [`key-${(i % 3) + 1}`, k, 0.25]),   // хук расшифровывается
  ['riser', 3, 0.3], ['hit', 3, 0.5],                                                    // дроп: пролёт сквозь заголовок
  ['swell', 10.3, 0.5],                                                                  // отлёт от экрана A
  ['whoosh', 12.4, 0.55],                                                                // пролёт сквозь карточку трека
  ['tick', 13, 0.4], ['tick', 17, 0.4], ['tick', 22, 0.4],                               // смены кадра
  ['swell', 28.9, 0.55],                                                                 // подлёт к строке
  ...[29.35, 29.85, 30.35, 30.85, 31.35, 31.85, 32.35, 32.85].map((k, i) => [`key-${(i % 3) + 1}`, k, 0.35]),
  ['riser', 35, 0.3], ['hit', 35, 0.5], ['whoosh', 35.1, 0.45],                          // строка взрывается в шар
  ...[41.15, 41.4, 41.65, 41.9, 42.15, 42.4, 42.65, 42.9].map((k, i) => [`key-${(i % 3) + 1}`, k, 0.2]),
  ['tick', 44.0, 0.45], ['whoosh', 44.55, 0.55],                                         // render 100 %, пролёт сквозь код
  ['swell', 47.6, 0.5],                                                                  // кран
  ['tick', 48.6, 0.4], ['tick', 49.6, 0.4], ['tick', 50.5, 0.45],
  ['bell', 51, 0.35],                                                                    // знак
];

export async function buildOneTake({root, engine, template, filmPath, out, packColors}) {
  const run = (cmd, a) => execFileSync(cmd, a, {stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28});
  const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  const film = JSON.parse(await readFile(filmPath, 'utf8'));
  const from = (p) => {
    const f = path.resolve(path.dirname(filmPath), p);
    if (!existsSync(f)) throw new Error(`В сценарии нет файла: ${p}`);
    return f;
  };
  if (!film.music?.src) throw new Error('Нужен music.src — трек с дропом');
  if (!Array.isArray(film.screens) || film.screens.length !== 2) throw new Error('Нужно ровно два экрана: screens[0] (A) и screens[1] (B)');

  const track = from(film.music.src);
  const map = JSON.parse(run('python3', [path.join(root, 'scripts/track_structure.py'), track, '--quiet-json']).toString());
  const beat = map.beat, b = (n) => n * beat, total = b(TOTAL_BEATS);
  const dropBeat = map.drops.length ? map.drops[0].beat : 8;
  const musicIn = film.music.start ?? Math.max(0, map.firstBeat + (dropBeat - HOOK) * beat);
  if (probe(track) < musicIn + total) throw new Error(`Трек короче нужного: от ${musicIn.toFixed(1)} с нужно ещё ${total.toFixed(1)} с`);

  await rm(out, {recursive: true, force: true});
  await mkdir(path.join(out, 'assets'), {recursive: true});
  const A = (name) => path.join(out, 'assets', name);
  const V = ['-c:v', 'libx264', '-crf', '15', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-g', '15', '-an'];
  const FIT = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=${FPS}`;

  // Экраны: отрезок [from, to] со скоростью speed; до доли align — первый кадр, после конца — последний.
  const aligns = [3.4, 44.8];
  const ids = ['a', 'b'];
  for (const [i, sc] of film.screens.entries()) {
    const src = from(sc.src), speed = sc.speed ?? 1;
    const seg = A(`seg-${ids[i]}.mp4`);
    const a0 = sc.from ?? 0, a1 = sc.to ?? Math.min(probe(src), a0 + 4);
    run('ffmpeg', ['-v', 'error', '-y', '-ss', String(a0), '-t', String(a1 - a0), '-i', src, '-vf', `setpts=PTS/${speed},${FIT}`, ...V, seg]);
    const L = probe(seg);
    const pre = b(aligns[i]).toFixed(3), post = Math.max(0, total - b(aligns[i]) - L).toFixed(3);
    run('ffmpeg', ['-v', 'error', '-y', '-i', seg, '-vf', `tpad=start_mode=clone:start_duration=${pre}:stop_mode=clone:stop_duration=${post}`, '-t', total.toFixed(3), ...V, A(`${ids[i]}.mp4`)]);
    await rm(seg);
  }

  // Трек: вход за 3 доли до дропа, затухание в последние 1,2 с.
  run('ffmpeg', ['-v', 'error', '-y', '-ss', musicIn.toFixed(3), '-t', total.toFixed(3), '-i', track,
    '-af', `afade=t=out:st=${(total - 1.2).toFixed(3)}:d=1.2`, '-c:a', 'aac', '-b:a', '256k', A('music.m4a')]);

  // Огибающая бочки: низ до 140 Гц, 16 окон на долю; столбики дорожки — максимум из 4 окон.
  const pcm = run('ffmpeg', ['-v', 'error', '-i', A('music.m4a'), '-af', 'lowpass=f=140,lowpass=f=140', '-ac', '1', '-ar', '8000', '-f', 's16le', '-']);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  const perBeat = 16, NK = TOTAL_BEATS * perBeat, win = (beat * 8000) / perBeat;
  const rms = Array.from({length: NK}, (_, i) => {
    let s = 0, n = 0;
    for (let k = Math.floor(i * win); k < Math.floor((i + 1) * win) && k < samples.length; k++) { s += samples[k] * samples[k]; n++; }
    return Math.sqrt(s / Math.max(1, n));
  });
  const sorted = [...rms].sort((x, y) => x - y);
  const lo = sorted[Math.floor(NK * 0.1)], hi = sorted[Math.floor(NK * 0.995)] || 1;
  const kick = rms.map((v) => +Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))), 1.6).toFixed(3));
  const peaks = Array.from({length: TOTAL_BEATS * 4}, (_, i) => Math.max(...kick.slice(i * 4, i * 4 + 4)));

  // Звук по событиям: пик файла (sounds/sounds.json) — на долю события.
  const meta = JSON.parse(await readFile(path.join(root, 'sounds/sounds.json'), 'utf8'));
  const audio = [`<audio id="music" class="clip" src="assets/music.m4a" data-start="0" data-duration="${total.toFixed(3)}" data-volume="${film.music.volume ?? 0.6}" data-track-index="30"></audio>`];
  const used = new Set();
  CUES.forEach(([name, at, volume], i) => {
    const file = `${name}.wav`, m = meta[file];
    if (!m) return;
    if (!used.has(file)) { used.add(file); execFileSync('cp', [path.join(root, 'sounds', file), A(`sfx-${file}`)]); }
    let start = b(at) - (m.peak - m.onset), mediaStart = m.onset;
    if (start < 0) { mediaStart -= start; start = 0; }
    const dur = Math.min(m.length - mediaStart, total - start);
    if (dur > 0.03) audio.push(`<audio id="s${i}" class="clip" src="assets/sfx-${file}" data-start="${start.toFixed(3)}" data-duration="${dur.toFixed(3)}" data-media-start="${mediaStart.toFixed(3)}" data-volume="${volume}" data-track-index="${31 + i}"></audio>`);
  });

  const videos = ids.map((id, i) => `<video id="v-${id}" class="clip tex" src="assets/${id}.mp4" data-start="0" data-duration="${total.toFixed(3)}" data-track-index="${2 + i}" muted playsinline></video>`);
  const filmOut = {...film};
  delete filmOut.music;
  const reel = {bpm: map.bpm, beat, total, peaks, kick, perBeat, screens: ids,
    track: {title: film.trackTitle ?? 'твой трек', artist: film.trackArtist ?? ''}, film: filmOut};
  let html = await readFile(path.join(template, 'index.html'), 'utf8');
  html = html
    .replaceAll('data-duration="0"', `data-duration="${total.toFixed(3)}"`)
    .replace('<!-- reel:videos -->', videos.join('\n      '))
    .replace('<!-- reel:audio -->', audio.join('\n      '))
    .replace('/* reel:config */', `window.REEL = ${JSON.stringify(reel).replaceAll('<', '\\u003c')};`);
  if (packColors) {
    // палитра пака → PAL шаблона
    html = html.replace(/const PAL = \{[^}]*\};/, `const PAL = ${JSON.stringify(packColors)};`);
  }
  const fontCss = (await readFile(path.join(engine, 'fonts/fonts.css'), 'utf8')).replaceAll('url(./', 'url(fonts/');
  html = html.replace('<!-- cadence:fonts -->', `<style>\n${fontCss}\n    </style>`);
  await writeFile(path.join(out, 'index.html'), html);
  await cp(path.join(engine, 'lib'), path.join(out, 'lib'), {recursive: true});
  await cp(path.join(engine, 'vendor/three'), path.join(out, 'vendor/three'), {recursive: true});
  await cp(path.join(engine, 'fonts'), path.join(out, 'fonts'), {recursive: true});
  console.log(`шоурил: ${map.bpm} BPM, вход в трек ${musicIn.toFixed(2)} с, дроп на доле ${HOOK} → ${total.toFixed(1)} с, ${audio.length - 1} звуков`);
}
