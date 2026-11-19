#!/usr/bin/env node
// Проверка раскладки собранной доски (board-explainer) до рендера: открывает сборку в браузере без окна
// (chrome-headless-shell из кэша HyperFrames) и на каждую сцену смотрит прямоугольники window.__boardLayout.
//
//   npm --prefix engine run board-check -- <папка сборки> [--heroes heroes.json] [--safe 65,288,886,1440]
//
// Без --heroes проверяет саму графику: штамп на тексте, штамп на соседнем предмете, надпись на надписи, выход за рабочую зону.
// С --heroes (доска поверх записи) ещё и графику против людей, лиц и главного предмета под ней:
//   {"0.25": [[x, y, w, h, "face" | "person" | "object"], …], "0.5": […], …}   секунды от начала доски, пиксели кадра.
// Рамки героев даёт любой детектор (лица, силуэт человека, главный предмет); предмет-герой — компактный и в середине кадра.
// Ошибок нет — код 0 и строка «чисто», есть — код 1 и перечень по сценам.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const build = path.resolve(args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--heroes' && args[args.indexOf(a) - 1] !== '--safe') ?? '');
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (!existsSync(path.join(build, 'index.html'))) { console.error('нужна папка сборки с index.html: npm --prefix engine run board-check -- <папка>'); process.exit(2); }

const html = readFileSync(path.join(build, 'index.html'), 'utf8');
const film = JSON.parse(html.match(/<script type="application\/json" id="film">([\s\S]*?)<\/script>/)[1]);
const W = Number(html.match(/data-width="(\d+)"/)?.[1] ?? 1080), H = Number(html.match(/data-height="(\d+)"/)?.[1] ?? 1920);
const D = Number(html.match(/id="scene"[^>]*data-duration="([\d.]+)"/)?.[1] ?? 10);
const portrait = H > W;
const safe = (opt('--safe') ?? (portrait ? '65,288,886,1440' : `${Math.round(0.06 * W)},${Math.round(0.09 * H)},${Math.round(0.94 * W)},${Math.round(0.91 * H)}`)).split(',').map(Number);
const heroes = opt('--heroes') ? JSON.parse(readFileSync(opt('--heroes'), 'utf8')) : null;

export const isSubject = (h) => { const c = h[0] + h[2] / 2; return c > 0.23 * W && c < 0.77 * W && h[2] < 0.7 * W && h[2] * h[3] < 0.35 * W * H; };
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const r3 = (x) => Math.round(x * 1000) / 1000;

const pp = path.join(here, 'node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js');
const cache = path.join(os.homedir(), '.cache/hyperframes/chrome/chrome-headless-shell');
const shell = existsSync(cache) ? readdirSync(cache).sort().reverse().flatMap((v) => {
  const dir = path.join(cache, v);
  return readdirSync(dir).map((sub) => ['chrome-headless-shell', 'chrome-headless-shell.exe'].map((n) => path.join(dir, sub, n))).flat();
}).find(existsSync) : null;
if (!existsSync(pp) || !shell) { console.error('нет puppeteer-core в движке или chrome-headless-shell в кэше HyperFrames: python3 scripts/engine_setup.py install, затем npm --prefix engine run doctor'); process.exit(2); }
const puppeteer = (await import(pathToFileURL(pp).href)).default;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const f = path.join(build, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(build) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: shell, headless: true, args: ['--no-sandbox'] });
const issues = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof window.__boardLayout === 'function', { timeout: 20000 });
  const lay = (t) => page.evaluate((x) => { window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: x } })); return window.__boardLayout(); }, t);
  const words = film.words;
  let t0 = 0;
  for (const [j, w] of words.entries()) {
    const a0 = Number.isFinite(w.at) ? w.at : t0;
    const a1 = Number.isFinite(words[j + 1]?.at) ? words[j + 1].at : (w.dur ? a0 + w.dur : D);
    t0 = a1;
    const t = r3(Math.max(a0 + 0.3, Math.min(a1, D) - 0.75));
    const tag = `сцена ${j + 1} «${w.word}» — ${t} с`;
    const L = (await lay(t)).filter((r) => r.scene === j);
    const texts = L.filter((r) => r.part === 'text'), stamps = L.filter((r) => r.kind === 'stamp'), boxes = L.filter((r) => r.part === 'box');
    for (const s of stamps) for (const x of texts) if (inter(s, x) > 0.03 * s.w * s.h) issues.push(`${tag}: штамп «${s.text}» на тексте «${x.text}»`);
    for (const s of stamps) {
      const others = boxes.filter((r) => r.kind === 'item' && r.item !== s.item).sort((a, b) => inter(s, b) - inter(s, a));
      for (const b of others.slice(1)) if (inter(s, b) > 0.03 * s.w * s.h) issues.push(`${tag}: штамп «${s.text}» заходит на соседний предмет «${b.text}»`);
    }
    for (const [k, x] of texts.entries()) for (const y of texts.slice(k + 1)) if (x.item !== y.item && inter(x, y) > 0.05 * Math.min(x.w * x.h, y.w * y.h)) issues.push(`${tag}: надпись «${x.text}» на надписи «${y.text}»`);
    // рабочая зона — для вертикали (интерфейс площадки); в 16:9 — только с явным --safe
    if (portrait || opt('--safe')) for (const b of boxes.filter((r) => r.w * r.h > 60 * 60)) if (b.x < safe[0] - 25 || b.x + b.w > safe[2] + 25 || b.y < safe[1] - 30 || b.y + b.h > safe[3] + 30) issues.push(`${tag}: «${b.text}» за рабочей зоной (${Math.round(b.x)}, ${Math.round(b.y)}, ${Math.round(b.w)}×${Math.round(b.h)})`);
    if (!heroes) continue;
    // графика против героев в каждый размеченный момент сцены: план под доской может смениться посреди сцены
    for (const [key, hs] of Object.entries(heroes)) {
      const tt = Number(key);
      if (!(tt >= a0 && tt < a1)) continue;
      const vis = (await lay(tt)).filter((r) => r.part === 'box' && r.w > 4);
      for (const h of hs.filter((x) => x[4] !== 'object' || isSubject(x))) {
        const hr = { x: h[0], y: h[1], w: h[2], h: h[3] };
        for (const b of vis) {
          const o = inter(b, hr);
          if (h[4] === 'face' ? o > 0 : o > 0.08 * hr.w * hr.h) issues.push(`сцена ${j + 1} «${w.word}» — ${tt} с: «${b.text}» закрывает ${h[4] === 'face' ? 'лицо' : h[4] === 'person' ? 'человека' : 'предмет'} (${h.slice(0, 4).join(', ')})`);
        }
      }
    }
  }
} finally { await browser.close(); server.close(); }
const uniq = [...new Set(issues)];
if (uniq.length) { console.log(`раскладка доски не прошла проверку:\n  ${uniq.join('\n  ')}`); process.exit(1); }
console.log(`раскладка доски чисто: ${film.words.length} сц.${heroes ? ', герои под ней не закрыты' : ''}`);
