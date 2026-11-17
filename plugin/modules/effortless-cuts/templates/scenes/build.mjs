#!/usr/bin/env node
/**
 * Builds one designed scene into a HyperFrames project the Cadence engine can render.
 * Copied into <studio>/scenes by `scripts/scenes.py init`; scenes.py runs it, one scene at a time:
 *
 *   node build.mjs <workspace> --entry src/index.tsx --composition <scene id> --out <workspace>/out/<scene id>
 *                  [--node-modules <workspace>/node_modules] [--frame src/lib/frame.tsx] [--step 15]
 *
 * <workspace> holds src/ (the scenes) and public/ (their files). src/index.tsx calls
 * render({ID: {component, fps, width, height, durationInFrames, props, fonts}}) from '@cadence/frame'.
 *
 * Steps:
 *   1. Discovery in Node: the entry is bundled for Node and its tree is rendered to markup at frame 0, at every
 *      Sequence start it reveals and every --step frames. That lists every OffthreadVideo use (with its start and
 *      trim) and every public/ image the frames show.
 *   2. Browser bundle: src/lib/mount.tsx + entry -> <out>/app.js (esbuild, React in production mode).
 *   3. <out>/index.html: #root with the size and duration, one static <video data-hf-key> per video use (the engine
 *      reads videos from the static HTML), <audio> for the ones with sound, @font-face rules, font warm-up text and
 *      the image preload list. public/ is hard-linked into <out>/public.
 *
 * Then: npm --prefix <cadence>/engine run render -- <out> --fps <fps> --crf 16 --workers 1 --output <mp4>
 * The build only adds and overwrites files in <out>; a stale file left there is harmless (use a fresh --out for a clean tree).
 * stdout: one JSON line with the result (dir, fps, size, frames, videos, sound, images).
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args._[0]) {
  console.error('usage: node build.mjs <workspace> [--entry src/index.tsx] [--composition ID] [--out DIR] [--frame src/lib/frame.tsx] [--node-modules DIR] [--step 15]');
  process.exit(2);
}
const project = path.resolve(args._[0]);
const entry = path.resolve(project, args.entry ?? 'src/index.tsx');
const outDir = path.resolve(args.out ?? path.join(project, 'out', 'hf'));
// The frame runtime: --frame, else the project's own synced copy (src/lib/frame.tsx), else the one next to this script.
const frameFile = path.resolve(args.frame ?? [path.join(project, 'src', 'lib', 'frame.tsx'), path.join(here, 'src', 'lib', 'frame.tsx')].find((f) => fs.existsSync(f)));
const mountFile = [path.join(project, 'src', 'lib', 'mount.tsx'), path.join(here, 'src', 'lib', 'mount.tsx')].find((f) => fs.existsSync(f));
const nodeModules = path.resolve(args['node-modules'] ?? path.join(here, 'node_modules'));
const step = Math.max(1, Number(args.step ?? 15));
const IMAGE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

const need = (name) => {
  try {
    return createRequire(path.join(nodeModules, 'x.js'))(name);
  } catch {
    console.error(JSON.stringify({error: `${name} is not installed in ${nodeModules}`, fix: 'python3 scripts/scenes.py init --studio <studio> (installs the scene packages, with the person\'s consent)'}));
    process.exit(2);
  }
};
const esbuild = need('esbuild');

const common = {
  bundle: true,
  absWorkingDir: project,
  nodePaths: [nodeModules],
  alias: {'@cadence/frame': frameFile},
  jsx: 'automatic',
  loader: {'.json': 'json'},
  // Scenes may read HF_* switches from the environment of the build: they are baked in.
  define: {
    'process.env.NODE_ENV': '"production"',
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^HF_[A-Z0-9_]+$/.test(k)).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])),
  },
  logLevel: 'error',
  legalComments: 'none',
};

// ---------------------------------------------------------------- 1. discovery in Node

fs.mkdirSync(outDir, {recursive: true});
const nodeBundle = await esbuild.build({
  ...common,
  stdin: {
    contents: [
      `export {renderToStaticMarkup} from 'react-dom/server';`,
      `export {createElement} from 'react';`,
      `export {Frame} from '@cadence/frame';`,
      `import ${JSON.stringify(entry)};`,
    ].join('\n'),
    resolveDir: project,
    loader: 'tsx',
  },
  platform: 'node',
  format: 'cjs',
  write: false,
  outfile: path.join(outDir, 'discover.cjs'),
});

const discovery = {starts: new Set([0]), videos: new Map()};
globalThis.__HF_DISCOVERY__ = discovery;
// Run the CommonJS bundle in this process, without a temporary file: module, exports and require are passed in.
const cjs = {exports: {}};
new Function('module', 'exports', 'require', '__filename', '__dirname', nodeBundle.outputFiles[0].text)(
  cjs, cjs.exports, createRequire(path.join(nodeModules, 'x.js')), path.join(outDir, 'discover.cjs'), outDir);
const mod = cjs.exports;
const compositions = globalThis.__HF_COMPOSITIONS__;
if (!compositions || !Object.keys(compositions).length) {
  console.error(JSON.stringify({error: `${path.relative(project, entry)} did not call render({...}) from '@cadence/frame'`}));
  process.exit(1);
}
const id = args.composition ?? Object.keys(compositions)[0];
const spec = compositions[id];
if (!spec) {
  console.error(JSON.stringify({error: `no composition ${id}`, have: Object.keys(compositions)}));
  process.exit(1);
}
const {fps, width, height, durationInFrames} = spec;
const props = spec.props ?? {};
const cfg = {id, fps, width, height, durationInFrames, defaultProps: props, props};

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const assets = new Set();
const done = new Set();
const last = durationInFrames - 1;
const queue = () => {
  const all = new Set(discovery.starts);
  for (let f = 0; f <= last; f += step) all.add(f);
  all.add(last);
  return [...all].filter((f) => f >= 0 && f <= last && !done.has(f)).sort((a, b) => a - b);
};
let warnings = 0;
for (let todo = queue(); todo.length; todo = queue()) {
  for (const frame of todo) {
    done.add(frame);
    let html = '';
    try {
      html = mod.renderToStaticMarkup(mod.createElement(mod.Frame, {cfg, frame, Component: spec.component}));
    } catch (err) {
      if (warnings++ < 3) console.error(JSON.stringify({warning: `discovery could not render frame ${frame}: ${err.message}`}));
      continue;
    }
    for (const m of unescape(html).matchAll(/public\/[^"'()\s<>]+/g)) assets.add(m[0]);
  }
  if (done.size > 20000) break;
}

// ---------------------------------------------------------------- 2. browser bundle

await esbuild.build({
  ...common,
  stdin: {
    contents: `import ${JSON.stringify(mountFile)};\nimport ${JSON.stringify(entry)};\n`,
    resolveDir: project,
    loader: 'tsx',
  },
  platform: 'browser',
  format: 'iife',
  // React draws random ids for internal keys; a seeded generator keeps every frame and every run identical.
  define: {...common.define, 'Math.random': '__hfRandom'},
  banner: {js: 'var __hfSeed = 0x9e3779b9; function __hfRandom() { __hfSeed = (__hfSeed + 0x6d2b79f5) >>> 0; var t = __hfSeed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }'},
  target: 'chrome120',
  minify: true,
  outfile: path.join(outDir, 'app.js'),
});

// ---------------------------------------------------------------- 3. files and index.html

function linkTree(from, to) {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  for (const entryName of fs.readdirSync(from, {withFileTypes: true})) {
    if (entryName.name.startsWith('.')) continue;
    const a = path.join(from, entryName.name), b = path.join(to, entryName.name);
    if (entryName.isDirectory()) {
      fs.mkdirSync(b, {recursive: true});
      n += linkTree(a, b);
    } else {
      // already linked to this file: keep; otherwise link under a temporary name and rename it over the old one
      // (a big source video is never copied while a hard link is possible)
      if (fs.existsSync(b) && fs.statSync(b).ino === fs.statSync(a).ino) { n++; continue; }
      const tmp = `${b}.hf-link`;
      try {
        if (fs.existsSync(tmp)) fs.renameSync(tmp, b);
        fs.linkSync(a, tmp);
        fs.renameSync(tmp, b);
      } catch {
        fs.copyFileSync(a, b);
      }
      n++;
    }
  }
  return n;
}
fs.mkdirSync(path.join(outDir, 'public'), {recursive: true});
const linked = linkTree(path.join(project, 'public'), path.join(outDir, 'public'));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const sec = (f) => (f / fps).toFixed(4);

// fonts: public/ files or npm:<package>/<file> copied next to the page
const faces = [];
for (const f of spec.fonts ?? []) {
  let url;
  if (f.src.startsWith('npm:')) {
    const file = path.join(nodeModules, f.src.slice(4));
    if (!fs.existsSync(file)) { console.error(JSON.stringify({warning: `font file missing: ${f.src}`})); continue; }
    fs.mkdirSync(path.join(outDir, 'fonts'), {recursive: true});
    fs.copyFileSync(file, path.join(outDir, 'fonts', path.basename(file)));
    url = `fonts/${path.basename(file)}`;
  } else {
    url = `public/${f.src.replace(/^\/+/, '')}`;
  }
  faces.push({...f, url});
}
const fontCss = faces.map((f) => `@font-face { font-family: '${f.family}'; src: url('${f.url}') format('${f.url.endsWith('.woff') ? 'woff' : 'woff2'}'); font-weight: ${f.weight ?? 400}; font-style: ${f.style ?? 'normal'}; font-display: block;${f.unicodeRange ? ` unicode-range: ${f.unicodeRange};` : ''} }`).join('\n      ');
const warm = [...new Map(faces.map((f) => [`${f.family}|${f.weight}|${f.style}`, f])).values()]
  .map((f) => `<span style="font-family:'${esc(f.family)}';font-weight:${f.weight ?? 400};font-style:${f.style ?? 'normal'}">AaZz09 АаЯяЁё</span>`).join('');

const videos = [...discovery.videos.values()].filter((v) => v.src.startsWith('public/'));
const skipped = [...discovery.videos.values()].filter((v) => !v.src.startsWith('public/'));
for (const v of skipped) console.error(JSON.stringify({warning: `video outside public/ is not rendered: ${v.src}`}));
const videoTags = videos.map((v, i) =>
  `<video id="hfv${i}" class="clip" data-hf-key="${esc(v.key)}" src="${esc(v.src)}" data-start="${sec(v.startFrame)}" data-duration="${sec(v.durationFrames)}" data-media-start="${sec(v.mediaStartFrame)}" data-track-index="${1 + i}"${v.loop ? ' loop' : ''} muted playsinline></video>`);
const audioTags = videos.filter((v) => v.volume > 0).map((v, i) =>
  `<audio id="hfa${i}" class="clip" src="${esc(v.src)}" data-start="${sec(v.startFrame)}" data-duration="${sec(v.durationFrames)}" data-media-start="${sec(v.mediaStartFrame)}" data-volume="${v.volume}" data-track-index="${50 + i}"></audio>`);
const images = [...assets].filter((a) => IMAGE.test(a.split('?')[0]));
const missing = images.filter((a) => !fs.existsSync(path.join(outDir, decodeURIComponent(a))));
for (const m of missing.slice(0, 10)) console.error(JSON.stringify({warning: `image not found in public/: ${m}`}));

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${esc(id)}</title>
    <!-- Built by build.mjs from ${esc(path.basename(project))}/${esc(path.relative(project, entry))}; do not edit, rebuild. -->
    <style>
      ${fontCss}
      html, body { margin: 0; background: #000; }
      #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #app { position: absolute; inset: 0; }
      #hf-video-park { display: none; }
      #hf-preload, #hf-font-warm { position: absolute; left: -4000px; top: 0; width: 64px; height: 64px; overflow: hidden; opacity: 0; pointer-events: none; }
      #hf-preload img { width: 64px; height: 64px; }
      #hf-font-warm span { font-size: 48px; white-space: nowrap; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${esc(id)}" data-start="0" data-width="${width}" data-height="${height}" data-duration="${sec(durationInFrames)}" data-fps="${fps}" data-no-timeline>
      <div id="app"></div>
      <div id="hf-video-park">
        ${videoTags.join('\n        ')}
      </div>
      ${audioTags.join('\n      ')}
      <div id="hf-preload"></div>
      <div id="hf-font-warm">${warm}</div>
    </div>
    <script>
      window.__HF_COMPOSITION__ = ${JSON.stringify(id)};
      window.__HF_PRELOAD__ = ${JSON.stringify(images).replaceAll('<', '\\u003c')};
    </script>
    <script src="app.js"></script>
  </body>
</html>
`;
fs.writeFileSync(path.join(outDir, 'index.html'), html);

console.log(JSON.stringify({dir: outDir, composition: id, fps, width, height, durationInFrames, seconds: +(durationInFrames / fps).toFixed(3), framesSampled: done.size, videos: videos.length, sound: audioTags.length, images: images.length, missingImages: missing.length, fonts: faces.length, publicFiles: linked}));
