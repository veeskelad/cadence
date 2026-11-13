#!/usr/bin/env python3
"""Кино-эффекты на живом видео: speed ramp, whip pan, crash zoom, zoom-переход, тряска,
вспышка, match cut, стоп-кадр. Всё считается локально (ffmpeg + OpenCV), исходники не меняются.

    python3 scripts/video_fx.py ramp   IN  --from 6.6 --to 8.9 --slow 0.45-1.45 [--factor 0.25]
    python3 scripts/video_fx.py whip   A B --a 2.0-3.4 --b 0.6-2.2 [--dir left|right]
    python3 scripts/video_fx.py crash  IN  --from 0.2 --to 3.0 --at 0.8 --center 640,280 [--zoom 3.6]
    python3 scripts/video_fx.py zoom   A B --a 1.8-3.2 --b 6.0-7.6
    python3 scripts/video_fx.py shake  IN  --from 7.0 --to 9.4 --hits 0.78,1.62 [--strength 1]
    python3 scripts/video_fx.py flash  A B --a 0.4-1.7 --b 0.2-1.9
    python3 scripts/video_fx.py match  A B --a 1.55-2.27 --b 12-14 --a-circle 676,275,187 --b-circle 563,321,169
    python3 scripts/video_fx.py freeze IN  --from 2.97 --to 3.4 [--hold 2] [--label "← это я" --label-at 0.36,0.3]

Общее: --size WxH (по умолчанию размер первого входа), --fps 30, --out путь, --overwrite,
--dry-run (только план). Времена — в секундах исходника; --at, --hits, --slow — от начала отрезка.
Центры и круги — в пикселях исходника (x,y и x,y,радиус). Выход без звука: звук под эффект
ставит навык cadence-sound. По умолчанию выход — work/<проект>/out/<имя>-<эффект>.mp4.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, check_output, default_output, first_stream, main_guard, probe, require_input,
    require_tool,
)

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover
    raise SystemExit("Нужны numpy и OpenCV: python3 -m pip install -r requirements.txt")

FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNSMono.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf",
]


# ---------------------------------------------------------------- кадры

class Clip:
    """Отрезок видео в памяти: кадры BGR в исходном размере, приведённые к общей частоте."""

    def __init__(self, path: Path, t0: float, t1: float, fps: float):
        if t1 <= t0:
            raise CadenceError(f"Пустой отрезок {t0}–{t1} в {path.name}")
        v = first_stream(probe(path), "video")
        if not v:
            raise CadenceError(f"В {path.name} нет видео")
        self.w, self.h = int(v["width"]), int(v["height"])
        raw = subprocess.run(
            [require_tool("ffmpeg"), "-v", "error", "-nostdin", "-ss", str(t0), "-i", str(path), "-t", str(t1 - t0),
             "-vf", f"fps={fps}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
            capture_output=True, check=False)
        if raw.returncode != 0:
            raise CadenceError(f"ffmpeg не прочитал {path.name}: {raw.stderr.decode(errors='replace')[-400:]}")
        size = self.w * self.h * 3
        n = len(raw.stdout) // size
        if n < 2:
            raise CadenceError(f"В отрезке {t0}–{t1} файла {path.name} меньше двух кадров")
        self.frames = list(np.frombuffer(raw.stdout[:n * size], np.uint8).reshape(n, self.h, self.w, 3))


class Canvas:
    """Выходной кадр W×H; окно на исходник с центром, увеличением, сдвигом и поворотом."""

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h

    def view(self, img, cx=None, cy=None, zoom=1.0, dx=0.0, dy=0.0, rot=0.0):
        sh, sw = img.shape[:2]
        cx = sw / 2 if cx is None else cx
        cy = sh / 2 if cy is None else cy
        s = max(self.w / sw, self.h / sh) * zoom  # «cover»: окно заполняет кадр целиком
        m = cv2.getRotationMatrix2D((cx, cy), rot, s)
        m[0, 2] += self.w / 2 - cx + dx * self.w
        m[1, 2] += self.h / 2 - cy + dy * self.h
        return cv2.warpAffine(img, m, (self.w, self.h), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_REFLECT)


def hblur(img, n):
    n = int(abs(n))
    if n < 2:
        return img
    k = np.full((1, n), 1 / n, np.float32)
    return cv2.filter2D(img, -1, k)


def zblur(img, amount, steps=8):
    """Радиальный смаз от центра кадра."""
    if amount < 0.005:
        return img
    h, w = img.shape[:2]
    acc = np.zeros(img.shape, np.float32)
    for i in range(steps):
        m = cv2.getRotationMatrix2D((w / 2, h / 2), 0, 1 + amount * i / (steps - 1))
        acc += cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REFLECT)
    return (acc / steps).astype(np.uint8)


def ease_in(p):
    return p ** 3


def ease_out(p):
    return 1 - (1 - p) ** 3


def interp(a, b, t):
    """Промежуточный кадр по оптическому потоку — для плавного замедления."""
    if t < 0.02:
        return a
    if t > 0.98:
        return b
    ga, gb = (cv2.cvtColor(x, cv2.COLOR_BGR2GRAY) for x in (a, b))
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    fab, fba = dis.calc(ga, gb, None), dis.calc(gb, ga, None)
    h, w = a.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    t = float(t)
    wa = cv2.remap(a, gx - fab[..., 0] * t, gy - fab[..., 1] * t, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    wb = cv2.remap(b, gx - fba[..., 0] * (1 - t), gy - fba[..., 1] * (1 - t), cv2.INTER_LINEAR,
                   borderMode=cv2.BORDER_REFLECT)
    return cv2.addWeighted(wa, 1 - t, wb, t, 0)


def label(img, text, x, y, size):
    """Плашка с подписью; x, y — доли кадра. Без Pillow или шрифта — без подписи, с предупреждением."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow не установлен — подпись пропущена", file=sys.stderr)
        return img
    font = next((f for f in FONT_CANDIDATES if Path(f).exists()), None)
    if not font:
        print("Не нашёл шрифт с кириллицей — подпись пропущена", file=sys.stderr)
        return img
    im = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(font, size)
    xy = (x * img.shape[1], y * img.shape[0])
    x0, y0, x1, y1 = d.textbbox(xy, text, font=f)
    pad = size // 3
    d.rounded_rectangle((x0 - pad, y0 - pad // 2, x1 + pad, y1 + pad // 2), pad, fill=(242, 166, 90))
    d.text(xy, text, font=f, fill=(14, 12, 11))
    return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)


# ---------------------------------------------------------------- эффекты

def fx_ramp(c: Canvas, a: Clip, o):
    s0, s1 = o.slow
    out, s, n = [], 0.0, len(a.frames)
    while s < n - 1.01:
        t = s / o.fps
        k = np.clip((t - s0) / 0.25, 0, 1) * np.clip((s1 - t) / 0.25, 0, 1)
        speed = 1 - (1 - o.factor) * k * k * (3 - 2 * k)
        i = int(s)
        out.append(c.view(interp(a.frames[i], a.frames[i + 1], s - i), *o.center_or(a), o.zoom))
        s += speed
    return out


def fx_whip(c: Canvas, a: Clip, b: Clip, o):
    sign = -1 if o.dir == "left" else 1
    n = 9
    out = [c.view(f) for f in a.frames[:-n]]
    for k, f in enumerate(a.frames[-n:]):
        p = (k + 1) / n
        out.append(hblur(c.view(f, dx=sign * 0.9 * ease_in(p)), 6 + c.w * 0.27 * p * p))
    for k, f in enumerate(b.frames[:n]):
        p = (k + 1) / n
        out.append(hblur(c.view(f, dx=-sign * 0.9 * (1 - ease_out(p))), c.w * 0.27 * (1 - p) ** 2))
    return out + [c.view(f) for f in b.frames[n:]]


def fx_crash(c: Canvas, a: Clip, o):
    cx, cy = o.center_or(a)
    out = []
    for i, f in enumerate(a.frames):
        t = i / o.fps
        if t < o.at:
            out.append(c.view(f, a.w / 2, a.h / 2))
        elif t < o.at + 0.14:
            p = ease_in((t - o.at) / 0.14)
            img = c.view(f, a.w / 2 + (cx - a.w / 2) * p, a.h / 2 + (cy - a.h / 2) * p, 1 + (o.zoom - 1) * p)
            out.append(zblur(img, 0.12 * (1 - abs(p - 0.7))))
        else:
            k = t - o.at - 0.14
            out.append(c.view(f, cx, cy, o.zoom + 0.06 * k, dy=4 * np.exp(-k * 9) * np.sin(k * 60) / c.h))
    return out


def fx_zoom(c: Canvas, a: Clip, b: Clip, o):
    out = [c.view(f) for f in a.frames[:-8]]
    for k, f in enumerate(a.frames[-8:]):
        p = ease_in((k + 1) / 8)
        out.append(zblur(c.view(f, zoom=1 + 2.2 * p), 0.35 * p))
    for k, f in enumerate(b.frames[:10]):
        p = ease_out((k + 1) / 10)
        out.append(zblur(c.view(f, zoom=3.0 - 2.0 * p), 0.35 * (1 - p)))
    return out + [c.view(f) for f in b.frames[10:]]


def fx_shake(c: Canvas, a: Clip, o):
    rng = np.random.default_rng(7)
    n = len(a.frames)
    nx, ny, nr = (rng.normal(size=n) for _ in range(3))
    out = []
    for i, f in enumerate(a.frames):
        t = i / o.fps
        e = min(1.2, sum(np.exp(-(t - h) * 7) for h in o.hits if t >= h)) * o.strength
        img = c.view(f, *o.center_or(a), o.zoom + 0.07 * e, dx=0.035 * e * nx[i], dy=0.03 * e * ny[i],
                     rot=1.6 * e * nr[i])
        out.append(hblur(img, 10 * e * abs(nx[i])))
    return out


def fx_flash(c: Canvas, a: Clip, b: Clip, o):
    out = [c.view(f) for f in a.frames]
    white = np.full((c.h, c.w, 3), 255, np.uint8)
    out[-2] = cv2.addWeighted(out[-2], 0.4, white, 0.6, 0)
    out[-1] = white
    for k, f in enumerate(b.frames):
        over = max(0.0, 1 - k / 10)
        v = c.view(f).astype(np.float32) * (1 + 1.6 * over) + 60 * over
        out.append(np.clip(v, 0, 255).astype(np.uint8))
    return out


def fx_match(c: Canvas, a: Clip, b: Clip, o):
    ax, ay, ar = o.a_circle
    bx, by, br = o.b_circle
    k = ar / br
    m = np.float32([[k, 0, ax - bx * k], [0, k, ay - by * k]])
    out = [c.view(f, ax, ay, o.zoom) for f in a.frames]
    for i, f in enumerate(b.frames):
        moved = cv2.warpAffine(f, m, (a.w, a.h), borderMode=cv2.BORDER_CONSTANT)
        out.append(c.view(moved, ax, ay, o.zoom * (1 - 0.12 * ease_out(i / len(b.frames)))))
    return out


def fx_freeze(c: Canvas, a: Clip, o):
    cx, cy = o.center_or(a)
    out = [c.view(f, cx, cy, o.zoom) for f in a.frames]
    still = a.frames[-1]
    gray = cv2.cvtColor(cv2.cvtColor(still, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    for k in range(int(o.hold * o.fps)):
        p = ease_out(min(1, k / 6))
        f = c.view(cv2.addWeighted(still, 1 - 0.75 * p, gray, 0.75 * p, 0), cx, cy,
                   o.zoom * (1 + 0.05 * ease_out(min(1, k / 20))))
        if k < 2:
            f = cv2.addWeighted(f, 0.3, np.full_like(f, 255), 0.7, 0)
        if o.label and k >= 5:
            f = label(f, o.label, *o.label_at, max(14, c.h // 13))
        out.append(f)
    return out


EFFECTS = {
    "ramp": (1, fx_ramp, "замедление в главный момент и снова обычная скорость"),
    "whip": (2, fx_whip, "резкий смаз камеры уводит в следующий план"),
    "crash": (1, fx_crash, "стремительный наезд на деталь"),
    "zoom": (2, fx_zoom, "влёт в центр кадра и вылет из следующего"),
    "shake": (1, fx_shake, "кадр вздрагивает на ударах"),
    "flash": (2, fx_flash, "вспышка склеивает два плана"),
    "match": (2, fx_match, "круг из одного плана продолжается в другом"),
    "freeze": (1, fx_freeze, "стоп-кадр в главный момент, цвет уходит, подпись"),
}


# ---------------------------------------------------------------- запуск

def span(text):
    try:
        a, b = (float(x) for x in text.split("-", 1))
    except ValueError:
        raise argparse.ArgumentTypeError(f"нужен отрезок вида 1.5-3.2, а не {text}")
    return a, b


def floats(n):
    def parse(text):
        vals = [float(x) for x in text.split(",")]
        if len(vals) != n:
            raise argparse.ArgumentTypeError(f"нужно {n} числа через запятую: {text}")
        return vals
    return parse


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("effect", choices=EFFECTS)
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--from", dest="t0", type=float)
    ap.add_argument("--to", dest="t1", type=float)
    ap.add_argument("--a", type=span, help="отрезок первого видео, например 2.0-3.4")
    ap.add_argument("--b", type=span, help="отрезок второго видео")
    ap.add_argument("--slow", type=span, default=(0.45, 1.45), help="ramp: где замедлять, от начала отрезка")
    ap.add_argument("--factor", type=float, default=0.25, help="ramp: скорость в замедлении")
    ap.add_argument("--dir", choices=["left", "right"], default="left", help="whip: куда рвётся камера")
    ap.add_argument("--at", type=float, default=0.8, help="crash: когда наезд, от начала отрезка")
    ap.add_argument("--center", type=floats(2), help="точка интереса x,y в пикселях исходника")
    ap.add_argument("--zoom", type=float, help="увеличение (crash по умолчанию 3.6, иначе 1)")
    ap.add_argument("--hits", type=lambda s: [float(x) for x in s.split(",")], default=[0.8], help="shake: удары")
    ap.add_argument("--strength", type=float, default=1.0, help="shake: сила, 0.5–1.5")
    ap.add_argument("--a-circle", type=floats(3), help="match: круг в конце первого плана x,y,r")
    ap.add_argument("--b-circle", type=floats(3), help="match: круг во втором плане x,y,r")
    ap.add_argument("--hold", type=float, default=2.0, help="freeze: сколько держать стоп-кадр, с")
    ap.add_argument("--label", help="freeze: подпись на стоп-кадре")
    ap.add_argument("--label-at", type=floats(2), default=[0.36, 0.3], help="freeze: где подпись, доли кадра x,y")
    ap.add_argument("--size", help="размер выхода WxH, по умолчанию как у первого входа")
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--crf", type=int, default=20)
    ap.add_argument("--out")
    ap.add_argument("--project")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    o = ap.parse_args()

    need, fn, what = EFFECTS[o.effect]
    if len(o.inputs) != need:
        raise CadenceError(f"{o.effect}: нужно входов — {need}, дано {len(o.inputs)}")
    paths = [require_input(p, "видео") for p in o.inputs]
    if need == 1:
        if o.t0 is None or o.t1 is None:
            raise CadenceError(f"{o.effect}: укажи отрезок --from и --to")
        spans = [(o.t0, o.t1)]
    else:
        if not o.a or not o.b:
            raise CadenceError(f"{o.effect}: укажи отрезки --a и --b")
        spans = [o.a, o.b]
    if o.effect == "match" and (not o.a_circle or not o.b_circle):
        raise CadenceError("match: укажи --a-circle и --b-circle (x,y,радиус в пикселях исходника)")
    if o.zoom is None:
        o.zoom = 3.6 if o.effect == "crash" else 1.0
    o.center_or = lambda clip: (o.center or [clip.w / 2, clip.h / 2])

    out = Path(o.out) if o.out else default_output(paths[0], o.effect, ".mp4", o.project)
    print(f"Эффект: {o.effect} — {what}")
    for p, (t0, t1) in zip(paths, spans):
        print(f"  вход: {p.name} {t0:.2f}–{t1:.2f} с")
    print(f"  выход: {out} (без звука)")
    if o.dry_run:
        return 0
    out = check_output(out, paths, o.overwrite)

    clips = [Clip(p, t0, t1, o.fps) for p, (t0, t1) in zip(paths, spans)]
    if o.size:
        w, h = (int(x) for x in o.size.lower().split("x"))
    else:
        w, h = clips[0].w, clips[0].h
    w, h = w - w % 2, h - h % 2
    frames = fn(Canvas(w, h), *clips, o)

    enc = subprocess.Popen(
        [require_tool("ffmpeg"), "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{w}x{h}", "-r", str(o.fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", str(o.crf),
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(out)],
        stdin=subprocess.PIPE)
    for f in frames:
        enc.stdin.write(np.ascontiguousarray(f).tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise CadenceError("ffmpeg не записал результат")
    print(f"Готово: {out} · {len(frames) / o.fps:.1f} с · {w}×{h}")
    return 0


if __name__ == "__main__":
    main_guard(main)
