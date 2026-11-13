"""يولّد أيقونات التطبيق — علامة «دبوس» بيضاء على مربّع نيلي."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(OUT, exist_ok=True)

INDIGO_TOP = (92, 84, 240)
INDIGO_BOT = (67, 56, 202)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(INDIGO_TOP, INDIGO_BOT, y / max(1, size - 1)))
    return img


def draw_pin(d, cx, cy, r, color):
    """دبوس موقع: دائرة + ذيل مثلثي"""
    # الذيل
    d.polygon([(cx - r * 0.62, cy + r * 0.42), (cx + r * 0.62, cy + r * 0.42), (cx, cy + r * 1.92)], fill=color)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def make(size, maskable=False):
    S = size * 4
    scale = 0.74 if maskable else 1.0
    radius = 0 if maskable else int(S * 0.225)

    base = gradient(S)
    layer = Image.new('L', (S, S), 0)
    ld = ImageDraw.Draw(layer)
    if maskable:
        ld.rectangle([0, 0, S, S], fill=255)
    else:
        ld.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)

    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    img.paste(base, (0, 0), layer)

    d = ImageDraw.Draw(img)
    cx = S / 2
    cy = S / 2
    r = S * 0.185 * scale
    # الدبوس الأبيض
    draw_pin(d, cx, cy - r * 0.16, r, (255, 255, 255, 255))
    # الفتحة الداخلية
    hole = r * 0.42
    hy = cy - r * 0.16
    d.ellipse([cx - hole, hy - hole, cx + hole, hy + hole], fill=INDIGO_BOT + (255,))

    return img.resize((size, size), Image.LANCZOS)


make(512).save(os.path.join(OUT, 'icon-512.png'))
make(192).save(os.path.join(OUT, 'icon-192.png'))
make(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
make(180).save(os.path.join(OUT, 'apple-touch-icon.png'))
print('icons ok')
