#!/usr/bin/env python3
"""Субтитры локальным Whisper: SRT рядом с видео и, по желанию, вшитые в новый MP4.

Всё считается на этой машине. Скрипт ничего не устанавливает и сам в сеть не ходит:
если Whisper не установлен — говорит, какой командой поставить, и останавливается;
если модели ещё нет на диске — просит разрешения флагом --allow-download.

    python3 scripts/captions_whisper.py work/my-vlog/out/take1-cut.mp4 --dry-run
    python3 scripts/captions_whisper.py work/my-vlog/out/take1-cut.mp4
    python3 scripts/captions_whisper.py work/my-vlog/out/take1-cut.mp4 --burn
    # поправили текст в SRT руками — вшить исправленный:
    python3 scripts/captions_whisper.py work/my-vlog/out/take1-cut.mp4 --srt-in work/my-vlog/out/take1-cut.srt --burn

Что получится (по умолчанию в work/<проект>/out/):
    <имя>.srt         субтитры: ≤ 32 знака в строке, ≤ 2 строки, не короче 0,8 с
    <имя>.words.json  слова с временем (из них можно пересобрать SRT без Whisper: --words-in)
    <имя>-subs.mp4    видео со вшитыми субтитрами (только с --burn)
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, check_output, ffmpeg_cmd, first_stream, main_guard, out_dir_for,
    probe, require_input, require_tool, run, same_file, write_json,
)

MODEL_SIZES = {"tiny": "75 МБ", "base": "145 МБ", "small": "0,5 ГБ", "medium": "1,5 ГБ",
               "large": "3 ГБ", "large-v3": "3 ГБ", "turbo": "1,6 ГБ"}
SENTENCE_END = re.compile(r"[.!?…]+[»\"')]*$")


# ---------------------------------------------------------------- поиск Whisper

def find_backends() -> list[str]:
    forced = os.environ.get("CADENCE_WHISPER_BACKEND", "").strip()
    if forced == "none":  # для самопроверки: притвориться, что Whisper не установлен
        return []
    found = []
    if importlib.util.find_spec("faster_whisper"):
        found.append("faster-whisper")
    if importlib.util.find_spec("whisper"):
        found.append("openai-whisper")
    if shutil.which("whisper"):
        found.append("cli")
    if forced:
        return [b for b in found if b == forced]
    return found


def install_hint() -> str:
    py = sys.executable or "python3"
    return (
        "Локальный Whisper не найден.\n"
        "Поставить одной командой (нужен интернет, пакет около 100 МБ):\n"
        f"    {py} -m pip install -U faster-whisper\n"
        "Модель распознавания скачается отдельно при первом запуске — скрипт попросит "
        "разрешения флагом --allow-download.\n"
        "Сам я ничего не устанавливаю. Без Whisper можно вшить готовый SRT: --srt-in <файл> --burn."
    )


def model_cached(backend: str, model: str) -> bool | None:
    """Есть ли модель на диске. None — не знаем (тогда считаем, что нет)."""
    if backend in ("openai-whisper", "cli"):
        root = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "whisper"
        name = {"large": "large-v3", "turbo": "large-v3-turbo"}.get(model, model)
        return (root / f"{name}.pt").is_file()
    if backend == "faster-whisper":
        hub = os.environ.get("HF_HUB_CACHE") or (
            Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub")
        hub = Path(hub)
        return any(p.is_dir() for p in hub.glob(f"models--*faster-whisper-{model}"))
    return None


# ---------------------------------------------------------------- распознавание

def extract_wav(src: Path, tmp: Path) -> Path:
    wav = tmp / "speech.wav"
    run(ffmpeg_cmd("-y", "-loglevel", "error", "-i", src, "-map", "0:a:0", "-ac", "1",
                   "-ar", "16000", "-c:a", "pcm_s16le", wav))
    return wav


def words_from_segments(segments) -> list[dict]:
    words = []
    for seg in segments:
        seg_words = seg.get("words") or []
        if seg_words:
            for w in seg_words:
                text = str(w.get("word", "")).strip()
                if text:
                    words.append({"w": text, "start": float(w["start"]), "end": float(w["end"])})
        else:  # без пословного времени: делим отрезок поровну
            parts = str(seg.get("text", "")).split()
            if not parts:
                continue
            s, e = float(seg["start"]), float(seg["end"])
            step = (e - s) / len(parts)
            for i, p in enumerate(parts):
                words.append({"w": p, "start": s + i * step, "end": s + (i + 1) * step})
    return words


def transcribe(backend: str, wav: Path, model: str, lang: str, allow_download: bool, tmp: Path) -> list[dict]:
    if backend == "faster-whisper":
        from faster_whisper import WhisperModel  # type: ignore
        m = WhisperModel(model, device="auto", compute_type="default",
                         local_files_only=not allow_download)
        segs, _info = m.transcribe(str(wav), language=lang, word_timestamps=True)
        return words_from_segments(
            {"start": s.start, "end": s.end, "text": s.text,
             "words": [{"word": w.word, "start": w.start, "end": w.end} for w in (s.words or [])]}
            for s in segs)
    if backend == "openai-whisper":
        import whisper  # type: ignore
        if not hasattr(whisper, "load_model"):
            raise CadenceError("Пакет whisper установлен, но это не openai-whisper. " + install_hint(), 3)
        m = whisper.load_model(model)
        r = m.transcribe(str(wav), language=lang, word_timestamps=True, fp16=False, verbose=None)
        return words_from_segments(r.get("segments", []))
    if backend == "cli":
        outdir = tmp / "cli"
        outdir.mkdir()
        run([shutil.which("whisper") or "whisper", str(wav), "--model", model, "--language", lang,
             "--word_timestamps", "True", "--output_format", "json", "--output_dir", str(outdir),
             "--fp16", "False", "--verbose", "False"])
        data = json.loads((outdir / f"{wav.stem}.json").read_text(encoding="utf-8"))
        return words_from_segments(data.get("segments", []))
    raise CadenceError(f"Неизвестный способ распознавания: {backend}")


# ---------------------------------------------------------------- группировка в субтитры

def wrap(text_words: list[str], max_chars: int, max_lines: int) -> list[str] | None:
    """Разбить на ≤ max_lines строк по ≤ max_chars; для двух строк — поровну. None — не влезает."""
    one = " ".join(text_words)
    if len(one) <= max_chars:
        return [one]
    if max_lines < 2:
        return None
    if max_lines == 2:
        best = None
        for i in range(1, len(text_words)):
            a, b = " ".join(text_words[:i]), " ".join(text_words[i:])
            if len(a) <= max_chars and len(b) <= max_chars:
                score = abs(len(a) - len(b))
                if best is None or score < best[0]:
                    best = (score, [a, b])
        return best[1] if best else None
    lines, cur = [], ""
    for w in text_words:
        cand = f"{cur} {w}".strip()
        if len(cand) <= max_chars:
            cur = cand
        else:
            if not cur:
                return None
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines if len(lines) <= max_lines else None


def group_words(words: list[dict], max_chars: int = 32, max_lines: int = 2, min_dur: float = 0.8,
                max_dur: float = 6.0, pause: float = 0.5) -> list[dict]:
    cues: list[dict] = []
    cur: list[dict] = []

    def flush():
        if cur:
            lines = wrap([w["w"] for w in cur], max_chars, max_lines) or [" ".join(w["w"] for w in cur)]
            cues.append({"start": cur[0]["start"], "end": cur[-1]["end"], "lines": lines})
            cur.clear()

    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            too_long = w["end"] - cur[0]["start"] > max_dur
            fits = wrap([x["w"] for x in cur] + [w["w"]], max_chars, max_lines) is not None
            if gap >= pause or too_long or not fits:
                flush()
        cur.append(w)
        if SENTENCE_END.search(w["w"]) and len(" ".join(x["w"] for x in cur)) >= max_chars // 2:
            flush()
    flush()

    # Не короче min_dur: тянем конец; если мешает следующий субтитр — слегка сдвигаем его начало,
    # пока у него самого остаётся min_dur.
    gap = 0.04
    for i, c in enumerate(cues):
        want = max(c["end"], c["start"] + min_dur)
        if i + 1 < len(cues):
            nxt = cues[i + 1]
            if want + gap > nxt["start"]:
                room = max(nxt["end"], nxt["start"] + min_dur) - min_dur
                nxt["start"] = max(nxt["start"], min(want + gap, room))
            want = min(want, nxt["start"] - gap)
        c["end"] = max(want, c["start"] + 0.1)
    return cues


def srt_time(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(cues: list[dict]) -> str:
    blocks = []
    for n, c in enumerate(cues, 1):
        blocks.append(f"{n}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n" + "\n".join(c["lines"]))
    return "\n\n".join(blocks) + "\n"


# ---------------------------------------------------------------- вшивание

def burn(src: Path, srt: Path, out: Path, font: str, font_px: float | None, fonts_dir: Path | None,
         max_chars: int, crf: int) -> None:
    filters = run(ffmpeg_cmd("-filters")).stdout or ""
    if not re.search(r"\ssubtitles\s", filters):
        raise CadenceError("В этой сборке ffmpeg нет фильтра subtitles (нужна libass). "
                           "SRT готов — его можно подключить в плеере или монтажной программе.", 3)
    info = probe(src)
    v = first_stream(info, "video")
    if not v:
        raise CadenceError("В файле нет картинки — вшивать субтитры некуда.")
    w, h = int(v.get("width", 0)), int(v.get("height", 0))
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(round(float(sd["rotation"]))) % 360
    if rot in (90, 270):
        w, h = h, w
    px = font_px or min(h * 0.045, w / (max_chars * 0.58))
    # libass рисует SRT в сетке 384×288 и масштабирует по высоте кадра.
    scale = 288.0 / h
    style = ",".join([
        f"FontName={font}", f"FontSize={px * scale:.1f}",
        "PrimaryColour=&H00FFFFFF", "OutlineColour=&H00000000", "BackColour=&H80000000",
        "BorderStyle=1", f"Outline={max(1.0, px * 0.08 * scale):.1f}", "Shadow=0",
        # У вертикального ролика низ кадра закрывают кнопки площадки — поднимаем выше.
        "Alignment=2", f"MarginV={round(288 * (0.18 if h > w else 0.08))}",
    ])
    with tempfile.TemporaryDirectory(prefix="cadence-subs-") as tmpdir:
        tmp = Path(tmpdir)
        shutil.copyfile(srt, tmp / "captions.srt")
        vf = f"subtitles=filename=captions.srt:charenc=UTF-8:force_style='{style}'"
        if fonts_dir:
            (tmp / "fonts").symlink_to(fonts_dir.resolve(), target_is_directory=True)
            vf += ":fontsdir=fonts"
        part = out.with_name(out.stem + ".part.mp4")
        try:
            run(ffmpeg_cmd("-y", "-loglevel", "error", "-i", src, "-map", "0:v:0", "-map", "0:a?",
                           "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
                           "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", part),
                cwd=tmp)
            part.replace(out)
        finally:
            if part.exists():
                part.unlink()


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Субтитры локальным Whisper (SRT) и вшивание в новый MP4.")
    ap.add_argument("video", help="видео (лучше уже порезанное: субтитры совпадут с итоговым роликом)")
    ap.add_argument("--lang", default="ru", help="язык речи (по умолчанию ru)")
    ap.add_argument("--model", default="small", help="модель Whisper: tiny, base, small, medium, large, turbo")
    ap.add_argument("--backend", default="auto", choices=["auto", "faster-whisper", "openai-whisper", "cli"])
    ap.add_argument("--allow-download", action="store_true",
                    help="разрешить скачать модель, если её нет на диске (нужен интернет)")
    ap.add_argument("--out", help="путь к SRT (по умолчанию work/<проект>/out/<имя>.srt)")
    ap.add_argument("--project", help="имя проекта в work/")
    ap.add_argument("--words-in", help="собрать SRT из готового <имя>.words.json, без Whisper")
    ap.add_argument("--srt-in", help="готовый SRT (например, поправленный руками) — только вшить")
    ap.add_argument("--burn", action="store_true", help="вшить субтитры в новый MP4")
    ap.add_argument("--burn-out", help="путь к MP4 с субтитрами (по умолчанию <имя>-subs.mp4 в out/)")
    ap.add_argument("--font", default="Arial", help="шрифт для --burn (по умолчанию Arial)")
    ap.add_argument("--font-size", type=float, help="высота букв в пикселях кадра (по умолчанию — по размеру кадра)")
    ap.add_argument("--fonts-dir", help="папка со своими шрифтами (.ttf/.otf) для --burn")
    ap.add_argument("--max-chars", type=int, default=32, help="знаков в строке (по умолчанию 32)")
    ap.add_argument("--max-lines", type=int, default=2, help="строк в субтитре (по умолчанию 2)")
    ap.add_argument("--min-dur", type=float, default=0.8, help="мин. длительность субтитра, с (0.8)")
    ap.add_argument("--max-dur", type=float, default=6.0, help="макс. длительность субтитра, с (6)")
    ap.add_argument("--pause", type=float, default=0.5, help="пауза, после которой новый субтитр, с (0.5)")
    ap.add_argument("--crf", type=int, default=18, help="качество x264 для --burn")
    ap.add_argument("--dry-run", action="store_true", help="показать план, ничего не делать")
    ap.add_argument("--overwrite", action="store_true", help="разрешить заменить прежний результат")
    args = ap.parse_args()

    src = require_input(args.video, "видео")
    require_tool("ffmpeg")
    if not re.fullmatch(r"[\w .\-]+", args.font):
        raise CadenceError("--font: только буквы, цифры, пробел, точка и дефис.")
    if not re.fullmatch(r"[a-z]{2,3}", args.lang):
        raise CadenceError("--lang: код языка, например ru или en.")
    if not re.fullmatch(r"[\w.\-]+", args.model):
        raise CadenceError("--model: имя модели, например small.")
    fonts_dir = Path(args.fonts_dir).expanduser() if args.fonts_dir else None
    if fonts_dir and not fonts_dir.is_dir():
        raise CadenceError(f"Нет папки со шрифтами: {fonts_dir}")

    srt_out = (Path(args.out).expanduser() if args.out
               else out_dir_for(src, args.project) / f"{src.stem}.srt")
    words_out = srt_out.with_name(srt_out.stem + ".words.json")
    burn_out = (Path(args.burn_out).expanduser() if args.burn_out
                else srt_out.with_name(f"{src.stem}-subs.mp4"))
    for p in (srt_out, words_out, burn_out):
        if same_file(p, src):
            raise CadenceError(f"Отказ: выход {p} совпадает с исходником.")

    # 1. Откуда берём текст
    if args.srt_in:
        srt_path = require_input(args.srt_in, "SRT")
        if not args.burn:
            raise CadenceError("--srt-in нужен только вместе с --burn.")
        mode = f"готовый SRT {srt_path}"
        backend = None
    elif args.words_in:
        mode = f"слова из {args.words_in}"
        backend = None
    else:
        backends = find_backends()
        if args.backend != "auto":
            backends = [b for b in backends if b == args.backend]
        if not backends:
            print(install_hint(), file=sys.stderr)
            return 3
        backend = backends[0]
        cached = model_cached(backend, args.model)
        mode = f"Whisper ({backend}), модель {args.model}, язык {args.lang}"
        if not cached and not args.allow_download:
            print(f"Модели {args.model} нет на диске (размер около {MODEL_SIZES.get(args.model, '?')}).\n"
                  "Чтобы скачать её один раз, нужен интернет. Запустите ту же команду с --allow-download.\n"
                  "Совет: модель base меньше и быстрее, small точнее для русского.", file=sys.stderr)
            return 4

    print(f"Видео: {src}")
    print(f"Текст: {mode}")
    if not args.srt_in:
        print(f"Будет записано: {srt_out}" + ("" if args.words_in else f", {words_out.name}"))
    if args.burn:
        print(f"Вшитые субтитры: {burn_out}")
    if args.dry_run:
        print("Это план (--dry-run). Ничего не записано.")
        return 0

    # 2. Текст → SRT
    if not args.srt_in:
        check_output(srt_out, [src], args.overwrite)
        if args.words_in:
            data = json.loads(require_input(args.words_in, "words.json").read_text(encoding="utf-8"))
            words = data["words"] if isinstance(data, dict) else data
        else:
            check_output(words_out, [src], args.overwrite)
            if not first_stream(probe(src), "audio"):
                raise CadenceError("В файле нет звука — распознавать нечего.")
            print("Распознаю речь… (на длинном видео это может занять несколько минут)")
            with tempfile.TemporaryDirectory(prefix="cadence-whisper-") as tmpdir:
                tmp = Path(tmpdir)
                words = transcribe(backend, extract_wav(src, tmp), args.model, args.lang,
                                   args.allow_download, tmp)
            write_json(words_out, {"source": str(src), "backend": backend, "model": args.model,
                                   "lang": args.lang, "words": words})
        if not words:
            raise CadenceError("Речь не распознана: слов нет. Проверь звук и язык (--lang).")
        cues = group_words(words, args.max_chars, args.max_lines, args.min_dur, args.max_dur, args.pause)
        srt_out.write_text(to_srt(cues), encoding="utf-8")
        print(f"SRT: {srt_out} ({len(cues)} субтитров)")
        srt_path = srt_out

    # 3. Вшивание
    if args.burn:
        check_output(burn_out, [src, srt_path], args.overwrite)
        print("Вшиваю субтитры (перекодирование видео)…")
        burn(src, srt_path, burn_out, args.font, args.font_size, fonts_dir, args.max_chars, args.crf)
        print(f"Готово: {burn_out}")
    return 0


if __name__ == "__main__":
    main_guard(main)
