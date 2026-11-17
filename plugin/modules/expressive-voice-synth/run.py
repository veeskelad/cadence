#!/usr/bin/env python3
"""Озвучка текста нейросетью с тембром из образца и управлением манерой словами.

Всё считается на этой машине. Веса модели скрипт сам не скачивает: нет папки с весами — останавливается;
скачивание только с `--allow-download` и согласия человека. Расчёт рассчитан на NVIDIA (CUDA).

    python3 modules/expressive-voice-synth/run.py --mode zero-shot --text "Привет!" \
        --prompt-wav voice.wav --prompt-text "что сказано в образце" --model-dir <папка весов> --dry-run
    python3 modules/expressive-voice-synth/run.py --mode cross-lingual --text-file script.txt --prompt-wav voice.wav
    python3 modules/expressive-voice-synth/run.py --mode instruct --text "..." --prompt-wav voice.wav --instruct "Говори быстро"

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

MODULE_ID = "expressive-voice-synth"
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(HERE))
from cadence_paths import CadenceError, check_output, main_guard, require_input, slugify, work_root  # noqa: E402

DEFAULT_DIR = Path.home() / ".cache/cadence/models/Fun-CosyVoice3-0.5B"
DEFAULT_ID = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"  # имя из документации модели; сверить перед скачиванием
V3_PREFIX = "You are a helpful assistant."
CYRILLIC = re.compile(r"[а-яёА-ЯЁ]")


def ensure_deps() -> None:
    try:
        for name in ("torch", "torchaudio", "hyperpyyaml", "modelscope", "onnxruntime", "whisper"):
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
    raise CadenceError("пропуск: нет зависимостей модуля (torch, onnxruntime и др.). Установка — около 12 ГБ вместе с весами, сеть, "
                       f"только с согласия человека: python3 scripts/module_setup.py install {MODULE_ID}", code=3)


def split_text(text: str, limit: int = 160) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=[.!?…。！？])\s*|\n+", text) if p.strip()]
    chunks: list[str] = []
    for p in parts:
        if chunks and len(chunks[-1]) + 1 + len(p) <= limit:
            chunks[-1] += " " + p
        else:
            chunks.append(p)
    return chunks


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", required=True, choices=["zero-shot", "cross-lingual", "instruct"],
                    help="zero-shot — тембр и слова образца; cross-lingual — тембр образца, текст на другом языке; "
                         "instruct — тембр образца и манера словами")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text")
    src.add_argument("--text-file", help="файл с текстом (utf-8)")
    ap.add_argument("--prompt-wav", required=True, help="образец голоса, локальный wav; только с согласия владельца голоса")
    ap.add_argument("--prompt-text", help="дословно, что сказано в образце (нужно для zero-shot)")
    ap.add_argument("--instruct", help="манера словами (режим instruct)")
    ap.add_argument("--model-dir", default=str(DEFAULT_DIR), help="папка с весами модели")
    ap.add_argument("--model-id", default=DEFAULT_ID, help="имя модели для скачивания (только с --allow-download)")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--pause", type=float, default=0.3, help="пауза между кусками, с")
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
    if args.mode == "zero-shot" and not args.prompt_text:
        raise CadenceError("Режим zero-shot: нужен --prompt-text, дословно что сказано в образце.")
    if args.mode == "instruct" and not args.instruct:
        raise CadenceError("Режим instruct: нужен --instruct.")
    prompt = require_input(args.prompt_wav, "образец голоса")
    model_dir = Path(args.model_dir).expanduser()
    have = model_dir.is_dir()
    out = Path(args.out).expanduser() if args.out else work_root() / slugify(args.project or "voiceover") / "out" / f"{args.name}.wav"
    chunks = split_text(text)
    cyr = bool(CYRILLIC.search(text))

    print(f"Режим: {args.mode}; веса: {model_dir} ({'есть' if have else 'нет'}); текст {len(text)} знаков, кусков {len(chunks)}")
    print(f"Образец голоса: {prompt}\nБудет записано: {out}")
    print("Клонирование голоса: только с согласия владельца голоса.")
    if cyr:
        print("Русский текст: встроенная обработка текста рассчитана на китайский и английский и отключена; "
              "числа и латиницу напиши словами, ударения не размечаются.")
    if args.dry_run:
        return 0
    if not have and not args.allow_download:
        raise CadenceError(f"Папки с весами {model_dir} нет. Скачивание (около 5–10 ГБ, оценка) — только с согласия человека: "
                           f"повтори с --allow-download (модель {args.model_id}).", code=3)
    check_output(out, [prompt], args.overwrite)
    ensure_deps()
    try:
        importlib.import_module("matcha")
    except ImportError:
        raise CadenceError("Нет пакета matcha: папка third_party/Matcha-TTS в модуле пуста. Поставить в среду модуля, с согласия "
                           "человека (сеть): <python модуля> -m pip install --no-deps matcha-tts. "
                           "<python модуля> показывает: python3 scripts/module_setup.py python expressive-voice-synth", code=3)

    import torch
    import soundfile as sf

    if not have:
        from modelscope import snapshot_download
        print(f"Скачиваю веса {args.model_id} в {model_dir}…")
        snapshot_download(args.model_id, local_dir=str(model_dir))
    from cosyvoice.cli.cosyvoice import AutoModel

    print(f"Устройство: {'cuda' if torch.cuda.is_available() else 'cpu (очень медленно)'}. Загружаю модель…")
    model = AutoModel(model_dir=str(model_dir))
    v3 = (model_dir / "cosyvoice3.yaml").exists()  # у этой версии в подсказке нужен служебный префикс
    pieces: list = []
    for i, chunk in enumerate(chunks, 1):
        print(f"[{i}/{len(chunks)}] {chunk[:70]}")
        kw = {"speed": args.speed, "text_frontend": not cyr}
        if args.mode == "zero-shot":
            ptext = f"{V3_PREFIX}<|endofprompt|>{args.prompt_text}" if v3 else args.prompt_text
            gen = model.inference_zero_shot(chunk, ptext, str(prompt), **kw)
        elif args.mode == "cross-lingual":
            gen = model.inference_cross_lingual(f"{V3_PREFIX}<|endofprompt|>{chunk}" if v3 else chunk, str(prompt), **kw)
        else:
            itext = f"{V3_PREFIX} {args.instruct}<|endofprompt|>" if v3 else f"{args.instruct}<|endofprompt|>"
            gen = model.inference_instruct2(chunk, itext, str(prompt), **kw)
        for part in gen:
            pieces.append(part["tts_speech"].cpu())
        if i < len(chunks):
            pieces.append(torch.zeros(1, int(model.sample_rate * args.pause)))
    out.parent.mkdir(parents=True, exist_ok=True)
    wav = torch.cat(pieces, dim=1).squeeze(0).cpu().numpy()
    sf.write(str(out), wav, model.sample_rate)
    print(f"Готово: {out} ({len(wav) / model.sample_rate:.1f} с)")
    return 0


if __name__ == "__main__":
    main_guard(main)
