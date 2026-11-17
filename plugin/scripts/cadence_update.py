#!/usr/bin/env python3
"""Проверка и установка новой версии Cadence изнутри установленного выпуска.

  python3 scripts/cadence_update.py status            # без сети: версия, где установка, включена ли проверка
  python3 scripts/cadence_update.py enable            # человек согласился проверять обновления раз в день
  python3 scripts/cadence_update.py disable
  python3 scripts/cadence_update.py check [--force]   # один запрос к указателю; без согласия и чаще раза в день — нет
  python3 scripts/cadence_update.py check --once      # одна проверка по прямой просьбе, без включения ежедневной
  python3 scripts/cadence_update.py apply             # поставить новую версию рядом; только после «да» человека

Сеть — только указатель Cadence и точный ZIP версии, который он называет; без редиректов,
со сверкой размера и SHA-256 каждого файла. Новый выпуск встаёт рядом в `releases/`, старый
не удаляется, `work/` не трогается. Понижение версии и непроверенный путь обновления — отказ.
Вывод — JSON одной строкой.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import RELEASE_ROOT, in_plugin, work_root  # noqa: E402
from cadence_release import CheckError, install, pointer, read_resource, receipt, require, unpack  # noqa: E402

POINTER_URL = "https://veeskelad.github.io/cadence/current/manifest.json"
ARCHIVE_LIMIT = 64 * 1024 * 1024
CHECK_EVERY = timedelta(hours=24)


def settings_path() -> Path:
    return work_root() / "cadence-update.json"


def load_settings() -> dict:
    p = settings_path()
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}
    except (OSError, ValueError):
        return {}


def save_settings(data: dict) -> None:
    p = settings_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".pending")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, p)


def vtuple(v: str) -> tuple:
    return tuple(int(x) for x in v.split("."))


def installed() -> dict:
    """Что стоит сейчас: выпуск из установки или исходники разработчика."""
    m = RELEASE_ROOT / "manifest.json"
    if in_plugin():
        data = json.loads((RELEASE_ROOT / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
        info = {"kind": "plugin", "release_id": f"cadence-{data.get('version')}", "version": data.get("version")}
    elif m.is_file():
        data = json.loads(m.read_text(encoding="utf-8"))
        info = {"kind": "release", "release_id": data.get("release_id"), "version": data.get("product_version")}
    else:
        cfg = json.loads((RELEASE_ROOT / "release.json").read_text(encoding="utf-8"))
        info = {"kind": "source", "release_id": cfg.get("release_id"), "version": cfg.get("version")}
    root = RELEASE_ROOT.parent.parent if RELEASE_ROOT.parent.name == "releases" else None
    info["install_root"] = root if root and (root / ".cadence-install.json").is_file() else None
    return info


def compare(local: dict, p: dict) -> dict:
    out = {"installed": local["version"], "latest": p["version"]}
    if local["kind"] == "source":
        out["state"] = "source"          # исходники обновляются через git, не этим скриптом
    elif local["kind"] == "plugin":
        out["state"] = "plugin-update" if vtuple(p["version"]) > vtuple(local["version"]) else "current"
        out["update"] = "claude plugin marketplace update cadence && claude plugin update cadence@cadence"
    elif vtuple(p["version"]) <= vtuple(local["version"]):
        out["state"] = "current"
    elif local["release_id"] in p["tested_update_from"]:
        out["state"] = "available"
    else:
        out["state"] = "untested"        # путь обновления не проверен: только новая установка в пустую папку
    return out


def emit(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False))


def cmd_status(_a) -> dict:
    s, local = load_settings(), installed()
    return {"installed": local["version"], "kind": local["kind"], "release_id": local["release_id"],
            "install_root_found": local["install_root"] is not None,
            "update_check": s.get("update_check"), "last_check": s.get("last_check"), "latest_seen": s.get("latest_seen")}


def cmd_toggle(on: bool) -> dict:
    s = load_settings()
    s.update(update_check=on, decided=datetime.now(timezone.utc).date().isoformat())
    save_settings(s)
    return {"update_check": on}


def cmd_check(a) -> dict:
    s = load_settings()
    if not (s.get("update_check") or a.once):
        return {"state": "off", "note": "проверка выключена: спросить человека, затем enable или check --once"}
    last = s.get("last_check")
    if last and not (a.force or a.once):
        if datetime.now(timezone.utc) - datetime.fromisoformat(last) < CHECK_EVERY:
            return {"state": "skipped", "latest_seen": s.get("latest_seen"), "last_check": last}
    p = pointer(POINTER_URL, {POINTER_URL})
    result = compare(installed(), p)
    s.update(last_check=datetime.now(timezone.utc).isoformat(timespec="seconds"), latest_seen=p["version"])
    save_settings(s)
    return result


def cmd_apply(_a) -> dict:
    local = installed()
    require(local["kind"] != "plugin", "Cadence стоит плагином: обновляет Claude Code — claude plugin update cadence@cadence")
    require(local["kind"] == "release", "это исходники, а не установленный выпуск: обновляются через git")
    root = local["install_root"]
    require(root is not None, "не найдена папка установки с .cadence-install.json над releases/")
    r = receipt(root)
    require(r["release_id"] == local["release_id"], "этот выпуск не активный: открыть активный и обновлять из него")
    p = pointer(POINTER_URL, {POINTER_URL})
    state = compare(local, p)["state"]
    require(state == "available", {"current": "уже актуально", "untested": "путь обновления с этой версии не проверен"}.get(state, state))
    stage = Path(tempfile.mkdtemp(prefix="cadence-update-"))
    try:
        data = read_resource(p["archive_url"], {p["archive_url"]}, ARCHIVE_LIMIT)
        candidate = unpack(data, p, stage)
        mode = install(root, p, candidate)
    finally:
        shutil.rmtree(stage, ignore_errors=True)          # только своя временная папка
    s = load_settings()
    s.update(latest_seen=p["version"], updated_to=p["release_id"])
    save_settings(s)
    return {"state": mode, "from": local["release_id"], "to": p["release_id"],
            "open": f"releases/{p['release_id']}", "old_kept": f"releases/{local['release_id']}"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("enable")
    sub.add_parser("disable")
    c = sub.add_parser("check")
    c.add_argument("--force", action="store_true", help="не ждать суток с прошлой проверки")
    c.add_argument("--once", action="store_true", help="одна проверка по прямой просьбе человека")
    sub.add_parser("apply")
    a = ap.parse_args()
    try:
        out = {"status": cmd_status, "enable": lambda _: cmd_toggle(True), "disable": lambda _: cmd_toggle(False),
               "check": cmd_check, "apply": cmd_apply}[a.cmd](a)
    except CheckError as e:
        emit({"state": "error", "reason": str(e)})
        return 1
    except OSError as e:
        emit({"state": "error", "reason": type(e).__name__, "note": "нет сети или нет прав на запись в папку установки"})
        return 1
    except (ValueError, KeyError, TypeError) as e:     # битый указатель или настройки: без путей и traceback
        emit({"state": "error", "reason": type(e).__name__, "note": "указатель или work/cadence-update.json не читается"})
        return 1
    emit({k: (str(v) if isinstance(v, Path) else v) for k, v in out.items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
