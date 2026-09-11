from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
LOGO = ASSETS / 'logo.png'
ICON = ASSETS / 'app.ico'

if not LOGO.exists():
    raise SystemExit('missing official asset: assets/logo.png')

im = Image.open(LOGO).convert('RGBA')

# electron-builder requires the Windows icon to contain a 256x256 frame.
# Keep the official logo artwork unchanged; only upscale the raster source when
# an earlier runtime copy is smaller than 256px.
if im.width < 256 or im.height < 256:
    scale = max(256 / im.width, 256 / im.height)
    target = (max(256, round(im.width * scale)), max(256, round(im.height * scale)))
    im = im.resize(target, Image.Resampling.LANCZOS)

im.save(
    ICON,
    format='ICO',
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],
)
print('logo source size:', Image.open(LOGO).size)
print('generated icon canvas:', im.size)
print('generated', ICON)
