"""Source-data candidates for complete avatar occlusion; not proof of reachability.
Read exported BG layer attributes, 4bpp transparency and original idle avatar PNGs.
field_camera.c DrawMetatile puts NORMAL/SPLIT upper tiles on BG2 (priority 1).
Scope: connected FireRed maps, non-edge collision-free cells, priority-2 elevations,
Red/Leaf standing frames in four directions. No mutations or gameplay preparation.
"""
import json,base64,struct,functools
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]/'public/fr'
def read(p):return json.loads(p.read_text())
def nums(s,size):
 b=base64.b64decode(s);return struct.unpack('<'+('H' if size==2 else 'I')*(len(b)//size),b)
priorities=read(root/'cdata/event_object_movement.json')['defs']['sElevationToPriority']['value']
index=read(root.parent/'viewer/kanto.json');queue=list(index['maps']);seen=set();maps=[]
while queue:
 mid=queue.pop()
 if mid in seen:continue
 seen.add(mid);m=read(root/'maps'/f'{mid}.json');maps.append(m)
 queue += [w['destMap'] for w in m['warps'] if w['destMap']!='MAP_DYNAMIC']+[c['map'] for c in m['connections']]
# FireRed include/fieldmap.h:6-8; 4bpp tiles use 32 bytes.
NUM_TILES_IN_PRIMARY=640
NUM_TILES_TOTAL=1024
NUM_METATILES_IN_PRIMARY=640
@functools.lru_cache(None)
def tileset(n):
 t=read(root/'tilesets'/f'{n}.json');return nums(t['metatiles'],2),nums(t['attributes'],4),base64.b64decode(t['tiles'])
@functools.lru_cache(None)
def mask(primary,secondary,mt):
 pm,pa,pt=tileset(primary);sm,sa,st=tileset(secondary)
 entries,attrs,local=(pm,pa,mt) if mt<NUM_METATILES_IN_PRIMARY else (sm,sa,mt-NUM_METATILES_IN_PRIMARY)
 if local>=len(attrs):raise ValueError(f'Invalid source metatile {primary}/{secondary}:{mt}')
 if (attrs[local]>>29)&3==1:return (False,)*256
 if (attrs[local]>>29)&3 not in [0,2]:raise ValueError('Unsupported source BG layer')
 tiles=pt[:NUM_TILES_IN_PRIMARY*32]+st[:(NUM_TILES_TOTAL-NUM_TILES_IN_PRIMARY)*32];out=[]
 for y in range(16):
  for x in range(16):
   entry=entries[local*8+4+(y//8)*2+x//8];sx=7-x%8 if entry&1024 else x%8;sy=7-y%8 if entry&2048 else y%8
   pos=(entry&1023)*32+sy*4+sx//2;byte=tiles[pos] if pos<len(tiles) else 0
   out.append(bool((byte>>4) if sx&1 else (byte&15)))
 return tuple(out)
objects=read(root/'objects.json');shapes=[]
for char,name in [('red','RED'),('leaf','GREEN')]:
 gfx=next(g for g in objects['gfx'].values() if g['name']==f'OBJ_EVENT_GFX_{name}_NORMAL')
 for direction,f,flip in [('south',0,False),('north',1,False),('west',2,False),('east',2,True)]:
  file,i=gfx['frames'][f];im=Image.open(root/file).convert('RGBA').crop((i*16,0,(i+1)*16,32))
  if flip:im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
  shapes.append((char,direction,[(x,y) for y in range(32) for x in range(16) if im.getpixel((x,y))[3]]))
@functools.lru_cache(None)
def coverage(p,s,above,below,shape):
 a,b=mask(p,s,above),mask(p,s,below);pixels=shapes[shape][2]
 return sum((a if y<16 else b)[(y%16)*16+x] for x,y in pixels),len(pixels)
full=[];best=[];cells=0
for m in maps:
 l=read(root/'layouts'/f'{m["layout"]}.json');blocks=nums(l['blocks'],2);w=l['width']
 for i,b in enumerate(blocks):
  if i<w or b&0xc00 or (b>>12)==15 or priorities[b>>12]<=1:continue
  cells+=1
  for f,(char,direction,_) in enumerate(shapes):
   covered,total=coverage(l['primary'],l['secondary'],blocks[i-w]&1023,b&1023,f)
   if covered==total and total:full.append({'map':m['id'],'x':i%w,'y':i//w,'char':char,'direction':direction,'covered':covered})
   if covered>0:best.append((covered/total,m['id'],i%w,i//w,char,direction,covered,total))
print(json.dumps({'maps':len(maps),'cells':cells,'candidatePoseCount':len(full),'candidateCellCount':len({(r['map'],r['x'],r['y']) for r in full}),'full':full,'best':sorted(best,reverse=True)[:10]}))
