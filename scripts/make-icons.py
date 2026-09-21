#!/usr/bin/env python3
"""Erzeugt App-Icons und iOS-Splashscreens für Arilica.

Motiv: das Fünfeck der venezianischen Festung von Peschiera.
Einmalig laufen lassen, die PNGs liegen fest im Repo:

    python3 scripts/make-icons.py
"""
import math, pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

LAKE = (30, 95, 115)     # --lake  #1E5F73
GOLD = (184, 145, 42)    # --gold  #B8912A
BG   = (244, 240, 230)   # --bg    #F4F0E6
SS   = 4                 # Supersampling


def pentagon(cx, cy, r, rot=-90):
    return [(cx + r * math.cos(math.radians(rot + i * 72)),
             cy + r * math.sin(math.radians(rot + i * 72))) for i in range(5)]


def logo(d, cx, cy, r, color, stroke):
    """Fünfeck-Umriss der Festung mit einer Wellenlinie darin."""
    d.polygon(pentagon(cx, cy, r), outline=color, width=stroke)
    y, half, amp = cy + r * 0.40, r * 0.48, r * 0.115
    pts = []
    for i in range(61):
        t = i / 60
        pts.append((cx - half + 2 * half * t,
                    y + math.sin(t * math.pi * 2) * amp))
    d.line(pts, fill=color, width=max(1, int(stroke * 0.9)), joint="curve")


def icon(size, maskable=False, radius_ratio=0.22):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=LAKE + (255,))
        r = S * 0.30                      # Safe Zone: Motiv auf 60 % der Fläche
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * radius_ratio, fill=LAKE + (255,))
        r = S * 0.34
    logo(d, S / 2, S / 2 * 0.97, r, GOLD + (255,), max(SS, int(S * 0.038)))
    return img.resize((size, size), Image.LANCZOS)


def splash(w, h):
    W, H = w * 1, h * 1
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    r = min(W, H) * 0.14
    logo(d, W / 2, H / 2, r, LAKE, max(2, int(r * 0.10)))
    return img


# --- App-Icons ---------------------------------------------------------------
icon(192).save(OUT / "icon-192.png")
icon(512).save(OUT / "icon-512.png")
icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
# iOS maskiert selbst -> voll ausgefüllt, ohne Transparenz
icon(180, radius_ratio=0.0).convert("RGB").save(OUT / "apple-touch-icon.png")
icon(32, radius_ratio=0.18).save(OUT / "favicon-32.png")

# --- iOS-Splashscreens (gängige iPhone-Auflösungen, Portrait) ---------------
SPLASHES = [
    (1179, 2556), (1170, 2532), (1290, 2796), (1284, 2778),
    (1125, 2436), (1242, 2688), (828, 1792), (750, 1334),
]
for w, h in SPLASHES:
    splash(w, h).save(OUT / f"splash-{w}x{h}.png", optimize=True)

print("icons:", *sorted(p.name for p in OUT.iterdir()), sep="\n  ")
