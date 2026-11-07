# Builds the app icons from the logo artwork: the chef's hat and face, cobalt on lemon, rising from the bottom edge.
# Usage: python3 scripts/make-app-icons.py   (from mobile-app/, needs numpy + Pillow)
# Writes assets/remi.icon (iOS Icon Composer bundle), assets/images/icon.png, the Android adaptive layers and favicon.png.
import json, os, numpy as np
from PIL import Image, ImageFilter

LEMON, COBALT = (248, 228, 92), (23, 52, 190)
rgb = np.asarray(Image.open('assets/brand/source/remi-logo.webp').convert('RGB')).astype(float)
bg = np.median(rgb[:50, :50].reshape(-1, 3), axis=0)
alpha = np.clip((bg[0] - rgb[..., 0]) / (bg[0] - 50), 0, 1); alpha[alpha < 0.15] = 0   # drop paper texture
# Hat + face only (no spoon, steam or arms); strokes thickened so they survive at 60 px.
art = Image.fromarray((alpha * 255).astype('uint8')).crop((762, 190, 1335, 905))
art = art.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1.2))

def layer(height, bottom, color=COBALT):
    """1024x1024 transparent layer with the art `height` px tall, its open bottom at y=`bottom`."""
    w = round(art.width * height / art.height); m = art.resize((w, height), Image.LANCZOS)
    out = Image.new('RGBA', (1024, 1024), color + (0,)); ink = Image.new('RGBA', m.size, color + (255,)); ink.putalpha(m)
    out.alpha_composite(ink, ((1024 - w) // 2, bottom - height)); return out

def flat(lyr):
    out = Image.new('RGBA', (1024, 1024), LEMON + (255,)); out.alpha_composite(lyr); return out.convert('RGB')

ios = layer(800, 1024)
os.makedirs('assets/remi.icon/Assets', exist_ok=True)
ios.save('assets/remi.icon/Assets/chef.png', optimize=True)
srgb = lambda c: 'srgb:' + ','.join(f'{v / 255:.5f}' for v in c) + ',1.00000'
json.dump({
    'fill': {'solid': srgb(LEMON)},
    'groups': [{'layers': [{'image-name': 'chef.png', 'name': 'chef'}], 'shadow': {'kind': 'neutral', 'opacity': 0.5},
                'translucency': {'enabled': False, 'value': 0.5}}],
    'supported-platforms': {'circles': ['watchOS'], 'squares': 'shared'},
}, open('assets/remi.icon/icon.json', 'w'), indent=2)
flat(ios).save('assets/images/icon.png', optimize=True)
flat(ios).resize((48, 48), Image.LANCZOS).save('assets/images/favicon.png', optimize=True)
# Android adaptive icons show only the centre 2/3 (y 171-853), so the art is smaller and its cut edge sits just below that.
android = layer(600, 900)
android.save('assets/images/android-icon-foreground.png', optimize=True)
Image.new('RGB', (1024, 1024), LEMON).save('assets/images/android-icon-background.png', optimize=True)
mono = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0)); mono.putalpha(android.split()[3]); mono.save('assets/images/android-icon-monochrome.png', optimize=True)
print('icons written')
