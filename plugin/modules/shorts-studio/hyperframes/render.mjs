#!/usr/bin/env node
/**
 * Renders the approved segments of the shorts-studio module with the shared Cadence engine (HyperFrames).
 *
 * For every segment it builds a small self-contained project (short.html + lib/motion.js + fonts + the
 * clip) and renders it to short_NN.mp4, one segment after another. No packages to install: the engine is
 * `engine/` at the Cadence root (python3 scripts/engine_setup.py status).
 *
 * Usage:
 *   node render.mjs \
 *     --segments $SHORTS_TMP/approved_segments.json \
 *     --reframe $SHORTS_TMP/reframe.json \
 *     --captions $SHORTS_TMP/transcript.json \
 *     --style bold \
 *     --clips-dir $SHORTS_TMP/clips/ \
 *     --output-dir $SHORTS_TMP/render/ \
 *     [--quality standard] [--workers 1] [--keep-projects] [--build-only]
 *
 * --build-only writes the projects to <output-dir>/_projects/ without rendering (for checks and snapshots).
 *
 * stdout carries one JSON line per step (as before); the engine's own progress goes to stderr.
 */
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cadenceRoot = path.resolve(here, "..", "..", "..");
const engineDir = process.env.CADENCE_ENGINE ? path.resolve(process.env.CADENCE_ENGINE) : path.join(cadenceRoot, "engine");

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, "");
    if (key === "keep-projects" || key === "build-only") parsed[key] = true;
    else parsed[key] = args[++i];
  }
  return parsed;
}

const log = (obj) => console.log(JSON.stringify(obj));

