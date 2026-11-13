#!/usr/bin/env python3
"""DaVinci Resolve: свой шаблон Fusion-перехода с другими значениями по умолчанию.

Скрипты Resolve ставят переход (TimelineItem.AddTransition), но не меняют его настройки: угол,
силу размытия. Встроенные Fusion-переходы — текстовые макросы `.setting` в архиве Templates.drfx
внутри приложения. Копия макроса с другими значениями становится новым переходом, и AddTransition
ставит его по имени.

    python3 scripts/resolve_transition_template.py list
    python3 scripts/resolve_transition_template.py inputs --base "Stretch Blur"
    python3 scripts/resolve_transition_template.py make --base "Stretch Blur" \\
        --name "Cadence Stretch Blur 45" --set "Blur Scale=0.7" --set BlurAngle=45
    python3 scripts/resolve_transition_template.py make ... --install          # только план
    python3 scripts/resolve_transition_template.py make ... --install --yes    # с согласия человека

Безопасность:
- Resolve запускать не нужно, открытый проект не меняется никогда: скрипт только читает архив
  приложения и пишет новый файл.
- По умолчанию файл пишется в рабочую папку: `<work>/resolve-templates/` (или --out-dir).
- `--install` без `--yes` ничего не пишет: печатает, куда ляжет файл и как откатить.
  `--install --yes` — только после согласия человека: это запись в личные файлы Resolve.
- Существующий файл не перезаписывается; имя обязано начинаться с «Cadence » и не совпадать
  со встроенным переходом.

Ключ --set ищет вход, выведенный наружу, по имени (Name) или по источнику (Source). Меняется
и значение по умолчанию этого входа, и значение у инструмента за ним. Проверено на Resolve Studio
21.1 (macOS): новый шаблон подхватывается без перезапуска.
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import CadenceError, work_root  # noqa: E402

MAC_DRFX = Path("/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Resources/Fusion/Templates/Templates.drfx")
MAC_USER_TRANSITIONS = Path.home() / "Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Templates/Edit/Transitions"
PREFIX = "Edit/Transitions/"
NAME_PREFIX = "Cadence "

INSTANCE = re.compile(r'(\t+)(\w+) = InstanceInput \{\n(.*?)\n\1\},', re.S)
NUMBER = re.compile(r"-?\d+(\.\d+)?")


def _field(body: str, key: str) -> str | None:
    m = re.search(rf'\b{key} = "([^"]*)"', body)
    return m.group(1) if m else None


def exposed_inputs(text: str) -> list[dict]:
    """Входы перехода, выведенные наружу: имя в Inspector, инструмент и его вход, значение по умолчанию."""
    out = []
    for m in INSTANCE.finditer(text):
        body = m.group(3)
        default = re.search(r"\bDefault = ([^,\n]+),", body)
        out.append({"name": _field(body, "Name"), "source": _field(body, "Source"),
                    "tool": _field(body, "SourceOp"), "default": default.group(1) if default else None})
    return out


def set_default(text: str, key: str, value: str) -> tuple[str, bool]:
    """Меняет значение входа `key`. Возвращает новый текст и флаг: нашлось ли значение у инструмента за входом."""
    for m in INSTANCE.finditer(text):
        indent, _, body = m.groups()
        if key not in (_field(body, "Name"), _field(body, "Source")):
            continue
        op, source = _field(body, "SourceOp"), _field(body, "Source")
        if not op or not source:
            raise CadenceError(f"у входа {key!r} нет SourceOp или Source — такой вход не поменять")
        if re.search(r"\bDefault = [^,\n]+,", body):
            new_body = re.sub(r"\bDefault = [^,\n]+,", f"Default = {value},", body)
        else:
            new_body = f"{body}\n{indent}\tDefault = {value},"
        text = text[: m.start(3)] + new_body + text[m.end(3):]
        tool = re.search(rf"\n(\t+){re.escape(op)} = [\w.]+ \{{", text)
        if not tool:
            raise CadenceError(f"инструмент {op} для входа {key!r} не найден в макросе")
        # искать значение только внутри блока этого инструмента, а не в следующих за ним
        end = text.find(f"\n{tool.group(1)}}},", tool.end())
        end = len(text) if end < 0 else end
        inner = re.compile(rf"(\b{re.escape(source)} = Input \{{ Value = )[^,]+(, \}},)")
        hit = inner.search(text, tool.end(), end)
        if not hit:
            return text, False
        return text[: hit.start()] + f"{hit.group(1)}{value}{hit.group(2)}" + text[hit.end():], True
    names = ", ".join(sorted({i["name"] or i["source"] or "?" for i in exposed_inputs(text)}))
    raise CadenceError(f"нет входа {key!r}. Есть: {names or 'ничего'}")


def drfx_path(args: argparse.Namespace) -> Path:
    if args.drfx:
        return Path(args.drfx).expanduser()
    if sys.platform != "darwin":
        raise CadenceError("путь к Templates.drfx проверен только на macOS. Найди его в папке установки Resolve "
                           "(Fusion/Templates/Templates.drfx) и передай через --drfx")
    return MAC_DRFX


def templates_dir(args: argparse.Namespace) -> Path:
    if args.templates_dir:
        return Path(args.templates_dir).expanduser()
    if sys.platform != "darwin":
        raise CadenceError("папка пользовательских переходов проверена только на macOS. Передай её через --templates-dir "
                           "(в Resolve: Fusion/Templates/Edit/Transitions в папке поддержки)")
    return MAC_USER_TRANSITIONS


def builtin_names(drfx: Path) -> list[str]:
    if not drfx.exists():
        raise CadenceError(f"нет архива шаблонов: {drfx}. Resolve не установлен или стоит в другом месте — укажи --drfx")
    with zipfile.ZipFile(drfx) as z:
        return sorted(n[len(PREFIX):-len(".setting")] for n in z.namelist()
                      if n.startswith(PREFIX) and n.endswith(".setting") and "/" not in n[len(PREFIX):])


def read_base(drfx: Path, base: str) -> str:
    if base not in builtin_names(drfx):
        raise CadenceError(f"нет встроенного перехода {base!r}; список — команда list")
    with zipfile.ZipFile(drfx) as z:
        return z.read(f"{PREFIX}{base}.setting").decode("utf-8")


def cmd_list(args: argparse.Namespace) -> int:
    print("\n".join(builtin_names(drfx_path(args))))
    return 0


def cmd_inputs(args: argparse.Namespace) -> int:
    for i in exposed_inputs(read_base(drfx_path(args), args.base)):
        print(f"{i['name'] or '-'}\tисточник {i['source'] or '-'}\tинструмент {i['tool'] or '-'}\tпо умолчанию {i['default'] or '-'}")
    return 0


def cmd_make(args: argparse.Namespace) -> int:
    drfx = drfx_path(args)
    name = args.name.strip()
    if not re.fullmatch(r"[\w .-]+", name):
        raise CadenceError("имя: буквы, цифры, пробелы, точки и дефисы")
    if not name.startswith(NAME_PREFIX):
        raise CadenceError(f"имя начинается с «{NAME_PREFIX}», чтобы свои шаблоны отличались от встроенных: «{NAME_PREFIX}{name}»")
    if name.casefold() in {n.casefold() for n in builtin_names(drfx)}:
        raise CadenceError(f"имя {name!r} совпадает со встроенным переходом")
    if not args.set:
        raise CadenceError("нечего менять: добавь хотя бы один --set KEY=VALUE (входы — команда inputs)")
    text = read_base(drfx, args.base)
    for item in args.set:
        key, _, value = item.partition("=")
        value = value.strip()
        if not NUMBER.fullmatch(value):
            raise CadenceError(f"--set {item!r}: нужно число")
        text, inner = set_default(text, key.strip(), value)
        if not inner:
            print(f"внимание: у {key.strip()!r} поменялось только значение по умолчанию; у инструмента значение не найдено — "
                  "проверь переход рендером", file=sys.stderr)

    if args.install:
        out_dir = templates_dir(args)
    else:
        out_dir = Path(args.out_dir).expanduser() if args.out_dir else work_root() / "resolve-templates"
    out = out_dir / f"{name}.setting"
    if out.exists():
        raise CadenceError(f"файл уже есть: {out}. Выбери другое имя; старый файл не трогаю")
    if args.install and not args.yes:
        print("План (ничего не записано):")
        print(f"  записать новый файл {out}")
        print("  это личная папка шаблонов Resolve; открытые проекты не меняются")
        print(f"  откат — удалить этот файл; в Resolve переход «{name}» пропадёт из списка")
        print("Запись — только после согласия человека: повтори команду с --yes.")
        return 3
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out, "x", encoding="utf-8") as fh:
        fh.write(text)
    print(out)
    if args.install:
        print(f"откат — удалить файл {out}")
        print(f'поставить: item.AddTransition({{"type": "{name}", "category": "fusion", "position": "end", '
              f'"alignment": "center", "duration": 10}})')
    else:
        print("файл в рабочей папке; в Resolve он появится после установки (--install --yes) или ручного копирования "
              "в Fusion/Templates/Edit/Transitions")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--drfx", help="путь к Templates.drfx (по умолчанию — стандартная установка на macOS)")
    p.add_argument("--templates-dir", help="папка пользовательских переходов для --install")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="встроенные Fusion-переходы").set_defaults(func=cmd_list)
    i = sub.add_parser("inputs", help="входы перехода, которые можно поменять")
    i.add_argument("--base", required=True)
    i.set_defaults(func=cmd_inputs)
    m = sub.add_parser("make", help="новый шаблон из встроенного")
    m.add_argument("--base", required=True, help="имя встроенного перехода, например \"Stretch Blur\"")
    m.add_argument("--name", required=True, help="имя нового перехода, начинается с «Cadence »")
    m.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    m.add_argument("--out-dir", help="куда писать без --install (по умолчанию <work>/resolve-templates)")
    m.add_argument("--install", action="store_true", help="в папку шаблонов Resolve; без --yes — только план")
    m.add_argument("--yes", action="store_true", help="человек согласился на запись в папку Resolve")
    m.set_defaults(func=cmd_make)
    args = p.parse_args(argv)
    try:
        return args.func(args)
    except CadenceError as exc:
        print(f"resolve_transition_template: {exc}", file=sys.stderr)
        return exc.code
    except (zipfile.BadZipFile, UnicodeDecodeError) as exc:
        print(f"resolve_transition_template: архив шаблонов не читается: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
