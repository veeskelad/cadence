#!/usr/bin/env python3
"""Свести звук: внешний микрофон с видео камеры и (по желанию) музыку под голос.

1) Звук с петлички или рекордера вместо звука камеры. Сдвиг находится сам —
   по совпадению огибающих громкости двух записей:

    python3 scripts/audio_sync.py work/my-vlog/in/cam.mp4 --audio work/my-vlog/in/mic.wav --dry-run
    python3 scripts/audio_sync.py work/my-vlog/in/cam.mp4 --audio work/my-vlog/in/mic.wav

2) Музыка под голосом: когда человек говорит, музыка сама приглушается
   (sidechain-компрессия), итог выводится примерно к −14 LUFS без лимитера:

    python3 scripts/audio_sync.py work/my-vlog/out/take1-cut.mp4 --music work/my-vlog/in/track.mp3 --duck

3) Проверка сведения до полного файла: три коротких ролика (начало, середина, конец),
   в каждом лицо и звук рекордера вместе — человек смотрит на губы и слушает:

    python3 scripts/audio_sync.py work/my-vlog/in/cam.mp4 --audio work/my-vlog/in/mic.wav --preview

   Видео плюс отдельный WAV — не проверка синхронизации: сводит их тогда плеер, а не мы.

Можно и то и другое сразу. Картинка не перекодируется (копируется как есть); в превью — перекодируется,
чтобы рез был точным. Исходники не меняются, результат — новый MP4 в work/<проект>/out/ плюс JSON с цифрами.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, check_output, duration_of, ffmpeg_cmd, first_stream, fmt_time, main_guard,
    measure_loudness, out_dir_for, parse_ebur128, probe, require_input, run, same_file, sha256,
    write_json,
)

SR = 16000          # частота для анализа
HOP = 160           # 10 мс — шаг грубой огибающей
FINE_SR = 2000      # 0,5 мс — шаг точной подстройки
TRUE_PEAK_CEIL = -1.0


# ---------------------------------------------------------------- чтение звука

def decode(path: Path, seconds: float | None) -> np.ndarray:
    cmd = ffmpeg_cmd("-loglevel", "error", "-i", path)
    if seconds:
        cmd += ["-t", f"{seconds:.3f}"]
    cmd += ["-map", "0:a:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise CadenceError(f"Не смог прочитать звук из {path}:\n"
                           + proc.stderr.decode(errors="replace")[-600:])
    return np.frombuffer(proc.stdout, dtype="<f4").astype(np.float64)


def envelope(x: np.ndarray, hop: int) -> np.ndarray:
    """Огибающая: лог-энергия окон, приведённая к нулю и единичному разбросу."""
    n = len(x) // hop
    if n < 10:
        return np.zeros(0)
    frames = x[: n * hop].reshape(n, hop)
    env = np.log10(np.mean(frames ** 2, axis=1) + 1e-10)
    env -= env.mean()
    sd = env.std()
    return env / sd if sd > 0 else env


def fine_env(x: np.ndarray) -> np.ndarray:
    step = SR // FINE_SR
    n = len(x) // step
    env = np.abs(x[: n * step]).reshape(n, step).mean(axis=1)
    env = env - env.mean()
    sd = env.std()
    return env / sd if sd > 0 else env


# ---------------------------------------------------------------- поиск сдвига

def xcorr(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """c[k] = sum a[t] * b[t + k]; индекс k по модулю длины (отрицательные — в хвосте)."""
    n = 1
    while n < len(a) + len(b):
        n *= 2
    return np.fft.irfft(np.conj(np.fft.rfft(a, n)) * np.fft.rfft(b, n), n)


def pearson_at(a: np.ndarray, b: np.ndarray, k: int) -> tuple[float, int]:
    """Корреляция a[t] и b[t + k] на общем участке; вторым — длина участка."""
    if k >= 0:
        aa, bb = a[: max(0, len(b) - k)], b[k:]
    else:
        aa, bb = a[-k:], b
    m = min(len(aa), len(bb))
    if m < 20:
        return 0.0, m
    aa, bb = aa[:m], bb[:m]
    sa, sb = aa.std(), bb.std()
    if sa == 0 or sb == 0:
        return 0.0, m
    return float(np.mean((aa - aa.mean()) * (bb - bb.mean())) / (sa * sb)), m


def best_lag_near(a: np.ndarray, b: np.ndarray, center: int, radius: int) -> tuple[int, float]:
    best = (center, -2.0)
    for k in range(center - radius, center + radius + 1):
        r, _ = pearson_at(a, b, k)
        if r > best[1]:
            best = (k, r)
    return best


def find_offset(cam: np.ndarray, rec: np.ndarray, max_offset: float) -> dict:
    """lag > 0: событие в камере на t звучит в рекордере на t + lag (рекордер включили раньше)."""
    ea, eb = envelope(cam, HOP), envelope(rec, HOP)
    if len(ea) == 0 or len(eb) == 0:
        raise CadenceError("Одна из записей слишком короткая для сведения.")
    c = xcorr(ea, eb)
    n = len(c)
    maxk = int(max_offset * SR / HOP)
    lags = np.concatenate([np.arange(0, min(maxk, n // 2) + 1), np.arange(-min(maxk, n // 2 - 1), 0)])
    vals = c[lags % n]
    i = int(np.argmax(vals))
    coarse = int(lags[i])
    # Второй по силе пик дальше ±1 с — чтобы понять, насколько ответ однозначный.
    far = np.abs(lags - coarse) > int(1.0 * SR / HOP)
    second = float(vals[far].max()) if far.any() else 0.0
    peak_ratio = float(vals[i] / second) if second > 0 else float("inf")
    r_coarse, overlap = pearson_at(ea, eb, coarse)

    # Точная подстройка по огибающей 0,5 мс в окне ±20 мс.
    fa, fb = fine_env(cam), fine_env(rec)
    scale = FINE_SR * HOP // SR
    fine_k, r_fine = best_lag_near(fa, fb, coarse * scale, 2 * scale)
    lag = fine_k / FINE_SR

    # Плывёт ли сдвиг: сравниваем начало и конец общего участка (окна по 30 с).
    drift = None
    win = int(30 * SR / HOP)
    if overlap > 4 * win:
        start_a = max(0, -coarse)
        end_a = start_a + overlap - win
        k1, _ = best_lag_near(ea[start_a:start_a + win], eb, coarse + start_a, 50)
        k2, _ = best_lag_near(ea[end_a:end_a + win], eb, coarse + end_a, 50)
        drift = ((k2 - end_a) - (k1 - start_a)) * HOP / SR

    if r_coarse >= 0.5 and peak_ratio >= 1.3:
        level = "высокая"
    elif r_coarse >= 0.3 and peak_ratio >= 1.1:
        level = "средняя"
    else:
        level = "низкая"
    return {"offset": round(lag, 4), "coarse_offset": coarse * HOP / SR,
            "correlation": round(r_coarse, 3), "fine_correlation": round(r_fine, 3),
            "peak_ratio": round(peak_ratio, 2) if np.isfinite(peak_ratio) else None,
            "overlap_seconds": round(overlap * HOP / SR, 1), "confidence": level,
            "drift_seconds": None if drift is None else round(drift, 3)}


# ---------------------------------------------------------------- сборка графа

def voice_chain(has_rec: bool, offset: float, vdur: float) -> str:
    if not has_rec:
        return f"[0:a:0]apad,atrim=end={vdur:.6f}"
    if offset >= 0:
        head = f"[1:a:0]atrim=start={offset:.6f},asetpts=PTS-STARTPTS"
    else:
        head = f"[1:a:0]adelay=delays={int(round(-offset * 1000))}:all=1"
    return f"{head},apad,atrim=end={vdur:.6f}"


def build_graph(has_rec: bool, offset: float, vdur: float, music_idx: int | None,
                music_gain: float, sc_gain: float, duck: bool, final_gain: float | None,
                meter: bool) -> str:
    fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
    parts = [f"{voice_chain(has_rec, offset, vdur)},{fmt}[voice]"]
    last = "voice"
    if music_idx is not None:
        parts.append(f"[{music_idx}:a:0]{fmt},volume={music_gain:.2f}dB,"
                     f"atrim=end={vdur:.6f},asetpts=PTS-STARTPTS[mus]")
        if duck:
            parts.append("[voice]asplit=2[vmix][vsc0]")
            parts.append(f"[vsc0]volume={sc_gain:.2f}dB[vsc]")
            parts.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=15:"
                         "release=350:makeup=1[bed]")
            parts.append("[vmix][bed]amix=inputs=2:duration=first:normalize=0[mix]")
        else:
            parts.append("[voice][mus]amix=inputs=2:duration=first:normalize=0[mix]")
        last = "mix"
    tail = f"[{last}]"
    if final_gain is not None:
        tail += f"volume={final_gain:.2f}dB,"
    tail += "ebur128=peak=true:framelog=quiet[aout]" if meter else "anull[aout]"
    parts.append(tail)
    return ";".join(parts)


def preview_windows(speech: list[tuple[float, float]], vdur: float, clip: float) -> list[tuple[str, float]]:
    """Три начала окон по clip секунд: в начале, середине и конце, каждое там, где больше всего речи."""
    clip = min(clip, vdur)
    last = max(0.0, vdur - clip)
    anchors = (("start", 0.0), ("middle", last / 2), ("end", last))
    out = []
    for name, anchor in anchors:
        # кандидаты — окно у якоря и сдвиги на ±1/6 длины ролика; берём с наибольшей речью
        best = (anchor, -1.0)
        for k in (0, -1, 1, -2, 2, -3, 3, -4, 4):  # при равной речи — ближе к якорю
            t = min(max(anchor + k * vdur / 24, 0.0), last)
            talk = sum(max(0.0, min(b, t + clip) - max(a, t)) for a, b in speech)
            if talk > best[1] + 1e-6:
                best = (t, talk)
        out.append((name, round(best[0], 3)))
    return out


def speech_spans(x: np.ndarray, sr: int = SR) -> list[tuple[float, float]]:
    """Где звучит голос: окна 50 мс громче −35 dBFS (грубо, только чтобы окно превью не попало в тишину)."""
    hop = sr // 20
    n = len(x) // hop
    if n == 0:
        return []
    db = 10 * np.log10(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-10)
    loud = db > -35
    spans, start = [], None
    for i, v in enumerate(loud):
        if v and start is None:
            start = i
        elif not v and start is not None:
            spans.append((start / 20, i / 20))
            start = None
    if start is not None:
        spans.append((start / 20, n / 20))
    return spans


def write_previews(video: Path, rec: Path, offset: float, windows: list[tuple[str, float]], clip: float,
                   folder: Path, vdur: float) -> list[dict]:
    rows = []
    full = clip
    for i, (name, t) in enumerate(windows, 1):
        target = folder / f"preview-{i}-{name}.mp4"
        # рекордер включили позже — окно не раньше, чем он начал писать
        t = round(min(max(t, -offset), max(vdur - 0.5, 0.0)), 3)
        clip = max(0.5, min(full, vdur - t))
        rec_start = t + offset
        if rec_start >= 0:
            rec_in = ["-ss", f"{rec_start:.3f}", "-t", f"{clip:.3f}", "-i", str(rec)]
            achain = "[1:a:0]asetpts=PTS-STARTPTS"
        else:
            rec_in = ["-t", f"{clip + rec_start:.3f}", "-i", str(rec)]
            achain = f"[1:a:0]adelay=delays={int(round(-rec_start * 1000))}:all=1"
        graph = f"{achain},apad,atrim=end={clip:.3f},aresample=48000[a]"
        run(ffmpeg_cmd("-y", "-loglevel", "error", "-ss", f"{t:.3f}", "-t", f"{clip:.3f}", "-i", video,
                       *rec_in, "-filter_complex", graph, "-map", "0:v:0", "-map", "[a]",
                       "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                       "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", target))
        rows.append({"file": target.name, "where": name, "video_start": t, "recorder_start": round(rec_start, 3),
                     "seconds": round(clip, 3)})
    return rows


def inputs_for(video: Path, rec: Path | None, music: Path | None) -> tuple[list[str], int | None]:
    args = ["-i", str(video)]
    if rec:
        args += ["-i", str(rec)]
    music_idx = None
    if music:
        music_idx = 2 if rec else 1
        args += ["-stream_loop", "-1", "-i", str(music)]
    return args, music_idx


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Свести внешний звук с видео и/или подложить музыку под голос.")
    ap.add_argument("video", help="видео с камеры")
    ap.add_argument("--audio", help="звук с петлички/рекордера, который поставить вместо звука камеры")
    ap.add_argument("--music", help="музыкальный трек под голос (зациклится, если короче видео)")
    ap.add_argument("--duck", action="store_true", help="приглушать музыку, когда звучит голос")
    ap.add_argument("--music-db", type=float, default=-10.0,
                    help="музыка тише голоса на столько dB до приглушения (по умолчанию -10)")
    ap.add_argument("--target", type=float, default=-14.0,
                    help="громкость итога с музыкой, LUFS (по умолчанию -14)")
    ap.add_argument("--offset", type=float, help="задать сдвиг вручную, с (вместо автоматического)")
    ap.add_argument("--max-offset", type=float, default=60.0, help="искать сдвиг в пределах ±, с (60)")
    ap.add_argument("--force", action="store_true", help="писать результат даже при низкой уверенности")
    ap.add_argument("--preview", action="store_true",
                    help="вместо полного файла — три коротких ролика (начало, середина, конец) для проверки на глаз")
    ap.add_argument("--clip-seconds", type=float, default=8.0, help="длина каждого ролика превью, с (по умолчанию 8)")
    ap.add_argument("--dry-run", action="store_true", help="только посчитать и показать, ничего не писать")
    ap.add_argument("--out", help="путь к новому MP4 (по умолчанию work/<проект>/out/<имя>-sync.mp4)")
    ap.add_argument("--project", help="имя проекта в work/")
    ap.add_argument("--overwrite", action="store_true", help="разрешить заменить прежний результат")
    args = ap.parse_args()

    video = require_input(args.video, "видео")
    rec = require_input(args.audio, "звук рекордера") if args.audio else None
    music = require_input(args.music, "музыку") if args.music else None
    if not rec and not music:
        raise CadenceError("Нечего делать: укажи --audio (звук рекордера) и/или --music (трек).")
    if args.duck and not music:
        raise CadenceError("--duck работает вместе с --music.")
    if args.preview and (not rec or music):
        raise CadenceError("--preview проверяет сведение рекордера: нужен --audio, без --music.")
    if args.preview and args.clip_seconds <= 0:
        raise CadenceError("--clip-seconds должен быть больше нуля.")
    vinfo = probe(video)
    if not first_stream(vinfo, "video"):
        raise CadenceError("В первом файле нет картинки — нужен видеофайл.")
    vdur = duration_of(vinfo)
    cam_has_audio = bool(first_stream(vinfo, "audio"))
    if not rec and not cam_has_audio:
        raise CadenceError("В видео нет звука, а --audio не задан: голоса нет, музыку подкладывать не под что.")

    suffix = "-".join(x for x in ("sync" if rec else "", "music" if music else "") if x)
    if args.preview:
        out = (Path(args.out).expanduser() if args.out
               else out_dir_for(video, args.project) / f"{video.stem}-sync-preview")
    else:
        out = (Path(args.out).expanduser() if args.out
               else out_dir_for(video, args.project) / f"{video.stem}-{suffix}.mp4")
        if out.suffix.lower() != ".mp4":
            raise CadenceError("--out должен заканчиваться на .mp4")
    sources = [p for p in (video, rec, music) if p]
    for p in ((out,) if args.preview else (out, out.with_suffix(".json"))):
        for s in sources:
            if same_file(p, s) or (args.preview and same_file(p, s.parent)):
                raise CadenceError(f"Отказ: выход {p} совпадает с исходником {s} или его папкой.")

    report: dict = {"tool": "cadence audio_sync", "video": str(video), "video_duration": round(vdur, 3)}
    offset = 0.0
    if rec:
        report["audio"] = str(rec)
        if args.offset is not None:
            offset = args.offset
            report["sync"] = {"offset": offset, "confidence": "задан вручную"}
            print(f"Сдвиг задан вручную: {offset:+.3f} с")
        else:
            if not cam_has_audio:
                raise CadenceError("В видео нет звука камеры — сравнивать не с чем. "
                                   "Задайте сдвиг вручную: --offset <секунды>.")
            print("Ищу сдвиг между звуком камеры и рекордера…")
            span = min(vdur, 600.0) + args.max_offset
            sync = find_offset(decode(video, span), decode(rec, span + args.max_offset), args.max_offset)
            report["sync"] = sync
            offset = sync["offset"]
            if offset >= 0:
                where = f"рекордер включили на {offset:.3f} с раньше камеры — его начало обрежу"
            else:
                where = f"рекордер включили на {-offset:.3f} с позже камеры — добавлю тишину в начало"
            print(f"Сдвиг: {offset:+.3f} с ({where})")
            print(f"Уверенность: {sync['confidence']} (корреляция {sync['correlation']}, "
                  f"пик сильнее соседних в {sync['peak_ratio']} раза, общий участок {sync['overlap_seconds']} с)")
            if sync["drift_seconds"] is not None and abs(sync["drift_seconds"]) > 0.02:
                print(f"Внимание: от начала к концу сдвиг плывёт на {sync['drift_seconds']:+.3f} с. "
                      "Обычно это разная частота у камеры и рекордера; к концу губы разойдутся со звуком.")

    music_gain = sc_gain = 0.0
    if music:
        report["music"] = str(music)
        voice_src, voice_stream = (rec, "0:a:0") if rec else (video, "0:a:0")
        lv = measure_loudness(voice_src, stream=voice_stream).get("lufs", -23.0)
        lm = measure_loudness(music, stream="0:a:0").get("lufs", -14.0)
        if not np.isfinite(lv) or lv < -60:
            raise CadenceError("Голос почти не слышен (тише −60 LUFS) — под него не подложить музыку.")
        lm = lm if np.isfinite(lm) else -14.0
        music_gain = (lv + args.music_db) - lm
        sc_gain = -20.0 - lv
        report["levels"] = {"voice_lufs": lv, "music_lufs": lm, "music_gain_db": round(music_gain, 2),
                            "duck": args.duck, "target_lufs": args.target}
        print(f"Голос {lv:.1f} LUFS, трек {lm:.1f} LUFS → трек {music_gain:+.1f} dB "
              f"({args.music_db:+.0f} dB к голосу){', с приглушением под речью' if args.duck else ''}")

    if args.preview:
        # где говорят — по звуку рекордера, переведённому во время видео
        heard = [(a - offset, b - offset) for a, b in speech_spans(decode(rec, vdur + abs(offset) + 1.0))]
        windows = preview_windows(heard, vdur, args.clip_seconds)
        clip = min(args.clip_seconds, vdur)
        print(f"Превью: три ролика по {clip:.1f} с — " + ", ".join(
            f"{name} с {fmt_time(t)}" for name, t in windows))
        print(f"Будет записано: {out}/preview-1-start.mp4, -2-middle, -3-end и preview.json")
        print("В каждом ролике картинка камеры и звук рекордера вместе: смотреть на губы и слушать. "
              "Видео и отдельный WAV рядом — не проверка: их сводит плеер.")
    else:
        print(f"Будет записано: {out}, {out.with_suffix('.json').name}")
    if rec and report["sync"].get("confidence") == "низкая" and not args.force:
        print("Уверенность низкая — результат не пишу. Проверь, те ли это файлы, "
              "или задайте сдвиг вручную: --offset <секунды> (найдите общий хлопок).")
        return 5
    if args.dry_run:
        print("Это план (--dry-run). Ничего не записано.")
        return 0

    if args.preview:
        if out.exists() and not args.overwrite:
            raise CadenceError(f"Отказ: папка {out} уже есть. Укажи другой --out или добавь --overwrite.")
        out.mkdir(parents=True, exist_ok=True)
        hashes = {str(p): sha256(p) for p in sources}
        print("Собираю три ролика превью…")
        report["preview"] = write_previews(video, rec, offset, windows, clip, out, vdur)
        for p, h in hashes.items():
            if sha256(Path(p)) != h:
                raise CadenceError(f"Внимание: исходник {p} изменился во время работы.")
        report["output"] = str(out)
        write_json(out / "preview.json", report)
        print(f"Готово: {out}")
        print("Если губы и звук совпадают во всех трёх — запускай ту же команду без --preview.")
        return 0

    out = check_output(out, sources, args.overwrite)
    json_path = check_output(out.with_suffix(".json"), sources, args.overwrite)
    hashes = {str(p): sha256(p) for p in sources}
    inputs, music_idx = inputs_for(video, rec, music)

    final_gain = None
    if music:
        print("Меряю громкость смеси…")
        graph = build_graph(bool(rec), offset, vdur, music_idx, music_gain, sc_gain, args.duck, None, True)
        meas = parse_ebur128(run(ffmpeg_cmd("-nostats", *inputs, "-filter_complex", graph,
                                            "-map", "[aout]", "-f", "null", "-")).stderr or "")
        mix_i, mix_tp = meas.get("lufs", -23.0), meas.get("true_peak", -6.0)
        final_gain = args.target - mix_i
        note = ""
        if mix_tp + final_gain > TRUE_PEAK_CEIL:
            final_gain = TRUE_PEAK_CEIL - mix_tp
            note = (f"Без лимитера до {args.target:.0f} LUFS не дотянуть: пики упрутся в "
                    f"{TRUE_PEAK_CEIL:.0f} dBTP. Итог будет около {mix_i + final_gain:.1f} LUFS.")
        report["levels"].update({"mix_lufs_before": mix_i, "mix_true_peak_before": mix_tp,
                                 "final_gain_db": round(final_gain, 2),
                                 "expected_lufs": round(mix_i + final_gain, 1)})
        print(f"Смесь {mix_i:.1f} LUFS, пик {mix_tp:.1f} dBTP → общий уровень {final_gain:+.1f} dB")
        if note:
            print(note)
            report["levels"]["note"] = note

    graph = build_graph(bool(rec), offset, vdur, music_idx, music_gain, sc_gain, args.duck,
                        final_gain, False)
    part = out.with_name(out.stem + ".part.mp4")
    print("Собираю видео (картинка копируется без перекодирования)…")
    try:
        run(ffmpeg_cmd("-y", "-loglevel", "error", *inputs, "-filter_complex", graph,
                       "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac",
                       "-b:a", "192k", "-movflags", "+faststart", part))
        part.replace(out)
    finally:
        if part.exists():
            part.unlink()
    for p, h in hashes.items():
        if sha256(Path(p)) != h:
            raise CadenceError(f"Внимание: исходник {p} изменился во время работы.")

    report["output"] = str(out)
    report["output_duration"] = round(duration_of(probe(out)), 3)
    if music:
        report["levels"]["result_lufs"] = measure_loudness(out).get("lufs")
        print(f"Громкость итога: {report['levels']['result_lufs']:.1f} LUFS")
    write_json(json_path, report)
    print(f"Готово: {out} ({fmt_time(report['output_duration'])})")
    print(f"Цифры: {json_path}")
    return 0


if __name__ == "__main__":
    main_guard(main)
