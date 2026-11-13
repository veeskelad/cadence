"""Общие вещи для скриптов Cadence: где лежат работы человека, запуск ffmpeg,
защита исходников от перезаписи.

Рабочая папка (work) ищется так:
1. переменная окружения CADENCE_WORK;
2. если скрипт лежит в выпуске `<установка>/releases/<id>/scripts/` — `<установка>/work`;
3. иначе (dev-репозиторий) — `./work` рядом со `scripts/`.

Исходники не меняются никогда: любой результат — новый файл, обычно в
`work/<проект>/out/`.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
RELEASE_ROOT = SCRIPTS_DIR.parent

# Расширения, которые считаем видео/звуком при поиске входов.
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts"}
AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aif", ".aiff"}


class CadenceError(Exception):
    """Понятная человеку ошибка: печатаем текст и выходим с кодом 2."""

    def __init__(self, message: str, code: int = 2):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------- пути

CONFIG_FILE = Path.home() / ".config/cadence/config.json"   # {"work": "<папка>"} — где человек держит свою work/


def in_plugin() -> bool:
    """Cadence стоит плагином Claude Code: папка выпуска — кэш, который заменяется при обновлении."""
    return "/plugins/cache/" in RELEASE_ROOT.as_posix()


def work_root() -> Path:
    """CADENCE_WORK → work/ рядом с releases/ → папка из ~/.config/cadence/config.json →
    ~/Cadence/work для плагина → work/ в исходниках."""
    env = os.environ.get("CADENCE_WORK", "").strip()
    if env:
        return Path(env).expanduser().resolve()
    if RELEASE_ROOT.parent.name == "releases":
        return (RELEASE_ROOT.parent.parent / "work").resolve()
    try:
        configured = json.loads(CONFIG_FILE.read_text(encoding="utf-8")).get("work", "")
    except (OSError, ValueError):
        configured = ""
    if configured:
        return Path(configured).expanduser().resolve()
    if in_plugin():
        return (Path.home() / "Cadence/work").resolve()
    return (RELEASE_ROOT / "work").resolve()


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\-]+", "-", name.strip(), flags=re.UNICODE).strip("-_").lower()
    return s or "project"


def project_of(path: Path) -> str | None:
    """Имя проекта, если файл лежит внутри work/<проект>/..."""
    root = work_root()
    try:
        rel = path.resolve().relative_to(root)
    except ValueError:
        return None
    return rel.parts[0] if len(rel.parts) > 1 else None


def out_dir_for(source: Path, project: str | None = None) -> Path:
    """Папка out/ для результата: проект из аргумента, из пути источника или по имени файла."""
    name = project or project_of(source) or slugify(source.stem)
    return work_root() / name / "out"


def default_output(source: Path, suffix: str, ext: str, project: str | None = None) -> Path:
    return out_dir_for(source, project) / f"{source.stem}-{suffix}{ext}"


def same_file(a: Path, b: Path) -> bool:
    try:
        if a.resolve() == b.resolve():
            return True
        return a.exists() and b.exists() and os.path.samefile(a, b)
    except OSError:
        return False


def check_output(out: Path, inputs: list[Path], overwrite: bool = False) -> Path:
    """Отказ, если выход совпадает с любым входом или уже существует без --overwrite."""
    out = out.expanduser()
    for src in inputs:
        if same_file(out, src):
            raise CadenceError(
                f"Отказ: выход {out} совпадает с исходником {src}. "
                "Исходник не перезаписываем — укажи другой --out."
            )
    if out.exists() and not overwrite:
        raise CadenceError(
            f"Отказ: файл {out} уже есть. Укажи другой --out "
            "или добавь --overwrite, если старый результат не нужен."
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def require_input(path: str | Path, what: str = "файл") -> Path:
    p = Path(path).expanduser()
    if not p.is_file():
        raise CadenceError(f"Не нашёл {what}: {p}")
    return p.resolve()


# ---------------------------------------------------------------- инструменты

def require_tool(name: str) -> str:
    found = shutil.which(name)
    if not found:
        hint = {
            "ffmpeg": "macOS: brew install ffmpeg; Windows: winget install Gyan.FFmpeg; Linux: sudo apt install ffmpeg",
            "ffprobe": "ffprobe ставится вместе с ffmpeg (brew install ffmpeg)",
        }.get(name, "")
        raise CadenceError(f"Нет программы {name}. {hint}".strip(), code=3)
    return found


def run(cmd: list[str], *, capture: bool = True, cwd: Path | None = None,
        check: bool = True) -> subprocess.CompletedProcess:
    """Запуск без shell: аргументы списком."""
    proc = subprocess.run(
        [str(c) for c in cmd],
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
        errors="replace",
    )
    if check and proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-12:]
        raise CadenceError(
            f"Команда {Path(str(cmd[0])).name} завершилась с ошибкой {proc.returncode}:\n" + "\n".join(tail)
        )
    return proc


def ffmpeg_cmd(*args: str | Path) -> list[str]:
    return [require_tool("ffmpeg"), "-hide_banner", "-nostdin", *[str(a) for a in args]]


def probe(path: Path) -> dict:
    proc = run([require_tool("ffprobe"), "-v", "error", "-print_format", "json",
                "-show_format", "-show_streams", str(path)])
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise CadenceError(f"ffprobe не смог прочитать {path}: {exc}")


def first_stream(info: dict, kind: str) -> dict | None:
    for s in info.get("streams", []):
        if s.get("codec_type") == kind and not s.get("disposition", {}).get("attached_pic"):
            return s
    return None


def duration_of(info: dict) -> float:
    for value in (info.get("format", {}).get("duration"),
                  *(s.get("duration") for s in info.get("streams", []))):
        try:
            if value is not None and float(value) > 0:
                return float(value)
        except (TypeError, ValueError):
            pass
    return 0.0


def parse_rate(rate: str | None) -> float:
    if not rate or rate in ("0/0", "0"):
        return 0.0
    if "/" in rate:
        num, den = rate.split("/", 1)
        try:
            return float(num) / float(den) if float(den) else 0.0
        except ValueError:
            return 0.0
    try:
        return float(rate)
    except ValueError:
        return 0.0


def video_fps(info: dict) -> float:
    v = first_stream(info, "video")
    if not v:
        return 0.0
    return parse_rate(v.get("avg_frame_rate")) or parse_rate(v.get("r_frame_rate"))


def measure_loudness(path: Path, extra_filter: str | None = None, stream: str = "0:a:0") -> dict:
    """Интегральная громкость (LUFS), диапазон (LU) и true peak (dBTP) через ebur128."""
    chain = "ebur128=peak=true:framelog=quiet"
    if extra_filter:
        chain = f"{extra_filter},{chain}"
    proc = run(ffmpeg_cmd("-nostats", "-i", path, "-map", stream, "-af", chain, "-f", "null", "-"))
    return parse_ebur128(proc.stderr or "")


def parse_ebur128(text: str) -> dict:
    summary = text[text.rfind("Summary:"):] if "Summary:" in text else text
    out: dict = {}
    for key, pattern in (("lufs", r"I:\s+(-?[\d.]+|-inf)\s+LUFS"),
                         ("lra", r"LRA:\s+(-?[\d.]+)\s+LU"),
                         ("true_peak", r"Peak:\s+(-?[\d.]+|-inf)\s+dBFS")):
        m = re.search(pattern, summary)
        if m:
            out[key] = float("-inf") if m.group(1) == "-inf" else float(m.group(1))
    return out


# ---------------------------------------------------------------- разное

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fmt_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(int(m), 60)
    return f"{h}:{m:02d}:{s:05.2f}" if h else f"{m}:{s:05.2f}"


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main_guard(fn) -> None:
    """Запуск main() с понятным выводом ошибок вместо трейсбэка."""
    try:
        code = fn()
    except CadenceError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(exc.code)
    except KeyboardInterrupt:
        print("Остановлено.", file=sys.stderr)
        sys.exit(130)
    sys.exit(code or 0)