function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {encoding: "utf8"});
  const d = Number(r.stdout.trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

function linkOrCopy(from, to) {
  try {
    fs.linkSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
  }
}

function buildProject(dir, props, clipPath, clipSeconds) {
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(path.join(dir, "lib"), {recursive: true});
  fs.cpSync(path.join(here, "fonts"), path.join(dir, "fonts"), {recursive: true});
  fs.copyFileSync(path.join(engineDir, "lib", "motion.js"), path.join(dir, "lib", "motion.js"));
  linkOrCopy(clipPath, path.join(dir, "clip.mp4"));
  const seconds = props.durationInSeconds.toFixed(3);
  const media = Math.min(clipSeconds ?? props.durationInSeconds, props.durationInSeconds).toFixed(3);
  // The video sits directly in #root (the engine seeks it frame by frame only there); the sound is a separate track.
  const tags = [
    `<video id="clip" class="clip" src="clip.mp4" data-start="0" data-duration="${media}" data-media-start="0" data-track-index="1" muted playsinline></video>`,
    `<audio id="clip-audio" class="clip" src="clip.mp4" data-start="0" data-duration="${media}" data-media-start="0" data-volume="1" data-track-index="2"></audio>`,
  ].join("\n      ");
  let html = fs.readFileSync(path.join(here, "short.html"), "utf8");
  html = html
    .replace(/(data-composition-id="short"[^>]*?data-duration=")[\d.]+"/, `$1${seconds}"`)
    .replace("<!-- shorts:media -->", tags)
    .replace(/(<script type="application\/json" id="short">)[\s\S]*?(<\/script>)/, (_, open, close) =>
      `${open}\n${JSON.stringify(props).replaceAll("<", "\\u003c")}\n    ${close}`);
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

function renderProject(dir, output, quality, workers) {
  const r = spawnSync(
    "npm",
    ["--prefix", engineDir, "run", "render", "--", dir, "--quality", quality, "--fps", "30", "--workers", String(workers), "--output", output],
    {stdio: ["ignore", 2, 2]},
  );
  if (r.status !== 0 || !fs.existsSync(output)) throw new Error(`engine render failed (exit ${r.status})`);
}

function main() {
  const args = parseArgs();
  const segmentsPath = args.segments;
  const reframePath = args.reframe;
  const captionsPath = args.captions;
  const style = args.style || "bold";
  const clipsDir = args["clips-dir"];
  // absolute: the engine runs from engine/, a relative project path would point inside it
  const outputDir = path.resolve(args["output-dir"] || path.join(process.env.SHORTS_TMP || "shorts-tmp", "render"));
  const quality = args.quality || "standard";
  const workers = args.workers || "1";

  if (!segmentsPath || !reframePath || !captionsPath || !clipsDir) {
    console.error(JSON.stringify({
      error: "Missing required arguments",
      usage: "node render.mjs --segments FILE --reframe FILE --captions FILE --clips-dir DIR [--style bold|bounce|clean] [--output-dir DIR] [--quality standard] [--workers 1] [--keep-projects] [--build-only]",
    }));
    process.exit(1);
  }
  if (!args["build-only"] && !fs.existsSync(path.join(engineDir, "node_modules", "hyperframes"))) {
    console.error(JSON.stringify({
      error: "Cadence engine is not installed",
      fix: "python3 scripts/engine_setup.py status (from the Cadence root); install it only with the person's consent.",
    }));
    process.exit(2);
  }

  const segments = JSON.parse(fs.readFileSync(segmentsPath, "utf-8")).segments;
  const reframeData = JSON.parse(fs.readFileSync(reframePath, "utf-8"));
  const allCaptions = JSON.parse(fs.readFileSync(captionsPath, "utf-8")).captions;
  fs.mkdirSync(outputDir, {recursive: true});
  const projectsDir = path.join(outputDir, "_projects");

  const results = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segId = seg.id ?? (i + 1);
    const nn = String(segId).padStart(2, "0");
    const clipName = `clip_${nn}.mp4`;
    const clipPath = path.resolve(clipsDir, clipName);
    const outputPath = path.resolve(outputDir, `short_${nn}.mp4`);

    if (!fs.existsSync(clipPath)) {
      console.error(JSON.stringify({error: `Clip not found: ${clipPath}`}));
      continue;
    }

    const reframe = reframeData.clips?.[clipName] || {};
    if (!reframe.crop) {
      console.error(JSON.stringify({warning: `No reframe data for ${clipName}, using default 9:16 center crop for 1920x1080`}));
    }
    const [srcW, srcH] = (reframe.source_resolution || "1920x1080").split("x").map(Number);

    // Captions for this segment, moved to clip-local time (milliseconds).
    const segStartMs = seg.start * 1000;
    const segEndMs = seg.end * 1000;
    const captions = allCaptions
      .filter((c) => c.startMs >= segStartMs && c.endMs <= segEndMs)
      .map((c) => ({text: c.text, startMs: c.startMs - segStartMs, endMs: c.endMs - segStartMs}));
    const durationInSeconds = seg.end - seg.start;

    const props = {
      sourceWidth: srcW,
      sourceHeight: srcH,
      crop: reframe.crop || {x: 0, y: 0, w: 607, h: 1080},
      cropKeyframes: reframe.crop_keyframes || [],
      captions,
      captionStyle: style,
      hookLine1: seg.hook_line1 || "",
      hookLine2: seg.hook_line2 || "",
      showProgressBar: true,
      durationInSeconds,
    };

    log({action: "render", segment: i + 1, total: segments.length, duration: `${durationInSeconds.toFixed(1)}s`, status: "starting"});

    const projectDir = path.join(projectsDir, `short_${nn}`);
    if (args["build-only"]) {
      buildProject(projectDir, props, clipPath, probeDuration(clipPath));
      results.push({action: "build", segment: i + 1, project: projectDir, status: "complete"});
      log(results.at(-1));
      continue;
    }
    let rendered = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const started = Date.now();
        buildProject(projectDir, props, clipPath, probeDuration(clipPath));
        renderProject(projectDir, outputPath, quality, workers);
        const result = {
          action: "render",
          segment: i + 1,
          output: outputPath,
          duration: `${durationInSeconds.toFixed(1)}s`,
          render_time_sec: ((Date.now() - started) / 1000).toFixed(1),
          file_size_mb: (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1),
          status: "complete",
        };
        results.push(result);
        log(result);
        rendered = true;
        if (!args["keep-projects"]) fs.rmSync(projectDir, {recursive: true, force: true});
        break;
      } catch (err) {
        const payload = {action: "render", segment: i + 1, attempt, error: err.message};
        if (attempt < 2) log({...payload, status: "retrying"});
        else console.error(JSON.stringify({...payload, status: "failed"}));
      }
    }
    if (!rendered) results.push({action: "render", segment: i + 1, output: outputPath, status: "failed"});
  }
  if (!args["keep-projects"] && !args["build-only"]) fs.rmSync(projectsDir, {recursive: true, force: true});

  log({action: "render_complete", segments_rendered: results.filter((r) => r.status === "complete").length, total_segments: segments.length, output_dir: outputDir, results});
}

main();
