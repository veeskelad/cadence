#!/usr/bin/env python3
"""Лист сравнения стилей на кадре самого человека: 2–6 паков рядом, чтобы выбрать глазами.

  python3 scripts/style_sheet.py --frame work/my-brand/in/frame.jpg \\
      --pack $WORK/packs/mono/pack.json --pack $WORK/packs/mono-cream/pack.json \\
      --headline "Pre-load *the game*" --render

Каждый пак — отдельная секция 1 с: кадр человека, номер, заголовок с выделенным словом,
три строки карточек, подпись и плашка с цветами пака. С `--render` секции снимаются
движком (`npm --prefix engine run snapshot`) и складываются в один `sheet.jpg`.
Выделение: цвет `signal`, а если `signal` почти не отличается от `ink` (монохромный пак) — инверсия:
плашка цвета `signal` с тёмным текстом.

Результат — новая папка `work/style-sheet-NN/` (или `--out`); исходники не меняются.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import CadenceError, RELEASE_ROOT, main_guard, work_root  # noqa: E402

FONTS = RELEASE_ROOT / "engine/fonts"
MOTION = RELEASE_ROOT / "engine/lib/motion.js"


def load_pack(ref: str) -> dict:
    p = Path(ref)
    if not p.is_file():
        for base in (work_root() / "packs", RELEASE_ROOT / "design/packs"):
            if (base / ref / "pack.json").is_file():
                p = base / ref / "pack.json"
                break
    if not p.is_file():
        raise CadenceError(f"пак не найден: {ref} (путь к pack.json или id из work/packs или design/packs)")
    return json.loads(p.read_text(encoding="utf-8"))


def rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(h: str) -> float:
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def ratio(a: str, b: str) -> float:
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def family(face: dict) -> str:
    return face["family"].split(",")[0].strip().strip("'\"")


def font_dirs(families: set) -> set:
    """Папки engine/fonts/<dir>, которые объявляют нужные семейства в fonts.css."""
    css = (FONTS / "fonts.css").read_text(encoding="utf-8")
    dirs = set()
    for block in css.split("@font-face")[1:]:
        fam = re.search(r"font-family:\s*['\"]?([^;'\"]+)", block)
        url = re.search(r"url\(\.?/?([^/)]+)/", block)
        if fam and url and fam.group(1).strip() in families:
            dirs.add(url.group(1))
    return dirs


def emph(text: str) -> str:
    return re.sub(r"\*(.+?)\*", r"<b>\1</b>", html.escape(text))


def section(i: int, pack: dict, frame_name: str, headline: str) -> str:
    c, t = pack["colors"], pack["typography"]
    invert = ratio(c["signal"], c["ink"]) < 1.3
    em = (f"color:{c.get('onSignal', c['canvas'])};background:{c['signal']};padding:0 .14em .04em;border-radius:.12em;text-shadow:none"
          if invert else f"color:{c['signal']}")
    glass = "inset" in str(pack.get("shadow", {}).get("card", ""))
    card = ("background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.24);backdrop-filter:blur(30px) saturate(1.4);"
            "-webkit-backdrop-filter:blur(30px) saturate(1.4)" if glass else f"background:{c['surface']};border:2px solid {c['line']}")
    sw = "".join(f'<i style="background:{c[k]}"></i>' for k in ("canvas", "surface", "ink", "muted", "signal", "signalSecondary"))
    disp, body = family(t["display"]), family(t["body"])
    dw, bw = t["display"].get("weight", 700), t["body"].get("weight", 500)
    tr = t["display"].get("transform", "none")
    rows = [("Row one", "$499", c["signal"]), ("Row two", "$499", c["ink"]), ("Row three", "Later", None)]
    rows_html = "".join(
        f'<div class="cd" style="{card}"><span>{n}</span>'
        + (f'<span style="color:{col}">{v}</span>' if col else f'<span class="pl" style="background:{c["signal"]};color:{c.get("onSignal", c["canvas"])}">{v}</span>')
        + "</div>" for n, v, col in rows)
    return f'''
<section class="sc" id="s{i}" style="font-family:'{body}';font-weight:{bw};color:{c['ink']}">
  <div class="bg" style="background-image:url({frame_name})"></div><div class="vg"></div>
  <div class="tag" style="background:{c['canvas']}cc">{html.escape(pack.get('title', pack['id']))}<span class="sw">{sw}</span></div>
  <div class="kk" style="color:{c['muted']}">Thing</div>
  <div class="num" style="font-family:'{disp}';font-weight:{dw};color:{c['signal']};text-transform:{tr}">07</div>
  <div class="hd" style="font-family:'{disp}';font-weight:{dw};text-transform:{tr}">{emph(headline).replace('<b>', f'<b style="{em}">')}</div>
  <div class="ins" style="font-family:'{disp}';font-weight:{dw}">{rows_html}</div>
  <div class="cap">Captions look <b style="{em}">like this</b></div>
</section>'''


def build(frame: Path, packs: list, headline: str, out: Path) -> Path:
    if not frame.is_file():
        raise CadenceError(f"кадр не найден: {frame}")
    if not 2 <= len(packs) <= 6:
        raise CadenceError("сравниваются от 2 до 6 паков")
    if out.exists():
        raise CadenceError(f"папка уже есть, выбери новую: {out}")
    out.mkdir(parents=True)
    shutil.copy(frame, out / ("frame" + frame.suffix.lower()))
    fams = {family(p["typography"][k]) for p in packs for k in ("display", "body")}
    (out / "fonts").mkdir()
    shutil.copy(FONTS / "fonts.css", out / "fonts/fonts.css")
    for d in font_dirs(fams):
        shutil.copytree(FONTS / d, out / "fonts" / d)
    (out / "lib").mkdir()
    shutil.copy(MOTION, out / "lib/motion.js")
    secs = "".join(section(i, p, "frame" + frame.suffix.lower(), headline) for i, p in enumerate(packs))
    (out / "index.html").write_text(f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="fonts/fonts.css"><style>
html,body{{margin:0;width:1920px;height:1080px;background:#000;overflow:hidden}}#root{{position:relative;width:1920px;height:1080px;overflow:hidden}}
.sc{{position:absolute;inset:0;opacity:0}}.bg{{position:absolute;inset:0;background-size:cover;background-position:center}}
.vg{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.3) 0,transparent 18%,transparent 55%,rgba(0,0,0,.7) 100%),linear-gradient(90deg,transparent 45%,rgba(0,0,0,.45) 62%)}}
.tag{{position:absolute;left:120px;top:96px;padding:10px 18px;border-radius:12px;font-size:26px;display:flex;gap:16px;align-items:center}}
.sw{{display:flex;gap:6px}}.sw i{{width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,.25)}}
.kk{{position:absolute;left:120px;top:470px;font-size:34px}}.num{{position:absolute;left:120px;top:510px;font-size:200px;line-height:1;letter-spacing:-.05em;text-shadow:0 0 40px rgba(0,0,0,.8)}}
.hd{{position:absolute;left:120px;top:730px;font-size:88px;line-height:1;letter-spacing:-.03em;text-shadow:0 0 40px rgba(0,0,0,.85)}}
.ins{{position:absolute;left:1180px;top:200px;width:620px}}.cd{{display:flex;justify-content:space-between;align-items:center;border-radius:28px;padding:22px 30px;margin-bottom:16px;font-size:50px}}
.pl{{font-size:36px;padding:4px 16px;border-radius:12px}}
.cap{{position:absolute;left:260px;top:910px;width:1400px;text-align:center;font-size:50px;-webkit-text-stroke:3px rgba(0,0,0,.8);paint-order:stroke fill;text-shadow:0 0 26px rgba(0,0,0,.95)}}
.cap b{{-webkit-text-stroke:0}}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="{len(packs)}">{secs}
</div><script type="module">
import {{bindSeek}} from './lib/motion.js';
const secs = [...document.querySelectorAll('.sc')];
bindSeek((t) => secs.forEach((s, i) => {{ s.style.opacity = Math.floor(t) === i ? 1 : 0; }}));
</script></body></html>
''', encoding="utf-8")
    return out


def render(out: Path, count: int) -> Path:
    at = ",".join(f"{i + 0.5}" for i in range(count))
    shots = out / "shots"
    subprocess.run(["npm", "--prefix", str(RELEASE_ROOT / "engine"), "run", "snapshot", "--", str(out.resolve()),
                    "--at", at, "--no-end", "-o", str(shots.resolve())], check=True)
    frames = sorted(shots.glob("frame-*.png"))
    if len(frames) < count:
        raise CadenceError("снимки не получились: проверь `npm --prefix engine install`")
    cols = 3 if count in (3, 5, 6) else 2
    rows = (count + cols - 1) // cols
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-pattern_type", "glob", "-i", str(shots / "frame-*.png"),
                    "-vf", f"scale=960:-1,tile={cols}x{rows}", "-frames:v", "1", str(out / "sheet.jpg")], check=True)
    return out / "sheet.jpg"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frame", required=True, help="кадр человека (jpg/png) — фон для сравнения")
    ap.add_argument("--pack", action="append", required=True, help="pack.json или id пака; 2–6 раз")
    ap.add_argument("--headline", default="Your headline *here*", help="заголовок, *слово* — выделение")
    ap.add_argument("--out", help="новая папка результата; по умолчанию work/style-sheet-<n>/")
    ap.add_argument("--render", action="store_true", help="снять секции движком и сложить sheet.jpg")
    a = ap.parse_args()
    packs = [load_pack(r) for r in a.pack]
    out = Path(a.out) if a.out else next(work_root() / f"style-sheet-{n:02d}" for n in range(1, 100)
                                         if not (work_root() / f"style-sheet-{n:02d}").exists())
    build(Path(a.frame), packs, a.headline, out)
    print(f"лист: {out / 'index.html'}")
    if a.render:
        print(f"снимок: {render(out, len(packs))}")
    else:
        print(f"снять: npm --prefix engine run snapshot -- {out.resolve()} --at "
              + ",".join(f"{i + 0.5}" for i in range(len(packs))) + " --no-end")


if __name__ == "__main__":
    main_guard(main)
