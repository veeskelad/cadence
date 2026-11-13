#!/usr/bin/env python3
"""Движок рендера (HyperFrames) один раз на компьютер, а не заново в каждой версии Cadence.

  python3 scripts/engine_setup.py status     # без сети: готов ли движок
  python3 scripts/engine_setup.py install    # сеть, только после согласия человека: npm ci ~300 МБ

Зависимости ставятся в общий кэш `~/.cache/cadence/engine-<хеш package-lock>/`, а `engine/node_modules`
становится ссылкой на него. Новая версия Cadence с теми же зависимостями подключается без скачивания;
плагин Claude Code, у которого папка заменяется при обновлении, тоже. Вывод — JSON одной строкой.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent / "engine"
LOCK = ENGINE / "package-lock.json"


def cache_dir() -> Path:
    base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    return base / "cadence" / ("engine-" + hashlib.sha256(LOCK.read_bytes()).hexdigest()[:12])


def ready(modules: Path) -> bool:
    return (modules / ".bin/hyperframes").exists()


def link(target: Path) -> None:
    nm = ENGINE / "node_modules"
    if nm.is_symlink():
        nm.unlink()
    nm.symlink_to(target, target_is_directory=True)


def status() -> dict:
    nm, cache = ENGINE / "node_modules", cache_dir()
    if ready(nm):
        return {"engine": "ready", "shared": nm.is_symlink()}
    if ready(cache / "node_modules"):
        return {"engine": "cached", "note": "движок уже скачан для этой версии зависимостей: install подключит без сети"}
    return {"engine": "missing", "note": "нужна установка: сеть, около 300 МБ, с согласия человека"}


def install() -> dict:
    nm, cache = ENGINE / "node_modules", cache_dir()
    if ready(nm):
        return {"engine": "ready", "downloaded": False}
    if nm.exists() and not nm.is_symlink():
        raise SystemExit(json.dumps({"engine": "error", "reason": "engine/node_modules — неполная папка: удалить её вручную и повторить"}, ensure_ascii=False))
    downloaded = False
    if not ready(cache / "node_modules"):
        tmp = cache.with_name(cache.name + ".partial")
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        for name in ("package.json", "package-lock.json"):
            shutil.copy(ENGINE / name, tmp / name)
        env = {**os.environ, "HYPERFRAMES_NO_UPDATE_CHECK": "1", "HYPERFRAMES_NO_TELEMETRY": "1", "DO_NOT_TRACK": "1"}
        subprocess.run(["npm", "ci", "--no-audit", "--no-fund", "--prefix", str(tmp)], check=True, env=env)
        shutil.rmtree(cache, ignore_errors=True)
        tmp.rename(cache)
        downloaded = True
    link(cache / "node_modules")
    return {"engine": "ready" if ready(nm) else "error", "downloaded": downloaded}


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd not in ("status", "install"):
        print(__doc__)
        return 2
    out = status() if cmd == "status" else install()
    print(json.dumps(out, ensure_ascii=False))
    return 0 if out["engine"] in ("ready", "cached", "missing") else 1


if __name__ == "__main__":
    sys.exit(main())
