#!/usr/bin/env python3
"""Prepare static FireRed/Emerald images for the common viewer, from existing exports.
No game data is modified. Outputs public/map-viewer/{firered,emerald}; details
remain in public/{fr,emerald}/maps and are fetched only when requested.
Usage: npm run maps:images [-- firered|emerald]
"""
from __future__ import annotations
import base64
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
from map_images import MapRenderer, words

ROOT = Path(__file__).resolve().parents[2]
CHUNK = 1024
CONFIG = {'firered': ('fr', 'kanto', 640, 7), 'emerald': ('emerald', 'hoenn', 512, 6)}


def write(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))


def export(game):
    directory, world_name, count, palettes = CONFIG[game]
    source = ROOT/'public'/directory
    index = json.loads((source/'maps.json').read_text())
    world = json.loads((ROOT/f'public/viewer/{world_name}.json').read_text())
    objects = json.loads((source/'objects.json').read_text())['gfx']
    out = ROOT/'public/map-viewer'/game
    stage = ROOT/'.decomp-build/map-viewer'/game
    if stage.exists(): shutil.rmtree(stage)
    stage.mkdir(parents=True)
    tilesets = {}; renderers = {}; layouts = {}; maps = {}; unresolved = []
    for folder in ['images','sprites','collision','world']: (stage/folder).mkdir()
    for name, entry in sorted(index['maps'].items()):
        m = json.loads((source/f'maps/{name}.json').read_text())
        lid = entry['layout']
        if lid not in layouts:
            layout = json.loads((source/f'layouts/{lid}.json').read_text())
            layouts[lid] = layout
            pair = (layout['primary'], layout['secondary'])
            for symbol in pair:
                if symbol not in tilesets: tilesets[symbol] = json.loads((source/f'tilesets/{symbol}.json').read_text())
            if pair not in renderers: renderers[pair] = MapRenderer(*(tilesets[t] for t in pair),primary_count=count,primary_palettes=palettes,backdrop=(0,0,0,255),reserved_palettes=True)
            raw = base64.b64decode(layout['blocks'])
            renderers[pair].blocks(layout['width'],layout['height'],raw).save(stage/f'images/{lid}.png',optimize=True)
            mask = Image.new('RGBA',(layout['width']*16,layout['height']*16))
            draw = ImageDraw.Draw(mask)
            for i, b in enumerate(words(raw)):
                if b & 0xc00:
                    x,y = (i%layout['width'])*16,(i//layout['width'])*16
                    draw.rectangle((x,y,x+15,y+15),fill=(255,64,64,90))
            mask.save(stage/f'collision/{lid}.png',optimize=True)
        l = layouts[lid]
        sprite_layer = Image.new('RGBA',(l['width']*16,l['height']*16))
        sprites = 0
        for obj in m['objects']:
            info = objects.get(str(obj.get('graphicsId')))
            if not info or not info['frames'] or obj.get('clone'):
                unresolved.append({'map':name,'localId':obj.get('localId'),'graphics':obj.get('graphicsName')});continue
            movement = obj.get('movementType',0)
            frame = {8:1,9:2,10:2}.get(movement,0)
            if frame>=len(info['frames']): frame=0
            file, index_frame = info['frames'][frame]
            with Image.open(source/file) as sheet:
                w,h = info['width'],info['height']
                sprite = sheet.crop((index_frame*w,0,(index_frame+1)*w,h)).convert('RGBA')
                if movement==10: sprite=ImageOps.mirror(sprite)
                sprite_layer.alpha_composite(sprite,(obj['x']*16-(w-16)//2,obj['y']*16-(h-16)))
                sprites+=1
        sprite_file = f'sprites/{name}.png' if sprites else None
        if sprites: sprite_layer.save(stage/sprite_file,optimize=True)
        maps[name] = {'id':name,'name':entry['name'],'width':l['width']*16,'height':l['height']*16,
                      'image':f'images/{lid}.png','sprites':sprite_file,'collision':f'collision/{lid}.png',
                      'detail':f'/{directory}/maps/{name}.json','type':m['mapType'],'section':entry['section'],
                      'primary':l['primary'],'secondary':l['secondary']}
    minx=min(m['x'] for m in world['maps'].values());miny=min(m['y'] for m in world['maps'].values())
    rects=[{'id':n,'x':(m['x']-minx)*16,'y':(m['y']-miny)*16,'w':m['width']*16,'h':m['height']*16} for n,m in sorted(world['maps'].items())]
    width=world['world']['width']*16;height=world['world']['height']*16;chunks=[]
    for y in range(0,height,CHUNK):
        for x in range(0,width,CHUNK):
            near=[m for m in rects if m['x']<x+CHUNK and m['y']<y+CHUNK and m['x']+m['w']>x and m['y']+m['h']>y]
            if not near: continue
            w,h=min(CHUNK,width-x),min(CHUNK,height-y)
            for kind in ['image','sprites','collision']:
                chunk=Image.new('RGBA',(w,h))
                for m in near:
                    file=maps[m['id']][kind]
                    if file:
                        with Image.open(stage/file) as image:chunk.paste(image,(m['x']-x,m['y']-y))
                file=f'world/{kind}_{x}_{y}.png';chunk.save(stage/file,optimize=True)
                chunks.append({'x':x,'y':y,'w':w,'h':h,'file':file,'layer':kind})
    scale=min(1,2048/max(width,height));overviews={}
    for kind in ['image','sprites','collision']:
        overview=Image.new('RGBA',(round(width*scale),round(height*scale)))
        for m in rects:
            file=maps[m['id']][kind]
            if file:
                with Image.open(stage/file) as image:
                    overview.paste(image.resize((max(1,round(m['w']*scale)),max(1,round(m['h']*scale))),Image.Resampling.NEAREST),(round(m['x']*scale),round(m['y']*scale)))
        file=f'world/overview_{kind}.png';overview.save(stage/file,optimize=True);overviews[kind]=file
    write(stage/'catalog.json',{'_meta':{'generator':'tools/viewer/gba_maps.py','sourceCommit':world['_meta']['decomp_commit'],
        'mapsIndexSha256':hashlib.sha256((source/'maps.json').read_bytes()).hexdigest(),'profile':{'primaryTiles':count,'primaryPalettes':palettes},
        'unresolvedObjects':unresolved,'limitations':['Static default tiles/palettes; no animation or game scripts.','Sprites are source templates, not current save state.']},
        'maps':maps,'world':{'w':width,'h':height,'origin':world['world']['origin'],'maps':rects,'chunks':chunks,'overviews':overviews,'conflicts':world['conflicts']}})
    out.mkdir(parents=True,exist_ok=True)
    for folder in ['images','sprites','collision','world']:
        if (out/folder).exists():shutil.rmtree(out/folder)
        shutil.copytree(stage/folder,out/folder)
    shutil.copy2(stage/'catalog.json',out/'catalog.json')
    print(f'{game}: {len(maps)} maps, {len(layouts)} layouts, {len(rects)} connected maps, {len(chunks)} world chunks; {len(unresolved)} unresolved object templates')


def mipmaps(game):
    if game=='hns':
        paths=[ROOT/'public/hns/world/overview.png']
    else:
        paths=list((ROOT/'public/crystal/world').glob('*/overview*.png'))
    if not paths: raise ValueError(f'missing {game} source world images')
    for path in sorted(paths):
        target=ROOT/'public/map-viewer'/game/path.relative_to(ROOT/'public'/game)
        target.parent.mkdir(parents=True,exist_ok=True)
        with Image.open(path) as image:
            scale=min(1,2048/max(image.size))
            image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.NEAREST).save(target,optimize=True)
    print(f'{game}: {len(paths)} reduced world images')


if __name__=='__main__':
    for game in sys.argv[1:] or ['firered','emerald','hns','crystal']:
        if game in CONFIG: export(game)
        elif game in ['hns','crystal']: mipmaps(game)
        else: raise SystemExit(f'unsupported game: {game}')
