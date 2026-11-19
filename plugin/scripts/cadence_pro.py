#!/usr/bin/env python3
"""Клиент Cadence Pro: ключ подписки и рецепты с сервера по одному на шаг.

  python3 scripts/cadence_pro.py status [--online]          ключ, компьютер, адрес сервера; --online — подписка (сеть)
  python3 scripts/cadence_pro.py setup --from <файл>         установить скачанный ключ и привязать к компьютеру (сеть)
  python3 scripts/cadence_pro.py setup --downloads           то же, ключ ищется только в папке «Загрузки»
  python3 scripts/cadence_pro.py catalog                     список рецептов Resolve (сеть)
  python3 scripts/cadence_pro.py recipe <id>                 один рецепт (сеть)
  python3 scripts/cadence_pro.py run <id> [-- аргументы]     скрипт из рецепта: сверить sha256, положить в work/.cadence-pro, запустить
  python3 scripts/cadence_pro.py headers                     заголовки для MCP-клиента (headersHelper), без сети
  python3 scripts/cadence_pro.py mcp-config                  команда подключения сервера к Claude Code

Ключ — файл ~/.config/cadence/studio-license.json (или CADENCE_STUDIO_LICENSE), общий с Cadence Studio.
Адрес сервера — поле access_url ключа (или CADENCE_PRO_URL). Ключ не печатается и в журнал не пишется.
Отпечаток компьютера считается так же, как в Cadence Studio: одно место на компьютер, а не два.
"""

from __future__ import annotations

import base64
import getpass
import hashlib
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

KEY_FILE = re.compile(r'^studio-license(?:[ _-]?\(?\d{1,3}\)?)?\.json$', re.I)
TIMEOUT = 15


def license_path() -> Path:
    return Path(os.environ.get('CADENCE_STUDIO_LICENSE') or Path.home() / '.config/cadence/studio-license.json')


def node_platform() -> str:
    """Имя системы, как его даёт Node (os.platform()): darwin, win32, linux."""
    return {'darwin': 'darwin', 'win32': 'win32', 'cygwin': 'win32'}.get(sys.platform, 'linux' if sys.platform.startswith('linux') else sys.platform)


def raw_device() -> str:
    try:
        if sys.platform == 'darwin':
            out = subprocess.run(['ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'], capture_output=True, text=True, timeout=10).stdout
            m = re.search(r'"IOPlatformUUID" = "([^"]+)"', out)
            return m.group(1) if m else ''
        if sys.platform in ('win32', 'cygwin'):
            out = subprocess.run(['reg', 'query', r'HKLM\SOFTWARE\Microsoft\Cryptography', '/v', 'MachineGuid'], capture_output=True, text=True, timeout=10).stdout
            m = re.search(r'MachineGuid\s+REG_SZ\s+(\S+)', out)
            return m.group(1) if m else ''
        for f in ('/etc/machine-id', '/var/lib/dbus/machine-id'):
            p = Path(f)
            if p.exists() and p.read_text().strip():
                return p.read_text().strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return ''


def device_id(raw: str | None = None) -> str:
    """Отпечаток компьютера: тот же, что deviceId() в Cadence Studio (server/license.mjs)."""
    if os.environ.get('CADENCE_STUDIO_DEVICE'):
        return os.environ['CADENCE_STUDIO_DEVICE']
    raw = raw_device() if raw is None else raw
    if not raw:
        raw = f'{socket.gethostname()}:{getpass.getuser()}:{node_platform()}'
    return 'd_' + hashlib.sha256(f'cadence-studio:{raw}'.encode()).hexdigest()[:32]


def read_license(path: Path | None = None) -> dict | None:
    p = path or license_path()
    try:
        lic = json.loads(p.read_text())
    except (OSError, ValueError):
        return None
    return lic if isinstance(lic, dict) and isinstance(lic.get('payload'), dict) and isinstance(lic.get('signature'), str) else None


