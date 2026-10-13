#!/usr/bin/env python3
"""Compose a principal atlas: FireRed Kanto, HnS Johto, Emerald Hoenn.
Map IDs are namespaced by region. Connections retain source geometry inside each
component; placement between regions/components and navigation journeys are editorial.
Writes only public/map-viewer/principal, requires prepared source images.
"""
from __future__ import annotations
import importlib.util
import json
import re
import shutil
from collections import deque
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/map-viewer/principal'
STAGE=ROOT/'.decomp-build/principal-world'
GAP=1024
KANTO_SECTIONS={f'MAPSEC_ROUTE_{i}' for i in range(1,26)}|{
 'MAPSEC_PALLET_TOWN','MAPSEC_VIRIDIAN_CITY','MAPSEC_PEWTER_CITY','MAPSEC_CERULEAN_CITY','MAPSEC_VERMILION_CITY',
 'MAPSEC_LAVENDER_TOWN','MAPSEC_CELADON_CITY','MAPSEC_SAFFRON_CITY','MAPSEC_FUCHSIA_CITY','MAPSEC_CINNABAR_ISLAND',
 'MAPSEC_INDIGO_PLATEAU','MAPSEC_POKEMON_LEAGUE','MAPSEC_VIRIDIAN_FOREST','MAPSEC_MT_MOON','MAPSEC_DIGLETTS_CAVE',
 'MAPSEC_ROCK_TUNNEL','MAPSEC_POWER_PLANT','MAPSEC_ROCKET_HIDEOUT','MAPSEC_SILPH_CO','MAPSEC_POKEMON_TOWER',
 'MAPSEC_POKEMON_MANSION','MAPSEC_KANTO_SAFARI_ZONE','MAPSEC_KANTO_VICTORY_ROAD','MAPSEC_SEAFOAM_ISLANDS',
 'MAPSEC_CERULEAN_CAVE','MAPSEC_S_S_ANNE','MAPSEC_UNDERGROUND_PATH','MAPSEC_UNDERGROUND_PATH_2'}
SEVII_SECTIONS={f'MAPSEC_{island}_ISLAND' for island in ['ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN']}|{
 'MAPSEC_LOST_CAVE','MAPSEC_MT_EMBER','MAPSEC_TRAINER_TOWER_2','MAPSEC_DOTTED_HOLE','MAPSEC_ICEFALL_CAVE',
 'MAPSEC_WATER_PATH','MAPSEC_RESORT_GORGEOUS','MAPSEC_SEVAULT_CANYON','MAPSEC_THREE_ISLE_PORT',
 'MAPSEC_CAPE_BRINK','MAPSEC_FIVE_ISLE_MEADOW','MAPSEC_MEMORIAL_PILLAR','MAPSEC_ROCKET_WAREHOUSE',
 'MAPSEC_WATER_LABYRINTH','MAPSEC_KINDLE_ROAD','MAPSEC_EMBER_SPA','MAPSEC_TREASURE_BEACH',
 'MAPSEC_CANYON_ENTRANCE','MAPSEC_TANOBY_KEY','MAPSEC_TANOBY_RUINS','MAPSEC_DILFORD_CHAMBER',
 'MAPSEC_LIPTOO_CHAMBER','MAPSEC_MONEAN_CHAMBER','MAPSEC_RIXY_CHAMBER','MAPSEC_SCUFIB_CHAMBER',
 'MAPSEC_VIAPOIS_CHAMBER','MAPSEC_WEEPTH_CHAMBER','MAPSEC_TRAINER_TOWER','MAPSEC_ALTERING_CAVE',
 'MAPSEC_GREEN_PATH','MAPSEC_OUTCAST_ISLAND','MAPSEC_PATTERN_BUSH','MAPSEC_RUIN_VALLEY',
 'MAPSEC_BERRY_FOREST','MAPSEC_BOND_BRIDGE','MAPSEC_THREE_ISLE_PATH'}
