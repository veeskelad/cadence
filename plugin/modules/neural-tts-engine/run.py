#!/usr/bin/env python3
"""Озвучка текста нейросетью с тремя режимами: готовый диктор, голос по описанию словами, голос по образцу.

Всё считается на этой машине. Веса моделей скрипт сам не скачивает: нет их в кэше — останавливается
и называет объём; скачивание только с `--allow-download` и согласия человека. Расчёт рассчитан на NVIDIA
(CUDA); на процессоре работает очень медленно, на Mac лучше модуль mlx-audio-engine.

    python3 modules/neural-tts-engine/run.py --mode design --text "Привет!" --language Russian \
        --instruct "Спокойный низкий мужской голос, говорит неторопливо" --dry-run
    python3 modules/neural-tts-engine/run.py --mode custom --text-file script.txt --speaker <имя диктора> --language Russian
    python3 modules/neural-tts-engine/run.py --mode clone --text "..." --ref-audio voice.wav --ref-text "что сказано в образце"

Результат по умолчанию — `$WORK/<проект>/out/<имя>.wav`.
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

MODULE_ID = "neural-tts-engine"
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(HERE))
from cadence_paths import CadenceError, check_output, main_guard, require_input, slugify, work_root  # noqa: E402

KINDS = {"custom": "CustomVoice", "design": "VoiceDesign", "clone": "Base"}
SIZES = {"1.7B": "около 4–5 ГБ", "0.6B": "около 2–3 ГБ"}  # оценка по числу параметров


def model_name(mode: str, size: str) -> str:
    return f"Qwen/Qwen3-TTS-12Hz-{size}-{KINDS[mode]}"


def hf_cached(repo: str) -> bool:
    hub = Path(os.environ.get("HF_HUB_CACHE") or Path(os.environ.get("HF_HOME", Path.home() / ".cache/huggingface")) / "hub")
    return any(hub.glob(f"models--{repo.replace('/', '--')}/snapshots/*/config.json"))


def ensure_deps() -> None:
    try:
        for name in ("torch", "transformers", "soundfile", "librosa"):
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
    raise CadenceError("пропуск: нет зависимостей модуля (torch, transformers и др.). Установка — около 6 ГБ вместе с весами, сеть, "
                       f"только с согласия человека: python3 scripts/module_setup.py install {MODULE_ID}", code=3)


def split_text(text: str, limit: int = 300) -> list[str]:
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
    ap.add_argument("--mode", required=True, choices=sorted(KINDS),
                    help="custom — готовый диктор; design — голос по описанию; clone — голос по образцу")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text")
    src.add_argument("--text-file", help="файл с текстом (utf-8)")
    ap.add_argument("--language", default="Auto", help="название языка по-английски (Russian, English, ...) или Auto")
    ap.add_argument("--size", default="1.7B", choices=sorted(SIZES), help="размер модели (по умолчанию 1.7B)")
    ap.add_argument("--speaker", help="имя диктора (режим custom); неверное имя — скрипт покажет список")
    ap.add_argument("--instruct", help="описание голоса (design) или манеры (custom), словами")
    ap.add_argument("--ref-audio", help="образец голоса, локальный wav (режим clone); только с согласия владельца голоса")
    ap.add_argument("--ref-text", help="дословно, что сказано в образце; без него тембр берётся грубее")
    ap.add_argument("--pause", type=float, default=0.35, help="пауза между предложениями, с")
    ap.add_argument("--device", default="auto", help="auto (cuda:0, иначе cpu), cuda:0, mps, cpu")
    ap.add_argument("--flash-attn", action="store_true", help="включить flash-attention 2 (если пакет стоит)")
    ap.add_argument("--name", default="voiceover")
    ap.add_argument("--project", help="имя проекта в $WORK")
    ap.add_argument("--out", help="полный путь к wav (по умолчанию $WORK/<проект>/out/<имя>.wav)")
    ap.add_argument("--allow-download", action="store_true", help="разрешить скачать веса (сеть, только с согласия)")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    text = (args.text if args.text is not None else require_input(args.text_file, "файл с текстом").read_text(encoding="utf-8")).strip()
    if not text:
        raise CadenceError("Текст пустой.")
    if args.mode == "clone" and not args.ref_audio:
        raise CadenceError("Режим clone: нужен --ref-audio (локальный wav) и желательно --ref-text.")
    if args.mode == "design" and not args.instruct:
        raise CadenceError("Режим design: опиши голос словами в --instruct.")
    ref = require_input(args.ref_audio, "образец голоса") if args.ref_audio else None
    out = Path(args.out).expanduser() if args.out else work_root() / slugify(args.project or "voiceover") / "out" / f"{args.name}.wav"
    repo = model_name(args.mode, args.size)
    have = hf_cached(repo)
    chunks = split_text(text)

    print(f"Режим: {args.mode}; модель {repo}, веса {SIZES[args.size]}, в кэше: {'да' if have else 'нет'}; язык: {args.language}")
    print(f"Текст: {len(text)} знаков, кусков {len(chunks)}\nБудет записано: {out}")
    if ref:
        print("Клонирование голоса: только с согласия владельца голоса.")
    if args.dry_run:
        return 0
    if not have and not args.allow_download:
        raise CadenceError(f"Весов {repo} ({SIZES[args.size]}) в кэше нет. Скачивание — только с согласия человека: "
                           "повтори с --allow-download.", code=3)
    check_output(out, [ref] if ref else [], args.overwrite)
    if not args.allow_download:
        os.environ["HF_HUB_OFFLINE"] = "1"
    ensure_deps()

    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    device = args.device
    if device == "auto":
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("Внимание: на процессоре озвучка очень медленная; на Mac берите mlx-audio-engine.")
    kwargs = {"device_map": device, "dtype": torch.bfloat16 if device.startswith("cuda") else torch.float32}
    if args.flash_attn:
        kwargs["attn_implementation"] = "flash_attention_2"
    print(f"Устройство: {device}. Загружаю модель…")
    tts = Qwen3TTSModel.from_pretrained(repo, **kwargs)
    langs = tts.get_supported_languages()
    if args.language.lower() != "auto" and langs is not None and args.language.lower() not in langs:
        raise CadenceError(f"Язык {args.language} эта модель не знает. Умеет: {', '.join(langs)}")

    pieces: list = []
    sr = 0
    for i, chunk in enumerate(chunks, 1):
        print(f"[{i}/{len(chunks)}] {chunk[:70]}")
        if args.mode == "custom":
            speakers = tts.get_supported_speakers() or []
            if not args.speaker or (speakers and args.speaker.lower() not in speakers):
                raise CadenceError(f"Режим custom: нужен --speaker. Доступные дикторы: {', '.join(speakers) or 'список недоступен'}")
            wavs, sr = tts.generate_custom_voice(text=chunk, language=args.language, speaker=args.speaker, instruct=args.instruct or "")
        elif args.mode == "design":
            wavs, sr = tts.generate_voice_design(text=chunk, language=args.language, instruct=args.instruct)
        else:
            wavs, sr = tts.generate_voice_clone(text=chunk, language=args.language, ref_audio=str(ref),
                                                ref_text=args.ref_text, x_vector_only_mode=not args.ref_text)
        pieces.append(np.asarray(wavs[0], dtype=np.float32))
        if i < len(chunks):
            pieces.append(np.zeros(int(sr * args.pause), dtype=np.float32))
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), np.concatenate(pieces), sr)
    print(f"Готово: {out} ({sum(len(p) for p in pieces) / sr:.1f} с)")
    return 0


if __name__ == "__main__":
    main_guard(main)
