"""Compare exported connections with mapjson's native header selection.
The native tool is built in our check directory, never in the reference decomp.
"""
from pathlib import Path
import json
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'decomp'))
from common import BUILD, DECOMP, OUT

folder = BUILD / 'checks/map-connections'
folder.mkdir(parents=True, exist_ok=True)
tool = DECOMP / 'tools/mapjson'
binary = folder / 'mapjson'
subprocess.run(['clang++', '-std=c++11', '-O0', str(tool / 'mapjson.cpp'), str(tool / 'json11.cpp'), '-o', str(binary)], check=True)
for name, connected in [('SaffronCity',False),('SaffronCity_Connection',True)]:
    output = folder / name
    output.mkdir(exist_ok=True)
    subprocess.run([str(binary),'map','firered',str(DECOMP/'data/maps'/name/'map.json'),str(DECOMP/'data/layouts/layouts.json'),str(output)],check=True)
    native = (output/'header.inc').read_text()
    assert ('\t.4byte '+name+'_MapConnections\n' in native) == connected, native
    assert ('\t.4byte NULL\n' in native) != connected, native
    mid = 'MAP_SAFFRON_CITY' if name == 'SaffronCity' else 'MAP_SAFFRON_CITY_CONNECTION'
    exported = json.loads((OUT/'maps'/f'{mid}.json').read_text())
    assert bool(exported['connections']) == connected, mid
# Check every exported source declaration; keep authored warps independent of connections.
count = 0
for path in sorted((DECOMP/'data/maps').glob('*/map.json')):
    source = json.loads(path.read_text())
    exported_path = OUT/'maps'/f'{source["id"]}.json'
    if not exported_path.exists(): continue
    exported = json.loads(exported_path.read_text())
    expected = [] if source.get('connections_no_include') else source.get('connections') or []
    assert exported['connections'] == expected, source['id']
    assert len(exported['warps']) == len(source.get('warp_events', [])), source['id']
    count += 1
print(f'Map connections PASS: native mapjson real/stub Saffron headers; {count} source map declarations, warps retained')