ISLANDS=['ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN']
JOHTO_SECTIONS={f'MAPSEC_ROUTE_{i}' for i in range(26,49)}|{
 'MAPSEC_NEW_BARK_TOWN','MAPSEC_CHERRYGROVE_CITY','MAPSEC_VIOLET_CITY','MAPSEC_AZALEA_TOWN','MAPSEC_GOLDENROD_CITY',
 'MAPSEC_ECRUTEAK_CITY','MAPSEC_OLIVINE_CITY','MAPSEC_CIANWOOD_CITY','MAPSEC_MAHOGANY_TOWN','MAPSEC_LAKE_OF_RAGE',
 'MAPSEC_BLACKTHORN_CITY','MAPSEC_MT_SILVER','MAPSEC_SAFARI_ZONE_GATE','MAPSEC_SAFARI_ZONE','MAPSEC_DARK_CAVE',
 'MAPSEC_UNION_CAVE','MAPSEC_ILEX_FOREST','MAPSEC_NATIONAL_PARK','MAPSEC_WHIRL_ISLANDS','MAPSEC_CLIFF_CAVE',
 'MAPSEC_MT_MORTAR','MAPSEC_ICE_PATH','MAPSEC_TOHJO_FALLS','MAPSEC_SPROUT_TOWER','MAPSEC_SLOWPOKE_WELL',
 'MAPSEC_BURNED_TOWER','MAPSEC_OLIVINE_LIGHTHOUSE','MAPSEC_TIN_TOWER','MAPSEC_DRAGONS_DEN','MAPSEC_RUINS_OF_ALPH',
 'MAPSEC_EMBEDDED_TOWER','MAPSEC_SS_AQUA','MAPSEC_TRAINER_HILL','MAPSEC_ROCKET_HIDEOUT'}
# These source states remain in the HnS variant viewer, rather than cover the same ground twice.
STATE_VARIANTS={'MAP_LAKE_OF_RAGE_LOW_TIDE','MAP_NATIONAL_PARK_BUG_CONTEST','MAP_MT_SILVER_SUMMIT_NIGHT',
 'MAP_TIN_TOWER_ROOF_NIGHT','MAP_GOLDENROD_CITY_DEPARTMENT_STORE_7FNIGHT'}
LINK_MAPS={'MAP_BATTLE_COLOSSEUM_2P','MAP_BATTLE_COLOSSEUM_4P','MAP_TRADE_CENTER','MAP_RECORD_CORNER','MAP_UNION_ROOM'}
EXTERIOR_TYPES={'MAP_TYPE_CITY','MAP_TYPE_TOWN','MAP_TYPE_ROUTE','MAP_TYPE_OCEAN_ROUTE'}


def read(path):return json.loads(path.read_text())
def write(path,data):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))


def johto_members(maps,source):
    seen={'MAP_NEW_BARK_TOWN'};queue=deque(sorted(seen));evidence={}
    while queue:
        id=queue.popleft();m=maps[id]
        targets=[c['map'] for c in m['connections']]+[w['dest_map'] for w in m['warps']]
        script=source/'data/maps'/m['name']/'scripts.inc'
        if script.exists():targets+=re.findall(r'\bMAP_[A-Z0-9_]+\b',script.read_text())
        for target in sorted(set(targets)):
            if target in maps and target not in seen and target not in STATE_VARIANTS and maps[target]['section'] in JOHTO_SECTIONS:
                seen.add(target);queue.append(target);evidence[target]=id
    return seen,evidence


