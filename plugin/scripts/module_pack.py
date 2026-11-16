#!/usr/bin/env python3
"""Пакеты тяжёлых модулей: что из модуля едет в выпуске, а что ставится отдельно с согласия человека.

  python3 scripts/module_pack.py plan                     # какие модули тяжелее порога и что уйдёт в пакет
  python3 scripts/module_pack.py build --tag modules-1.10 # zip в dist/modules/, payload в module.json, exclude в release.json

Модуль тяжелее порога (3 МБ) или с файлами, похожими для сборщика на секрет (длинные base64-строки), делится: паспорт, MODULE.md, guides/ и файлы лицензий остаются в выпуске,
остальное собирается в детерминированный zip (одинаковые файлы → одинаковый хеш). Пакет кладётся в
GitHub Releases репозитория выпуска; `module_setup.py install <id>` скачивает его, сверяет sha256,
распаковывает в общий кэш и ставит ссылки в папку модуля. Для разработки в исходниках ничего не нужно:
тяжёлые папки лежат на месте.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = ROOT / "modules"
DIST = ROOT / "dist" / "modules"
RELEASE = ROOT / "release.json"
THRESHOLD = 3 * 1024 * 1024
REPO = "veeskelad/cadence"
KEEP = re.compile(r"^(module\.json|MODULE\.md|guides|licenses|README.*|LICEN[CS]E.*|NOTICE.*|CREDITS.*|THIRD[_-]PARTY.*|COPYING.*|UPSTREAM.*)$", re.I)
SKIP = {".DS_Store", "__pycache__", "node_modules", ".venv"}


def files_under(p: Path):
    if p.is_symlink():
        return []
    if p.is_file():
        return [p]
    return sorted(f for f in p.rglob("*") if f.is_file() and not f.is_symlink() and not (set(f.parts) & SKIP))


def size(p: Path) -> int:
    return sum(f.stat().st_size for f in files_under(p))


# Длинные base64-подобные строки (словари токенизатора, имена методов ObjC) сборщик выпуска считает
# возможным секретом и останавливается. Модуль с такими файлами целиком уходит в пакет.
BLOB = re.compile(rb"[A-Za-z0-9+/]{120,}={0,2}")


def has_blob(mdir: Path) -> bool:
    for e in mdir.iterdir():
        if KEEP.match(e.name) or e.name in SKIP:
            continue
        if any(BLOB.search(f.read_bytes()) for f in files_under(e)):
            return True
    return False


def plan() -> list[dict]:
    out = []
    for mj in sorted(MODULES.glob("*/module.json")):
        mdir = mj.parent
        total = size(mdir)
        if total < THRESHOLD and not has_blob(mdir):
            continue
        paths = sorted(e.name for e in mdir.iterdir() if not KEEP.match(e.name) and e.name not in SKIP and not e.name.startswith("."))
        out.append({"id": mdir.name, "total": total, "paths": paths, "payload": sum(size(mdir / p) for p in paths)})
    return out


def build_zip(mdir: Path, paths: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for rel in paths:
            for f in files_under(mdir / rel):
                info = zipfile.ZipInfo(f.relative_to(mdir).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
                info.external_attr = (0o755 if f.stat().st_mode & 0o111 else 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, f.read_bytes())
    return buf.getvalue()


def build(tag: str) -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    excludes = []
    changed = []
    for item in plan():
        mdir = MODULES / item["id"]
        data = build_zip(mdir, item["paths"])
        sha = hashlib.sha256(data).hexdigest()
        name = f"{item['id']}-{sha[:12]}.zip"
        (DIST / name).write_bytes(data)
        mj = mdir / "module.json"
        m = json.loads(mj.read_text(encoding="utf-8"))
        if m.get("network") == "none":
            m["network"] = "install"  # пакет скачивается при установке
        prev = m.get("payload") or {}
        # Пакет не изменился — ссылка на прежний релиз остаётся, перезаливать его не нужно
        url = prev["url"] if prev.get("sha256") == sha and prev.get("url") else f"https://github.com/{REPO}/releases/download/{tag}/{name}"
        if url != prev.get("url"):
            changed.append(name)
        m["payload"] = {"paths": item["paths"], "file": name, "sha256": sha, "bytes": len(data), "expanded_bytes": item["payload"], "url": url}
        mj.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        excludes += [f"modules/{item['id']}/{p}" for p in item["paths"]]
        print(f"{item['id']}: {len(data) / 1e6:.1f} МБ → {name}")
    rel = json.loads(RELEASE.read_text(encoding="utf-8"))
    rel["exclude"] = [e for e in rel.get("exclude", []) if not e.startswith("modules/")] + sorted(excludes)
    RELEASE.write_text(json.dumps(rel, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"release.json: исключено из выпуска {len(excludes)} путей; пакеты — {DIST}")
    print("выложить в релиз " + tag + ": " + (" ".join(changed) if changed else "ничего, все пакеты прежние"))
    (DIST / "CHANGED.txt").write_text("\n".join(changed) + "\n")


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "plan"
    if cmd == "plan":
        rows = plan()
        for r in rows:
            print(f"{r['id']:<38} {r['total'] / 1e6:6.1f} МБ, в пакет {r['payload'] / 1e6:6.1f} МБ: {', '.join(r['paths'])}")
        light = sum(size(m.parent) for m in MODULES.glob("*/module.json")) - sum(r["payload"] for r in rows)
        print(f"в выпуске останется модулей на {light / 1e6:.1f} МБ")
        return 0
    if cmd == "build":
        if "--tag" not in sys.argv:
            print("нужен --tag, например modules-1.10")
            return 2
        build(sys.argv[sys.argv.index("--tag") + 1])
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
