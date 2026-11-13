#!/usr/bin/env python3
"""Show one numbered palette from Wada's first dictionary (CMYK-derived sRGB)."""
import argparse
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "knowledge/palettes/sanzo-wada/vol1-colors.json"


def palette(number: int) -> dict:
    colors = json.loads(DATA.read_text(encoding="utf-8"))
    return {
        "volume": 1,
        "number": number,
        "colors": [
            {key: color[key] for key in ("name", "hex", "cmyk")}
            for color in colors if number in color["combinations"]
        ],
        "note": "HEX converted from CMYK, not measured from printed swatches",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("number", type=int, choices=range(1, 349), metavar="1..348")
    args = parser.parse_args()
    print(json.dumps(palette(args.number), ensure_ascii=False, indent=2))