def johto_rects(maps,selected,origin="MAP_NEW_BARK_TOWN",exterior_types=EXTERIOR_TYPES):
    remaining={n for n in selected if maps[n]['type'] in exterior_types};components=[];conflicts=[]
    while remaining:
        start=origin if origin in remaining else min(remaining)
        positions={start:(0,0)};queue=deque([start]);remaining.remove(start)
        while queue:
            n=queue.popleft();m=maps[n];x,y=positions[n]
            for c in m['connections']:
                target,d,o=c['map'],c['direction'],c['offset']
                if target not in selected or maps[target]['type'] not in exterior_types or d not in ['up','down','left','right']:continue
                b=maps[target];desired={'up':(x+o,y-b['h']),'down':(x+o,y+m['h']),'left':(x-b['w'],y+o),'right':(x+m['w'],y+o)}[d]
                if target in positions:
                    if positions[target]!=desired:conflicts.append({'from':n,'to':target,'placed':positions[target],'wanted':desired})
                elif target in remaining:
                    positions[target]=desired;remaining.remove(target);queue.append(target)
        minx=min(x for x,y in positions.values());miny=min(y for x,y in positions.values())
        rects=[{'id':n,'x':(x-minx)*16,'y':(y-miny)*16,'w':maps[n]['w']*16,'h':maps[n]['h']*16} for n,(x,y) in sorted(positions.items())]
        width=max(r['x']+r['w'] for r in rects);height=max(r['y']+r['h'] for r in rects)
        components.append({'origin':start,'rects':rects,'w':width,'h':height})
    # Doors connect isolated exterior spaces; arrange those components in a separate strip.
    result=list(components[0]['rects']);width=components[0]['w'];height=components[0]['h'];cursor=0;strip_y=height+GAP
    for component in components[1:]:
        for r in component['rects']:result.append({**r,'x':r['x']+cursor,'y':r['y']+strip_y})
        cursor+=component['w']+256; height=max(height,strip_y+component['h'])
    return result,max(width,cursor),height,[{'origin':c['origin'],'maps':[r['id'] for r in c['rects']]} for c in components],conflicts


def sevii_rects(catalog,selected):
    # Source offsets are in metatiles. Reuse the connection placement with GBA dimensions/types.
    maps={id:{'w':m['width']//16,'h':m['height']//16,'type':m['type'],
              'connections':read(ROOT/'public/fr/maps'/f'{id}.json')['connections']} for id,m in catalog['maps'].items() if id in selected}
    groups=[];conflicts=[]
    for island in ISLANDS:
        members={id for id in selected if id.startswith(f'MAP_{island}_ISLAND') or
                 (island=='ONE' and id.startswith('MAP_MT_EMBER')) or (island=='SEVEN' and id.startswith('MAP_TRAINER_TOWER'))}
        rects,w,h,components,errors=johto_rects(maps,members,f'MAP_{island}_ISLAND',{1,2,3,6})
        groups.append({'island':island,'rects':rects,'w':w,'h':h,'maps':sorted(members),'components':components})
        conflicts+=errors
    assert set().union(*(set(g['maps']) for g in groups))==selected
    pitch=max(g['w'] for g in groups)+GAP; y=0;result=[];bounds=[]
    for index in range(0,len(groups),2):
        row=groups[index:index+2]
        for col,g in enumerate(row):
            x=col*pitch
            result += [{**r,'x':r['x']+x,'y':r['y']+y} for r in g['rects']]
            bounds.append({k:v for k,v in g.items() if k!='rects'}|{'x':x,'y':y})
        y+=max(g['h'] for g in row)+GAP
    return result,max(r['x']+r['w'] for r in result),y-GAP,bounds,conflicts


