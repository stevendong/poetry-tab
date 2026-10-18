"""Create the checked-in compact assets from preserved original art and fonts.

Requires Pillow, fonttools and brotli. Ordinary npm run pack needs only Node.js.
Usage: python scripts/compact-assets.py --originals /path/to/original-assets
Originals contain art/*.webp and fonts/MaShanZheng-Regular.ttf.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image
from fontTools import subset
from fontTools.ttLib import TTFont

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

js="""import{QUOTES}from'./extension/quotes.js';import{toTraditional,toSimplified}from'./extension/chinese.js';
const text=QUOTES.map(q=>q.lines.join('')+q.title+q.author).join('');
process.stdout.write([...new Set(text+toTraditional(text)+toSimplified(text)+'，。！？、：《》（）·—… ')].sort().join(''));"""
text=subprocess.check_output(['node','--input-type=module','-e',js],cwd=root,text=True)
original=args.originals/'fonts/MaShanZheng-Regular.ttf'
font=TTFont(original)
options=subset.Options();options.desubroutinize=True
sub=subset.Subsetter(options=options);sub.populate(text=text);sub.subset(font)
font.flavor='woff2';font.recalcTimestamp=False
destination=assets/'fonts/MaShanZheng-subset.woff2';font.save(destination)
provenance_path=assets/'fonts/MaShanZheng.provenance.json'
provenance=json.loads(provenance_path.read_text())
provenance.update({'file':destination.name,'originalSha256':sha(original.read_bytes()),'sha256':sha(destination.read_bytes()),'coverage':'WOFF2 subset for the display lines, titles and authors of all 17 offline poems, including Simplified/Traditional conversions. Other characters use local Kai or serif fallback fonts.','glyphCount':len(font.getBestCmap()),'subsetCharacters':text})
provenance_path.write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
# Remove only known runtime originals after preserving them in --originals.
for name in ['MaShanZheng-Regular.ttf','poetry-serif.ttf','provenance.json','OFL.txt']:
    target=assets/'fonts'/name
    if target.exists():
        assert (args.originals/'fonts'/name).read_bytes()==target.read_bytes()
        target.unlink()
print(json.dumps({'artBytes':sum((assets/'art'/p['file']).stat().st_size for p in prompts),'brushBytes':destination.stat().st_size}))
