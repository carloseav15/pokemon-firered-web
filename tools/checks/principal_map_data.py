"""Validate principal membership, source assets, placements and journey provenance."""
import importlib.util
import json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('principal',ROOT/'tools/viewer/principal_world.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
d=json.loads((p.OUT/'catalog.json').read_text())
sources={g:json.loads((ROOT/path).read_text()) for g,path in {'hns':'public/hns/maps.json','firered':'public/map-viewer/firered/catalog.json','emerald':'public/map-viewer/emerald/catalog.json'}.items()}
assert len(d['maps'])==sum(r['maps'] for r in d['regions'])
for key,m in d['maps'].items():
    assert key==f"{m['region']}/{m['sourceId']}"
    original=sources[m['game']]['maps'][m['sourceId']]
    assert m['section']==original['section']
    for layer in ['image','sprites','collision']:
        if m[layer]:
            with Image.open(ROOT/'public'/m[layer].lstrip('/')) as image: assert image.size==(m['width'],m['height'])
# Known cities prove coverage and distinguish inherited Emerald maps in HnS.
for region,ids in {'kanto':['PALLET_TOWN','VIRIDIAN_CITY','SAFFRON_CITY'], 'johto':['NEW_BARK_TOWN','GOLDENROD_CITY','OLIVINE_CITY','BLACKTHORN_CITY','ROCKET_HIDEOUT_B1F'], 'hoenn':['LITTLEROOT_TOWN','SLATEPORT_CITY','EVER_GRANDE_CITY']}.items():
    for id in ids: assert f'{region}/MAP_{id}' in d['maps']
assert not any(m['sourceId'] in p.STATE_VARIANTS for m in d['maps'].values())
assert not any(m['region']=='johto' and m['sourceId'] in sources['emerald']['maps'] for m in d['maps'].values() if m['sourceId'] in ['MAP_LITTLEROOT_TOWN','MAP_SLATEPORT_CITY','MAP_FORTREE_CITY'])
regions={r['id']:r for r in d['regions']}
for a,b in zip(d['regions'],d['regions'][1:]): assert a['x']+a['w']+p.GAP==b['x']
for r in d['world']['maps']:
    assert r['id'] in d['maps'];region=regions[d['maps'][r['id']]['region']]
    assert region['x']<=r['x'] and r['x']+r['w']<=region['x']+region['w']
    assert 0<=r['y'] and r['y']+r['h']<=region['h']
for c in d['world']['chunks']:
    with Image.open(p.OUT/c['file']) as image: assert image.size==(c['w'],c['h'])
for file in d['world']['overviews'].values():
    with Image.open(p.OUT/file) as image: assert max(image.size)<=2048
for b in d['boundaries']:
    assert b['from'] in d['maps'] and b['sourceTarget'] in sources['hns']['maps']
    if b['primaryTarget']:assert b['primaryTarget'] in d['maps']
for t in d['travels']:assert t['a'] in d['maps'] and t['b'] in d['maps']
refs_spec=importlib.util.spec_from_file_location('refs',ROOT/'tools/refs/common.py');refs=importlib.util.module_from_spec(refs_spec);refs_spec.loader.exec_module(refs)
hns=refs.source_path('pokemon-hns')
script=(hns/'data/maps/OlivineCity_PortInside/scripts.inc').read_text()
assert 'OlivinePort_EventScript_ChoseVermilion' in script and 'warpsilent MAP_VERMILION_CITY_PORT_INSIDE' in script
selected,evidence=p.johto_members(sources['hns']['maps'],hns)
assert selected=={m['sourceId'] for m in d['maps'].values() if m['region']=='johto'} and evidence==d['_meta']['johtoEvidence']
print(f"Principal data PASS: {len(d['maps'])} maps, {len(d['world']['maps'])} exteriors, {len(d['boundaries'])} boundaries; {len(d['_meta']['johtoConflicts'])} source connection discrepancies retained")
