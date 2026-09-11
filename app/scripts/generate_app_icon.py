from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
LOGO = ASSETS / 'logo.png'
ICON = ASSETS / 'app.ico'

if not LOGO.exists():
    raise SystemExit('missing official asset: assets/logo.png')

im = Image.open(LOGO).convert('RGBA')
im.save(
    ICON,
    format='ICO',
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],
)
print('generated', ICON)
