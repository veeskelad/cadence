#!/usr/bin/env python3
"""Голос и музыка, когда в ролике главное — речь. Всё локально через ffmpeg, в сеть не ходит.

Подкоманды:
  voice      срез низа 80 Гц → (шумодав только с --denoise) → замер → одно усиление к −14 LUFS,
             истинный пик не выше −1 dBTP → <имя>-voice.wav
  find-drop  три кандидата на дроп трека: где громкость резче всего растёт
  mix        подложка под голос: кусок трека со сдвигом «дроп − финальная фраза», уровень −24 LUFS
             при голосе −14, приглушение по голосу (ratio 3, threshold 0.10, attack 20 мс, release 380 мс),
             итог к −14 LUFS → <голос>-mix.wav
  master     микс в готовый рендер: картинка копируется без перекодирования, AAC 256k, faststart
  measure    громкость, истинный пик, LRA и оценка шума файла

Громкость везде меняется одним усилением после замера, без лимитера и компрессора на итоге.
Если пик не даёт дотянуть до цели, результат будет тише цели, и скрипт это напишет.
Исходники не меняются: результат — новый файл (по умолчанию в work/<проект>/out/) и JSON с цифрами рядом.
Уровни и причины — skills/cadence-sound/references/voice-and-music.md.

  python3 scripts/voice_music_mix.py voice <голос.wav> [--denoise] [--out <voice.wav>]
  python3 scripts/voice_music_mix.py find-drop <трек.mp3>
  python3 scripts/voice_music_mix.py mix --voice <voice.wav> --music <трек.mp3> --drop-at 42.3 --land-at 11.8
  python3 scripts/voice_music_mix.py master --video <render.mp4> --audio <mix.wav>
  python3 scripts/voice_music_mix.py measure <файл>
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, check_output, default_output, duration_of, ffmpeg_cmd, first_stream, main_guard,
    measure_loudness, parse_ebur128, probe, require_input, run, sha256, write_json,
)

VOICE_LUFS = -14.0      # голос и итог
BED_LUFS = -24.0        # подложка при голосе −14
CEIL = -1.0             # истинный пик, dBTP
QUIET_FLOOR = -50.0     # шум ниже этого — шумодав не нужен
DURATION_TOLERANCE = 0.034


# ---------------------------------------------------------------- замеры

def safe_gain(lufs: float, peak: float, target: float, ceil: float = CEIL) -> tuple[float, bool]:
    """Одно усиление к цели, но такое, чтобы пик не вышел за потолок. Второе — упёрлось ли в пик."""
    gain = target - lufs
    if peak + gain > ceil:
        return ceil - peak, True
    return gain, False


def loudness(path: Path, chain: str | None = None, stream: str = "0:a:0") -> dict:
    m = measure_loudness(path, chain, stream)
    if not np.isfinite(m.get("lufs", float("-inf"))):
        raise CadenceError(f"{path}: звук почти не слышен — громкость не измерить.")
    return m


def decode(path: Path, rate: int) -> np.ndarray:
    proc = subprocess.run(ffmpeg_cmd("-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1",
                                     "-ar", str(rate), "-f", "f32le", "-"),
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise CadenceError(f"Не смог прочитать звук из {path}: {proc.stderr.decode(errors='replace')[-300:]}")
    return np.frombuffer(proc.stdout, dtype="<f4").astype(np.float64)


def rms_db(x: np.ndarray, size: int) -> np.ndarray:
    n = len(x) // size
    frames = x[: n * size].reshape(n, size)
    return 20 * np.log10(np.maximum(np.sqrt(np.mean(frames ** 2, axis=1)), 1e-5))


def noise_floor(path: Path) -> float | None:
    """Оценка шума: медиана тихих окон 10 мс (на 30 дБ тише громких). Меньше 0,5 с тишины — None."""
    db = rms_db(decode(path, 16000), 160)
    if len(db) == 0:
        return None
    quiet = db[db < np.percentile(db, 95) - 30]
    return round(float(np.median(quiet)), 1) if len(quiet) >= 50 else None


def drop_candidates(db: np.ndarray, hop: float, window: float = 2.0, count: int = 3,
                    spacing: float = 4.0) -> list[dict]:
    """Дроп — самый резкий подъём: средний уровень следующих window секунд минус предыдущих."""
    w = int(round(window / hop))
    if len(db) < 2 * w + 1:
        return []
    csum = np.concatenate(([0.0], np.cumsum(db)))
    idx = np.arange(w, len(db) - w)
    rise = (csum[idx + w] - csum[idx]) / w - (csum[idx] - csum[idx - w]) / w
    picked: list[int] = []
    for k in np.argsort(rise)[::-1]:
        t = int(idx[k])
        if all(abs(t - p) * hop >= spacing for p in picked):
            picked.append(t)
        if len(picked) == count:
            break
    return [{"time": round(p * hop, 2), "rise_db": round(float(rise[p - w]), 1)} for p in picked]


def moov_before_mdat(path: Path) -> bool | None:
    """True — заголовок файла в начале (+faststart сработал), плеер стартует сразу."""
    size_total = path.stat().st_size
    with path.open("rb") as fh:
        offset = 0
        while offset < size_total:
            fh.seek(offset)
            head = fh.read(16)
            if len(head) < 8:
                return None
            size, kind = int.from_bytes(head[:4], "big"), head[4:8]
            if size == 1:
                size = int.from_bytes(head[8:16], "big")
            if kind == b"moov":
                return True
            if kind == b"mdat":
                return False
            if size < 8:
                return None
            offset += size
    return None


# ---------------------------------------------------------------- выходы

def outputs(out_arg: str | None, source: Path, suffix: str, ext: str, project: str | None,
            sources: list[Path], overwrite: bool) -> tuple[Path, Path]:
    out = Path(out_arg).expanduser() if out_arg else default_output(source, suffix, ext, project)
    if out.suffix.lower() != ext:
        raise CadenceError(f"--out должен заканчиваться на {ext}")
    out = check_output(out, sources, overwrite)
    report = check_output(out.with_suffix(".json"), sources, overwrite)
    return out, report


def check_untouched(hashes: dict[Path, str]) -> None:
    for p, h in hashes.items():
        if sha256(p) != h:
            raise CadenceError(f"Внимание: исходник {p} изменился во время работы.")


def short_note(result_lufs: float, target: float, capped: bool) -> str | None:
    if capped and result_lufs < target - 0.5:
        return (f"Тише цели: {result_lufs:.1f} LUFS вместо {target:.0f}. Громкость упёрлась в пик, "
                "лимитер не ставлю. Обычно хватает: площадка сама не убавит тихий ролик.")
    return None


# ---------------------------------------------------------------- подкоманды

def cmd_voice(a: argparse.Namespace) -> int:
    src = require_input(a.input, "голос")
    floor = a.noise_floor if a.noise_floor is not None else noise_floor(src)
    if a.denoise and floor is None:
        raise CadenceError("Шум не измерить: в файле почти нет пауз. Измерь исходник до нарезки "
                           "(`measure <исходник>`) и передай --noise-floor.")
    if a.denoise and floor < QUIET_FLOOR:
        raise CadenceError(f"Шум {floor:.1f} dBFS — запись чистая (тише {QUIET_FLOOR:.0f}). "
                           "Шумодав здесь только добавит артефактов: убери --denoise.")
    out, report_path = outputs(a.out, src, "voice", ".wav", a.project, [src], a.overwrite)
    # моно и частота — в цепочке: замер и запись видят один и тот же сигнал
    chain = ("aformat=channel_layouts=mono,highpass=f=80" + (",afftdn=nf=-25" if a.denoise else "")
             + ",aresample=48000")
    before = loudness(src, chain)
    gain, capped = safe_gain(before["lufs"], before["true_peak"], a.target, a.peak)
    hashes = {src: sha256(src)}
    run(ffmpeg_cmd("-y", "-v", "error", "-i", src, "-map", "0:a:0", "-af", f"{chain},volume={gain:.2f}dB",
                   "-c:a", "pcm_s24le", out))
    check_untouched(hashes)
    after = loudness(out)
    note = short_note(after["lufs"], a.target, capped)
    report = {"tool": "cadence voice_music_mix voice", "input": str(src), "output": str(out),
              "chain": chain, "denoise": a.denoise, "noise_floor_db": floor,
              "before": before, "gain_db": round(gain, 2), "peak_limited": capped, "measured": after, "note": note}
    write_json(report_path, report)
    print(f"Голос: было {before['lufs']:.1f} LUFS, пик {before['true_peak']:.1f} → усиление {gain:+.1f} дБ → "
          f"{after['lufs']:.1f} LUFS, пик {after['true_peak']:.1f} dBTP")
    if floor is not None:
        print(f"Шум около {floor:.1f} dBFS" + (" — шумодав не нужен" if floor < QUIET_FLOOR and not a.denoise else ""))
    if note:
        print(note)
    print(f"Готово: {out}\nЦифры: {report_path}")
    return 0


def cmd_find_drop(a: argparse.Namespace) -> int:
    src = require_input(a.music, "трек")
    hop = 0.1
    db = rms_db(decode(src, 22050), int(22050 * hop))
    smooth = np.convolve(db, np.ones(5) / 5, mode="same")   # 0,5 с: одиночный удар не выигрывает у раскрытия
    found = drop_candidates(smooth, hop, count=a.count)
    if not found:
        raise CadenceError("Трек слишком короткий: нужно хотя бы 4 с.")
    print(f"{src.name}: длина {len(db) * hop:.1f} с. Кандидаты на дроп (послушай каждый):")
    for i, c in enumerate(found, 1):
        print(f"  {i}. {c['time']:.2f} с — громкость растёт на {c['rise_db']:.1f} дБ")
    print("Доли и брейки точнее: python3 scripts/track_structure.py <трек>")
    return 0


def mix_graph(segment: str, bed_gain: float, sc_gain: float, length: float, fade: float,
              a: argparse.Namespace, tail: str) -> str:
    """tail: что сделать с [mix] (или [duck], если tail начинается с 'duck:')."""
    # sidechaincompress отдаёт меньше, чем получил: оба входа дополняются тишиной (apad),
    # выход обрезается по длине голоса (atrim), длительность сверяется после записи.
    parts = [
        f"[1:a:0]{segment},volume={bed_gain:.2f}dB,afade=t=out:st={max(0.0, length - fade):.3f}:d={fade:.3f},apad[bed]",
        "[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=2[vmix][vsc0]",
        f"[vsc0]volume={sc_gain:.2f}dB,apad[vsc]",
        f"[bed][vsc]sidechaincompress=threshold={a.threshold}:ratio={a.ratio}:attack={a.attack}:"
        f"release={a.release},atrim=duration={length:.6f}[duck]",
    ]
    if tail.startswith("duck:"):
        parts.append(f"[vmix]anullsink;[duck]{tail[5:]}[aout]")
    else:
        parts.append(f"[vmix]apad,atrim=duration={length:.6f}[v]")
        parts.append("[v][duck]amix=inputs=2:duration=first:normalize=0[mix]")
        parts.append(f"[mix]{tail}[aout]")
    return ";".join(parts)


def measure_graph(voice: Path, music: Path, graph: str) -> dict:
    proc = run(ffmpeg_cmd("-nostats", "-i", voice, "-i", music, "-filter_complex", graph,
                          "-map", "[aout]", "-f", "null", "-"))
    return parse_ebur128(proc.stderr or "")


def cmd_mix(a: argparse.Namespace) -> int:
    voice = require_input(a.voice, "голос")
    music = require_input(a.music, "трек")
    length = duration_of(probe(voice))
    music_length = duration_of(probe(music))
    if length <= 0 or music_length <= 0:
        raise CadenceError("Не смог узнать длину голоса или трека.")
    if (a.drop_at is None) != (a.land_at is None):
        raise CadenceError("Для посадки дропа нужны оба: --drop-at (дроп в треке) и --land-at "
                           "(начало финальной фразы в ролике).")
    offset = a.drop_at - a.land_at if a.drop_at is not None else a.music_start
    # offset > 0 — трек берётся с середины; offset < 0 — в начале ролика тишина, трек входит позже
    lead = max(-offset, 0.0)
    music_in = max(offset, 0.0)
    available = music_length - music_in
    if available + lead < length - 0.05:
        raise CadenceError(f"Трека не хватает: с {music_in:.2f} с осталось {available:.2f} с, а голос "
                           f"{length:.2f} с (тишина в начале {lead:.2f} с). Возьми другой сдвиг или трек.")
    out, report_path = outputs(a.out, voice, "mix", ".wav", a.project, [voice, music], a.overwrite)

    v = loudness(voice)
    delta = v["lufs"] - VOICE_LUFS
    bed_target = a.music_lufs if a.music_lufs is not None else BED_LUFS + delta
    sc_gain = -delta    # ключ приглушения — как от голоса на −14: threshold работает одинаково
    segment = (f"atrim=start={music_in:.3f}:duration={length - lead:.3f},asetpts=PTS-STARTPTS,"
               "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
               + (f",adelay={int(round(lead * 1000))}:all=1" if lead else ""))
    b = loudness(music, segment)
    bed_gain, _ = safe_gain(b["lufs"], b["true_peak"], bed_target, a.peak)
    fade = min(a.fade_out, length / 4)

    pre = measure_graph(voice, music, mix_graph(segment, bed_gain, sc_gain, length, fade, a,
                                                "ebur128=peak=true:framelog=quiet"))
    if not np.isfinite(pre.get("lufs", float("-inf"))):
        raise CadenceError("Смесь почти беззвучная — проверь голос и трек.")
    final_gain, capped = safe_gain(pre["lufs"], pre["true_peak"], a.target, a.peak)
    duck = measure_graph(voice, music, mix_graph(segment, bed_gain, sc_gain, length, fade, a,
                                                 f"duck:volume={final_gain:.2f}dB,ebur128=peak=true:framelog=quiet"))

    hashes = {voice: sha256(voice), music: sha256(music)}
    graph = mix_graph(segment, bed_gain, sc_gain, length, fade, a, f"volume={final_gain:.2f}dB")
    run(ffmpeg_cmd("-y", "-v", "error", "-i", voice, "-i", music, "-filter_complex", graph,
                   "-map", "[aout]", "-ar", "48000", "-c:a", "pcm_s24le", out))
    check_untouched(hashes)
    out_length = duration_of(probe(out))
    drift = round(out_length - length, 3)
    if abs(drift) > DURATION_TOLERANCE:
        out.unlink()
        raise CadenceError(f"Длина микса {out_length:.3f} с, а голоса {length:.3f} с: хвост потерян. Микс удалён.")
    after = loudness(out)
    voice_final = v["lufs"] + final_gain
    separation = round(voice_final - duck["lufs"], 1) if np.isfinite(duck.get("lufs", float("-inf"))) else None
    note = short_note(after["lufs"], a.target, capped)
    report = {
        "tool": "cadence voice_music_mix mix", "voice": str(voice), "music": str(music), "output": str(out),
        "music_in": round(music_in, 3), "lead_silence": round(lead, 3), "drop_at": a.drop_at, "land_at": a.land_at,
        "voice_lufs": v["lufs"], "bed_target_lufs": round(bed_target, 1), "bed_gain_db": round(bed_gain, 2),
        "sidechain": {"threshold": a.threshold, "ratio": a.ratio, "attack": a.attack, "release": a.release,
                      "key_gain_db": round(sc_gain, 2)},
        "final_gain_db": round(final_gain, 2), "peak_limited": capped, "separation_db": separation,
        "duration": out_length, "duration_drift": drift, "measured": after, "note": note,
    }
    write_json(report_path, report)
    where = (f"трек с {music_in:.2f} с" if music_in else "трек с начала") + (f", тишина в начале {lead:.2f} с" if lead else "")
    print(f"Голос {v['lufs']:.1f} LUFS, подложка к {bed_target:.1f} LUFS, {where}")
    print(f"Итог: {after['lufs']:.1f} LUFS, пик {after['true_peak']:.1f} dBTP, голос над приглушённой подложкой "
          f"на {separation} дБ, длина {out_length:.3f} с")
    if delta < -1 and a.music_lufs is None:
        print(f"Голос тише −14 на {-delta:.1f} дБ — подложка опущена так же, чтобы разнос не сжался.")
    if note:
        print(note)
    print(f"Готово: {out}\nЦифры: {report_path}")
    return 0


def mux(video: Path, audio: Path, out: Path, gain: float) -> None:
    run(ffmpeg_cmd("-y", "-v", "error", "-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0",
                   "-c:v", "copy", "-af", f"volume={gain:.2f}dB", "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
                   "-shortest", "-movflags", "+faststart", out))


def cmd_master(a: argparse.Namespace) -> int:
    video = require_input(a.video, "рендер")
    audio = require_input(a.audio, "микс")
    vinfo = probe(video)
    if not first_stream(vinfo, "video"):
        raise CadenceError("В рендере нет картинки — нужен видеофайл.")
    out, report_path = outputs(a.out, video, "master", ".mp4", a.project, [video, audio], a.overwrite)
    hashes = {video: sha256(video), audio: sha256(audio)}
    gain = 0.0
    # AAC сам поднимает пик на 0,3–0,6 дБ: меряем готовый файл и, если пик вылез, убавляем.
    for _ in range(3):
        mux(video, audio, out, gain)
        m = loudness(out)
        if m["true_peak"] <= a.peak:
            break
        gain -= m["true_peak"] - a.peak + 0.1
    check_untouched(hashes)
    info = probe(out)
    v = first_stream(info, "video") or {}
    vdur, adur = duration_of(vinfo), duration_of(probe(audio))
    report = {"tool": "cadence voice_music_mix master", "video": str(video), "audio": str(audio), "output": str(out),
              "width": v.get("width"), "height": v.get("height"), "fps": v.get("avg_frame_rate"),
              "video_codec": v.get("codec_name"), "duration": duration_of(info), "video_duration": vdur,
              "audio_duration": adur, "gain_db": round(gain, 2), "moov_before_mdat": moov_before_mdat(out),
              "measured": m}
    write_json(report_path, report)
    print(f"Мастер: {m['lufs']:.1f} LUFS, пик {m['true_peak']:.1f} dBTP, картинка скопирована без перекодирования")
    if m["true_peak"] > a.peak:
        print(f"Пик выше {a.peak:.0f} dBTP и после трёх попыток — убавь микс и собери заново.")
    if abs(vdur - adur) > 0.1:
        print(f"Длины не совпадают: видео {vdur:.2f} с, звук {adur:.2f} с — мастер обрезан по короткому.")
    print(f"Готово: {out}\nЦифры: {report_path}")
    return 0


def cmd_measure(a: argparse.Namespace) -> int:
    src = require_input(a.input, "файл")
    m = loudness(src)
    floor = noise_floor(src)
    print(f"{src}\n  {m['lufs']:.1f} LUFS · пик {m['true_peak']:.1f} dBTP · LRA {m.get('lra', 0):.1f} LU · "
          + (f"шум около {floor:.1f} dBFS" if floor is not None else "пауз мало — шум не оценить"))
    return 0


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Голос, подложка с приглушением по голосу и мастер.")
    sub = ap.add_subparsers(dest="command", required=True)

    def outs(p: argparse.ArgumentParser) -> None:
        p.add_argument("--out", help="путь к новому файлу (по умолчанию work/<проект>/out/)")
        p.add_argument("--project", help="имя проекта в work/")
        p.add_argument("--overwrite", action="store_true", help="разрешить заменить прежний результат")
        p.add_argument("--target", type=float, default=VOICE_LUFS, help="громкость итога, LUFS (−14)")
        p.add_argument("--peak", type=float, default=CEIL, help="потолок истинного пика, dBTP (−1)")

    p = sub.add_parser("voice", help="голос к −14 LUFS без лимитера")
    p.add_argument("input")
    p.add_argument("--denoise", action="store_true", help="шумодав; только если шум громче −50 dBFS")
    p.add_argument("--noise-floor", type=float, help="шум исходника, dBFS (из measure): в нарезке пауз почти нет")
    outs(p)

    p = sub.add_parser("find-drop", help="кандидаты на дроп трека")
    p.add_argument("music")
    p.add_argument("--count", type=int, default=3)

    p = sub.add_parser("mix", help="подложка с приглушением по голосу, итог −14 LUFS")
    p.add_argument("--voice", required=True, help="голос (лучше результат подкоманды voice)")
    p.add_argument("--music", required=True)
    p.add_argument("--music-start", type=float, default=0.0, help="с какой секунды трека начать (без посадки дропа)")
    p.add_argument("--drop-at", type=float, help="время дропа в треке, с")
    p.add_argument("--land-at", type=float, help="начало финальной фразы в ролике, с")
    p.add_argument("--music-lufs", type=float,
                   help="уровень подложки, LUFS. По умолчанию −24 при голосе −14 (сдвигается вместе с голосом); "
                        "−22 громче, −26 тише")
    p.add_argument("--threshold", type=float, default=0.10)
    p.add_argument("--ratio", type=float, default=3.0)
    p.add_argument("--attack", type=float, default=20.0, help="мс")
    p.add_argument("--release", type=float, default=380.0, help="мс")
    p.add_argument("--fade-out", type=float, default=0.4, help="затухание трека в конце, с")
    outs(p)

    p = sub.add_parser("master", help="микс в готовый рендер без перекодирования картинки")
    p.add_argument("--video", required=True)
    p.add_argument("--audio", required=True)
    outs(p)

    p = sub.add_parser("measure", help="LUFS, пик, LRA, шум")
    p.add_argument("input")

    a = ap.parse_args()
    handlers = {"voice": cmd_voice, "find-drop": cmd_find_drop, "mix": cmd_mix, "master": cmd_master,
                "measure": cmd_measure}
    return handlers[a.command](a)


if __name__ == "__main__":
    main_guard(main)
