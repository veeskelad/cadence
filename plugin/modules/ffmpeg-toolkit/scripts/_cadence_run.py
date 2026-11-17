#!/usr/bin/env python3
"""Запуск любого инструмента модуля с результатом в $WORK/<проект>/out/, а не рядом с исходником.

    python3 modules/ffmpeg-toolkit/scripts/_cadence_run.py TOOL ВХОД [параметры инструмента] [--project NAME]

TOOL — имя скрипта без .py (cut, fit, silence, caption, ...). Если среди параметров нет -o/--output, а
инструмент пишет один файл, подставляется -o <work>/<проект>/out/<имя>_<инструмент>.<расширение>.
Инструменты с другой логикой выхода (export, render, batch, sync, grid, ...) и читающие (probe, check, look,
scenes, cropdetect, report, verify) запускаются как есть: для пишущих укажи -o сам. Сеть не нужна.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "scripts"))
from cadence_paths import CadenceError, default_output, main_guard  # noqa: E402

# инструмент -> расширение выхода (None: как у входа)
INJECT = {t: None for t in (
    "cut fit silence caption overlay graphics color audio loudness crop deinterlace denoise redact stabilize "
    "straighten sphere reverse loop freeze speedramp pad proxy broll metadata").split()}
INJECT.update({"join": ".mp4", "insert": ".mp4"})


def main() -> int:
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0 if argv else 2
    tool, rest = argv[0], argv[1:]
    if not re.fullmatch(r"[a-z]+", tool) or not (HERE / f"{tool}.py").is_file():
        raise CadenceError(f"Нет инструмента «{tool}»: список — python3 modules/ffmpeg-toolkit/scripts/_contract.py --json")
    project = None
    if "--project" in rest:
        i = rest.index("--project")
        project = rest[i + 1] if i + 1 < len(rest) else None
        rest = rest[:i] + rest[i + 2:]
    if tool in INJECT and not any(a in ("-o", "--output") or a.startswith("--output=") for a in rest):
        source = next((Path(a) for i, a in enumerate(rest)
                       if Path(a).is_file() and (i == 0 or not rest[i - 1].startswith("-"))), None)
        if source:
            out = default_output(source, tool, INJECT[tool] or source.suffix or ".mp4", project)
            out.parent.mkdir(parents=True, exist_ok=True)
            rest += ["-o", str(out)]
            print(f"результат: {out}", file=sys.stderr)
    return subprocess.run([sys.executable, str(HERE / f"{tool}.py"), *rest]).returncode


if __name__ == "__main__":
    main_guard(main)
