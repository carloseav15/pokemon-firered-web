#!/usr/bin/env python3
"""Validate HnS source-to-PNG samples without decoding the exported 4bpp data.
Checks the pinned source, source PNG tile coordinates, palette selection, flips,
block geometry and navigable destinations. Requires npm run hns:maps.
"""
import importlib.util
import json
import re
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('hns_source', ROOT/'tools/refs/common.py')
refs = importlib.util.module_from_spec(spec); spec.loader.exec_module(refs)
source = refs.source_path('pokemon-hns')
output = ROOT/'public/hns'
doc = json.loads((output/'maps.json').read_text())
assert doc['_meta']['commit'] == refs.SOURCES['pokemon-hns']['commit']
layouts = {l['id']:l for l in json.loads((source/'data/layouts/layouts.json').read_text())['layouts']}
headers = (source/'src/data/tilesets/headers.h').read_text()
graphics = (source/'src/graphics.c').read_text()+(source/'src/data/tilesets/graphics.h').read_text()
metatiles = (source/'src/data/tilesets/metatiles.h').read_text()


def palette(path):
    lines = path.read_text().splitlines()
    assert lines[0] == 'JASC-PAL'
    return [tuple(int(v)&248 for v in line.split()) for line in lines[3:19]]


def tileset(symbol):
    body = re.search(r'const struct Tileset '+symbol+r' =\s*\{(.*?)\};', headers, re.S)[1]
    fields = dict(re.findall(r'\.(\w+)\s*=\s*([^,\n]+)',body))
    tiles_name = fields['tiles'].strip()
    folder = re.search(tiles_name+r'\[\] = INCBIN_U32\("([^"]+)/tiles\.4bpp', graphics)[1]
    image = Image.open(source/folder/'tiles.png')
    pal_name = fields['palettes'].strip()
    pal_body = re.search(pal_name+r'\[\]\[16\] =\s*\{(.*?)\};',graphics,re.S)[1]
    pals = [palette(source/(p+'.pal')) for p in re.findall(r'INCBIN_U16\("([^"]+)\.gbapal"\)',pal_body)]
    meta_name = fields['metatiles'].strip()
    path = re.search(meta_name+r'\[\] = INCBIN_U16\("([^"]+)"\)',metatiles)[1]
    data = (source/path).read_bytes()
    return image, pals, struct.unpack('<'+str(len(data)//2)+'H',data)

samples = 0
for name in ['MAP_NEW_BARK_TOWN','MAP_GOLDENROD_CITY','MAP_ECRUTEAK_CITY','MAP_UNION_CAVE_1F','MAP_NEW_BARK_TOWN_LAB']:
    m = doc['maps'][name]; assert m['image'], (name,m['unavailable'])
    layout = layouts[m['layout']]
    primary = tileset(m['primary']); secondary = tileset(m['secondary'])
    palettes = primary[1][:7]+secondary[1][7:13]
    data = (source/layout['blockdata_filepath']).read_bytes()
    blocks = struct.unpack('<'+str(len(data)//2)+'H',data)
    with Image.open(output/m['image']) as image:
        assert image.size == (m['w']*16,m['h']*16)
        # Deterministic spread across the source map, not prepared fixtures.
        for index in sorted(set(range(0,len(blocks),max(1,len(blocks)//37)))):
            number = blocks[index]&1023
            bank,local = (primary,number) if number<640 else (secondary,number-640)
            entries = bank[2][local*8:local*8+8]
            for y in range(16):
                for x in range(16):
                    color = (*palettes[0][0],255)
                    for layer in (0,4):
                        entry = entries[layer+(y//8)*2+x//8]
                        tile = entry&1023; png = primary[0] if tile<640 else secondary[0]
                        tile = tile if tile<640 else tile-640
                        sx = 7-x%8 if entry&1024 else x%8
                        sy = 7-y%8 if entry&2048 else y%8
                        tx = (tile%(png.width//8))*8+sx
                        ty = (tile//(png.width//8))*8+sy
                        value = png.getpixel((tx,ty)) if ty<png.height else 0
                        if value: color = (*palettes[entry>>12][value],255)
                    assert image.getpixel(((index%m['w'])*16+x,(index//m['w'])*16+y)) == color, (name,index,x,y)
                    samples += 1
known = set(doc['maps'])
missing = []
for m in doc['maps'].values():
    for c in m['connections']:
        if c['map'] not in known: missing.append((m['id'],c['map']))
    if m['image']:
        assert (output/m['image']).exists()
assert not missing, missing[:10]
for c in doc['world']['chunks']:
    with Image.open(output/c['file']) as image: assert image.size==(c['w'],c['h'])
print(f'PASS: {samples} source PNG pixels across 5 maps; catalog images, chunk geometry and connection targets. No ROM/browser parity claim.')
