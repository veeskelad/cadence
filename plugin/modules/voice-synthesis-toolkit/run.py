#!/usr/bin/env python3
"""Озвучка текста локальной нейросетью (русский, английский и ещё 21 язык) и клонирование тембра по образцу.

Всё считается на этой машине. Веса моделей скрипт сам не скачивает: нет их в кэше — останавливается
и называет объём; скачивание только с `--allow-download` и согласия человека.

    python3 modules/voice-synthesis-toolkit/run.py --text "Привет, это проверка." --language ru --dry-run
    python3 modules/voice-synthesis-toolkit/run.py --text-file script.txt --language ru --project my-reel
    python3 modules/voice-synthesis-toolkit/run.py --text "..." --voice-ref voice.wav   # тембр по образцу, только с согласия владельца голоса

Результат по умолчанию — `$WORK/<проект>/out/<имя>.wav`. Во все файлы модель вшивает неслышимый водяной знак.
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

MODULE_ID = "voice-synthesis-toolkit"
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(HERE / "src"))
from cadence_paths import CadenceError, check_output, main_guard, require_input, slugify, work_root  # noqa: E402

# вариант -> (репозиторий весов, файл-признак в кэше, объём на диске (оценка), языки)
VARIANTS = {
    "multilingual": ("ResembleAI/chatterbox", "t3_mtl23ls_v2.safetensors", "около 3 ГБ", "23 языка, в том числе ru"),
    "base": ("ResembleAI/chatterbox", "t3_cfg.safetensors", "около 3 ГБ", "только английский"),
    "turbo": ("ResembleAI/chatterbox-turbo", "t3_turbo_v1.safetensors", "около 2 ГБ", "только английский, теги вроде [laugh]"),
    "nano": ("ResembleAI/chatterbox-nano", "t3_nano_v1.safetensors", "около 1 ГБ", "только английский"),
}


def hf_cached(repo: str, marker: str) -> bool:
    hub = Path(os.environ.get("HF_HUB_CACHE") or Path(os.environ.get("HF_HOME", Path.home() / ".cache/huggingface")) / "hub")
    return any(hub.glob(f"models--{repo.replace('/', '--')}/snapshots/*/{marker}"))


def ensure_deps() -> None:
    try:
        for name in ("torch", "librosa", "perth", "soundfile"):
            importlib.import_module(name)
        return
    except ImportError:
        pass
    if not os.environ.get("CADENCE_MODULE_REEXEC"):
        proc = subprocess.run([sys.executable, str(ROOT / "scripts/module_setup.py"), "python", MODULE_ID],
                              capture_output=True, text=True)
        try:
            py = json.loads(proc.stdout)["python"]
        except (ValueError, KeyError):
            py = None
        if proc.returncode == 0 and py and Path(py) != Path(sys.executable):
            os.environ["CADENCE_MODULE_REEXEC"] = "1"
            os.execv(py, [py, *sys.argv])
    raise CadenceError("пропуск: нет зависимостей модуля (torch, librosa и др.). Установка — около 4 ГБ вместе с весами, сеть, "
                       f"только с согласия человека: python3 scripts/module_setup.py install {MODULE_ID}", code=3)


def split_text(text: str, limit: int = 220) -> list[str]:
    """Режем по предложениям и собираем куски не длиннее limit знаков: модель плохо держит длинные абзацы."""
    parts = [p.strip() for p in re.split(r"(?<=[.!?…])\s+|\n+", text) if p.strip()]
    chunks: list[str] = []
    for p in parts:
        if chunks and len(chunks[-1]) + 1 + len(p) <= limit:
            chunks[-1] += " " + p
        else:
            chunks.append(p)
    return chunks


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text", help="текст озвучки")
    src.add_argument("--text-file", help="файл с текстом озвучки (utf-8)")
    ap.add_argument("--language", default="ru", help="код языка (ru, en, ...); не английский — только вариант multilingual")
    ap.add_argument("--variant", default="multilingual", choices=sorted(VARIANTS), help="какую модель взять")
    ap.add_argument("--voice-ref", help="образец голоса (wav или mp3, 10 секунд чистой речи); только с согласия владельца голоса")
    ap.add_argument("--exaggeration", type=float, default=0.5, help="выразительность 0..1 (по умолчанию 0.5)")
    ap.add_argument("--cfg-weight", type=float, default=0.5, help="насколько жёстко держаться образца и текста (0.5)")
    ap.add_argument("--pause", type=float, default=0.35, help="пауза между предложениями, с")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "mps", "cpu"])
    ap.add_argument("--name", default="voiceover", help="имя выходного файла без расширения")
    ap.add_argument("--project", help="имя проекта в $WORK")
    ap.add_argument("--out", help="полный путь к wav (по умолчанию $WORK/<проект>/out/<имя>.wav)")
    ap.add_argument("--allow-download", action="store_true", help="разрешить скачать веса (сеть, только с согласия)")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="показать, что будет сделано, и выйти")
    args = ap.parse_args()

    text = args.text if args.text is not None else require_input(args.text_file, "файл с текстом").read_text(encoding="utf-8")
    text = text.strip()
    if not text:
        raise CadenceError("Текст пустой.")
    lang = args.language.lower()
    if args.variant != "multilingual" and lang != "en":
        raise CadenceError(f"Вариант {args.variant}: {VARIANTS[args.variant][3]}. Для языка {lang} возьми --variant multilingual.")
    ref = require_input(args.voice_ref, "образец голоса") if args.voice_ref else None
    out = Path(args.out).expanduser() if args.out else work_root() / slugify(args.project or "voiceover") / "out" / f"{args.name}.wav"
    repo, marker, size, langs = VARIANTS[args.variant]
    have = hf_cached(repo, marker)
    chunks = split_text(text)

    print(f"Модель: {args.variant} ({langs}), веса {size}, в кэше: {'да' if have else 'нет'}; язык: {lang}")
    print(f"Текст: {len(text)} знаков, кусков {len(chunks)}; образец голоса: {ref or 'встроенный голос модели'}")
    print(f"Будет записано: {out}")
    if ref:
        print("Клонирование голоса: только с согласия владельца голоса.")
    if args.dry_run:
        return 0
    if not have and not args.allow_download:
        raise CadenceError(f"Весов {args.variant} ({size}, репозиторий {repo}) в кэше нет. Скачивание — только с согласия человека: "
                           "повтори с --allow-download.", code=3)
    check_output(out, [ref] if ref else [], args.overwrite)
    if not args.allow_download:
        os.environ["HF_HUB_OFFLINE"] = "1"
    ensure_deps()

    import numpy as np
    import soundfile as sf
    import torch

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Устройство: {device}. Загружаю модель…")
    if args.variant == "multilingual":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        gen = lambda t: model.generate(t, language_id=lang, audio_prompt_path=str(ref) if ref else None,  # noqa: E731
                                       exaggeration=args.exaggeration, cfg_weight=args.cfg_weight)
    elif args.variant == "base":
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device=device)
        gen = lambda t: model.generate(t, audio_prompt_path=str(ref) if ref else None,  # noqa: E731
                                       exaggeration=args.exaggeration, cfg_weight=args.cfg_weight)
    else:
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        model = ChatterboxTurboTTS.from_pretrained(device=device, nano=(args.variant == "nano"))
        gen = lambda t: model.generate(t, audio_prompt_path=str(ref) if ref else None)  # noqa: E731

    silence = np.zeros(int(model.sr * args.pause), dtype=np.float32)
    pieces: list = []
    for i, chunk in enumerate(chunks, 1):
        print(f"[{i}/{len(chunks)}] {chunk[:70]}")
        pieces.append(gen(chunk).squeeze().detach().cpu().numpy().astype(np.float32))
        if i < len(chunks):
            pieces.append(silence)
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), np.concatenate(pieces), model.sr)
    print(f"Готово: {out} ({sum(len(p) for p in pieces) / model.sr:.1f} с). В звук вшит неслышимый водяной знак модели.")
    return 0


if __name__ == "__main__":
    main_guard(main)
