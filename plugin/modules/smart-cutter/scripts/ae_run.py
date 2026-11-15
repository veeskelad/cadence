#!/usr/bin/env python3
"""Запуск собранного бинаря auto-editor с безопасным выходом: результат всегда в $WORK/<проект>/out/.

    python3 modules/smart-cutter/scripts/ae_run.py VIDEO [--project NAME] [--export FORMAT]
        [--out PATH] [--overwrite] [--dry-run] [любые параметры auto-editor, например --edit audio:threshold=0.04]

Бинаря нет — печатает, как его собрать, и запасной путь (scripts/silence_cut.py), код 3.
Исходник не меняется: выход, совпадающий со входом, — отказ. Сеть не нужна.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1]
ROOT = MODULE.parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from cadence_paths import CadenceError, check_output, default_output, main_guard, require_input  # noqa: E402

EXT = {"premiere": ".xml", "resolve-fcp7": ".xml", "resolve": ".fcpxml", "final-cut-pro": ".fcpxml",
       "shotcut": ".mlt", "kdenlive": ".kdenlive", "edl": ".edl", "v1": ".v1", "v2": ".v2", "v3": ".v3"}


def find_binary() -> str | None:
    for cand in (os.environ.get("CADENCE_AE_BIN", ""), str(MODULE / "auto-editor"), shutil.which("auto-editor") or ""):
        if cand and Path(cand).is_file() and os.access(cand, os.X_OK):
            return cand
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", help="путь к видео")
    ap.add_argument("--project", help="имя проекта в work/")
    ap.add_argument("--export", choices=sorted(EXT) + ["clip-sequence"], help="отдать таймлайн для монтажной программы")
    ap.add_argument("--out", help="путь результата (по умолчанию work/<проект>/out/<имя>-ae.<расширение>)")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="только показать, что будет вырезано (--preview)")
    args, rest = ap.parse_known_args()

    binary = find_binary()
    if not binary:
        raise CadenceError(
            "Нет бинаря auto-editor. Модуль на Nim, собирается только с согласия человека (см. modules/smart-cutter/MODULE.md, "
            "раздел «Сборка»); путь к готовому бинарю — переменная CADENCE_AE_BIN.\n"
            "Пока его нет, паузы вырезает python3 scripts/silence_cut.py.", code=3)
    source = require_input(args.video, "видео")
    cmd = [binary, str(source), *rest]
    if args.dry_run:
        cmd.append("--preview")
    else:
        ext = EXT.get(args.export or "", Path(source).suffix or ".mp4")
        out = Path(args.out).expanduser() if args.out else default_output(source, "ae", ext, args.project)
        out = check_output(out, [source], args.overwrite)
        if args.export:
            cmd += ["--export", args.export]
        cmd += ["-o", str(out)]
        print(f"результат: {out}")
    return subprocess.run(cmd).returncode


if __name__ == "__main__":
    main_guard(main)
