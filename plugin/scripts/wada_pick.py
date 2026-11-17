#!/usr/bin/env python3
"""Подбор сочетаний из первого тома словаря Сандзо Вады под фон и вкус человека.

Примеры (из корня Cadence):
  python3 scripts/wada_pick.py --canvas "#0A0A0A" --mode one-accent --diverse --limit 6
  python3 scripts/wada_pick.py --mode near-mono --hue 180-235
  python3 scripts/wada_pick.py --avoid-hue 15-45 --min-accent-contrast 4.5

Режимы:
  any         любые сочетания, где акцент читается на фоне;
  one-accent  один цветной тон, остальные цвета почти нейтральные (монохром плюс акцент);
  near-mono   средняя насыщенность сочетания низкая, допускается один цветной тон.

Вывод — JSON: номер, цвета (имя, HEX, тон, насыщенность Lab, контраст к фону), какой цвет годится в акцент.
HEX пересчитан из CMYK печатных образцов: перед паком контраст проверяется заново (validate_pack.py).
"""
import argparse
import colorsys
import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "knowledge/palettes/sanzo-wada/vol1-colors.json"
NEUTRAL_CHROMA = 14      # ниже — цвет считается нейтральным (серым, бежевым, чёрным)
NEAR_MONO_MEAN = 20      # средняя насыщенность сочетания для near-mono


def hex_rgb(value: str) -> tuple:
    value = value.lstrip("#")
    if len(value) != 6:
        raise argparse.ArgumentTypeError(f"нужен цвет #RRGGBB, получено {value!r}")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def luminance(rgb) -> float:
    def channel(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a, b) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def hue(rgb) -> float:
    return colorsys.rgb_to_hls(*[v / 255 for v in rgb])[0] * 360


def chroma(color: dict) -> float:
    return math.hypot(color["lab"][1], color["lab"][2])


def hue_range(text: str) -> tuple:
    try:
        lo, hi = (float(x) for x in text.split("-"))
    except ValueError:
        raise argparse.ArgumentTypeError(f"диапазон тона как 180-235, получено {text!r}")
    if not (0 <= lo <= 360 and 0 <= hi <= 360):
        raise argparse.ArgumentTypeError("тон — от 0 до 360 градусов")
    return lo, hi


def in_range(h: float, rng: tuple) -> bool:
    lo, hi = rng
    return lo <= h <= hi if lo <= hi else (h >= lo or h <= hi)   # 340-20 переходит через красный


def combos() -> dict:
    out = {}
    for color in json.loads(DATA.read_text(encoding="utf-8")):
        for number in color["combinations"]:
            out.setdefault(number, []).append(color)
    return out


def pick(canvas="#0A0A0A", mode="any", hues=(), avoid=(), min_contrast=3.0, diverse=False, limit=12) -> list:
    bg = hex_rgb(canvas)
    found = []
    for number, cs in sorted(combos().items()):
        rows = [{"name": c["name"], "hex": c["hex"].upper(), "hue": round(hue(c["rgb"])), "chroma": round(chroma(c)),
                 "contrast": round(contrast(c["rgb"], bg), 1)} for c in cs]
        colored = [r for r in rows if r["chroma"] > NEUTRAL_CHROMA]
        accents = [r for r in colored if r["contrast"] >= min_contrast
                   and (not hues or any(in_range(r["hue"], h) for h in hues))
                   and not any(in_range(r["hue"], a) for a in avoid)]
        if not accents:
            continue
        if any(any(in_range(r["hue"], a) for a in avoid) for r in colored):
            continue                                                   # отвергнутый тон не входит в сочетание вовсе
        if mode == "one-accent" and len(colored) != 1:
            continue
        if mode == "near-mono" and sum(r["chroma"] for r in rows) / len(rows) > NEAR_MONO_MEAN:
            continue
        accent = max(accents, key=lambda r: (r["contrast"] >= 4.5, r["chroma"]))
        found.append({"number": number, "accent": accent["hex"], "accent_name": accent["name"],
                      "accent_hue": accent["hue"], "colors": rows})
    if diverse:                                                        # по одному сочетанию на сектор тона в 30°
        seen, spread = set(), []
        for item in sorted(found, key=lambda x: -next(r["chroma"] for r in x["colors"] if r["hex"] == x["accent"])):
            sector = item["accent_hue"] // 30
            if sector not in seen:
                seen.add(sector)
                spread.append(item)
        found = sorted(spread, key=lambda x: x["accent_hue"])
    return found[:limit]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--canvas", default="#0A0A0A", help="цвет фона, на котором будет акцент (#RRGGBB)")
    parser.add_argument("--mode", choices=("any", "one-accent", "near-mono"), default="any")
    parser.add_argument("--hue", type=hue_range, action="append", default=[], help="искать акцент в диапазоне тона, напр. 180-235")
    parser.add_argument("--avoid-hue", type=hue_range, action="append", default=[], help="исключить тон, напр. 15-45 (оранжевый)")
    parser.add_argument("--min-accent-contrast", type=float, default=3.0, help="контраст акцента к фону, по умолчанию 3:1")
    parser.add_argument("--diverse", action="store_true", help="по одному сочетанию на каждый сектор тона")
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()
    hex_rgb(args.canvas)
    result = pick(args.canvas, args.mode, args.hue, args.avoid_hue, args.min_accent_contrast, args.diverse, args.limit)
    print(json.dumps({"canvas": args.canvas.upper(), "mode": args.mode, "count": len(result), "combinations": result,
                      "note": "HEX converted from CMYK; check contrast again in the pack"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
