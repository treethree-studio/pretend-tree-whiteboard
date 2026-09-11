from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)

S = 1024
im = Image.new('RGBA', (S, S), (251, 251, 250, 255))
d = ImageDraw.Draw(im)
sc = 4

def bezier(p0, p1, p2, p3, n=80):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]
        pts.append((x, y))
    return pts

pts = []
pts += bezier((128*sc,44*sc),(91*sc,44*sc),(72*sc,78*sc),(72*sc,112*sc),60)
pts += bezier((72*sc,112*sc),(72*sc,153*sc),(97*sc,179*sc),(128*sc,198*sc),60)[1:]
pts += bezier((128*sc,198*sc),(159*sc,179*sc),(184*sc,153*sc),(184*sc,112*sc),60)[1:]
pts += bezier((184*sc,112*sc),(184*sc,78*sc),(165*sc,44*sc),(128*sc,44*sc),60)[1:]
d.polygon(pts, fill=(29,29,31,255))
d.rounded_rectangle((122*sc,76*sc,134*sc,214*sc), radius=6*sc, fill=(29,29,31,255))
white = (251,251,250,255)
d.line([(128*sc,132*sc),(105*sc,122*sc),(89*sc,107*sc),(78*sc,90*sc)], fill=white, width=7*sc, joint='curve')
d.line([(128*sc,150*sc),(151*sc,137*sc),(168*sc,122*sc),(177*sc,103*sc)], fill=white, width=7*sc, joint='curve')

im = im.resize((256,256), Image.Resampling.LANCZOS)
im.save(ASSETS / 'logo.png', optimize=True)
im.save(ASSETS / 'app.ico', format='ICO', sizes=[(256,256)])
print('generated', ASSETS / 'logo.png')
print('generated', ASSETS / 'app.ico')
