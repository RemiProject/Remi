# Regenerates assets/brand/{logo,wordmark,mascot}.png from the logo artwork.
# Usage: python3 scripts/make-brand-assets.py assets/brand/source/remi-logo.webp assets/brand  (needs numpy + Pillow)
# shortcut: the wordmark is cut from the composite art, so the letter tops hidden behind the mascot are
# reconstructed by hand (erase polygons); replace with a separate wordmark file from the designer when available.
import sys, numpy as np
from PIL import Image, ImageFilter, ImageDraw
src, out = sys.argv[1], sys.argv[2]
rgb = np.asarray(Image.open(src).convert('RGB')).astype(float)
bg = np.median(rgb[:50, :50].reshape(-1, 3), axis=0)
alpha = np.clip((bg[0] - rgb[..., 0]) / (bg[0] - 50), 0, 1); ink = alpha > 0.35
f = lambda a, flt: np.asarray(Image.fromarray((a * 255).astype('uint8')).filter(flt)) > 0
thick = f(f(ink, ImageFilter.MinFilter(37)), ImageFilter.MaxFilter(37)); thick[:1150] = False
L = ink & f(thick, ImageFilter.MaxFilter(9)); L[1560:] = False
L[1225:1290, 1540:1600] |= ink[1225:1290, 1540:1600]          # thin end of the "i" tail
def write(mask, name, width, erase=()):
    ys, xs = np.nonzero(mask); x1, x2, y1, y2 = xs.min() - 6, xs.max() + 6, ys.min() - 6, ys.max() + 6
    a = Image.fromarray(((alpha * mask)[y1:y2, x1:x2] * 255).astype('uint8'))
    d = ImageDraw.Draw(a)
    for poly in erase: d.polygon([(x - x1, y - y1) for x, y in poly], fill=0)
    img = Image.new('RGBA', a.size, (255, 255, 255, 0)); img.putalpha(a)
    img = Image.composite(Image.new('RGBA', a.size, (255, 255, 255, 255)), img, a); img.putalpha(a)
    h = round(a.height * width / a.width); img.resize((width, h), Image.LANCZOS).save(f'{out}/{name}.png', optimize=True)
    print(name, width, h)
keep = f(L, ImageFilter.MaxFilter(5)) & (alpha > 0.02)
ys, xs = np.nonzero(keep); ox, oy = xs.min() - 6, ys.min() - 6     # erase polygons were measured in this crop
write(keep, 'wordmark', 690, [[(ox + x, oy + y) for x, y in p] for p in (
    [(380, 0), (475, 0), (475, 110), (438, 110), (433, 95), (426, 73), (414, 50), (401, 38), (386, 29), (376, 25)],
    [(558, 95), (610, 95), (610, 138), (600, 135), (588, 129), (572, 125), (558, 123)])])
mascot = ink & ~f(L, ImageFilter.MaxFilter(7)); mascot[1300:] = False
write(f(mascot, ImageFilter.MaxFilter(5)) & (alpha > 0.02) & ~f(L, ImageFilter.MaxFilter(3)), 'mascot', 600)
lock = f(ink, ImageFilter.MaxFilter(5)) & (alpha > 0.02); lock[1565:] = False   # whole artwork minus the tagline
write(lock, 'logo', 900)
