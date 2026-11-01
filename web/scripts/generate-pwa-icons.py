#!/usr/bin/env python3
"""Generate PWA icon PNGs for Momentum (dark bg, blue candlestick mark)."""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("Install Pillow: pip install Pillow")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
BG = (30, 30, 30)  # #1e1e1e
ACCENT = (13, 153, 255)  # #0d99ff


def draw_mark(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) // 2
    # Upward trend line
    line_w = max(3, w // 28)
    pts = [
        (x0 + int(w * 0.12), y0 + int(h * 0.72)),
        (x0 + int(w * 0.38), y0 + int(h * 0.52)),
        (x0 + int(w * 0.62), y0 + int(h * 0.58)),
        (x0 + int(w * 0.88), y0 + int(h * 0.28)),
    ]
    draw.line(pts, fill=ACCENT, width=line_w, joint="curve")
    # Minimal candlestick at center-right
    body_w = max(6, w // 9)
    body_top = y0 + int(h * 0.38)
    body_bot = y0 + int(h * 0.58)
    bx = x0 + int(w * 0.55)
    draw.line([(bx, y0 + int(h * 0.30)), (bx, body_top)], fill=ACCENT, width=max(2, line_w - 1))
    draw.line([(bx, body_bot), (bx, y0 + int(h * 0.68))], fill=ACCENT, width=max(2, line_w - 1))
    draw.rectangle([bx - body_w // 2, body_top, bx + body_w // 2, body_bot], fill=ACCENT)


def render(size: int, pad_ratio: float = 0.22) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    pad = int(size * pad_ratio)
    draw = ImageDraw.Draw(img)
    draw_mark(draw, (pad, pad, size - pad, size - pad))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {
        "apple-touch-icon.png": (180, 0.22),
        "icon-192.png": (192, 0.22),
        "icon-512.png": (512, 0.22),
        "icon-512-maskable.png": (512, 0.32),
    }
    for name, (size, pad) in sizes.items():
        render(size, pad).save(OUT / name, optimize=True)
    # Favicon 32
    fav = ROOT / "app"
    render(32, 0.18).save(fav / "icon.png", optimize=True)
    print("Wrote icons to", OUT, "and app/icon.png")


if __name__ == "__main__":
    main()
