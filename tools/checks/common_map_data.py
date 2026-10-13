#!/usr/bin/env python3
"""Check common-viewer catalogs against exported map/layout geometry and image assets.
No browser/gameplay claims. Requires npm run maps:images and the source exports.
"""
import base64
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
images=0;maps=0
for game,directory,world_name in [('firered','fr','kanto'),('emerald','emerald','hoenn')]:
    root=ROOT/f'public/map-viewer/{game}'
    doc=json.loads((root/'catalog.json').read_text())
    source=ROOT/f'public/{directory}'
    index=json.loads((source/'maps.json').read_text())
    world=json.loads((ROOT/f'public/viewer/{world_name}.json').read_text())
    assert set(doc['maps'])==set(index['maps']), game+' map coverage'
    assert doc['_meta']['mapsIndexSha256']==hashlib.sha256((source/'maps.json').read_bytes()).hexdigest(),game+' stale index'
    assert {r['id'] for r in doc['world']['maps']}==set(world['maps']),game+' world coverage'
    minx=min(m['x'] for m in world['maps'].values());miny=min(m['y'] for m in world['maps'].values())
    for r in doc['world']['maps']:
        m=world['maps'][r['id']]
        assert (r['x'],r['y'],r['w'],r['h'])==((m['x']-minx)*16,(m['y']-miny)*16,m['width']*16,m['height']*16)
    for id,m in doc['maps'].items():
        header=json.loads((source/f'maps/{id}.json').read_text())
        layout=json.loads((source/f"layouts/{header['layout']}.json").read_text())
        assert (m['width'],m['height'])==(layout['width']*16,layout['height']*16)
        assert len(base64.b64decode(layout['blocks']))==layout['width']*layout['height']*2
        for key in ['image','sprites','collision']:
            if m[key]:
                with Image.open(root/m[key]) as image:assert image.size==(m['width'],m['height']), (id,key)
                images+=1
        maps+=1
    for c in doc['world']['chunks']:
        assert c['w']<=1024 and c['h']<=1024
        with Image.open(root/c['file']) as image:assert image.size==(c['w'],c['h'])
        images+=1
    for file in doc['world']['overviews'].values():
        with Image.open(root/file) as image:assert max(image.size)<=2048
        images+=1
for game in ['hns','crystal']:
    files=list((ROOT/f'public/map-viewer/{game}/world').rglob('*.png'))
    assert files,game+' missing reduced world images'
    for p in files:
        with Image.open(p) as image:assert max(image.size)<=2048
        images+=1
print(f'PASS: {maps} GBA maps retain source coverage and geometry; {images} image references, world placements and bounded overview dimensions checked.')
