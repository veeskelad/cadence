#!/usr/bin/env python3
"""Зависимости модуля: проверить без сети или поставить с согласия человека.

  python3 scripts/module_setup.py status <id>    # без сети: что есть, чего не хватает
  python3 scripts/module_setup.py install <id>   # сеть, только после согласия: pip и npm в общий кэш
  python3 scripts/module_setup.py python <id>    # путь к python модуля (для запуска его скриптов)

Тяжёлая часть модуля (`payload` в паспорте) ставится первой: пакет из GitHub Releases, сверка размера
и sha256, распаковка в `~/.cache/cadence/modules/<id>-payload-<хеш>/` и ссылки в папку модуля.
Python-зависимости ставятся в `~/.cache/cadence/modules/<id>-<хеш requirements>/venv`, Node — в
`.../node_modules`, а `modules/<id>/<папка>/node_modules` становится ссылкой туда. Одинаковые зависимости
у разных версий Cadence ставятся один раз. Вывод — JSON одной строкой.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import io
import urllib.error
import urllib.parse
import urllib.request
import venv
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = ROOT / "modules"
QUIET_ENV = {"HYPERFRAMES_NO_UPDATE_CHECK": "1", "HYPERFRAMES_NO_TELEMETRY": "1", "DO_NOT_TRACK": "1",
             "PIP_DISABLE_PIP_VERSION_CHECK": "1"}


def fail(reason: str) -> None:
    raise SystemExit(json.dumps({"module": "error", "reason": reason}, ensure_ascii=False))


def passport(mid: str) -> tuple[dict, Path]:
    path = MODULES / mid / "module.json"
    if not path.is_file():
        fail(f"нет модуля «{mid}»: список — modules/REGISTRY.json")
    return json.loads(path.read_text(encoding="utf-8")), path.parent


def cache_root() -> Path:
    return Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "cadence" / "modules"


def digest(*files: Path) -> str:
    h = hashlib.sha256()
    for f in files:
        if f.is_file():
            h.update(f.read_bytes())
    return h.hexdigest()[:12]


PAYLOAD_HOSTS = {"github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"}


def allowed(url: str) -> bool:
    u = urllib.parse.urlsplit(url)
    return u.scheme == "https" and (u.hostname or "") in PAYLOAD_HOSTS


class _GithubOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl):
            raise urllib.error.URLError(f"переадресация на чужой адрес отклонена: {urllib.parse.urlsplit(newurl).hostname}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def payload_cache(m: dict) -> Path | None:
    pl = m.get("payload")
    return cache_root() / f"{m['id']}-payload-{pl['sha256'][:12]}" if pl else None


def payload_state(m: dict, mdir: Path) -> str | None:
    """None — пакета нет; ready — все пути на месте; cached — скачан, но не подключён; missing — не скачан."""
    pl = m.get("payload")
    if not pl:
        return None
    if all((mdir / p).exists() for p in pl["paths"]):
        return "ready"
    return "cached" if (payload_cache(m) / ".ok").exists() else "missing"


def unpack(data: bytes, dest: Path) -> None:
    base = dest.resolve()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            target = (dest / info.filename).resolve()
            if base not in target.parents:
                fail(f"в пакете путь вне папки: {info.filename}")
        z.extractall(dest)
        for info in z.infolist():
            mode = (info.external_attr >> 16) & 0o777
            if mode and not info.is_dir():
                os.chmod(dest / info.filename, mode)


def payload_install(m: dict, mdir: Path) -> None:
    pl = m["payload"]
    if payload_state(m, mdir) == "ready":
        return
    pc = payload_cache(m)
    if not (pc / ".ok").exists():
        if not allowed(pl["url"]):
            fail(f"адрес пакета не из разрешённых: {pl['url']}")
        with urllib.request.build_opener(_GithubOnly).open(pl["url"], timeout=300) as r:
            data = r.read(pl["bytes"] + 1)
        if len(data) != pl["bytes"] or hashlib.sha256(data).hexdigest() != pl["sha256"]:
            fail(f"пакет {pl['file']} не совпал по размеру или sha256 — не ставлю")
        tmp = pc.with_name(pc.name + ".partial")
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        unpack(data, tmp)
        shutil.rmtree(pc, ignore_errors=True)
        tmp.rename(pc)
        (pc / ".ok").write_text("ok")
    for rel in pl["paths"]:
        link = mdir / rel
        if link.is_symlink():
            link.unlink()
        if link.exists():
            continue  # в исходниках папка настоящая — оставить
        link.symlink_to(pc / rel, target_is_directory=(pc / rel).is_dir())


def py_cache(m: dict, mdir: Path) -> Path | None:
    req = m["deps"].get("python")
    if not req:
        return None
    key = digest(mdir / req) if (mdir / req).is_file() else (m.get("payload") or {}).get("sha256", "none")[:12]
    return cache_root() / f"{m['id']}-py-{key}"


def node_dir(m: dict, mdir: Path) -> Path | None:
    sub = m["deps"].get("node")
    return (mdir / sub).resolve() if sub else None


def node_cache(m: dict, mdir: Path) -> Path | None:
    nd = node_dir(m, mdir)
    if not nd or not (nd / "package.json").is_file():
        return None
    return cache_root() / f"{m['id']}-node-{digest(nd / 'package.json', nd / 'package-lock.json')}"


def venv_python(cache: Path) -> Path:
    return cache / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def status(mid: str) -> dict:
    m, mdir = passport(mid)
    missing_sys = [p for p in m["deps"].get("system", []) if not shutil.which(p)]
    out: dict = {"module": mid, "engine": m["engine"], "install_mb": m["install_mb"],
                 "network": m["network"], "keys": m["keys"], "system_missing": missing_sys}
    ps = payload_state(m, mdir)
    if ps:
        out["payload"] = ps
        out["payload_mb"] = round(m["payload"]["bytes"] / 1e6, 1)
    pc = py_cache(m, mdir)
    if pc:
        out["python"] = "ready" if (pc / ".ok").exists() else "missing"
    nc = node_cache(m, mdir)
    if nc:
        nm = node_dir(m, mdir) / "node_modules"
        out["node"] = "ready" if nm.exists() and (nc / ".ok").exists() else ("cached" if (nc / ".ok").exists() else "missing")
    if m["engine"] == "hyperframes":
        eng = subprocess.run([sys.executable, str(ROOT / "scripts/engine_setup.py"), "status"], capture_output=True, text=True)
        try:
            out["engine_status"] = json.loads(eng.stdout)["engine"]
        except (ValueError, KeyError):
            out["engine_status"] = "unknown"
    parts = [out.get("payload"), out.get("python"), out.get("node")]
    out["state"] = "ready" if not missing_sys and all(p in (None, "ready") for p in parts) else "needs-install"
    if out["state"] != "ready" and not missing_sys and all(p in (None, "ready", "cached") for p in parts):
        out["note"] = "уже скачано раньше (например, до обновления Cadence): install подключит без сети"
    elif out["state"] != "ready":
        mb = round(m["install_mb"] + (out.get("payload_mb", 0) if out.get("payload") == "missing" else 0))
        out["note"] = (f"нужна установка: около {mb} МБ, сеть — только с согласия человека"
                       + (f"; поставить программы: {', '.join(missing_sys)}" if missing_sys else ""))
    return out


def install(mid: str) -> dict:
    m, mdir = passport(mid)
    env = {**os.environ, **QUIET_ENV}
    if m.get("payload"):
        payload_install(m, mdir)
    pc = py_cache(m, mdir)
    if pc and not (pc / ".ok").exists():
        shutil.rmtree(pc, ignore_errors=True)
        venv.create(pc / "venv", with_pip=True)
        subprocess.run([str(venv_python(pc)), "-m", "pip", "install", "-q", "-r", str(mdir / m["deps"]["python"])],
                       check=True, env=env)
        (pc / ".ok").write_text("ok")
    nc = node_cache(m, mdir)
    if nc:
        nd = node_dir(m, mdir)
        if not (nc / ".ok").exists():
            tmp = nc.with_name(nc.name + ".partial")
            shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir(parents=True)
            for name in ("package.json", "package-lock.json"):
                if (nd / name).is_file():
                    shutil.copy(nd / name, tmp / name)
            cmd = ["npm", "ci" if (tmp / "package-lock.json").is_file() else "install", "--no-audit", "--no-fund",
                   "--prefix", str(tmp)]
            subprocess.run(cmd, check=True, env=env)
            shutil.rmtree(nc, ignore_errors=True)
            tmp.rename(nc)
            (nc / ".ok").write_text("ok")
        link = nd / "node_modules"
        if link.is_symlink():
            link.unlink()
        if link.exists():
            fail(f"{link.relative_to(ROOT)} — обычная папка: удалить вручную и повторить")
        link.symlink_to(nc / "node_modules", target_is_directory=True)
    return status(mid)


def python_path(mid: str) -> dict:
    m, mdir = passport(mid)
    pc = py_cache(m, mdir)
    if not pc:
        return {"module": mid, "python": sys.executable}
    if not (pc / ".ok").exists():
        fail(f"зависимости «{mid}» не поставлены: python3 scripts/module_setup.py install {mid} (с согласия)")
    return {"module": mid, "python": str(venv_python(pc))}


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in ("status", "install", "python"):
        print(__doc__)
        return 2
    cmd, mid = sys.argv[1], sys.argv[2]
    out = {"status": status, "install": install, "python": python_path}[cmd](mid)
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
