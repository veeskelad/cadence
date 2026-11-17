#!/usr/bin/env python3
"""Вырезать паузы из видео с речью (говорящая голова, влог).

Сначала план, потом выполнение:

    python3 scripts/silence_cut.py work/my-vlog/in/take1.mp4 --dry-run
    python3 scripts/silence_cut.py work/my-vlog/in/take1.mp4

Что получится (по умолчанию в work/<проект>/out/):
    <имя>-cut.mp4   новое видео без пауз (перекодировано, резы точные, стыки звука с фейдом 10 мс)
    <имя>-cut.json  список оставленных кусков и вырезанных пауз
    <имя>-cut.edl   тот же монтаж для импорта в DaVinci Resolve (CMX3600)

Исходник не меняется. Выход, совпадающий со входом, — отказ.
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, check_output, default_output, duration_of, ffmpeg_cmd, first_stream,
    fmt_time, main_guard, parse_rate, probe, require_input, run, same_file, sha256,
    video_fps, write_json,
)

FADE = 0.010  # 10 мс фейд на каждом стыке звука


# ---------------------------------------------------------------- анализ

def detect_silences(path: Path, threshold_db: float, min_silence: float, duration: float) -> list[tuple[float, float]]:
    proc = run(ffmpeg_cmd("-nostats", "-i", path, "-map", "0:a:0", "-af",
                          f"silencedetect=noise={threshold_db}dB:d={min_silence}",
                          "-f", "null", "-"))
    silences, start = [], None
    for line in (proc.stderr or "").splitlines():
        m = re.search(r"silence_start:\s*(-?[\d.]+)", line)
        if m:
            start = max(0.0, float(m.group(1)))
            continue
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m and start is not None:
            silences.append((start, min(float(m.group(1)), duration)))
            start = None
    if start is not None:  # тишина до конца файла
        silences.append((start, duration))
    return silences


def plan_segments(silences: list[tuple[float, float]], duration: float, padding: float,
                  merge_gap: float, min_keep: float, fps: float) -> list[tuple[float, float]]:
    """Речь = всё, что не тишина; расширяем на padding, склеиваем близкие, выбрасываем крошки."""
    speech, cursor = [], 0.0
    for s, e in silences:
        if s > cursor:
            speech.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < duration:
        speech.append((cursor, duration))

    padded = [(max(0.0, s - padding), min(duration, e + padding)) for s, e in speech]
    merged: list[list[float]] = []
    for s, e in padded:
        if merged and s - merged[-1][1] < merge_gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])

    # Границы — по сетке кадров, чтобы звук и картинка были одной длины и не расползались.
    def snap(t: float) -> float:
        return round(t * fps) / fps if fps > 0 else t

    out = []
    for s, e in merged:
        s2, e2 = snap(s), min(snap(e), duration)
        if e2 - s2 >= max(min_keep, 1.0 / fps if fps else 0.0):
            out.append((round(s2, 6), round(e2, 6)))
    return out


def removed_intervals(keep: list[tuple[float, float]], duration: float) -> list[tuple[float, float]]:
    gaps, cursor = [], 0.0
    for s, e in keep:
        if s - cursor > 1e-6:
            gaps.append((cursor, s))
        cursor = e
    if duration - cursor > 1e-6:
        gaps.append((cursor, duration))
    return gaps


# ---------------------------------------------------------------- выход

def build_filtergraph(keep: list[tuple[float, float]], duration: float) -> str:
    parts, pads = [], []
    last = len(keep) - 1
    for i, (s, e) in enumerate(keep):
        length = e - s
        parts.append(f"[0:v:0]trim=start={s:.6f}:end={e:.6f},setpts=PTS-STARTPTS[v{i}]")
        chain = f"[0:a:0]atrim=start={s:.6f}:end={e:.6f},asetpts=PTS-STARTPTS"
        if (i > 0 or s > 0) and length > 2 * FADE:
            chain += f",afade=t=in:st=0:d={FADE}"
        if (i < last or e < duration) and length > 2 * FADE:
            chain += f",afade=t=out:st={length - FADE:.6f}:d={FADE}"
        parts.append(chain + f"[a{i}]")
        pads.append(f"[v{i}][a{i}]")
    parts.append("".join(pads) + f"concat=n={len(keep)}:v=1:a=1[vout][aout]")
    return ";".join(parts)


def out_rate(info: dict, fps: float) -> str:
    """Постоянная частота кадров результата: как у исходника (телефонное VFR — по средней)."""
    v = first_stream(info, "video") or {}
    r = v.get("r_frame_rate") or ""
    if re.fullmatch(r"\d+/\d+", r) and 0 < parse_rate(r) <= 120 and abs(parse_rate(r) - fps) < 0.05:
        return r
    for std in ("24000/1001", "24/1", "25/1", "30000/1001", "30/1", "50/1", "60000/1001", "60/1"):
        if abs(parse_rate(std) - fps) < 0.05:
            return std
    return f"{fps:.3f}"


def tc(frames: int, base: int) -> str:
    ff = frames % base
    total_s = frames // base
    return f"{total_s // 3600:02d}:{total_s // 60 % 60:02d}:{total_s % 60:02d}:{ff:02d}"


def parse_tc(value: str | None, base: int) -> int:
    if not value:
        return 0
    m = re.match(r"(\d+):(\d+):(\d+)[:;.](\d+)", value)
    if not m:
        return 0
    h, mi, s, f = (int(x) for x in m.groups())
    return ((h * 60 + mi) * 60 + s) * base + f


def write_edl(path: Path, title: str, clip_name: str, keep: list[tuple[float, float]],
              fps: float, src_tc: str | None) -> None:
    base = max(1, int(round(fps)))
    src_offset = parse_tc(src_tc, base)
    rec = 3600 * base  # таймлайн Resolve по умолчанию начинается с 01:00:00:00
    lines = [f"TITLE: {title}", "FCM: NON-DROP FRAME", ""]
    for n, (s, e) in enumerate(keep, 1):
        fin, fout = int(round(s * fps)), int(round(e * fps))
        length = fout - fin
        if length <= 0:
            continue
        lines.append(f"{n:03d}  {'AX':<8} {'AA/V':<5} C        "
                     f"{tc(src_offset + fin, base)} {tc(src_offset + fout, base)} "
                     f"{tc(rec, base)} {tc(rec + length, base)}")
        lines.append(f"* FROM CLIP NAME: {clip_name}")
        lines.append("")
        rec += length
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Вырезать паузы из видео с речью. Исходник не меняется.")
    ap.add_argument("video", help="путь к видео")
    ap.add_argument("--dry-run", action="store_true", help="только показать план, ничего не писать")
    ap.add_argument("--threshold", type=float, default=-35.0,
                    help="что считать тишиной, dB (по умолчанию -35; тихая запись — -45)")
    ap.add_argument("--min-silence", type=float, default=0.45,
                    help="паузы короче не трогаем, с (по умолчанию 0.45)")
    ap.add_argument("--padding", type=float, default=0.12,
                    help="запас вокруг речи, с (по умолчанию 0.12)")
    ap.add_argument("--merge-gap", type=float, default=0.20,
                    help="куски речи с зазором меньше этого склеиваются, с (по умолчанию 0.20)")
    ap.add_argument("--min-keep", type=float, default=0.30,
                    help="кусок короче выбрасывается как щелчок, с (по умолчанию 0.30)")
    ap.add_argument("--out", help="путь к новому MP4 (по умолчанию work/<проект>/out/<имя>-cut.mp4)")
    ap.add_argument("--project", help="имя проекта в work/ (по умолчанию — из пути или имени файла)")
    ap.add_argument("--crf", type=int, default=18, help="качество x264, меньше = лучше (по умолчанию 18)")
    ap.add_argument("--preset", default="medium", help="скорость x264 (по умолчанию medium)")
    ap.add_argument("--overwrite", action="store_true", help="разрешить заменить прежний результат")
    args = ap.parse_args()

    src = require_input(args.video, "видео")
    if not re.fullmatch(r"[a-z]+", args.preset):
        raise CadenceError("--preset: только имя пресета x264, например medium или fast")
    info = probe(src)
    if not first_stream(info, "video"):
        raise CadenceError("В файле нет картинки. Этот скрипт режет видео.")
    if not first_stream(info, "audio"):
        raise CadenceError("В файле нет звука — паузы искать не по чему.")
    duration = duration_of(info)
    fps = video_fps(info) or 30.0
    rate = out_rate(info, fps)

    silences = detect_silences(src, args.threshold, args.min_silence, duration)
    keep = plan_segments(silences, duration, args.padding, args.merge_gap, args.min_keep, fps)
    if not keep:
        raise CadenceError(f"При пороге {args.threshold} dB весь файл похож на тишину. "
                           "Попробуйте --threshold -45 или проверьте звук: inspect_video.py.")
    removed = removed_intervals(keep, duration)
    out_len = sum(e - s for s, e in keep)
    cut_len = duration - out_len

    out = Path(args.out).expanduser() if args.out else default_output(src, "cut", ".mp4", args.project)
    if out.suffix.lower() != ".mp4":
        raise CadenceError("--out должен заканчиваться на .mp4")
    for side in (out, out.with_suffix(".json"), out.with_suffix(".edl")):
        if same_file(side, src):
            raise CadenceError(f"Отказ: выход {side} совпадает с исходником. "
                               "Исходник не перезаписываем — укажи другой --out.")

    print(f"Исходник: {src}")
    print(f"Длина: {fmt_time(duration)} → {fmt_time(out_len)} "
          f"(вырезано {cut_len:.1f} с, {cut_len / duration:.0%})" if duration else "")
    print(f"Резов: {len(removed)}, кусков речи: {len(keep)}; порог {args.threshold} dB, "
          f"пауза от {args.min_silence} с, запас {args.padding} с")
    for s, e in removed[:12]:
        print(f"  вырезать {fmt_time(s)}–{fmt_time(e)} ({e - s:.2f} с)")
    if len(removed) > 12:
        print(f"  … и ещё {len(removed) - 12}")
    print(f"Будет записано: {out}, {out.with_suffix('.json').name}, {out.with_suffix('.edl').name}")

    if not removed:
        print("Пауз длиннее порога не нашлось — резать нечего, файл не пишу.")
        return 0
    if args.dry_run:
        print("Это план (--dry-run). Ничего не записано.")
        return 0

    out = check_output(out, [src], args.overwrite)
    json_path, edl_path = out.with_suffix(".json"), out.with_suffix(".edl")
    for side in (json_path, edl_path):
        check_output(side, [src], args.overwrite)

    src_hash = sha256(src)
    tmp = out.with_name(out.stem + ".part.mp4")
    graph = build_filtergraph(keep, duration)
    cmd = ffmpeg_cmd("-y", "-loglevel", "error", "-i", src, "-filter_complex", graph,
                     "-map", "[vout]", "-map", "[aout]",
                     "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
                     "-pix_fmt", "yuv420p", "-fps_mode", "cfr", "-r", rate, "-c:a", "aac", "-b:a", "192k",
                     "-movflags", "+faststart", tmp)
    print("Режу и перекодирую…")
    try:
        run(cmd)
        tmp.replace(out)
    finally:
        if tmp.exists():
            tmp.unlink()

    if sha256(src) != src_hash:  # не должно случиться никогда; проверяем всё равно
        raise CadenceError("Внимание: исходник изменился во время работы. Проверь файл.")

    real = duration_of(probe(out))
    v = first_stream(info, "video") or {}
    write_json(json_path, {
        "tool": "cadence silence_cut",
        "source": str(src),
        "source_sha256": src_hash,
        "output": str(out),
        "settings": {"threshold_db": args.threshold, "min_silence": args.min_silence,
                     "padding": args.padding, "merge_gap": args.merge_gap,
                     "min_keep": args.min_keep, "fps": fps},
        "duration_in": round(duration, 3),
        "duration_out_planned": round(out_len, 3),
        "duration_out": round(real, 3),
        "cuts": len(removed),
        "keep": [{"start": s, "end": e} for s, e in keep],
        "removed": [{"start": round(s, 6), "end": round(e, 6)} for s, e in removed],
    })
    write_edl(edl_path, out.stem, src.name, keep, fps,
              ((info.get("format") or {}).get("tags") or {}).get("timecode")
              or (v.get("tags") or {}).get("timecode"))
    print(f"Готово: {out} ({fmt_time(real)})")
    print(f"Список резов: {json_path}")
    print(f"Для DaVinci Resolve: {edl_path}")
    if math.fabs(real - out_len) > 0.2:
        print(f"Внимание: длина результата {real:.2f} с, ожидалось {out_len:.2f} с.")
    return 0


if __name__ == "__main__":
    main_guard(main)
