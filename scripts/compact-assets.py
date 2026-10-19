"""Create the checked-in compact assets from preserved original art.

Requires Pillow. Ordinary npm run pack needs only Node.js.
Usage: python scripts/compact-assets.py --originals /path/to/original-assets
Originals contain art/*.webp.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--originals',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
assets=root/'extension/assets'
assert args.originals.resolve()!=assets.resolve(), 'Preserve originals outside the runtime assets'
sha=lambda value: hashlib.sha256(value).hexdigest()
prompts=json.loads((assets/'art/prompts.json').read_text())
for prompt in prompts:
    source=args.originals/'art'/prompt['file']
    image=Image.open(source).convert('RGB')
    image.thumbnail((640,10000),Image.Resampling.LANCZOS)
    destination=assets/'art'/prompt['file']
    image.save(destination,format='WEBP',quality=20,method=6)
    prompt['derivative']={'method':'WebP resized without cropping','quality':20,'width':image.width,'height':image.height,'originalSha256':sha(source.read_bytes()),'sha256':sha(destination.read_bytes())}
(assets/'art/prompts.json').write_text(json.dumps(prompts,ensure_ascii=False,indent=2)+'\n')

print(json.dumps({'artBytes':sum((assets/'art'/p['file']).stat().st_size for p in prompts)}))
