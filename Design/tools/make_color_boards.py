"""Builds Design/<version>/color-board.png and palette.json from each version's theme tokens.

Usage (from the repo root): python3 Design/tools/make_color_boards.py   (needs Pillow)
Tokens are read straight from git, so the boards always match what each version shipped.
"""
import json, re, subprocess, tempfile, os
from PIL import Image, ImageDraw, ImageFont

VERSIONS = [
    ('version-1-original', 'Version 1', 'Original', 'origin/main', None, None),
    # Version 2's code kept version 1's palette keys ("Remi Blue" holds tomato red), so the board uses its DESIGN.md names.
    ('version-2-living-cookbook', 'Version 2', 'Living Cookbook', 'origin/version-2', 'mobile-app/assets/fonts/DMSerifDisplay-Regular.ttf',
     {'Tomato': '#B92318', 'Deep Tomato': '#752116', 'Ivory Paper': '#FFF7E8', 'Butter': '#F7CA51', 'Leafy': '#35532B', 'Ink': '#271B15'}),
    ('version-3-sip-happy', 'Version 3', 'Sip Happy', 'version-3', 'mobile-app/assets/fonts/DMSans-Display.ttf', None),
]
TOKENS = 'mobile-app/src/theme/tokens.ts'
LABEL_FONTS = ('version-3', 'mobile-app/assets/fonts/DMSans-Heading.ttf', 'mobile-app/assets/fonts/DMSans.ttf')
ROLES = ['background', 'surface', 'surfaceMuted', 'text', 'textSecondary', 'primary', 'onPrimary', 'primarySoft', 'accent',
         'hero', 'onHero', 'selectedSurface', 'border', 'warningSurface', 'successSurface', 'errorSurface']
PAIRS = [('text', 'background'), ('textSecondary', 'surface'), ('onPrimary', 'primary'), ('onHero', 'hero'), ('selectedText', 'selectedSurface')]

def git_show(ref, path):
    return subprocess.run(['git', 'show', f'{ref}:{path}'], capture_output=True, check=True).stdout

def parse(ts):
    palette = {k.strip(): v for k, v in re.findall(r"'?(\w[\w ]*?)'?:\s*'(#[0-9A-Fa-f]{6})'", ts[ts.index('palette = {'):ts.index('} as const')])}
    def resolve(v):
        v = v.strip()
        if v.startswith("'"): return v.strip("'")
        m = re.match(r"palette(?:\['(.+?)'\]|\.(\w+))", v); return palette[m.group(1) or m.group(2)]
    themes = {}
    for mode in ('light', 'dark'):
        block = re.search(mode + r":\s*\{(.*?)\n  \}", ts, re.S).group(1)
        themes[mode] = {k: resolve(v) for k, v in re.findall(r"(\w+):\s*('[^']*'|palette(?:\['[^']+'\]|\.\w+))", block)}
    return palette, themes

def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contrast(a, b):
    x, y = sorted((lum(a), lum(b)), reverse=True); return (x + 0.05) / (y + 0.05)
def ink(bg): return '#FFFFFF' if contrast('#FFFFFF', bg) >= contrast('#0E1440', bg) else '#0E1440'
def solid(h): return h if h.startswith('#') and len(h) == 7 else None

def font_file(ref, path, tmp):
    out = os.path.join(tmp, f"{ref.replace('/', '_')}-{os.path.basename(path)}")
    with open(out, 'wb') as f: f.write(git_show(ref, path))
    return out

def board(folder, number, name, ref, title_font, named, tmp):
    code_palette, themes = parse(git_show(ref, TOKENS).decode()); palette = named or code_palette
    heading = font_file(LABEL_FONTS[0], LABEL_FONTS[1], tmp); body = font_file(LABEL_FONTS[0], LABEL_FONTS[2], tmp)
    display = font_file(ref, title_font, tmp) if title_font else heading
    F = lambda p, s: ImageFont.truetype(p, s)
    light, dark = themes['light'], themes['dark']
    W, H = 1800, 1500
    img = Image.new('RGB', (W, H), light['background']); d = ImageDraw.Draw(img)
    d.text((80, 64), f'Remi · {number}', font=F(heading, 34), fill=light['textSecondary'])
    d.text((80, 104), name, font=F(display, 96), fill=light['text'])
    d.text((80, 230), f'Colour board · tokens from {ref}:{TOKENS}', font=F(body, 26), fill=light['textSecondary'])
    # Core palette
    x, y, sw = 80, 300, 260
    for label, hexv in palette.items():
        d.rounded_rectangle((x, y, x + sw, y + sw), 28, fill=hexv, outline=light['border'], width=2)
        d.text((x + 22, y + sw - 86), label, font=F(heading, 28), fill=ink(hexv))
        d.text((x + 22, y + sw - 46), hexv.upper(), font=F(body, 24), fill=ink(hexv))
        x += sw + 24
    # Theme roles
    def roles(y0, theme, bg, title):
        d.rounded_rectangle((60, y0 - 20, W - 60, y0 + 330), 36, fill=bg)
        d.text((90, y0), title, font=F(heading, 32), fill=theme['text'])
        cx, cy, cw, ch = 90, y0 + 60, 190, 116
        for i, role in enumerate(ROLES):
            hexv = solid(theme.get(role, ''))
            if not hexv: continue
            if i and i % 8 == 0: cx, cy = 90, cy + ch + 24
            d.rounded_rectangle((cx, cy, cx + cw, cy + ch), 18, fill=hexv, outline=theme['border'], width=2)
            d.text((cx + 14, cy + 14), role, font=F(heading, 20), fill=ink(hexv))
            d.text((cx + 14, cy + ch - 36), hexv.upper(), font=F(body, 20), fill=ink(hexv))
            cx += cw + 14
    roles(620, light, light['surface'], 'Light theme')
    roles(990, dark, dark['background'], 'Dark theme')
    # Contrast pairs
    y = 1370; x = 80
    d.text((x, y - 6), 'Contrast', font=F(heading, 26), fill=light['text']); x += 150
    for fg, bgk in PAIRS:
        a, b = solid(light.get(fg, '')), solid(light.get(bgk, ''))
        if not (a and b): continue
        ratio = contrast(a, b); label = f'{fg} / {bgk}  {ratio:.1f}:1'
        tw = d.textlength(label, font=F(body, 20)) + 36
        d.rounded_rectangle((x, y - 10, x + tw, y + 34), 22, fill=b, outline=light['border'], width=2)
        d.text((x + 18, y - 2), label, font=F(body, 20), fill=a); x += tw + 14
    os.makedirs(f'Design/{folder}', exist_ok=True)
    img.save(f'Design/{folder}/color-board.png', optimize=True)
    with open(f'Design/{folder}/palette.json', 'w') as f:
        json.dump({'version': number, 'name': name, 'source': f'{ref}:{TOKENS}', 'palette': palette, **({'codePalette': code_palette} if named else {}), 'themes': themes}, f, indent=2)
    print(folder, len(palette), 'palette colours')

with tempfile.TemporaryDirectory() as tmp:
    for v in VERSIONS: board(*v, tmp)
