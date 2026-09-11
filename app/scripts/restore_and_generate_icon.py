from pathlib import Path
import base64
from io import BytesIO
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
SOURCE = ASSETS / 'logo.base64'
LOGO = ASSETS / 'logo.png'
ICON = ASSETS / 'app.ico'

if not SOURCE.exists():
    raise SystemExit('missing deterministic source: assets/logo.base64')

payload = ''.join(SOURCE.read_text(encoding='utf-8').split())
try:
    raw = base64.b64decode(payload, validate=True)
except Exception as exc:
    raise SystemExit(f'invalid base64 logo source: {exc}')

# Validate the restored bytes before replacing the runtime logo.
try:
    probe = Image.open(BytesIO(raw))
    probe.verify()
except Exception as exc:
    raise SystemExit(f'invalid restored PNG: {exc}')

LOGO.write_bytes(raw)
im = Image.open(LOGO).convert('RGBA')

if im.width < 256 or im.height < 256:
    scale = max(256 / im.width, 256 / im.height)
    target = (max(256, round(im.width * scale)), max(256, round(im.height * scale)))
    im = im.resize(target, Image.Resampling.LANCZOS)

im.save(
    ICON,
    format='ICO',
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],
)

print('restored logo:', Image.open(LOGO).size)
print('generated icon canvas:', im.size)
print('generated', ICON)