def write_license(lic: dict, path: Path | None = None) -> Path:
    """Атомарная запись с правами 600."""
    p = path or license_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix='.studio-license-')
    with os.fdopen(fd, 'w') as f:
        json.dump(lic, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.chmod(tmp, 0o600)
    os.replace(tmp, p)
    return p


def server_url(lic: dict | None) -> str:
    url = os.environ.get('CADENCE_PRO_URL') or ((lic or {}).get('payload') or {}).get('access_url') or ''
    url = str(url).rstrip('/')
    return url if url.startswith('https://') or (url.startswith('http://127.0.0.1') and os.environ.get('CADENCE_PRO_URL')) else ''


def headers(lic: dict, device: str) -> dict:
    token = base64.urlsafe_b64encode(json.dumps(lic, ensure_ascii=False, separators=(',', ':')).encode()).decode().rstrip('=')
    return {'Authorization': f'Bearer {token}', 'X-Cadence-Device': device}


def post(url: str, body: dict, extra: dict | None = None) -> tuple[int, dict | list | None]:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                 headers={'content-type': 'application/json', 'accept': 'application/json, text/event-stream', **(extra or {})})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, None


def call_tool(lic: dict, name: str, args: dict | None = None) -> tuple[bool, str]:
    """Вызов инструмента MCP Cadence Pro. Ответ: (успех, текст)."""
    url = server_url(lic)
    if not url:
        return False, 'В ключе нет адреса сервера Cadence Pro. Нужен свежий ключ.'
    code, body = post(url + '/pro/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': name, 'arguments': args or {}}}, headers(lic, device_id()))
    if code == 401:
        return False, 'Сервер не принял ключ: он не от Cadence Pro или повреждён. Нужен свежий ключ.'
    if code != 200 or not isinstance(body, dict):
        return False, f'Сервер Cadence Pro не ответил как надо (HTTP {code}). Попробовать позже.'
    if 'error' in body:
        return False, str(body['error'].get('message', 'ошибка'))
    res = body.get('result') or {}
    text = '\n'.join(c.get('text', '') for c in res.get('content', []) if c.get('type') == 'text')
    return not res.get('isError'), text


SCRIPT_BLOCK = re.compile(r'^```python cadence-script=([A-Za-z0-9_]+\.py) sha256=([0-9a-f]{64})\n(.*?)^```$', re.S | re.M)
MARKS = re.compile('\u2060[\u200b\u200c]{48}\u2060')


def script_of(text: str) -> tuple[str, str] | None:
    """Скрипт из текста рецепта: (имя, код). None — блока нет или sha256 не сходится."""
    m = SCRIPT_BLOCK.search(MARKS.sub('', text))
    if not m:
        return None
    name, sha, code = m.group(1), m.group(2), m.group(3)
    return (name, code) if hashlib.sha256(code.encode('utf-8')).hexdigest() == sha else None


def cmd_run(rid: str, args: list[str]) -> int:
    lic = read_license()
    if not lic:
        print('ключа Cadence Pro нет: python3 scripts/cadence_pro.py status')
        return 1
    ok, text = call_tool(lic, 'resolve_recipe', {'id': rid})
    if not ok:
        print(text)
        return 1
    got = script_of(text)
    if not got:
        print(f'в рецепте {rid} нет скрипта или он повреждён (sha256 не сходится)')
        return 1
    name, code = got
    from cadence_paths import work_root  # рядом в scripts/
    where = work_root() / '.cadence-pro'
    where.mkdir(parents=True, exist_ok=True)
    target = where / name
    target.write_text(code, encoding='utf-8')
    env = {**os.environ, 'CADENCE_SCRIPTS': str(Path(__file__).resolve().parent)}
    return subprocess.run([sys.executable, str(target), *args], env=env).returncode


def find_downloads() -> Path | None:
    d = Path.home() / 'Downloads'
    if not d.is_dir():
        return None
    found = [p for p in d.iterdir() if p.is_file() and not p.is_symlink() and KEY_FILE.match(p.name)]
    return max(found, key=lambda p: p.stat().st_mtime) if found else None


