#!/usr/bin/env python3
"""Export pinned Heart & Soul maps to public/hns, independently of game data.

npm run refs:fetch -- pokemon-hns && npm run hns:maps
Reuses the decomp tileset reader, retaining original u16 attributes. Static BG
composition follows HnS fieldmap.h (640 tiles/metatiles, 7 primary palettes),
8x8 4bpp tiles, tilemap flips and transparent index 0. No scripts are executed.
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("hns_refs_common", ROOT / "tools/refs/common.py")
refs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refs)
sys.path.insert(0, str(ROOT / "tools/decomp"))
from common import write_json
from step_tilesets import export_tilesets

OUT = ROOT / "public/hns"
STAGE = ROOT / ".decomp-build/hns-maps"
TILE = 16
CHUNK = 1024


from map_images import MapRenderer


def place(maps: dict, start: str) -> tuple[dict, list]:
    positions = {start: (0, 0)}
    queue = deque([start])
    conflicts = []
    while queue:
        name = queue.popleft()
        a = maps[name]
        x, y = positions[name]
        for c in a['connections']:
            direction, target, offset = c['direction'], c['map'], c['offset']
            if direction not in ('up', 'down', 'left', 'right'):
                continue
            if target not in maps:
                raise ValueError(f'{name}: missing connection target {target}')
            b = maps[target]
            desired = {'up': (x+offset, y-b['h']), 'down': (x+offset, y+a['h']),
                       'left': (x-b['w'], y+offset), 'right': (x+a['w'], y+offset)}[direction]
            if target not in positions:
                positions[target] = desired
                queue.append(target)
            elif positions[target] != desired:
                conflicts.append({'from': name, 'to': target, 'placed': positions[target], 'wanted': desired})
    return positions, conflicts


def main():
    source = refs.source_path('pokemon-hns')
    # Source ABI must be reviewed before accepting a different pin.
    header = (source/'include/fieldmap.h').read_text()
    for name, value in [('NUM_TILES_IN_PRIMARY', 640), ('NUM_METATILES_IN_PRIMARY', 640), ('NUM_PALS_IN_PRIMARY', 7)]:
        if f'#define {name} {value}\n' not in header:
            raise ValueError(f'unsupported HnS profile: {name}')
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    export_tilesets(source=source, output=STAGE, normalize_attributes=False)
    tilesets = {p.stem: json.loads(p.read_text()) for p in (STAGE/'tilesets').glob('*.json')}
    layouts = {l['id']: l for l in json.loads((source/'data/layouts/layouts.json').read_text())['layouts']}
    raw = {}
    duplicate_folders = []
    for p in sorted((source/'data/maps').glob('*/map.json')):
        m = json.loads(p.read_text())
        if m['id'] in raw:
            # map_data_rules.mk resolves group names to a matching directory.
            canonical = source/'data/maps'/m['name']/'map.json'
            if not canonical.exists():
                raise ValueError(f"ambiguous duplicate map {m['id']}")
            raw[m['id']] = json.loads(canonical.read_text())
            duplicate_folders.append({'id': m['id'], 'selected': str(canonical.relative_to(source))})
        else:
            raw[m['id']] = m
    by_name = {m['name']: m for m in raw.values()}
    renderers = {}
    rendered = set()
    rejected = {}
    maps = {}
    (STAGE/'images').mkdir()
    for name, m in sorted(raw.items()):
        layout = layouts[m['layout']]
        pair = (layout['primary_tileset'], layout['secondary_tileset'])
        if pair not in renderers:
            renderers[pair] = MapRenderer(*(tilesets[t] for t in pair))
        image_path = f"images/{layout['id']}.png"
        if layout['id'] not in rendered and layout['id'] not in rejected:
            try:
                renderers[pair].map(layout, source).save(STAGE/image_path, optimize=True)
            except ValueError as e:
                rejected[layout['id']] = str(e)
            else:
                rendered.add(layout['id'])
        events = by_name[m['shared_events_map']] if 'shared_events_map' in m else m
        maps[name] = {'id': name, 'name': m['name'], 'w': layout['width'], 'h': layout['height'],
                      'image': image_path if layout['id'] in rendered else None, 'unavailable': rejected.get(layout['id']), 'layout': m['layout'], 'primary': pair[0], 'secondary': pair[1],
                      'type': m['map_type'], 'section': m['region_map_section'], 'music': m['music'],
                      'connections': m.get('connections') or [], 'warps': events.get('warp_events', []),
                      'objects': events.get('object_events', []), 'coords': events.get('coord_events', []),
                      'bgs': events.get('bg_events', [])}
    positions, conflicts = place(maps, 'MAP_NEW_BARK_TOWN')
    missing_world = [n for n in positions if not maps[n]['image']]
    if 'MAP_NEW_BARK_TOWN' in missing_world:
        raise ValueError('New Bark Town did not render')
    minx = min(x for x,y in positions.values()); miny = min(y for x,y in positions.values())
    width = max(x+maps[n]['w'] for n,(x,y) in positions.items())-minx
    height = max(y+maps[n]['h'] for n,(x,y) in positions.items())-miny
    positioned = [{'id': n, 'x': (x-minx)*TILE, 'y': (y-miny)*TILE,
                   'w': maps[n]['w']*TILE, 'h': maps[n]['h']*TILE} for n,(x,y) in sorted(positions.items())]
    worlddir = STAGE/'world'; worlddir.mkdir()
    # Composite one bounded chunk at a time, rather than allocate a full world bitmap.
    chunks = []
    for y in range(0, height*TILE, CHUNK):
        for x in range(0, width*TILE, CHUNK):
            visible = [m for m in positioned if m['x'] < x+CHUNK and m['y'] < y+CHUNK and m['x']+m['w'] > x and m['y']+m['h'] > y]
            if not visible:
                continue
            w, h = min(CHUNK, width*TILE-x), min(CHUNK, height*TILE-y)
            chunk = Image.new('RGBA', (w,h))
            for m in visible:
                if not maps[m['id']]['image']: continue
                with Image.open(STAGE/maps[m['id']]['image']) as image:
                    chunk.paste(image, (m['x']-x, m['y']-y))
            file = f'world/{x}_{y}.png'; chunk.save(STAGE/file, optimize=True)
            chunks.append({'x': x, 'y': y, 'w': w, 'h': h, 'file': file})
    scale = min(1, 4096/max(width*TILE, height*TILE))
    overview = Image.new('RGBA', (round(width*TILE*scale), round(height*TILE*scale)))
    for m in positioned:
        if not maps[m['id']]['image']: continue
        with Image.open(STAGE/maps[m['id']]['image']) as image:
            thumb = image.resize((max(1, round(m['w']*scale)), max(1, round(m['h']*scale))), Image.Resampling.NEAREST)
            overview.paste(thumb, (round(m['x']*scale), round(m['y']*scale)))
    overview.save(worlddir/'overview.png', optimize=True)
    meta = {'source': refs.SOURCES['pokemon-hns']['repo'], 'commit': refs.SOURCES['pokemon-hns']['commit'],
            'generator': 'tools/viewer/hns_maps.py', 'profile': {'primaryTiles': 640, 'primaryMetatiles': 640, 'primaryPalettes': 7},
            'limitations': ['Static source tiles; no tile animation, time-of-day palette changes or scripts.',
                           'Object events are markers; NPC/follower sprites are not rendered.',
                           'All source maps include inherited Emerald maps and special/development areas.',
                           'World placements follow source connections; conflicts and overlapping variants are retained.'],
            'rejectedLayouts': rejected, 'duplicateMapIds': duplicate_folders,
            'credits': 'https://github.com/PokemonHnS-Development/pokemonHnS#credits'}
    write_json(STAGE/'maps.json', {'_meta': meta, 'maps': maps, 'world': {'w': width*TILE, 'h': height*TILE, 'maps': positioned, 'chunks': chunks, 'overview': 'world/overview.png', 'conflicts': conflicts, 'unavailable': missing_world}})
    # Publish after every map is rendered or explicitly rejected; no partial catalog replaces the previous one.
    OUT.mkdir(parents=True, exist_ok=True)
    for folder in ['images','world','tilesets']:
        if (OUT/folder).exists(): shutil.rmtree(OUT/folder)
        shutil.copytree(STAGE/folder, OUT/folder)
    shutil.copy2(STAGE/'maps.json', OUT/'maps.json')
    shutil.copy2(STAGE/'tilesets.json', OUT/'tilesets.json')
    shutil.copy2(source/'README.md', OUT/'SOURCE-README.md')
    print(f'{len(maps)} maps, {len(rendered)} rendered layouts, {len(rejected)} rejected layouts, {len(positions)} connected maps, {len(chunks)} chunks, {len(conflicts)} connection conflicts')


if __name__ == '__main__':
    main()
