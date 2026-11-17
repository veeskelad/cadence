#!/usr/bin/env python3
"""Хайлайт из длинного видео без речи (прогулка, поездка, виды с телефона) → немой черновик на 15–20 с.

Скрипт только читает исходник. Он делит видео на окна по длине плана, оценивает каждое по резкости,
движению в кадре, плавности камеры, тряске и экспозиции и жадно выбирает лучшие с разносом по
исходнику. Обязательные моменты (--pin) входят всегда. По желанию склейки подтягиваются к долям
трека (не дальше ±0,12 с). Подробности — skills/cadence-cut/references/highlight.md.

    python3 scripts/highlight_cut.py score  work/trip/in/walk.mp4 --target 17 --pin 83.5 --dry-run
    python3 scripts/highlight_cut.py score  work/trip/in/walk.mp4 --target 17 --pin 83.5
    python3 scripts/highlight_cut.py render work/trip/in/walk.mp4 --plan work/trip/out/walk-highlight/plan.json

Что получится (по умолчанию в work/<проект>/out/):
    <имя>-highlight/plan.json     планы: откуда, сколько, скорость; его можно править руками
    <имя>-highlight/windows.json  все окна с оценкой — запасные кандидаты на замену
    <имя>-highlight/picks.jpg     лист выбранных кадров с номерами
    <имя>-highlight.mp4           немой черновик (render), по умолчанию 1080×1920, 30 fps
Исходник не меняется. С --json каждая команда печатает один JSON-объект.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, check_output, duration_of, ffmpeg_cmd, first_stream, fmt_time, main_guard,
    out_dir_for, probe, require_input, run, same_file, sha256, write_json,
)

try:
    import numpy as np
except ImportError:  # pragma: no cover - зависит от машины
    np = None

ANALYSIS_FPS = 4
ANALYSIS_WIDTH = 96
SNAP_TOLERANCE = 0.12     # склейку двигаем к доле не дальше этого, с
MIN_SHOT = 0.4            # после подтяжки к долям план не короче, с
RHYTHM = (0.9, 2.2)       # медиана плана в живом хайлайте, с


def need_numpy() -> None:
    if np is None:
        raise CadenceError("Нужен numpy: python3 -m pip install numpy (ставить — с согласия человека).", 3)


# ---------------------------------------------------------------- кадры и метрики

def video_info(path: Path) -> dict:
    info = probe(path)
    v = first_stream(info, "video")
    if not v:
        raise CadenceError("В файле нет картинки.")
    w, h = int(v.get("width", 0)), int(v.get("height", 0))
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(round(float(sd["rotation"]))) % 360
    if rot in (90, 270):
        w, h = h, w
    dur = duration_of(info)
    if not (w and h and dur):
        raise CadenceError("ffprobe не сообщил размер или длину видео.")
    return {"width": w, "height": h, "duration": dur}


def read_frames(path: Path, info: dict):
    """Серые кадры 4 в секунду шириной 96 px; поворот телефона ffmpeg применяет сам."""
    h = max(2, int(round(info["height"] * ANALYSIS_WIDTH / info["width"] / 2)) * 2)
    proc = subprocess.Popen(
        ffmpeg_cmd("-loglevel", "error", "-i", path, "-an", "-vf",
                   f"fps={ANALYSIS_FPS},scale={ANALYSIS_WIDTH}:{h},format=gray", "-f", "rawvideo", "-"),
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size = ANALYSIS_WIDTH * h
    assert proc.stdout is not None
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(h, ANALYSIS_WIDTH).astype(np.float64)
    finally:
        proc.stdout.close()
        proc.wait()


def laplacian_var(f: np.ndarray) -> float:
    lap = f[1:-1, :-2] + f[1:-1, 2:] + f[:-2, 1:-1] + f[2:, 1:-1] - 4 * f[1:-1, 1:-1]
    return float(lap.var())


def phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """Сдвиг b относительно a (dx, dy) в пикселях: фазовая корреляция с уточнением по параболе."""
    win = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    fa, fb = np.fft.fft2((a - a.mean()) * win), np.fft.fft2((b - b.mean()) * win)
    cross = fb * np.conj(fa)
    cross /= np.abs(cross) + 1e-9
    corr = np.real(np.fft.ifft2(cross))
    iy, ix = np.unravel_index(int(np.argmax(corr)), corr.shape)
    h, w = corr.shape

    def refine(m1: float, c0: float, p1: float) -> float:
        den = m1 - 2 * c0 + p1
        return 0.0 if abs(den) < 1e-12 else 0.5 * (m1 - p1) / den

    dx = ix + refine(corr[iy, (ix - 1) % w], corr[iy, ix], corr[iy, (ix + 1) % w])
    dy = iy + refine(corr[(iy - 1) % h, ix], corr[iy, ix], corr[(iy + 1) % h, ix])
    if dx > w / 2:
        dx -= w
    if dy > h / 2:
        dy -= h
    return float(dx), float(dy)


def residual_motion(a: np.ndarray, b: np.ndarray, dx: float, dy: float) -> float:
    """Что осталось от разницы кадров после сдвига камеры — движение внутри кадра."""
    sx, sy = int(round(dx)), int(round(dy))
    h, w = a.shape
    ya, yb = (slice(0, h - sy), slice(sy, h)) if sy >= 0 else (slice(-sy, h), slice(0, h + sy))
    xa, xb = (slice(0, w - sx), slice(sx, w)) if sx >= 0 else (slice(-sx, w), slice(0, w + sx))
    pa, pb = a[ya, xa], b[yb, xb]
    return float(np.abs(pb - pa).mean()) if pa.size else 0.0


def frame_metrics(path: Path, info: dict) -> np.ndarray:
    """Строка на кадр: резкость, яркость, сдвиг x, сдвиг y, движение в кадре."""
    rows, prev = [], None
    for f in read_frames(path, info):
        dx = dy = resid = 0.0
        if prev is not None:
            dx, dy = phase_shift(prev, f)
            resid = residual_motion(prev, f, dx, dy)
        rows.append((laplacian_var(f), float(f.mean()), dx, dy, resid))
        prev = f
    if len(rows) < 4:
        raise CadenceError("Видео слишком короткое для хайлайта.")
    return np.array(rows, dtype=np.float64)


def zscore(v: np.ndarray) -> np.ndarray:
    sd = v.std()
    return (v - v.mean()) / sd if sd > 1e-9 else np.zeros_like(v)


def score_windows(m: np.ndarray, shot: float, step: float) -> list[dict]:
    """Окна по shot секунд с шагом step. Оценка: резкость важнее всего, тряска сильно штрафуется,
    движение в кадре и ровная панорама — плюс, пересвет или провал — минус."""
    win = max(2, int(round(shot * ANALYSIS_FPS)))
    hop = max(1, int(round(step * ANALYSIS_FPS)))
    sharp_log = np.log1p(m[:, 0])
    out = []
    for start in range(0, len(m) - win + 1, hop):
        seg = m[start:start + win]
        shift = seg[1:, 2:4]
        speed = np.hypot(shift[:, 0], shift[:, 1])
        jerk = float(np.hypot(*np.diff(shift, axis=0).std(axis=0))) if len(shift) > 2 else 0.0
        out.append({"start": round(start / ANALYSIS_FPS, 2), "sharp": float(sharp_log[start:start + win].mean()),
                    "bright": float(seg[:, 1].mean()), "pan": float(speed.mean()), "jerk": jerk,
                    "action": float(seg[1:, 4].mean())})
    if not out:
        return out
    sharp = zscore(np.array([w["sharp"] for w in out]))
    jerk = zscore(np.array([w["jerk"] for w in out]))
    action = zscore(np.array([w["action"] for w in out]))
    for i, w in enumerate(out):
        exposure = abs(w["bright"] - 118) / 60          # 0 — середина, около 1 — пересвет или провал
        steady_pan = 0.4 if 0.3 < w["pan"] < 4.0 else 0.0  # камера живая, но не смазанная
        w["score"] = round(float(sharp[i] + 0.5 * action[i] + steady_pan - 0.9 * jerk[i] - exposure), 3)
        for k in ("sharp", "bright", "pan", "jerk", "action"):
            w[k] = round(w[k], 3)
    return out


# ---------------------------------------------------------------- выбор и ритм

def select(windows: list[dict], target: float, shot: float, gap: float, pins: list[float]) -> list[dict]:
    count = max(1, round(target / shot))
    chosen: list[dict] = []
    for t in pins:
        near = min(windows, key=lambda w: abs(w["start"] + shot / 2 - t))
        if not any(c["start"] == near["start"] for c in chosen):
            chosen.append({**near, "pinned": True, "pin": t})
    for w in sorted(windows, key=lambda w: w["score"], reverse=True):
        if len(chosen) >= count:
            break
        if all(abs(w["start"] - c["start"]) >= gap for c in chosen):
            chosen.append(w)
    chosen.sort(key=lambda w: w["start"])
    return chosen


def order_shots(picks: list[dict], order: str) -> list[dict]:
    """strongest-first: самый сильный план открывает ролик, остальные — по ходу исходника."""
    if order == "source" or len(picks) < 2:
        return picks
    best = max(picks, key=lambda p: p["score"])
    return [best] + [p for p in picks if p is not best]


def beat_times(path: Path, music_in: float) -> list[float]:
    """Доли из карты scripts/track_structure.py (firstBeat, beat, beats) или из {"times": [...]},
    во времени ролика: трек начинается в ролике с music_in секунды трека."""
    data = json.loads(require_input(path, "карта долей").read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("times"), list):
        times = [float(t) for t in data["times"]]
    elif isinstance(data, dict) and all(k in data for k in ("firstBeat", "beat", "beats")):
        first, beat, n = float(data["firstBeat"]), float(data["beat"]), int(data["beats"])
        if beat <= 0:
            raise CadenceError("Карта долей: beat должен быть больше нуля.")
        times = [first + k * beat for k in range(n)]
    else:
        raise CadenceError("Карта долей: нужен вывод track_structure.py --json или {\"times\": [...]}.")
    return sorted(t - music_in for t in times if t - music_in > 0)


def snap_to_beats(durations: list[float], beats: list[float], tol: float = SNAP_TOLERANCE) -> tuple[list[float], list[float]]:
    """Склейки (границы планов в ролике) двигаются к ближайшей доле, если она не дальше tol.
    Возвращает новые длины и сдвиг каждой склейки."""
    bounds, t = [], 0.0
    for d in durations:
        t += d
        bounds.append(t)
    moved, new_bounds, prev = [], [], 0.0
    for b in bounds:
        near = min(beats, key=lambda x: abs(x - b)) if beats else None
        nb = near if near is not None and abs(near - b) <= tol and near - prev >= MIN_SHOT else b
        nb = max(nb, prev + MIN_SHOT)
        moved.append(round(nb - b, 3))
        new_bounds.append(nb)
        prev = nb
    out, prev = [], 0.0
    for nb in new_bounds:
        out.append(round(nb - prev, 3))
        prev = nb
    return out, moved


def median(values: list[float]) -> float:
    v = sorted(values)
    n = len(v)
    return 0.0 if not n else (v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2)


# ---------------------------------------------------------------- лист и рендер

def contact_sheet(src: Path, shots: list[dict], out: Path) -> bool:
    filters = run(ffmpeg_cmd("-filters")).stdout or ""
    labels = bool(re.search(r"\sdrawtext\s", filters))  # в некоторых сборках ffmpeg нет drawtext
    inputs, parts = [], []
    for i, s in enumerate(shots):
        inputs += ["-ss", f"{s['start'] + s['duration'] * s.get('speed', 1.0) / 2:.2f}", "-i", str(src)]
        chain = f"[{i}:v]scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2"
        if labels:
            tag = "PIN " if s.get("pinned") else ""
            chain += (f",drawtext=text='{tag}{i + 1} {s['start']:.1f}s':x=6:y=6:fontsize=22:"
                      "fontcolor=yellow:box=1:boxcolor=black@0.6")
        parts.append(chain + f",trim=end_frame=1,setpts=PTS-STARTPTS[v{i}]")
    n = len(shots)
    if n == 1:
        graph = parts[0].replace("[v0]", "[out]")
    else:
        cols = min(5, n)
        layout = "|".join(f"{(i % cols) * 270}_{(i // cols) * 480}" for i in range(n))
        graph = ";".join(parts) + ";" + "".join(f"[v{i}]" for i in range(n)) + \
            f"xstack=inputs={n}:layout={layout}:fill=black[out]"
    run(ffmpeg_cmd("-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
                   "-frames:v", "1", out))
    return labels


def render_graph(shots: list[dict], width: int, height: int, fps: int) -> str:
    parts = []
    for i, s in enumerate(shots):
        speed = float(s.get("speed", 1.0))
        src_len = float(s["duration"]) * speed
        parts.append(f"[0:v:0]trim=start={float(s['start']):.3f}:duration={src_len:.3f},"
                     f"setpts=(PTS-STARTPTS)/{speed:.4f},"
                     f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},"
                     f"fps={fps},setsar=1[s{i}]")
    return ";".join(parts) + ";" + "".join(f"[s{i}]" for i in range(len(shots))) + \
        f"concat=n={len(shots)}:v=1:a=0[out]"


def check_plan(plan: dict, duration: float) -> list[dict]:
    shots = plan.get("shots") if isinstance(plan, dict) else None
    if not isinstance(shots, list) or not shots:
        raise CadenceError("plan.json: нужен непустой список shots.")
    for i, s in enumerate(shots):
        try:
            start, dur, speed = float(s["start"]), float(s["duration"]), float(s.get("speed", 1.0))
        except (KeyError, TypeError, ValueError):
            raise CadenceError(f"plan.json: shots[{i}] — нужны числа start, duration и (по желанию) speed.")
        if dur <= 0 or not (0.25 <= speed <= 4.0):
            raise CadenceError(f"plan.json: shots[{i}] — duration > 0, speed от 0.25 до 4.")
        if start < 0 or start + dur * speed > duration + 0.05:
            raise CadenceError(f"plan.json: shots[{i}] выходит за исходник: {start:.2f} + {dur * speed:.2f} с "
                               f"при длине {duration:.2f} с.")
    return shots


# ---------------------------------------------------------------- команды

def cmd_score(args) -> tuple[dict, list[str]]:
    need_numpy()
    src = require_input(args.video, "видео")
    if args.shot <= 0 or args.target <= 0:
        raise CadenceError("--shot и --target должны быть больше нуля.")
    info = video_info(src)
    for t in args.pin:
        if not 0 <= t <= info["duration"]:
            raise CadenceError(f"--pin {t}: такого момента нет, длина видео {info['duration']:.1f} с.")
    folder = (Path(args.out_dir).expanduser() if args.out_dir
              else out_dir_for(src, args.project) / f"{src.stem}-highlight")
    if same_file(folder, src.parent):
        raise CadenceError("Отказ: папка результата совпадает с папкой исходника.")

    metrics = frame_metrics(src, info)
    windows = score_windows(metrics, args.shot, args.shot / 3)
    if not windows:
        raise CadenceError("Видео короче одного плана — нечего выбирать.")
    gap = args.gap or max(args.shot * 2, info["duration"] / (args.target / args.shot) / 2)
    picks = order_shots(select(windows, args.target, args.shot, gap, args.pin), args.order)
    durations = [args.shot] * len(picks)
    moved: list[float] = []
    if args.beats:
        durations, moved = snap_to_beats(durations, beat_times(Path(args.beats), args.music_in))
    shots = []
    for p, d in zip(picks, durations):
        start = min(p["start"], max(0.0, info["duration"] - d))
        shots.append({"start": round(start, 3), "duration": d, "speed": 1.0, "score": p["score"],
                      **({"pinned": True, "pin": p["pin"]} if p.get("pinned") else {})})
    med = median([s["duration"] for s in shots])
    notes = []
    if not RHYTHM[0] <= med <= RHYTHM[1]:
        notes.append(f"медиана плана {med:.2f} с вне {RHYTHM[0]}–{RHYTHM[1]} с: ролик будет "
                     + ("дёрганым" if med < RHYTHM[0] else "вялым") + "; поменяй --shot")
    plan = {"tool": "cadence highlight_cut", "source": str(src), "source_duration": round(info["duration"], 2),
            "target": args.target, "shot": args.shot, "gap": round(gap, 2), "order": args.order,
            "beats": str(args.beats) if args.beats else None, "music_in": args.music_in if args.beats else None,
            "beat_shift": moved, "median_shot": round(med, 3), "duration": round(sum(durations), 3),
            "notes": notes, "shots": shots}
    result = {**plan, "output": str(folder), "windows": len(windows)}
    lines = [f"Исходник: {src} ({fmt_time(info['duration'])})",
             f"Окон оценено: {len(windows)}; выбрано планов: {len(shots)} по ~{args.shot:g} с, "
             f"разнос в исходнике не меньше {gap:.1f} с; итог {sum(durations):.1f} с"]
    for i, s in enumerate(shots, 1):
        lines.append(f"  {i}. {fmt_time(s['start'])} на {s['duration']:.2f} с, оценка {s['score']:+.2f}"
                     + (" — обязательный" if s.get("pinned") else ""))
    if args.beats:
        lines.append(f"Склейки к долям: подвинуто {sum(1 for x in moved if x)} из {len(moved)}, "
                     f"не дальше {SNAP_TOLERANCE} с")
    lines += [f"Внимание: {n}" for n in notes]
    lines.append(f"Будет записано: {folder}/plan.json, windows.json, picks.jpg")
    if args.dry_run:
        result["status"] = "PLAN"
        lines.append("Это план (--dry-run). Ничего не записано.")
        return result, lines
    if folder.exists() and not args.overwrite:
        raise CadenceError(f"Отказ: папка {folder} уже есть. Укажи другую --out-dir или добавь --overwrite.")
    folder.mkdir(parents=True, exist_ok=True)
    write_json(folder / "plan.json", plan)
    write_json(folder / "windows.json", {"shot": args.shot, "windows": windows})
    labelled = contact_sheet(src, shots, folder / "picks.jpg")
    result["status"] = "DONE"
    lines.append(f"Готово: {folder}. Посмотри picks.jpg" + ("" if labelled else " (без подписей: в ffmpeg нет drawtext)")
                 + ": смаз, пересвет, палец в кадре, одно место дважды — замени план соседним окном из windows.json.")
    return result, lines


def cmd_render(args) -> tuple[dict, list[str]]:
    src = require_input(args.video, "видео")
    plan_path = require_input(args.plan, "plan.json")
    m = re.fullmatch(r"(\d{2,4})x(\d{2,4})", args.size)
    if not m:
        raise CadenceError("--size: ширина x высота, например 1080x1920.")
    width, height = int(m.group(1)), int(m.group(2))
    if width % 2 or height % 2:
        raise CadenceError("--size: ширина и высота должны быть чётными.")
    info = video_info(src)
    try:
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise CadenceError(f"plan.json не читается: {exc}")
    shots = check_plan(plan, info["duration"])
    total = sum(float(s["duration"]) for s in shots)
    out = (Path(args.out).expanduser() if args.out
           else out_dir_for(src, args.project) / f"{src.stem}-highlight.mp4")
    if out.suffix.lower() != ".mp4":
        raise CadenceError("--out должен заканчиваться на .mp4")
    result = {"tool": "cadence highlight_cut render", "source": str(src), "plan": str(plan_path),
              "output": str(out), "shots": len(shots), "duration_planned": round(total, 3),
              "size": f"{width}x{height}", "fps": args.fps}
    lines = [f"Планов: {len(shots)}, длина {total:.1f} с, {width}×{height}, {args.fps} fps, без звука",
             f"Будет записано: {out}"]
    if args.dry_run:
        result["status"] = "PLAN"
        lines.append("Это план (--dry-run). Ничего не записано.")
        return result, lines
    out = check_output(out, [src, plan_path], args.overwrite)
    src_hash = sha256(src)
    part = out.with_name(out.stem + ".part.mp4")
    try:
        run(ffmpeg_cmd("-y", "-loglevel", "error", "-i", src, "-filter_complex",
                       render_graph(shots, width, height, args.fps), "-map", "[out]", "-c:v", "libx264",
                       "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", part))
        part.replace(out)
    finally:
        if part.exists():
            part.unlink()
    if sha256(src) != src_hash:
        raise CadenceError("Внимание: исходник изменился во время работы. Проверь файл.")
    real = duration_of(probe(out))
    result.update({"status": "DONE", "duration": round(real, 3)})
    lines.append(f"Готово: {out} ({fmt_time(real)}). Звука нет: музыку ставят по навыку cadence-sound.")
    return result, lines


def main() -> int:
    ap = argparse.ArgumentParser(description="Хайлайт из длинного видео без речи. Исходник не меняется.")
    sub = ap.add_subparsers(dest="command", required=True)
    s = sub.add_parser("score", help="оценить окна и предложить план")
    s.add_argument("video", help="длинное видео без речи")
    s.add_argument("--target", type=float, default=17.0, help="длина ролика, с (по умолчанию 17)")
    s.add_argument("--shot", type=float, default=1.4, help="длина плана, с (по умолчанию 1.4; живой ритм — 0.9–2.2)")
    s.add_argument("--gap", type=float, default=0.0, help="разнос планов в исходнике, с; 0 — сам")
    s.add_argument("--pin", type=float, action="append", default=[], help="обязательный момент исходника, с (можно несколько)")
    s.add_argument("--order", choices=["strongest-first", "source"], default="strongest-first",
                   help="strongest-first: открыть самым сильным планом (по умолчанию); source — по ходу исходника")
    s.add_argument("--beats", help="карта долей трека: вывод track_structure.py --json или {\"times\": [...]}")
    s.add_argument("--music-in", type=float, default=0.0, help="с какой секунды трека начинается ролик (для --beats)")
    s.add_argument("--out-dir", help="новая папка (по умолчанию out/<имя>-highlight)")
    s.add_argument("--project", help="имя проекта в work/")
    s.add_argument("--dry-run", action="store_true", help="посчитать и показать, ничего не писать")
    s.add_argument("--overwrite", action="store_true")
    s.add_argument("--json", action="store_true", help="напечатать результат одним JSON-объектом")
    r = sub.add_parser("render", help="собрать немой черновик по plan.json")
    r.add_argument("video", help="тот же исходник")
    r.add_argument("--plan", required=True, help="plan.json из score (можно поправленный)")
    r.add_argument("--size", default="1080x1920", help="размер кадра (по умолчанию 1080x1920; горизонталь — 1920x1080)")
    r.add_argument("--fps", type=int, default=30, choices=[24, 25, 30, 50, 60])
    r.add_argument("--out", help="путь к MP4 (по умолчанию out/<имя>-highlight.mp4)")
    r.add_argument("--project", help="имя проекта в work/")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--overwrite", action="store_true")
    r.add_argument("--json", action="store_true")
    args = ap.parse_args()
    result, lines = (cmd_score if args.command == "score" else cmd_render)(args)
    print(json.dumps(result, ensure_ascii=False) if args.json else "\n".join(lines))
    return 0


if __name__ == "__main__":
    main_guard(main)
