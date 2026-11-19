#!/usr/bin/env node
// Часть scripts/news_shot.py (режим url): открывает страницу в Chrome движка Cadence (чистый временный профиль,
// без входа и cookies), прячет закреплённые плашки, находит цитату и снимает шапку статьи и абзац с цитатой.
// Печатает одну строку JSON: {lines, width, height, head} или {error}. Запускается из engine/ (puppeteer-core движка).
//   node scripts/news_shot_page.mjs '{"url": "...", "quote": "...", "png": ".../имя.png", "vw": 1100, "chrome": "..."}'

import {createRequire} from 'node:module';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const A = JSON.parse(process.argv[2]);
const require = createRequire(path.join(process.cwd(), 'package.json'));
const puppeteer = require('puppeteer-core');
const profile = await mkdtemp(path.join(os.tmpdir(), 'cadence-shot-'));
const browser = await puppeteer.launch({executablePath: A.chrome, headless: true, userDataDir: profile,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions']});
try {
  const page = await browser.newPage();
  await page.setViewport({width: A.vw, height: 1400, deviceScaleFactor: 2});
  await page.goto(A.url, {waitUntil: 'networkidle2', timeout: 60000});
  await new Promise((r) => setTimeout(r, 1500));
  const geo = await page.evaluate((q) => {
    const norm = (s) => s.replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
    // закреплённые плашки (cookie, подписка, реклама) прячем: на снимке только статья
    for (const e of document.querySelectorAll('body *')) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') e.style.setProperty('display', 'none', 'important');
    }
    const Q = norm(q).trim();
    const blocks = [...document.querySelectorAll('p, li, blockquote, h1, h2, h3, figcaption')].filter((b) => norm(b.innerText || '').includes(Q));
    if (!blocks.length) return {error: 'цитата не найдена на странице'};
    const b = blocks[blocks.length - 1];
    const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    const nodes = []; let all = '';
    while (walker.nextNode()) { const n = walker.currentNode; nodes.push({n, s: all.length}); all += norm(n.data); }
    const i0 = all.indexOf(Q);
    if (i0 < 0) return {error: 'цитата разбита разметкой страницы: сделай свой снимок (режим own)'};
    const pos = (k) => { for (let j = nodes.length - 1; j >= 0; j--) if (nodes[j].s <= k) return [nodes[j].n, Math.min(k - nodes[j].s, nodes[j].n.data.length)]; };
    const range = document.createRange();
    range.setStart(...pos(i0)); range.setEnd(...pos(i0 + Q.length));
    const sy = window.scrollY, sx = window.scrollX, rows = [];
    for (const c of range.getClientRects()) {
      if (c.width < 2) continue;
      const y = Math.round(c.top + sy), last = rows[rows.length - 1];
      if (last && Math.abs(last[1] - y) < c.height / 2) {
        const x1 = Math.max(last[0] + last[2], c.left + sx + c.width);
        last[0] = Math.min(last[0], c.left + sx); last[2] = x1 - last[0];
      } else rows.push([c.left + sx, y, c.width, c.height]);
    }
    // кадр — колонка текста: абзац с цитатой; шапка — заголовок и подпись автора над ним
    const br = b.getBoundingClientRect(), x = Math.max(0, Math.floor(br.left + sx - 28)), wd = Math.ceil(br.width + 56);
    const h1 = document.querySelector('article h1, main h1, h1');
    let head = null;
    if (h1) {
      const hr = h1.getBoundingClientRect(), ht = Math.max(0, Math.round(hr.top + sy - 24));
      const by = [...document.querySelectorAll('time, [class*=byline], [class*=author]')].map((e) => e.getBoundingClientRect())
        .filter((r) => r.top > hr.top && r.bottom < hr.bottom + 260 && r.height > 0 && r.height < 160);
      const hb = Math.round(Math.max(hr.bottom, ...by.map((r) => r.bottom)) + sy + 14);
      head = {x: Math.max(0, Math.floor(hr.left + sx - 28)), y: ht, width: Math.ceil(Math.max(hr.width, br.width) + 56), height: hb - ht};
    }
    const top = Math.max(0, Math.round(br.top + sy - 12)), bot = Math.round(br.bottom + sy + 16);
    return {head, clip: {x, y: top, width: wd, height: bot - top}, rows: rows.map((r) => [r[0] - x, r[1] - top, r[2], r[3]].map(Math.round))};
  }, A.quote);
  if (geo.error) { console.log(JSON.stringify({error: geo.error})); process.exitCode = 0; }
  else {
    // снимок в 2× плотности; строки — в CSS-пикселях, поэтому умножаем на 2, чтобы совпали с пикселями снимка
    await writeFile(A.png, await page.screenshot({clip: geo.clip, captureBeyondViewport: true}));
    if (geo.head) await writeFile(A.png.replace(/\.png$/, '-head.png'), await page.screenshot({clip: geo.head, captureBeyondViewport: true}));
    console.log(JSON.stringify({lines: geo.rows.map((r) => r.map((v) => v * 2)), head: !!geo.head}));
  }
} finally {
  await browser.close();
  await rm(profile, {recursive: true, force: true});
}
