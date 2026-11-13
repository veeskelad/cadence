#!/usr/bin/env python3
"""Монтаж говорящей головы из записи с дублями: выбранные куски, паузы по маске речи, рез одним проходом.

Где резать, решает звук, а не распознавание: время слов у Whisper гуляет на 0,1–0,2 с,
а громкость — измеренный факт. Текст (Whisper) нужен, чтобы выбрать дубль; маска речи — чтобы
найти точные края и паузы. Подробности и пороги с причинами — skills/cadence-cut/references/takes.md.

    python3 scripts/takes_cut.py analyze  <видео>                        # речь, паузы, пол шума (только чтение)
    python3 scripts/takes_cut.py check    <видео> --takes takes.json [--words <имя>.words.json]
    python3 scripts/takes_cut.py fragments <видео> --takes takes.json [--transcribe]   # куски до 5 с — поиск повторов
    python3 scripts/takes_cut.py cut      <видео> --takes takes.json --density natural --dry-run
    python3 scripts/takes_cut.py cut      <видео> --takes takes.json --density natural
    python3 scripts/takes_cut.py seams    <имя>-takes.mp4 --plan <имя>-takes.json   # кадры по краям каждого стыка

takes.json — решения агента о дублях, его читает человек:
    {"source": "take1.mp4",
     "spans": [{"id": "S1", "in": 12.4, "out": 17.9, "text": "…", "note": "почему этот дубль",
                "rejected": ["3.0–8.1 запнулся", "8.6–12.0 оборвал фразу"]}]}

Что получится (по умолчанию в work/<проект>/out/):
    <имя>-takes.mp4   ролик из выбранных кусков, паузы сжаты, фейд 15 мс на каждом стыке
    <имя>-takes.json  план (каждый кусок: откуда и куда) и проверка (остаток тишины, расхождение длины)
    <имя>-takes.edl   тот же монтаж для DaVinci Resolve (CMX3600)
Исходник не меняется. С --json каждая команда печатает один JSON-объект.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import tempfile
from array import array
from dataclasses import asdict, dataclass, replace
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, check_output, default_output, duration_of, ffmpeg_cmd, first_stream, fmt_time,
    main_guard, out_dir_for, probe, require_input, run, same_file, sha256, video_fps, write_json,
)
from silence_cut import out_rate, write_edl  # noqa: E402

SR = 16000
PUNCT = ".,!?;:…«»\"'()[]{}—–-‐“”„"
MIN_PAUSE_FLOOR = 0.150   # ниже тихий безударный слог не отличить от паузы — начало слова пропадёт
ARG_GRAPH_LIMIT = 60_000  # длиннее — граф идёт файлом, иначе не влезет в командную строку


@dataclass(frozen=True)
class Params:
    hop: float = 0.010            # окно громкости
    threshold_db: float = -30.0   # громче — кандидат в речь
    hold_hops: int = 3            # скользящий максимум ±30 мс
    min_speech: float = 0.110     # речь держится; вдох и щелчок короче
    tail_window: float = 0.250    # добор глухих окончаний за концом участка
    lead: float = 0.020           # вход = первая речь − 20 мс
    trail: float = 0.030          # выход = последняя речь + 30 мс
    min_pause: float = 0.160      # пауза короче — не трогаем
    keep_pause: float = 0.050     # сколько оставить от сжатой паузы
    fade: float = 0.015           # фейд звука на каждом стыке
    seam_pause: float = 1.0       # пауза длиннее внутри куска — обычно стык двух заходов


DENSITY = {
    "max": {"min_pause": 0.160, "keep_pause": 0.050},      # плотный темп, тишины почти не остаётся
    "natural": {"min_pause": 0.400, "keep_pause": 0.200},  # речь дышит
}


# ---------------------------------------------------------------- маска речи (чистые функции)

def envelope_db(samples, sr: int = SR, hop: float = 0.010) -> list[float]:
    """Громкость окнами hop, dBFS. samples — float в [-1, 1] (список или numpy)."""
    size = int(round(sr * hop))
    count = len(samples) // size
    if count == 0:
        return []
    try:
        import numpy as np
        frames = np.asarray(samples[: count * size], dtype=np.float64).reshape(count, size)
        rms = np.sqrt(np.mean(frames * frames, axis=1))
        return [float(x) for x in 20.0 * np.log10(np.maximum(rms, 1e-5))]
    except ImportError:
        out = []
        for i in range(count):
            chunk = samples[i * size:(i + 1) * size]
            rms = math.sqrt(sum(x * x for x in chunk) / size)
            out.append(20.0 * math.log10(max(rms, 1e-5)))
        return out


def sliding_max(values: list[float], radius: int) -> list[float]:
    n = len(values)
    if radius <= 0:
        return list(values)
    return [max(values[max(0, i - radius):min(n, i + radius + 1)]) for i in range(n)]


def runs_of(mask: list[bool]) -> list[tuple[int, int]]:
    """Непрерывные участки True как [start, end) в окнах."""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(mask)))
    return out


def speech_mask(db: list[float], p: Params) -> list[bool]:
    """Громкое (по скользящему максимуму), которое держится ≥ min_speech, плюс добор глухих окончаний.

    Скользящий максимум закрывает провал внутри слова и вытягивает короткий слог над порогом длины.
    Добор — только отбракованные короткие всплески не дальше tail_window за концом участка и не
    заходя в следующий участок: иначе паузы 0,16–0,25 с слились бы с речью и перестали сжиматься.
    """
    sdb = sliding_max(db, p.hold_hops)
    loud = [x >= p.threshold_db for x in sdb]
    min_hops = int(math.ceil(p.min_speech / p.hop - 1e-9))
    mask = [False] * len(db)
    runs = [r for r in runs_of(loud) if r[1] - r[0] >= min_hops]
    for a, b in runs:
        for i in range(a, b):
            mask[i] = True
    window = int(round(p.tail_window / p.hop))
    for idx, (_, end) in enumerate(runs):
        limit = runs[idx + 1][0] if idx + 1 < len(runs) else len(db)
        j = end
        while True:
            hits = [k for k in range(j, min(j + window, limit)) if loud[k] and not mask[k]]
            if not hits:
                break
            for k in range(j, hits[-1] + 1):
                mask[k] = True
            j = hits[-1] + 1
    return mask


def segments(mask: list[bool], hop: float) -> list[tuple[float, float]]:
    return [(round(a * hop, 3), round(b * hop, 3)) for a, b in runs_of(mask)]


def gaps(speech: list[tuple[float, float]], start: float, end: float) -> list[tuple[float, float]]:
    """Тишина между участками речи внутри [start, end], включая края."""
    out, cursor = [], start
    for a, b in speech:
        if b <= start or a >= end:
            continue
        if a > cursor:
            out.append((round(cursor, 3), round(a, 3)))
        cursor = max(cursor, b)
    if end > cursor:
        out.append((round(cursor, 3), round(end, 3)))
    return out


def snap(value: float, fps: Fraction | None) -> float:
    if not fps:
        return round(value, 6)
    return float(Fraction(round(Fraction(value) * fps)) / fps)


def plan_span(span: dict, speech: list[tuple[float, float]], p: Params, fps: Fraction | None,
              duration: float) -> list[dict]:
    """Куски одного интервала: края по речи, паузы ≥ min_pause сжаты до keep_pause, точки по сетке кадров."""
    s_in, s_out = float(span["in"]), float(span["out"])
    inside = [(max(a, s_in), min(b, s_out)) for a, b in speech if b > s_in and a < s_out]
    if not inside:
        raise CadenceError(f"{span.get('id', '?')}: в интервале {s_in}–{s_out} нет речи по маске")
    start = max(s_in, inside[0][0] - p.lead, 0.0)
    end = min(s_out, inside[-1][1] + p.trail, duration)
    half = p.keep_pause / 2
    pieces, cursor = [], start
    for (_, b0), (a1, _) in zip(inside, inside[1:]):
        if a1 - b0 >= p.min_pause:
            pieces.append((cursor, b0 + half))
            cursor = a1 - half
    pieces.append((cursor, end))
    frame = float(1 / fps) if fps else 0.0
    out: list[dict] = []
    for a, b in pieces:
        a, b = snap(a, fps), snap(b, fps)
        if b - a < max(frame, 2 * p.fade):
            continue
        if out and a < out[-1]["in"] + 1e-9:
            continue
        if out and a < out[-1]["out"]:
            a = out[-1]["out"]
        out.append({"span": span.get("id"), "in": round(a, 6), "out": round(b, 6)})
    return out


def residual(speech: list[tuple[float, float]]) -> dict:
    """Остаток тишины между первой и последней речью — показывается человеку числом."""
    inner = gaps(speech, speech[0][0], speech[-1][1]) if speech else []
    lengths = sorted((round(b - a, 3) for a, b in inner), reverse=True)
    return {"max_ms": round(lengths[0] * 1000) if lengths else 0,
            "over_150ms": sum(1 for x in lengths if x > 0.150),
            "top5_ms": [round(x * 1000) for x in lengths[:5]]}


def normalize_word(word: str) -> str:
    """Без краевой пунктуации, регистра и ё: Whisper пишет то «Дальше,», то «дальше»."""
    return word.strip().strip(PUNCT).lower().replace("ё", "е")


def repeated_ngrams(words: list[str], n: int = 3) -> list[str]:
    tokens = [w for w in (normalize_word(x) for x in words) if w]
    seen: dict[str, int] = {}
    hits: list[str] = []
    for i in range(len(tokens) - n + 1):
        gram = " ".join(tokens[i:i + n])
        if gram in seen and i - seen[gram] >= n and gram not in hits:
            hits.append(gram)
        seen.setdefault(gram, i)
    return hits


def fragment_bounds(speech: list[tuple[float, float]], lo: float, hi: float, duration: float,
                    max_len: float, pad: float = 0.25) -> list[tuple[float, float, bool]]:
    """Куски речи из [lo, hi] не длиннее max_len, разрез по паузам, у каждого разбег из тишины.

    Разбег до pad с каждой стороны, но не дальше середины паузы до соседней речи: короткое слово
    на самом краю куска Whisper теряет. Третье поле True — сплошную речь пришлось резать жёстко.
    """
    inside = [(max(a, lo), min(b, hi)) for a, b in speech if b > lo and a < hi]
    if not inside:
        return []
    groups, current = [], [inside[0]]
    for seg in inside[1:]:
        if seg[1] - current[0][0] > max_len - 2 * pad:
            groups.append(current)
            current = [seg]
        else:
            current.append(seg)
    groups.append(current)
    out = []
    for group in groups:
        first, last = group[0][0], group[-1][1]
        before = max((b for a, b in speech if b <= first), default=None)
        after = min((a for a, b in speech if a >= last), default=None)
        start = max(first - pad, (before + first) / 2 if before is not None else 0.0, 0.0)
        end = min(last + pad, (last + after) / 2 if after is not None else duration, duration)
        if end - start <= max_len:
            out.append((round(start, 3), round(end, 3), False))
            continue
        cursor = start
        while cursor < end - 0.05:
            out.append((round(cursor, 3), round(min(cursor + max_len, end), 3), True))
            cursor += max_len
    return out


def make_params(density: str | None, threshold: float | None, min_pause: float | None,
                keep_pause: float | None) -> Params:
    p = Params(**DENSITY[density]) if density else Params()
    if threshold is not None:
        p = replace(p, threshold_db=threshold)
    if min_pause is not None:
        p = replace(p, min_pause=min_pause)
    if keep_pause is not None:
        p = replace(p, keep_pause=keep_pause)
    if p.min_pause < MIN_PAUSE_FLOOR:
        raise CadenceError(f"--min-pause {p.min_pause} меньше {MIN_PAUSE_FLOOR} с: тихий слог примется "
                           "за паузу, и у слова пропадёт начало.")
    if p.keep_pause > p.min_pause:
        raise CadenceError("--keep-pause не может быть больше --min-pause.")
    return p


# ---------------------------------------------------------------- медиа

def read_pcm(path: Path, start: float | None = None, length: float | None = None):
    cmd = ffmpeg_cmd("-loglevel", "error")
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if length is not None:
        cmd += ["-t", f"{length:.3f}"]
    cmd += ["-i", str(path), "-map", "0:a:0", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    import subprocess
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise CadenceError(f"Не смог прочитать звук из {path}:\n" + proc.stderr.decode(errors="replace")[-400:])
    raw = proc.stdout[: len(proc.stdout) // 2 * 2]
    try:
        import numpy as np
        return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    except ImportError:
        pcm = array("h")
        pcm.frombytes(raw)
        if sys.byteorder == "big":
            pcm.byteswap()
        return [x / 32768.0 for x in pcm]


def measure(path: Path, p: Params) -> dict:
    db = envelope_db(read_pcm(path), SR, p.hop)
    mask = speech_mask(db, p)
    speech = segments(mask, p.hop)
    duration = round(len(db) * p.hop, 3)
    quiet = sorted(x for x, m in zip(db, mask) if not m)
    floor = round(quiet[len(quiet) // 10], 1) if quiet else None
    return {"speech": speech, "silences": gaps(speech, 0.0, duration), "duration": duration,
            "noise_floor_db": floor}


def media_facts(path: Path, need_video: bool = True) -> dict:
    info = probe(path)
    v, a = first_stream(info, "video"), first_stream(info, "audio")
    if need_video and not v:
        raise CadenceError("В файле нет картинки — нужен видеофайл.")
    if not a:
        raise CadenceError("В файле нет звука — резать по речи не по чему.")
    fps = video_fps(info) or 30.0
    return {"info": info, "duration": duration_of(info), "fps": fps, "rate": out_rate(info, fps) if v else None}


def fps_fraction(rate: str) -> Fraction:
    if "/" in rate:
        num, den = rate.split("/", 1)
        return Fraction(int(num), int(den))
    return Fraction(rate).limit_denominator(1001)


def load_takes(path_value: str, video: Path) -> tuple[Path, dict]:
    path = require_input(path_value, "takes.json")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise CadenceError(f"{path.name}: это не JSON ({exc}).")
    spans = data.get("spans") if isinstance(data, dict) else None
    if not isinstance(spans, list) or not spans:
        raise CadenceError(f"{path.name}: нужен непустой список spans.")
    for i, s in enumerate(spans):
        if not isinstance(s, dict) or not all(isinstance(s.get(k), (int, float)) for k in ("in", "out")):
            raise CadenceError(f"{path.name}: spans[{i}] — нужны числа in и out.")
        if s["out"] <= s["in"]:
            raise CadenceError(f"{path.name}: spans[{i}] ({s.get('id')}) — out не больше in.")
    src = data.get("source")
    if src and Path(str(src)).name != video.name:
        raise CadenceError(f"{path.name} описывает {src}, а на входе {video.name}. Дубли выбирались по другому файлу.")
    return path, data


def load_words(path_value: str | None) -> list[dict]:
    if not path_value:
        return []
    data = json.loads(require_input(path_value, "words.json").read_text(encoding="utf-8"))
    words = data.get("words") if isinstance(data, dict) else data
    out = []
    for w in words or []:
        text = w.get("w", w.get("word", ""))
        out.append({"w": str(text), "start": float(w["start"]), "end": float(w.get("end", w["start"]))})
    return out


# ---------------------------------------------------------------- команды

def cmd_analyze(args) -> tuple[dict, list[str]]:
    src = require_input(args.video, "видео")
    p = make_params(None, args.threshold, None, None)
    facts = media_facts(src, need_video=False)
    m = measure(src, p)
    inner = gaps(m["speech"], m["speech"][0][0], m["speech"][-1][1]) if m["speech"] else []
    long_pauses = [g for g in inner if g[1] - g[0] >= p.seam_pause]
    floor = m["noise_floor_db"]
    result = {"tool": "cadence takes_cut analyze", "source": str(src), "duration": round(facts["duration"], 3),
              "fps": round(facts["fps"], 3), "speech": m["speech"], "silences": m["silences"],
              "speech_seconds": round(sum(b - a for a, b in m["speech"]), 3),
              "long_pauses": long_pauses, "noise_floor_db": floor, "params": asdict(p)}
    lines = [f"Файл: {src}", f"Длина {fmt_time(facts['duration'])}, речи {result['speech_seconds']:.1f} с "
             f"в {len(m['speech'])} кусках, пауз длиннее секунды: {len(long_pauses)}"]
    if floor is not None:
        lines.append(f"Пол шума {floor} dBFS — " + ("чисто, шумодав не нужен" if floor < -50
                     else "шумновато, послушай паузы перед тем, как решать про шумодав"))
    for a, b in long_pauses[:12]:
        lines.append(f"  пауза {fmt_time(a)}–{fmt_time(b)} ({b - a:.1f} с) — здесь часто начинается новый дубль")
    return result, lines


def check_spans(spans: list[dict], speech: list[tuple[float, float]], duration: float, words: list[dict],
                seam: float) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    prev_out = None
    for span in spans:
        sid, s_in, s_out = span.get("id", "?"), float(span["in"]), float(span["out"])
        if s_in < 0 or s_out > duration + 0.05:
            errors.append(f"{sid}: {s_in}–{s_out} выходит за файл (0–{duration:.2f})")
        if not span.get("text"):
            warnings.append(f"{sid}: нет text — человеку нечего прочитать")
        if not span.get("note"):
            warnings.append(f"{sid}: нет note — почему выбран именно этот дубль")
        if prev_out is not None and s_in < prev_out:
            warnings.append(f"{sid}: начинается раньше конца предыдущего куска — порядок или пересечение")
        prev_out = s_out
        inside = [(a, b) for a, b in speech if b > s_in and a < s_out]
        if not inside:
            errors.append(f"{sid}: в интервале нет речи по маске")
            continue
        for a, b in gaps(inside, inside[0][0], inside[-1][1]):
            if b - a >= seam:
                warnings.append(f"{sid}: пауза {b - a:.2f} с внутри ({a:.2f}–{b:.2f}) — похоже на шов: один заход "
                                "кончился, начался следующий; сожмёшь паузу — фраза прозвучит дважды")
        first = inside[0]
        if len(inside) > 1 and first[1] - first[0] < 1.5 and inside[1][0] - first[1] >= 0.6:
            warnings.append(f"{sid}: начинается короткой речью {first[0]:.2f}–{first[1]:.2f}, за ней пауза "
                            f"{inside[1][0] - first[1]:.2f} с — похоже на хвост предыдущего дубля")
        if any(a < s_in < b for a, b in speech):
            warnings.append(f"{sid}: in {s_in} внутри речи — вход режет слово")
        if any(a < s_out < b for a, b in speech):
            warnings.append(f"{sid}: out {s_out} внутри речи — выход режет слово")
        if words:
            inside_words = [w["w"] for w in words if s_in <= w["start"] < s_out]
            for gram in repeated_ngrams(inside_words):
                warnings.append(f"{sid}: «{gram}» звучит дважды — повтор внутри куска")
            for a, b in inside:
                if b - a >= 0.25 and not any(w["start"] < b + 0.1 and w["end"] > a - 0.1 for w in words):
                    warnings.append(f"{sid}: {a:.2f}–{b:.2f} громко, но слов нет — шорох, вдох или «э-э»; "
                                    "послушай и посмотри кадр")
    return errors, warnings


def cmd_check(args) -> tuple[dict, list[str]]:
    src = require_input(args.video, "видео")
    takes_path, takes = load_takes(args.takes, src)
    p = make_params(None, args.threshold, None, None)
    m = measure(src, p)
    errors, warnings = check_spans(takes["spans"], m["speech"], m["duration"], load_words(args.words), p.seam_pause)
    result = {"tool": "cadence takes_cut check", "source": str(src), "takes": str(takes_path),
              "status": "FAIL" if errors else "OK", "spans": len(takes["spans"]),
              "words_checked": bool(args.words), "errors": errors, "warnings": warnings}
    lines = [f"Кусков: {len(takes['spans'])}; ошибок {len(errors)}, предупреждений {len(warnings)}"]
    lines += [f"  ошибка: {e}" for e in errors] + [f"  внимание: {w}" for w in warnings]
    if not args.words:
        lines.append("Без --words повторы и громкое без слов не проверены.")
    if not errors and not warnings:
        lines.append("Замечаний нет. Покажи человеку takes.json: текст кусков и что отвергнуто.")
    return result, lines


def filter_graph(pieces: list[dict], fade: float, fps: Fraction) -> str:
    """Один граф: split → trim/atrim каждого куска → concat. Видео со сдвигом на полкадра: trim берёт
    кадры с pts ≥ start, так в кусок попадают ровно кадры [in, out); звук — точно по in/out."""
    n = len(pieces)
    half = float(1 / fps) / 2
    parts = [f"[0:v:0]split={n}" + "".join(f"[vs{i}]" for i in range(n)),
             f"[0:a:0]asplit={n}" + "".join(f"[as{i}]" for i in range(n))]
    for i, pc in enumerate(pieces):
        a, b = pc["in"], pc["out"]
        length = b - a
        parts.append(f"[vs{i}]trim=start={max(a - half, 0):.6f}:end={b - half:.6f},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[as{i}]atrim=start={a:.6f}:end={b:.6f},asetpts=PTS-STARTPTS,"
                     f"afade=t=in:st=0:d={fade:.3f},afade=t=out:st={max(length - fade, 0):.6f}:d={fade:.3f}[a{i}]")
    parts.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vout][aout]")
    return ";".join(parts)


def graph_args(graph: str, tmp: Path) -> list[str]:
    if len(graph) < ARG_GRAPH_LIMIT:
        return ["-filter_complex", graph]
    script = tmp / "graph.txt"
    script.write_text(graph, encoding="utf-8")
    ver = run(ffmpeg_cmd("-version")).stdout or ""
    m = re.search(r"ffmpeg version n?(\d+)", ver)
    if m and int(m.group(1)) >= 7:
        return ["-/filter_complex", str(script)]
    return ["-filter_complex_script", str(script)]


def cmd_cut(args) -> tuple[dict, list[str]]:
    src = require_input(args.video, "видео")
    if not re.fullmatch(r"[a-z]+", args.preset):
        raise CadenceError("--preset: только имя пресета x264, например medium или fast.")
    takes_path, takes = load_takes(args.takes, src)
    p = make_params(args.density, args.threshold, args.min_pause, args.keep_pause)
    facts = media_facts(src)
    fps = fps_fraction(facts["rate"])
    m = measure(src, p)
    pieces = []
    for span in takes["spans"]:
        pieces.extend(plan_span(span, m["speech"], p, fps, facts["duration"]))
    if not pieces:
        raise CadenceError("План пуст: ни в одном куске нет речи.")
    pos = 0.0
    for pc in pieces:
        pc["out_start"] = round(pos, 6)
        pos += pc["out"] - pc["in"]
        pc["out_end"] = round(pos, 6)
    expected = round(pos, 3)

    out = Path(args.out).expanduser() if args.out else default_output(src, "takes", ".mp4", args.project)
    if out.suffix.lower() != ".mp4":
        raise CadenceError("--out должен заканчиваться на .mp4")
    json_path, edl_path = out.with_suffix(".json"), out.with_suffix(".edl")
    for side in (out, json_path, edl_path):
        for s in (src, takes_path):
            if same_file(side, s):
                raise CadenceError(f"Отказ: выход {side} совпадает с исходником {s}.")

    result = {"tool": "cadence takes_cut cut", "source": str(src), "takes": str(takes_path),
              "density": args.density, "params": asdict(p), "fps": facts["rate"], "pieces": pieces,
              "source_duration": round(facts["duration"], 3), "expected_duration": expected,
              "removed_seconds": round(facts["duration"] - expected, 3), "output": str(out)}
    lines = [f"Исходник: {src}",
             f"Кусков из takes.json: {len(takes['spans'])} → после сжатия пауз {len(pieces)} частей",
             f"Длина: {fmt_time(facts['duration'])} → {fmt_time(expected)} (уходит {facts['duration'] - expected:.1f} с)",
             f"Плотность {args.density}: паузы от {p.min_pause * 1000:.0f} мс сжимаются до {p.keep_pause * 1000:.0f} мс"]
    for pc in pieces[:12]:
        lines.append(f"  {pc['span']}: {fmt_time(pc['in'])}–{fmt_time(pc['out'])} → {fmt_time(pc['out_start'])}")
    if len(pieces) > 12:
        lines.append(f"  … и ещё {len(pieces) - 12}")
    lines.append(f"Будет записано: {out}, {json_path.name}, {edl_path.name}")
    if args.dry_run:
        result["status"] = "PLAN"
        lines.append("Это план (--dry-run). Ничего не записано.")
        return result, lines

    out = check_output(out, [src, takes_path], args.overwrite)
    for side in (json_path, edl_path):
        check_output(side, [src, takes_path], args.overwrite)
    src_hash = sha256(src)
    part = out.with_name(out.stem + ".part.mp4")
    with tempfile.TemporaryDirectory(prefix="cadence-takes-") as tmpdir:
        cmd = ffmpeg_cmd("-y", "-loglevel", "error", "-i", src,
                         *graph_args(filter_graph(pieces, p.fade, fps), Path(tmpdir)),
                         "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", args.preset,
                         "-crf", str(args.crf), "-pix_fmt", "yuv420p", "-fps_mode", "cfr", "-r", facts["rate"],
                         "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", part)
        try:
            run(cmd)
            part.replace(out)
        finally:
            if part.exists():
                part.unlink()
    if sha256(src) != src_hash:
        raise CadenceError("Внимание: исходник изменился во время работы. Проверь файл.")

    real = duration_of(probe(out))
    after = measure(out, p)
    inner = gaps(after["speech"], after["speech"][0][0], after["speech"][-1][1]) if after["speech"] else []
    left_long = [g for g in inner if g[1] - g[0] >= p.seam_pause]
    result.update({"status": "DONE", "source_sha256": src_hash, "takes_sha256": sha256(takes_path),
                   "output_duration": round(real, 3), "duration_drift": round(real - expected, 3),
                   "residual_silence": residual(after["speech"]), "long_pauses_left": left_long})
    write_json(json_path, result)
    v = first_stream(facts["info"], "video") or {}
    write_edl(edl_path, out.stem, src.name, [(pc["in"], pc["out"]) for pc in pieces], facts["fps"],
              ((facts["info"].get("format") or {}).get("tags") or {}).get("timecode")
              or (v.get("tags") or {}).get("timecode"))
    rs = result["residual_silence"]
    lines += [f"Готово: {out} ({fmt_time(real)}, расхождение с планом {result['duration_drift']:+.3f} с)",
              f"Остаток тишины: самая длинная пауза {rs['max_ms']} мс, длиннее 150 мс — {rs['over_150ms']}",
              f"План и проверка: {json_path}", f"Для DaVinci Resolve: {edl_path}"]
    if left_long:
        lines.append(f"Внимание: осталось пауз длиннее секунды — {len(left_long)}. Проверь края кусков.")
    return result, lines


def cmd_fragments(args) -> tuple[dict, list[str]]:
    src = require_input(args.video, "видео")
    takes_path, takes = load_takes(args.takes, src) if args.takes else (None, None)
    p = make_params(None, args.threshold, None, None)
    if args.transcribe and not re.fullmatch(r"auto|[a-z]{2,3}", args.lang):
        raise CadenceError("--lang: код языка (ru, en) или auto.")
    if args.transcribe and not re.fullmatch(r"[\w.\-]+", args.model):
        raise CadenceError("--model: имя модели, например small.")
    m = measure(src, p)
    ranges = ([(str(s.get("id", i + 1)), float(s["in"]), float(s["out"])) for i, s in enumerate(takes["spans"])]
              if takes else [("", 0.0, m["duration"])])
    bounds = [(sid, a, b, hard) for sid, lo, hi in ranges
              for a, b, hard in fragment_bounds(m["speech"], lo, hi, m["duration"], args.max_seconds)]
    folder = (Path(args.out_dir).expanduser() if args.out_dir
              else out_dir_for(src, args.project) / f"{src.stem}-fragments")
    backend = None
    if args.transcribe:
        import captions_whisper as cw
        found = cw.find_backends()
        if not found:
            raise CadenceError(cw.install_hint(), 3)
        backend = found[0]
        if not cw.model_cached(backend, args.model) and not args.allow_download:
            raise CadenceError(f"Модели {args.model} нет на диске (около {cw.MODEL_SIZES.get(args.model, '?')}). "
                               "Скачать её можно только с согласия человека: та же команда с --allow-download.", 4)
    result = {"tool": "cadence takes_cut fragments", "source": str(src), "output": str(folder),
              "fragments": [{"span": sid, "start": a, "end": b, "hard_split": hard} for sid, a, b, hard in bounds]}
    lines = [f"Кусков до {args.max_seconds:g} с: {len(bounds)}"
             + (f", расшифровка: {backend}, модель {args.model}" if backend else ""),
             f"Будет записано: {folder}/frag-NNN.wav, fragments.json"]
    if args.dry_run:
        result["status"] = "PLAN"
        lines.append("Это план (--dry-run). Ничего не записано.")
        return result, lines
    for s in (src, takes_path):
        if s and (same_file(folder, s) or s.parent == folder.resolve()):
            raise CadenceError("Отказ: папка фрагментов совпадает с папкой исходника.")
    if folder.exists() and not args.overwrite:
        raise CadenceError(f"Отказ: папка {folder} уже есть. Укажи другую --out-dir или добавь --overwrite.")
    folder.mkdir(parents=True, exist_ok=True)
    rows = result["fragments"]
    for i, row in enumerate(rows, 1):
        row["file"] = f"frag-{i:03d}.wav"
        run(ffmpeg_cmd("-y", "-loglevel", "error", "-ss", f"{row['start']:.3f}", "-t",
                       f"{row['end'] - row['start']:.3f}", "-i", src, "-map", "0:a:0", "-ac", "1",
                       "-ar", str(SR), "-c:a", "pcm_s16le", folder / row["file"]))
    repeats = {}
    if backend:
        import captions_whisper as cw
        lang = None if args.lang == "auto" else args.lang
        lines.append("Расшифровываю каждый кусок отдельно…")
        with tempfile.TemporaryDirectory(prefix="cadence-frag-") as tmpdir:
            for i, row in enumerate(rows):
                tmp = Path(tmpdir) / f"t{i}"
                tmp.mkdir()
                words = cw.transcribe(backend, folder / row["file"], args.model, lang, args.allow_download, tmp)
                row["text"] = " ".join(w["w"] for w in words).strip()
        # повтор ищется по всему куску takes.json: два захода часто попадают в разные фрагменты
        for sid in dict.fromkeys(r["span"] for r in rows):
            hits = repeated_ngrams(" ".join(r.get("text", "") for r in rows if r["span"] == sid).split())
            if hits:
                repeats[sid or "(весь файл)"] = hits
    result.update({"status": "DONE", "transcribed": bool(backend), "repeats": repeats,
                   "hard_splits": [r["file"] for r in rows if r["hard_split"]]})
    write_json(folder / "fragments.json", result)
    lines.append(f"Готово: {folder}")
    for sid, hits in repeats.items():
        lines.append(f"  внимание: {sid} — повтор: " + "; ".join(f"«{h}»" for h in hits))
    if result["hard_splits"]:
        lines.append(f"  сплошная речь разрезана жёстко в {len(result['hard_splits'])} местах — там слово могло пропасть")
    return result, lines


def cmd_seams(args) -> tuple[dict, list[str]]:
    video = require_input(args.video, "ролик после cut")
    plan_path = require_input(args.plan, "план (<имя>-takes.json)")
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    pieces = plan.get("pieces") or []
    fps = fps_fraction(str(plan.get("fps") or "30"))
    frame = float(1 / fps)
    folder = (Path(args.out_dir).expanduser() if args.out_dir
              else out_dir_for(video, args.project) / f"{video.stem}-seams")
    joints = [(i, pc) for i, pc in enumerate(pieces[1:], 1)]
    result = {"tool": "cadence takes_cut seams", "video": str(video), "output": str(folder), "seams": []}
    lines = [f"Стыков: {len(joints)}", f"Будет записано: {folder}/seam-NNN-a.jpg и -b.jpg"]
    if args.dry_run:
        result["status"] = "PLAN"
        lines.append("Это план (--dry-run). Ничего не записано.")
        return result, lines
    if folder.exists() and not args.overwrite:
        raise CadenceError(f"Отказ: папка {folder} уже есть. Укажи другую --out-dir или добавь --overwrite.")
    folder.mkdir(parents=True, exist_ok=True)
    for i, pc in joints:
        t = float(pc["out_start"])
        files = []
        # точный -ss берёт первый кадр с pts ≥ t: так получаются последний кадр до стыка и первый после
        for side, at in (("a", max(t - frame * 1.25, 0)), ("b", max(t - frame / 4, 0))):
            name = f"seam-{i:03d}-{side}.jpg"
            run(ffmpeg_cmd("-y", "-loglevel", "error", "-ss", f"{at:.4f}", "-i", video, "-frames:v", "1",
                           "-vf", "scale=-2:480", "-q:v", "4", folder / name))
            files.append(name)
        result["seams"].append({"joint": i, "time": t, "span": pc.get("span"), "source_in": pc["in"], "frames": files})
    result["status"] = "DONE"
    write_json(folder / "seams.json", result)
    lines.append(f"Готово: {folder}. Посмотри пары кадров: рука в кадре, скачок позы — поправь кусок.")
    return result, lines


# ---------------------------------------------------------------- CLI

def main() -> int:
    ap = argparse.ArgumentParser(description="Монтаж говорящей головы из записи с дублями. Исходник не меняется.")
    sub = ap.add_subparsers(dest="command", required=True)

    def common(sp, video_help="видео с речью"):
        sp.add_argument("video", help=video_help)
        sp.add_argument("--json", action="store_true", help="напечатать результат одним JSON-объектом")
        sp.add_argument("--threshold", type=float, help="громче этого — кандидат в речь, dBFS (по умолчанию -30)")

    a = sub.add_parser("analyze", help="речь, паузы и пол шума; ничего не пишет")
    common(a)

    c = sub.add_parser("check", help="проверить takes.json до показа человеку")
    common(c)
    c.add_argument("--takes", required=True, help="takes.json с выбранными кусками")
    c.add_argument("--words", help="<имя>.words.json исходника из captions_whisper.py — поиск повторов")

    f = sub.add_parser("fragments", help="куски до 5 с с разбегом из тишины, по желанию с расшифровкой")
    common(f)
    f.add_argument("--takes", help="takes.json: резать только выбранные куски")
    f.add_argument("--max-seconds", type=float, default=5.0, help="длина куска, с (по умолчанию 5)")
    f.add_argument("--transcribe", action="store_true", help="локальный Whisper на каждый кусок отдельно")
    f.add_argument("--model", default="small", help="модель Whisper (по умолчанию small)")
    f.add_argument("--lang", default="ru", help="язык речи или auto (по умолчанию ru)")
    f.add_argument("--allow-download", action="store_true", help="разрешить скачать модель (с согласия человека)")
    f.add_argument("--out-dir", help="новая папка для кусков (по умолчанию out/<имя>-fragments)")
    f.add_argument("--project", help="имя проекта в work/")
    f.add_argument("--dry-run", action="store_true")
    f.add_argument("--overwrite", action="store_true")

    k = sub.add_parser("cut", help="собрать ролик из выбранных кусков")
    common(k)
    k.add_argument("--takes", required=True, help="takes.json, согласованный с человеком")
    k.add_argument("--density", choices=sorted(DENSITY), required=True,
                   help="natural: паузы от 400 мс → 200 мс; max: от 160 мс → 50 мс")
    k.add_argument("--min-pause", type=float, help="пауза короче не трогается, с (не меньше 0.15)")
    k.add_argument("--keep-pause", type=float, help="сколько оставить от паузы, с")
    k.add_argument("--out", help="путь к MP4 (по умолчанию work/<проект>/out/<имя>-takes.mp4)")
    k.add_argument("--project", help="имя проекта в work/")
    k.add_argument("--crf", type=int, default=16, help="качество x264, меньше = лучше (по умолчанию 16)")
    k.add_argument("--preset", default="medium", help="скорость x264 (по умолчанию medium)")
    k.add_argument("--dry-run", action="store_true", help="только план: куски и длина")
    k.add_argument("--overwrite", action="store_true", help="разрешить заменить прежний результат")

    s = sub.add_parser("seams", help="кадры до и после каждого стыка")
    s.add_argument("video", help="<имя>-takes.mp4 после cut")
    s.add_argument("--plan", required=True, help="<имя>-takes.json того же реза")
    s.add_argument("--out-dir", help="новая папка для кадров (по умолчанию out/<имя>-seams)")
    s.add_argument("--project", help="имя проекта в work/")
    s.add_argument("--json", action="store_true")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--overwrite", action="store_true")

    args = ap.parse_args()
    handler = {"analyze": cmd_analyze, "check": cmd_check, "fragments": cmd_fragments,
               "cut": cmd_cut, "seams": cmd_seams}[args.command]
    result, lines = handler(args)
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print("\n".join(lines))
    return 1 if result.get("status") == "FAIL" else 0


if __name__ == "__main__":
    main_guard(main)
