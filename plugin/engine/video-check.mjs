#!/usr/bin/env node
// Проверка готового MP4 по кадрам: вспышка, моргание и рывок, которых не видно в раскладке.
// Считает по каждому кадру яркость (YAVG) и разницу с прошлым кадром (YDIF) через ffmpeg signalstats.
//
//   npm --prefix engine run video-check -- <файл.mp4> [--cuts 3.0,16.4] [--from 0] [--to 0]
//
// Скачок — кадр, который отличается от соседа намного сильнее, чем кадры вокруг (затемнение во весь кадр за один кадр,
// вспышка, сцена пропала и вернулась). Моргание — яркость резко уходит и за полсекунды возвращается.
// --cuts — моменты задуманных склеек встык (секунды), их скачок не ошибка.
// Ошибок нет — код 0 и строка «чисто», есть — код 1 и перечень с секундами.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';


// Кадры по порядку: время, средняя яркость, средняя разница с прошлым кадром (0–255)
export function readStats(path) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-vf', 'scale=270:-2,signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.slice(0, 400)}`);
  const out = [];
  let cur = null;
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) { cur = { t: Number(m[1]) }; out.push(cur); continue; }
    const kv = line.match(/lavfi\.signalstats\.(YAVG|YDIF)=([-+\d.eE]+)/);
    if (kv && cur) cur[kv[1]] = Number(kv[2]);
  }
  return out;
}

// Скачки и моргания по ряду кадров. fps — по шагу времени.
export function findJumps(frames, { cuts = [], from = 0, to = Infinity } = {}) {
  const issues = [];
  const dt = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1) : 1 / 30;
  const win = Math.max(3, Math.round(0.1 / dt));
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
  const nearCut = (t) => cuts.some((c) => Math.abs(c - t) < 2 * dt + 0.02);
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.t < from || f.t > to || nearCut(f.t)) continue;
    const around = frames.slice(Math.max(1, i - win), i + win + 1).filter((_, k, arr) => arr[k] !== f).map((x) => x.YDIF);
    const base = median(around);
    // скачок: кадр меняется в 4 раза сильнее соседей и сильнее 8 из 255 в среднем по кадру. Порог по пробам 20.11:
    // затемнение во весь кадр за кадр давало 10–17, строка текста и ключевой кадр кодека — 4–6,5
    if (f.YDIF > 8 && f.YDIF > 4 * Math.max(base, 0.4)) issues.push({ t: f.t, kind: 'скачок', v: f.YDIF, base });
  }
  // моргание: яркость падает больше чем на 25 % и за 0,5 с возвращается почти к прежней
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], f = frames[i];
    if (f.t < from || f.t > to || nearCut(f.t) || !(a.YAVG > 6)) continue;
    if (f.YAVG < a.YAVG * 0.75) {
      const back = frames.slice(i, i + Math.round(0.5 / dt)).find((x) => x.YAVG > a.YAVG * 0.92);
      if (back) issues.push({ t: f.t, kind: 'моргание', v: f.YAVG, base: a.YAVG });
    }
  }
  // соседние кадры одного события — одной строкой
  return issues.sort((x, y) => x.t - y.t).filter((x, k, arr) => !arr.slice(0, k).some((y) => y.kind === x.kind && x.t - y.t < 0.3));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const file = args.find((a, i) => !a.startsWith('--') && !['--cuts', '--from', '--to'].includes(args[i - 1]));
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (!file || !existsSync(file)) { console.error('нужен MP4: npm --prefix engine run video-check -- <файл.mp4>'); process.exit(2); }
  const cuts = (opt('--cuts') ?? '').split(',').filter(Boolean).map(Number);
  const frames = readStats(file);
  const issues = findJumps(frames, { cuts, from: Number(opt('--from') ?? 0), to: Number(opt('--to') ?? Infinity) });
  if (issues.length) {
    console.log(`видео не прошло проверку (${frames.length} кадров):\n  ${issues.map((x) => `${x.t.toFixed(2)} с: ${x.kind} — ${x.v.toFixed(1)} при ${x.base.toFixed(1)} вокруг`).join('\n  ')}`);
    process.exit(1);
  }
  console.log(`видео чисто: ${frames.length} кадров без вспышек, морганий и рывков`);
}
