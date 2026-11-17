#!/usr/bin/env python3
"""Реестр модулей: проверка паспортов и пересборка всего, что из них следует.

  python3 scripts/build_registry.py          # проверить и пересобрать
  python3 scripts/build_registry.py --check  # только проверить: код 1, если что-то не пересобрано

Источник правды — `modules/<id>/module.json`. Из него собираются:
- `modules/REGISTRY.json`;
- блок модулей в `MODULE-MAP.md`;
- таблица «просьба → навык → модуль» в `knowledge/system/ROUTING.md`;
- раздел «Модули» в `skills/<семейство>/SKILL.md`.
Генерированные блоки лежат между метками `<!-- modules:start -->` и `<!-- modules:end -->`.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = ROOT / "modules"
SKILLS = ROOT / "skills"
REGISTRY = MODULES / "REGISTRY.json"
CAPS = MODULES / "CAPABILITIES.json"
MODULE_MAP = ROOT / "MODULE-MAP.md"
ROUTING = ROOT / "knowledge/system/ROUTING.md"

START, END = "<!-- modules:start -->", "<!-- modules:end -->"
ENGINES = {"python", "node", "hyperframes", "ffmpeg", "nim", "docs"}  # Remotion не используется: рендер — общий движок HyperFrames
NETWORK = {"none", "install", "runtime"}
STATUS = {"ready", "beta", "docs"}
PLATFORMS = {"macos", "linux", "windows"}
REQUIRED = ("id", "family", "title", "what", "when", "capabilities", "inputs", "outputs",
            "run", "engine", "deps", "install_mb", "platform", "network", "keys", "status")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def load_modules() -> list[dict]:
    out = []
    for path in sorted(MODULES.glob("*/module.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        data["_dir"] = path.parent
        out.append(data)
    return out


PAYLOAD_KEYS = {"paths", "file", "sha256", "bytes", "expanded_bytes", "url"}
PAYLOAD_URL = re.compile(r"^https://github\.com/[\w.-]+/[\w.-]+/releases/download/[\w.-]+/[\w.-]+\.zip$")
KEEP_IN_RELEASE = {"module.json", "MODULE.md", "guides"}


def in_payload(rel: str, packed: list[str]) -> bool:
    first = rel.strip("/").split("/")[0]
    return first in packed


def payload_errors(m: dict, where: str, errs: list[str]) -> list[str]:
    """Тяжёлая часть модуля, которая ставится отдельно (scripts/module_pack.py). Возвращает её пути."""
    pl = m.get("payload")
    if pl is None:
        return []
    if not isinstance(pl, dict) or set(pl) != PAYLOAD_KEYS:
        errs.append(f"{where}: payload — ровно поля {sorted(PAYLOAD_KEYS)}")
        return []
    if not re.fullmatch(r"[0-9a-f]{64}", str(pl["sha256"])):
        errs.append(f"{where}: payload.sha256 — 64 шестнадцатеричных знака")
    if not PAYLOAD_URL.match(str(pl["url"])) or not str(pl["url"]).endswith("/" + str(pl["file"])):
        errs.append(f"{where}: payload.url — https://github.com/<владелец>/<репо>/releases/download/<тег>/{pl['file']}")
    paths = pl["paths"] if isinstance(pl["paths"], list) else []
    if not paths or any("/" in p or p in KEEP_IN_RELEASE or p.startswith(".") for p in paths):
        errs.append(f"{where}: payload.paths — непустой список папок верхнего уровня, без module.json, MODULE.md и guides")
    return paths


def validate(mods: list[dict], caps: dict) -> list[str]:
    errs: list[str] = []
    skills = {p.parent.name for p in SKILLS.glob("*/SKILL.md")}
    seen = set()
    for m in mods:
        where = f"modules/{m['_dir'].name}/module.json"
        missing = [k for k in REQUIRED if k not in m]
        if missing:
            errs.append(f"{where}: нет полей {', '.join(missing)}")
            continue
        if m["id"] != m["_dir"].name or not ID_RE.match(m["id"]):
            errs.append(f"{where}: id «{m['id']}» должен совпадать с папкой и быть [a-z0-9-]")
        if m["id"] in seen:
            errs.append(f"{where}: повтор id")
        seen.add(m["id"])
        if m["family"] not in skills:
            errs.append(f"{where}: family «{m['family']}» — нет такого навыка в skills/")
        if m["engine"] not in ENGINES:
            errs.append(f"{where}: engine «{m['engine']}» не из {sorted(ENGINES)}")
        if m["network"] not in NETWORK:
            errs.append(f"{where}: network «{m['network']}» не из {sorted(NETWORK)}")
        if m["status"] not in STATUS:
            errs.append(f"{where}: status «{m['status']}» не из {sorted(STATUS)}")
        if not set(m["platform"]) <= PLATFORMS or not m["platform"]:
            errs.append(f"{where}: platform — непустой список из {sorted(PLATFORMS)}")
        if not (2 <= len(m["when"]) <= 8):
            errs.append(f"{where}: when — от 2 до 8 просьб человека")
        if not (m["_dir"] / "MODULE.md").is_file():
            errs.append(f"{where}: нет MODULE.md")
        if list(m["_dir"].rglob("SKILL.md")):
            errs.append(f"{where}: внутри модуля есть SKILL.md — переименовать в MODULE.md или справку, иначе агент увидит его как навык")
        for c in m["capabilities"]:
            if c not in caps:
                errs.append(f"{where}: capability «{c}» нет в CAPABILITIES.json")
        packed = payload_errors(m, where, errs)
        dep_py = m["deps"].get("python")
        if dep_py and not (m["_dir"] / dep_py).is_file() and not in_payload(dep_py, packed):
            errs.append(f"{where}: deps.python «{dep_py}» не найден")
        dep_node = m["deps"].get("node")
        if dep_node and not (m["_dir"] / dep_node / "package.json").is_file() and not in_payload(dep_node, packed):
            errs.append(f"{where}: deps.node «{dep_node}» — нет package.json")
        if m["keys"] and m["network"] != "runtime":
            errs.append(f"{where}: есть keys, значит network должен быть runtime")
    ids = {m["id"] for m in mods}
    for key, cap in caps.items():
        for ref in [cap["primary"], *cap.get("fallback", [])]:
            kind, _, target = ref.partition(":")
            ok = {"module": target in ids, "script": (ROOT / target).is_file(),
                  "skill": target in skills}.get(kind, False)
            if not ok:
                errs.append(f"CAPABILITIES.json: {key} → «{ref}» не найден")
        if cap["skill"] not in skills:
            errs.append(f"CAPABILITIES.json: {key} → навык «{cap['skill']}» не найден")
    return errs


def public(m: dict) -> dict:
    return {k: v for k, v in m.items() if not k.startswith("_")}


def caps_of(mid: str, caps: dict) -> tuple[list[str], list[str]]:
    primary = [k for k, c in caps.items() if c["primary"] == f"module:{mid}"]
    fallback = [k for k, c in caps.items() if f"module:{mid}" in c.get("fallback", [])]
    return primary, fallback


def esc(s: str) -> str:
    return s.replace("|", "\\|")


def family_block(family: str, mods: list[dict]) -> str:
    rows = [m for m in mods if m["family"] == family]
    if not rows:
        return ""
    lines = ["## Модули", "",
             "Готовый код под отдельные задачи этого навыка. Выбрать строку по просьбе человека, открыть её "
             "`MODULE.md` и делать по нему; зависимости — `python3 scripts/module_setup.py status <id>`, установка только с согласия.",
             "", "| Модуль | Что получится | Когда брать | Инструкция |", "|---|---|---|---|"]
    for m in rows:
        when = "; ".join(f"«{w}»" for w in m["when"][:3])
        lines.append(f"| `{m['id']}` | {esc(m['what'])} | {esc(when)} | [MODULE.md](../../modules/{m['id']}/MODULE.md) |")
    return "\n".join(lines)


def routing_block(mods: list[dict], caps: dict) -> str:
    lines = ["## Просьба → навык → модуль", "",
             "Собирается из `modules/*/module.json` и `modules/CAPABILITIES.json` (`scripts/build_registry.py`). "
             "Одна функция — один основной исполнитель; запасной — только если основной недоступен.", "",
             "| Функция | Навык | Основной | Запасной |", "|---|---|---|---|"]
    for key, c in caps.items():
        fb = ", ".join(f"`{x}`" for x in c.get("fallback", [])) or "—"
        lines.append(f"| {esc(c['title'])} | `{c['skill']}` | `{c['primary']}` | {fb} |")
    if mods:
        lines += ["", "| Просьба человека | Навык | Модуль |", "|---|---|---|"]
        for m in mods:
            for w in m["when"]:
                lines.append(f"| «{esc(w)}» | `{m['family']}` | [`{m['id']}`](../../modules/{m['id']}/MODULE.md) |")
    return "\n".join(lines)


def map_block(mods: list[dict]) -> str:
    lines = ["## Модули из `modules/`", "",
             "| Модуль | Навык | Что получится | Движок | Сеть | Решение человека |", "|---|---|---|---|---|---|"]
    for m in mods:
        decide = "согласие на установку" if m["install_mb"] else "—"
        if m["keys"]:
            decide += "; ключ сервиса и оплата"
        lines.append(f"| `{m['id']}` | `{m['family']}` | {esc(m['what'])} | {m['engine']} | {m['network']} | {decide} |")
    return "\n".join(lines) if mods else "## Модули из `modules/`\n\nПока нет."


def put_block(text: str, block: str) -> str:
    body = f"{START}\n{block}\n{END}" if block else ""
    if START in text:
        pre, rest = text.split(START, 1)
        post = rest.split(END, 1)[1] if END in rest else ""
        new = pre.rstrip("\n") + ("\n\n" + body if body else "") + post
        return new if new.endswith("\n") else new + "\n"
    if not body:
        return text
    return text.rstrip("\n") + "\n\n" + body + "\n"


def build(check: bool) -> int:
    caps = json.loads(CAPS.read_text(encoding="utf-8"))
    mods = load_modules()
    errs = validate(mods, caps)
    if errs:
        print("\n".join(errs))
        return 1
    targets: dict[Path, str] = {}
    reg = {"modules": [public(m) | {"primary_for": caps_of(m["id"], caps)[0],
                                    "fallback_for": caps_of(m["id"], caps)[1]} for m in mods],
           "capabilities": caps}
    targets[REGISTRY] = json.dumps(reg, ensure_ascii=False, indent=2) + "\n"
    targets[MODULE_MAP] = put_block(MODULE_MAP.read_text(encoding="utf-8"), map_block(mods))
    targets[ROUTING] = put_block(ROUTING.read_text(encoding="utf-8"), routing_block(mods, caps))
    for skill in sorted(SKILLS.glob("*/SKILL.md")):
        targets[skill] = put_block(skill.read_text(encoding="utf-8"), family_block(skill.parent.name, mods))
    stale = [p for p, t in targets.items() if not p.exists() or p.read_text(encoding="utf-8") != t]
    if check:
        if stale:
            print("не пересобрано (запусти scripts/build_registry.py):\n" + "\n".join(str(p.relative_to(ROOT)) for p in stale))
            return 1
        print(f"реестр в порядке: модулей {len(mods)}, функций {len(caps)}")
        return 0
    for p in stale:
        p.write_text(targets[p], encoding="utf-8")
    print(f"пересобрано: {len(stale)} файлов; модулей {len(mods)}, функций {len(caps)}")
    return 0


if __name__ == "__main__":
    extra = [a for a in sys.argv[1:] if a != "--check"]
    if extra:  # неизвестный флаг (в том числе --help) — подсказка вместо пересборки
        print(__doc__)
        sys.exit(2)
    sys.exit(build("--check" in sys.argv[1:]))
