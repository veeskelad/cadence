#!/usr/bin/env python3
"""Паспорт видео: что за файл, перед тем как его резать.

Только читает файл. Ничего не пишет, кроме вывода в терминал (или JSON с --json).

    python3 scripts/inspect_video.py work/my-vlog/in/take1.mp4
    python3 scripts/inspect_video.py take1.mp4 --json
    python3 scripts/inspect_video.py take1.mp4 --quick      # без прохода по звуку и кадрам
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, duration_of, ffmpeg_cmd, first_stream, fmt_time, main_guard,
    parse_ebur128, parse_rate, probe, require_input, run,
)


def rotation_of(stream: dict) -> int:
    for sd in stream.get("side_data_list", []) or []:
        if "rotation" in sd:
            try:
                return int(round(float(sd["rotation"]))) % 360
            except (TypeError, ValueError):
                pass
    tag = (stream.get("tags") or {}).get("rotate")
    if tag:
        try:
            return int(tag) % 360
        except ValueError:
            pass
    return 0


def analyse(path: Path, silence_db: float, silence_min: float, has_audio: bool,
            has_video: bool) -> dict:
    """Один проход ffmpeg: громкость, тишина, чёрные кадры."""
    parts, maps = [], []
    if has_audio:
        parts.append(f"[0:a:0]ebur128=peak=true:framelog=quiet,"
                     f"silencedetect=noise={silence_db}dB:d={silence_min}[aout]")
        maps += ["-map", "[aout]"]
    if has_video:
        parts.append("[0:v:0]scale=320:-2,blackdetect=d=0.5:pix_th=0.10[vout]")
        maps += ["-map", "[vout]"]
    if not parts:
        return {}
    proc = run(ffmpeg_cmd("-nostats", "-i", path, "-filter_complex", ";".join(parts),
                          *maps, "-f", "null", "-"))
    err = proc.stderr or ""
    result: dict = {}
    if has_audio:
        result["loudness"] = parse_ebur128(err)
        result["silences"] = parse_silences(err)
    if has_video:
        result["black"] = [
            {"start": float(a), "end": float(b)}
            for a, b in re.findall(r"black_start:([\d.]+)\s+black_end:([\d.]+)", err)
        ]
    return result


def parse_silences(text: str) -> list[dict]:
    out, start = [], None
    for line in text.splitlines():
        m = re.search(r"silence_start:\s*(-?[\d.]+)", line)
        if m:
            start = max(0.0, float(m.group(1)))
            continue
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m and start is not None:
            out.append({"start": start, "end": float(m.group(1))})
            start = None
    if start is not None:
        out.append({"start": start, "end": None})
    return out


def passport(path: Path, quick: bool, silence_db: float, silence_min: float) -> dict:
    info = probe(path)
    fmt = info.get("format", {})
    v = first_stream(info, "video")
    a = first_stream(info, "audio")
    dur = duration_of(info)
    data: dict = {
        "file": str(path),
        "container": fmt.get("format_name"),
        "duration": round(dur, 3),
        "size_bytes": int(fmt.get("size", 0) or 0),
        "bitrate_kbps": round(int(fmt.get("bit_rate", 0) or 0) / 1000),
        "video": None,
        "audio": None,
        "timecode": (fmt.get("tags") or {}).get("timecode")
                    or ((v or {}).get("tags") or {}).get("timecode"),
    }
    if v:
        w, h = int(v.get("width", 0)), int(v.get("height", 0))
        rot = rotation_of(v)
        dw, dh = (h, w) if rot in (90, 270) else (w, h)
        avg = parse_rate(v.get("avg_frame_rate"))
        real = parse_rate(v.get("r_frame_rate"))
        data["video"] = {
            "codec": v.get("codec_name"),
            "profile": v.get("profile"),
            "pix_fmt": v.get("pix_fmt"),
            "width": w, "height": h,
            "rotation": rot,
            "display_width": dw, "display_height": dh,
            "orientation": "вертикальное" if dh > dw else ("квадрат" if dh == dw else "горизонтальное"),
            "fps": round(avg or real, 3),
            "variable_fps": bool(avg and real and abs(avg - real) > 0.05),
            "color": v.get("color_transfer"),
        }
    if a:
        data["audio"] = {
            "codec": a.get("codec_name"),
            "sample_rate": int(a.get("sample_rate", 0) or 0),
            "channels": a.get("channels"),
            "layout": a.get("channel_layout"),
        }
    data["audio_streams"] = sum(1 for s in info.get("streams", []) if s.get("codec_type") == "audio")
    if not quick:
        data.update(analyse(path, silence_db, silence_min, bool(a), bool(v)))
        sil = data.get("silences") or []
        total = sum(((s["end"] if s["end"] is not None else dur) - s["start"]) for s in sil)
        data["silence_total"] = round(total, 2)
    return data


def advice(d: dict) -> list[str]:
    tips = []
    v, a = d.get("video"), d.get("audio")
    if not a:
        tips.append("Звука нет — вырезать паузы по звуку не получится.")
    if v and v.get("variable_fps"):
        tips.append("Частота кадров плавает (обычно так снимает телефон). Нарезка справится, "
                    "но в DaVinci Resolve при импорте EDL возможен сдвиг на кадр.")
    if v and v.get("color") in ("arib-std-b67", "smpte2084"):
        tips.append("Видео в HDR. При перекодировании цвета могут стать бледнее; "
                    "если так случится — снимайте в SDR или конвертируйте в Resolve.")
    loud = d.get("loudness") or {}
    lufs = loud.get("lufs")
    if lufs is not None:
        if lufs < -30:
            tips.append(f"Звук очень тихий ({lufs:.1f} LUFS). Порог тишины для нарезки, "
                        "возможно, придётся опустить: --threshold -45.")
        elif lufs > -10:
            tips.append(f"Звук очень громкий ({lufs:.1f} LUFS), возможны перегрузки.")
    peak = loud.get("true_peak")
    if peak is not None and peak > -0.5:
        tips.append(f"Пики почти в нуле ({peak:.1f} dBTP) — где-то может быть клиппинг.")
    if d.get("silence_total") and d.get("duration"):
        share = d["silence_total"] / d["duration"]
        if share > 0.05:
            tips.append(f"Тишины примерно {d['silence_total']:.1f} с ({share:.0%} ролика) — "
                        "нарезка пауз заметно сократит видео.")
    if d.get("black"):
        tips.append(f"Есть чёрные кадры: {len(d['black'])} участк(а/ов).")
    return tips


def human(d: dict) -> str:
    lines = [f"Файл: {d['file']}"]
    mb = d["size_bytes"] / 1_000_000
    lines.append(f"Длина: {fmt_time(d['duration'])} ({d['duration']:.2f} с), {mb:.1f} МБ, "
                 f"{d['bitrate_kbps']} кбит/с, контейнер {d['container']}")
    v = d.get("video")
    if v:
        rot = f", повёрнуто на {v['rotation']}°" if v["rotation"] else ""
        vfr = ", переменная" if v["variable_fps"] else ""
        lines.append(f"Картинка: {v['display_width']}×{v['display_height']} ({v['orientation']}{rot}), "
                     f"{v['fps']:g} к/с{vfr}, кодек {v['codec']}, {v['pix_fmt']}")
    else:
        lines.append("Картинки нет.")
    a = d.get("audio")
    if a:
        more = f" (дорожек звука: {d['audio_streams']})" if d.get("audio_streams", 1) > 1 else ""
        lines.append(f"Звук: {a['codec']}, {a['sample_rate']} Гц, каналов {a['channels']}{more}")
    else:
        lines.append("Звука нет.")
    if d.get("timecode"):
        lines.append(f"Таймкод начала: {d['timecode']}")
    loud = d.get("loudness")
    if loud:
        lines.append(f"Громкость: {loud.get('lufs', float('nan')):.1f} LUFS, "
                     f"диапазон {loud.get('lra', float('nan')):.1f} LU, "
                     f"пик {loud.get('true_peak', float('nan')):.1f} dBTP "
                     "(для соцсетей обычно около −14 LUFS)")
    if "silences" in d:
        lines.append(f"Пауз длиннее порога: {len(d['silences'])}, всего {d.get('silence_total', 0):.1f} с")
    if "black" in d:
        lines.append(f"Чёрных участков: {len(d['black'])}")
    tips = advice(d)
    if tips:
        lines.append("")
        lines.append("На что обратить внимание:")
        lines += [f"- {t}" for t in tips]
    return "\n".join(lines)


def clean(x):
    """JSON без Infinity/NaN: тишина даёт -inf LUFS, в JSON это null."""
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, list):
        return [clean(v) for v in x]
    return x


def main() -> int:
    ap = argparse.ArgumentParser(description="Паспорт видео: длина, размер, звук, громкость, паузы.")
    ap.add_argument("video", help="путь к видео")
    ap.add_argument("--json", action="store_true", help="вывести всё в JSON")
    ap.add_argument("--quick", action="store_true", help="только метаданные, без прохода по файлу")
    ap.add_argument("--threshold", type=float, default=-35.0, help="порог тишины, dB (по умолчанию -35)")
    ap.add_argument("--min-silence", type=float, default=0.45, help="мин. пауза, с (по умолчанию 0.45)")
    args = ap.parse_args()
    path = require_input(args.video, "видео")
    d = passport(path, args.quick, args.threshold, args.min_silence)
    if not d.get("video") and not d.get("audio"):
        raise CadenceError(f"В файле нет ни картинки, ни звука: {path}")
    if args.json:
        print(json.dumps(clean(d), ensure_ascii=False, indent=2))
    else:
        print(human(d))
    return 0


if __name__ == "__main__":
    main_guard(main)
