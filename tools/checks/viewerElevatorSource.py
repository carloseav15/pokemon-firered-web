"""Deterministic source compilation and rejection of unsupported elevator script changes."""
from pathlib import Path
import json
import shutil
import sys
import tempfile
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'viewer'))
import elevator_scripts as compiler

canonical = compiler.compile_all()
artifact = json.loads((compiler.ROOT/'public/viewer/elevators.json').read_text())
assert canonical == artifact['elevators']
assert compiler.compile_all() == canonical
assert len(canonical) == 4
with tempfile.TemporaryDirectory(prefix='elevator-source-') as temp:
    source = Path(temp)
    (source/'src').mkdir()
    shutil.copy2(compiler.DECOMP/'src/field_specials.c',source/'src/field_specials.c')
    for folder in compiler.FOLDERS:
        shutil.copytree(compiler.DECOMP/'data/maps'/folder,source/'data/maps'/folder)
    with patch.object(compiler,'DECOMP',source):
        assert compiler.compile_all() == canonical
        cases = [
            ('CeladonCity_DepartmentStore_Elevator','message Text_WantWhichFloor','special UnsupportedMenu'),
            ('SilphCo_Elevator','MAP_SILPH_CO_1F, 255, 22, 3','MAP_SILPH_CO_1F, 254, 22, 3'),
            ('RocketHideout_Elevator','special AnimateElevator','special UnsupportedAnimation'),
            ('TrainerTower_Elevator','walk_right\n','walk_left\n'),
            ('TrainerTower_Elevator','goto TrainerTower_Elevator_EventScript_CloseFloorSelect','goto TrainerTower_Elevator_EventScript_SelectLobby'),
            ('RocketHideout_Elevator','msgbox RocketHideout_Elevator_Text_AppearsToNeedAKey','setflag FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT'),
        ]
        for folder, before, after in cases:
            path=source/'data/maps'/folder/'scripts.inc'
            original=path.read_text()
            assert before in original
            path.write_text(original.replace(before,after,1))
            try:
                compiler.compile_all()
            except ValueError:
                pass
            else:
                raise AssertionError(f'Unsupported source was accepted: {folder}')
            finally:
                path.write_text(original)
print('Viewer elevator source PASS: four menus deterministic; six unsupported changes rejected')