def main():
    spec=importlib.util.spec_from_file_location('world_refs',ROOT/'tools/refs/common.py');refs=importlib.util.module_from_spec(spec);spec.loader.exec_module(refs)
    hns_source=refs.source_path('pokemon-hns');hns=read(ROOT/'public/hns/maps.json')
    fr=read(ROOT/'public/map-viewer/firered/catalog.json');em=read(ROOT/'public/map-viewer/emerald/catalog.json')
    johto,evidence=johto_members(hns['maps'],hns_source)
    selections={
      'kanto':{id for id,m in fr['maps'].items() if m['section'] in KANTO_SECTIONS},
      'johto':johto,
      'sevii':{id for id,m in fr['maps'].items() if m['section'] in SEVII_SECTIONS and 'UNUSED' not in id},
      'hoenn':{id for id,m in em['maps'].items() if id not in LINK_MAPS and m['section'] not in {'MAPSEC_BIRTH_ISLAND','MAPSEC_NAVEL_ROCK','MAPSEC_FARAWAY_ISLAND'}}}
    jr,jw,jh,components,conflicts=johto_rects(hns['maps'],johto)
    sr,sw,sh,islands,sevii_conflicts=sevii_rects(fr,selections['sevii'])
    configs=[('johto','hns','Johto','Heart & Soul',hns,jr,jw,jh,'MAP_NEW_BARK_TOWN'),
             ('kanto','firered','Kanto','FireRed',fr,fr['world']['maps'],fr['world']['w'],fr['world']['h'],'MAP_PALLET_TOWN'),
             ('sevii','firered','Sevii · Kanto','FireRed',fr,sr,sw,sh,'MAP_ONE_ISLAND'),
             ('hoenn','emerald','Hoenn','Emerald',em,em['world']['maps'],em['world']['w'],em['world']['h'],'MAP_LITTLEROOT_TOWN')]
    if STAGE.exists():shutil.rmtree(STAGE)
    (STAGE/'world').mkdir(parents=True)
    maps={};rects=[];regions=[];xoffset=0
    for region,game,title,version,doc,local,width,height,origin in configs:
        for id in sorted(selections[region]):
            m=doc['maps'][id];key=f'{region}/{id}'
            if game=='hns':
                item={'id':key,'sourceId':id,'game':game,'region':region,'name':m['name'],'width':m['w']*16,'height':m['h']*16,
                      'image':'/hns/'+m['image'] if m['image'] else None,'sprites':None,'collision':None,'section':m['section']}
            else:
                item={'id':key,'sourceId':id,'game':game,'region':region,'name':m['name'],'width':m['width'],'height':m['height'],
                      'image':f'/map-viewer/{game}/'+m['image'],'sprites':f'/map-viewer/{game}/'+m['sprites'] if m['sprites'] else None,
                      'collision':f'/map-viewer/{game}/'+m['collision'],'section':m['section']}
            maps[key]=item
        for r in local:
            if r['id'] in selections[region]:rects.append({**r,'id':f"{region}/{r['id']}",'x':r['x']+xoffset})
        regions.append({'id':region,'title':title,'game':game,'version':version,'origin':f'{region}/{origin}','x':xoffset,'y':0,'w':width,'h':height,
                        'maps':len(selections[region]),**({'parent':'kanto'} if region=='sevii' else {}),'commit':doc['_meta'].get('commit',doc['_meta'].get('sourceCommit'))})
        xoffset+=width+GAP
    # Cross-source destination matches are navigation references, never warp-index equivalences.
    aliases={'MAP_ROUTE22':'kanto/MAP_ROUTE22'}
    aliases['MAP_INDIGO_PLATEAU']='kanto/MAP_INDIGO_PLATEAU_EXTERIOR'
    boundaries=[]
    for id in sorted(johto):
        m=hns['maps'][id]
        for kind,target in [('connection',c['map']) for c in m['connections']]+[('warp',w['dest_map']) for w in m['warps']]:
            if target not in johto and target in hns['maps']:
                boundaries.append({'from':f'johto/{id}','kind':kind,'sourceTarget':target,'primaryTarget':aliases.get(target),
                    'referenceUrl':f'/maps.html?game=hns#mapa={target}','policy':'navigation-reference-only; destination warp index is not transferred across sources'})
    travels=[{'id':'olivine-vermilion','a':'johto/MAP_OLIVINE_CITY','b':'kanto/MAP_VERMILION_CITY','label':'Olivine ↔ Vermilion',
              'kind':'atlas-navigation','basis':'HnS OlivineCity_PortInside/scripts.inc: OlivinePort_EventScript_ChoseVermilion. Endpoints adapted to principal sources; not a playable boat.'},
             {'id':'vermilion-slateport','a':'kanto/MAP_VERMILION_CITY','b':'hoenn/MAP_SLATEPORT_CITY','label':'Vermilion ↔ Slateport',
              'kind':'project-navigation','basis':'Editorial atlas journey. No original game connection is claimed.'}]
    for island in ISLANDS:
        travels.append({'id':f'vermilion-{island.lower()}-island','a':'kanto/MAP_VERMILION_CITY',
            'b':f'sevii/MAP_{island}_ISLAND','label':f'Vermilion ↔ Sevii · {ISLANDS.index(island)+1}',
            'kind':'source-navigation','description':'FireRed incluye los ferris Seagallop entre Vermilion y las Islas Sevii. Aquí puedes consultar sus destinos; no se ejecuta el viaje del juego.',
            'basis':f'FireRed data/scripts/seagallop.inc: SEAGALLOP_{island}_ISLAND. Atlas endpoints are town maps; source pass/flag requirements are not simulated.'})
    for t in travels:
        assert t['a'] in maps and t['b'] in maps,t
    width=xoffset-GAP;height=max(r['h'] for r in regions);chunks=[]
    for y in range(0,height,1024):
        for x in range(0,width,1024):
            near=[r for r in rects if r['x']<x+1024 and r['y']<y+1024 and r['x']+r['w']>x and r['y']+r['h']>y]
            if not near:continue
            w,h=min(1024,width-x),min(1024,height-y)
            for layer in ['image','sprites','collision']:
                image=Image.new('RGBA',(w,h))
                for r in near:
                    file=maps[r['id']][layer]
                    if file:
                        with Image.open(ROOT/'public'/file.lstrip('/')) as source:image.paste(source,(r['x']-x,r['y']-y))
                if not image.getbbox():continue
                file=f'world/{layer}_{x}_{y}.png';image.save(STAGE/file,optimize=True)
                chunks.append({'file':file,'layer':layer,'x':x,'y':y,'w':w,'h':h})
    scale=min(1,2048/max(width,height));overviews={}
    for layer in ['image','sprites','collision']:
        image=Image.new('RGBA',(round(width*scale),round(height*scale)))
        for r in rects:
            file=maps[r['id']][layer]
            if file:
                with Image.open(ROOT/'public'/file.lstrip('/')) as source:
                    image.paste(source.resize((max(1,round(r['w']*scale)),max(1,round(r['h']*scale))),Image.Resampling.NEAREST),(round(r['x']*scale),round(r['y']*scale)))
        file=f'world/overview_{layer}.png';image.save(STAGE/file,optimize=True);overviews[layer]=file
    write(STAGE/'catalog.json',{'_meta':{'generator':'tools/viewer/principal_world.py','placement':'Editorial: Johto, Kanto, Sevii and Hoenn separated by 1024 px; source connections preserved inside components.',
      'johtoSelection':'Source section allowlist plus reachability by connections, warps and script MAP references. References are not proof of runtime access.',
      'seviiIslands':islands,'seviiConflicts':sevii_conflicts,
      'seviiSelection':'Seven FireRed island groups and their routes/interiors. Event islands, prototypes, unused house and LINK rooms remain in source variants. Island/component positions are editorial.',
      'johtoEvidence':evidence,'johtoComponents':components,'johtoConflicts':conflicts,'excludedStateVariants':sorted(STATE_VARIANTS),
      'excludedPermittedJohtoMaps':sorted(n for n,m in hns['maps'].items() if m['section'] in JOHTO_SECTIONS and n not in johto),
      'borderAssignment':'HnS Routes 26–28, Tohjo Falls and Mt Silver kept with Johto as border areas; not a claim about official regional geography.'},
      'regions':regions,'maps':maps,'boundaries':boundaries,'crossSourceAliases':aliases,'travels':travels,
      'world':{'w':width,'h':height,'origin':'kanto/MAP_PALLET_TOWN','maps':rects,'chunks':chunks,'overviews':overviews}})
    OUT.mkdir(parents=True,exist_ok=True)
    if (OUT/'world').exists():shutil.rmtree(OUT/'world')
    shutil.copytree(STAGE/'world',OUT/'world');shutil.copy2(STAGE/'catalog.json',OUT/'catalog.json')
    print('Principal atlas:',[(r['id'],r['maps']) for r in regions],len(rects),'exteriors;',len(chunks),'chunks;',len(boundaries),'source boundaries')


if __name__=='__main__':main()
