# Gera os icones do app no mundo caixas de fosforo.
import os, re, sys
from PIL import Image, ImageDraw, ImageFilter
root = sys.argv[1]
S = 1024
def lerp(a, b, t): return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))
GOLD_HI=(0xE5,0xC4,0x78); GOLD_SOFT=(0x8C,0x6F,0x3D)

from PIL import ImageFont
FONT = root + '/assets/fonts/Yellowtail-400.ttf'
OX=(0x6B,0x16,0x22); FOIL=(0xD9,0xB2,0x5A); STRIKER=(0x5E,0x58,0x52); INK=(0x12,0x0E,0x0C)

def render(size, pad, rounded):
    # Icone de caixa de fosforo: capa vinho, o I de Intriga em script
    # dourado e a lixa cinza embaixo.
    big = S
    img = Image.new('RGBA', (big, big), (0,0,0,0))
    mask = Image.new('L', (big, big), 0)
    md = ImageDraw.Draw(mask)
    if rounded: md.rounded_rectangle([0,0,big-1,big-1], radius=int(big*0.22), fill=255)
    else: md.rectangle([0,0,big,big], fill=255)
    cover = Image.new('RGBA', (big,big), OX+(255,))
    cd = ImageDraw.Draw(cover)
    sy = int(big*(0.80 if pad < 0.15 else 0.76))
    cd.rectangle([0, sy, big, big], fill=STRIKER+(255,))
    for x in range(-big, big, max(2, big//90)):
        cd.line([(x, sy), (x+ (big-sy), big)], fill=(0x52,0x4D,0x48,255), width=max(1,big//300))
    cd.rectangle([0, sy-max(2,big//100), big, sy], fill=INK+(255,))
    img.paste(cover, (0,0), mask)
    # Um palito em pe: o "I" de Intriga.
    inner = big*(1-2*pad)
    d = ImageDraw.Draw(img)
    sw = inner*0.085; top = big*0.5 - inner*0.34; bot = sy - inner*0.06
    cx = big/2
    d.rectangle([cx-sw/2, top+inner*0.08, cx+sw/2, bot], fill=(0xE8,0xD3,0xA8,255))
    hw = sw*1.55; hh = inner*0.17
    d.rounded_rectangle([cx-hw/2, top, cx+hw/2, top+hh], radius=int(hw/2), fill=(0xB8,0x32,0x2A,255))
    return img.resize((size,size), Image.LANCZOS)

def save(img, path, opaque=False):
    if opaque:
        bg = Image.new('RGB', img.size, (0x6B,0x16,0x22)); bg.paste(img, mask=img.split()[3]); img = bg
    img.save(path)

# Android
for d,s in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    save(render(s, 0.1, True), f'{root}/android/app/src/main/res/mipmap-{d}/ic_launcher.png')
# iOS (sem transparência, o sistema arredonda)
ios = f'{root}/ios/Runner/Assets.xcassets/AppIcon.appiconset'
for f in os.listdir(ios):
    m = re.match(r'Icon-App-([\d.]+)x[\d.]+@(\d)x\.png', f)
    if m: save(render(round(float(m[1])*int(m[2])), 0.12, False), f'{ios}/{f}', opaque=True)
# Web
save(render(192, 0.1, True), f'{root}/web/icons/Icon-192.png')
save(render(512, 0.1, True), f'{root}/web/icons/Icon-512.png')
save(render(192, 0.2, False), f'{root}/web/icons/Icon-maskable-192.png', opaque=True)
save(render(512, 0.2, False), f'{root}/web/icons/Icon-maskable-512.png', opaque=True)
save(render(64, 0.04, True), f'{root}/web/favicon.png')
render(512, 0.1, True).save(sys.argv[2])