def cmd_status(online: bool) -> int:
    lic = read_license()
    if not lic:
        print(f'ключа нет: {license_path()}')
        print('дальше: ключ Cadence Pro приходит файлом studio-license.json после подписки; без него — ручная передача в Resolve')
        return 1
    p = lic['payload']
    here = device_id()
    bound = p.get('device')
    print(f'ключ: {license_path()}')
    print(f'план: {p.get("plan")}, оплачено до {p.get("period_end") or "—"}')
    print('компьютер: ' + ('этот' if bound == here else 'ключ ещё не привязан — нужен setup' if not bound else 'ключ от другого компьютера — нужен setup'))
    print(f'сервер: {server_url(lic) or "нет адреса в ключе"}')
    if online:
        ok, text = call_tool(lic, 'pro_access')
        print(text)
        return 0 if ok else 1
    return 0 if bound == here and server_url(lic) else 1


def cmd_setup(src: Path | None) -> int:
    lic = read_license(src) if src else read_license()
    if not lic:
        print(f'не найден ключ{": " + str(src) if src else ""}')
        return 1
    url = server_url(lic)
    if not url:
        print('в ключе нет адреса сервера: нужен свежий ключ Cadence Pro')
        return 1
    here = device_id()
    if lic['payload'].get('device') != here:
        code, body = post(url + '/access/refresh', {'license': lic, 'device': here})
        st = (body or {}).get('status') if isinstance(body, dict) else None
        if code != 200 or st != 'active':
            reasons = {'device_limit': 'все места для компьютеров заняты', 'expired': 'подписка закончилась', 'revoked': 'доступ отозван', 'none': 'подписки нет'}
            print(f'ключ не привязан: {reasons.get(st, (body or {}).get("error") if isinstance(body, dict) else f"HTTP {code}")}')
            return 1
        lic = body['license']
    dest = write_license(lic)
    if src and src.resolve() != dest.resolve() and src.parent == Path.home() / 'Downloads':
        print(f'скачанный файл можно удалить: {src}')
    print(f'ключ установлен: {dest}, привязан к этому компьютеру')
    return 0


def cmd_mcp_config() -> int:
    """Команда подключения: копия этого скрипта рядом с ключом (путь плагина меняется с каждым обновлением)."""
    helper = license_path().parent / 'cadence_pro.py'
    lic = read_license()
    url = server_url(lic)
    if not url:
        print('сначала ключ: python3 scripts/cadence_pro.py setup --from <файл>')
        return 1
    cfg = {'type': 'http', 'url': url + '/pro/mcp', 'headersHelper': f'{shutil.which("python3") or "python3"} {helper} headers'}
    print('# копия клиента рядом с ключом (её зовёт Claude Code за заголовком):')
    print(f'mkdir -p {license_path().parent} && cp {Path(__file__).resolve()} {helper}')
    print('# подключение сервера для всех проектов:')
    print(f"claude mcp add-json cadence-pro '{json.dumps(cfg, ensure_ascii=False)}' -s user")
    return 0


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0 if argv else 2
    cmd, rest = argv[0], argv[1:]
    if cmd == 'status':
        return cmd_status('--online' in rest)
    if cmd == 'setup':
        if '--from' in rest and rest.index('--from') + 1 < len(rest):
            return cmd_setup(Path(rest[rest.index('--from') + 1]).expanduser())
        if '--downloads' in rest:
            found = find_downloads()
            if not found:
                print('в «Загрузках» нет studio-license.json')
                return 1
            return cmd_setup(found)
        return cmd_setup(None)
    if cmd == 'headers':
        lic = read_license()
        if not lic:
            print('{}')
            return 1
        print(json.dumps(headers(lic, device_id())))
        return 0
    if cmd in ('catalog', 'recipe'):
        lic = read_license()
        if not lic:
            print('ключа Cadence Pro нет: python3 scripts/cadence_pro.py status')
            return 1
        if cmd == 'recipe' and (not rest or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', rest[0])):
            print('нужен id рецепта из catalog')
            return 2
        ok, text = call_tool(lic, 'resolve_catalog' if cmd == 'catalog' else 'resolve_recipe', {} if cmd == 'catalog' else {'id': rest[0]})
        print(text)
        return 0 if ok else 1
    if cmd == 'run':
        if not rest or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,60}', rest[0]):
            print('нужен id рецепта со скриптом: read-state, transition-template')
            return 2
        tail = rest[1:]
        return cmd_run(rest[0], tail[1:] if tail[:1] == ['--'] else tail)
    if cmd == 'mcp-config':
        return cmd_mcp_config()
    print(f'нет команды {cmd}; --help')
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
