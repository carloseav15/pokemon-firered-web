"""Compile source elevator destinations for the navigation presentation adapter.
No general story VM: reject changed destination bodies rather than guessing their effects.
"""
from pathlib import Path
import json
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'decomp'))
from common import DECOMP, ROOT

FOLDERS = ['CeladonCity_DepartmentStore_Elevator', 'SilphCo_Elevator', 'RocketHideout_Elevator', 'TrainerTower_Elevator']

def compile_all():
    result = {}
    for folder in FOLDERS:
        base = DECOMP / 'data/maps' / folder
        text = (base / 'scripts.inc').read_text()
        header = json.loads((base / 'map.json').read_text())
        bodies = dict(re.findall(r'^(\w+)::\n(.*?)(?=^\w+::|\Z)', text, re.M | re.S))
        choose = bodies.get(folder + '_EventScript_ChooseFloor', bodies[folder + '_EventScript_FloorSelect'])
        menu_ids = {'CeladonCity_DepartmentStore_Elevator':3, 'SilphCo_Elevator':1,
                    'RocketHideout_Elevator':2, 'TrainerTower_Elevator':6}
        menu_id = menu_ids[folder]
        root = [line.strip() for line in bodies[folder + '_EventScript_FloorSelect'].splitlines() if line.strip()]
        expected_root = ['lockall']
        if folder == 'RocketHideout_Elevator':
            expected_root += ['goto_if_unset FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT, RocketHideout_Elevator_EventScript_NeedKey']
        expected_root += [f'setvar VAR_0x8004, {menu_id}', 'call_if_unset FLAG_TEMP_2, EventScript_GetElevatorFloor',
            'copyvar VAR_0x8005, VAR_ELEVATOR_FLOOR', 'special DrawElevatorCurrentFloorWindow',
            'message Text_WantWhichFloor', 'waitmessage',
            f'setvar VAR_0x8004, {"LISTMENU_SILPHCO_FLOORS" if menu_id == 1 else menu_id}',
            'specialvar VAR_RESULT, InitElevatorFloorSelectMenuPos']
        if menu_id == 1:
            expected_root += ['special ListMenu', 'waitstate']
        if root[:len(expected_root)] != expected_root or root[len(expected_root)] != 'switch VAR_RESULT':
            raise ValueError(f'{folder}: unsupported menu entry sequence')
        root_cases = root[len(expected_root) + 1:]
        if not root_cases or root_cases[-1] != 'end' or any(not re.fullmatch(r'case \d+, \w+', line) for line in root_cases[:-1]):
            raise ValueError(f'{folder}: unsupported menu dispatch')
        if menu_id != 1:
            for index, label in re.findall(r'^\s*case (\d+), (\w+)', bodies[folder + '_EventScript_FloorSelect'], re.M):
                expected_from = [f'multichoicedefault 0, 0, '+{2:'MULTICHOICE_ROCKET_HIDEOUT_ELEVATOR',3:'MULTICHOICE_DEPT_STORE_ELEVATOR',6:'MULTICHOICE_ROOFTOP_B1F'}[menu_id]+f', {index}, FALSE',
                                 'goto '+folder+'_EventScript_ChooseFloor','end']
                if [line.strip() for line in bodies[label].splitlines() if line.strip()] != expected_from:
                    raise ValueError(f'{folder}:{label}: unsupported menu cursor sequence')
        move = bodies[folder + '_EventScript_MoveElevator']
        expected_move = ['special CloseElevatorCurrentFloorWindow', 'closemessage', 'waitse',
                         'special AnimateElevator', 'waitstate', 'setflag FLAG_TEMP_2', 'return']
        if [line.strip() for line in move.splitlines() if line.strip()] != expected_move:
            raise ValueError(f'{folder}: unsupported elevator animation script')
        if any(e['type'] != 'sign' or e['player_facing_dir'] != 'BG_EVENT_PLAYER_FACING_ANY'
               or e['script'] != folder + '_EventScript_FloorSelect' for e in header['bg_events']):
            raise ValueError(f'{folder}: unsupported control panel')
        choices = []
        for index, label in re.findall(r'^\s*case (\d+), (\w+)', choose, re.M):
            body = bodies[label]
            target = re.search(r'setdynamicwarp (MAP_\w+), (.*)', body)
            if not target:
                # Exit/cancel and Trainer Tower's intentionally inert roof option.
                normalized = [line.strip() for line in body.splitlines() if line.strip()]
                expected_close = (['goto '+folder+'_EventScript_CloseFloorSelect', 'end']
                                  if label.endswith('_SelectRoof') else
                                  ['special CloseElevatorCurrentFloorWindow', 'releaseall', 'end'])
                if normalized != expected_close:
                    raise ValueError(f'{folder}:{label}: unsupported non-destination body')
                if label.endswith('_SelectRoof'):
                    choices.append({'label': 'Rooftop', 'floor': 15, 'destination': None})
                continue
            floor = int(re.search(r'setvar VAR_0x8006, (\d+)', body)[1])
            args = [int(v.strip()) for v in target[2].split(',')]
            if len(args) == 3 and args[0] == 255:
                x, y = args[1:]
            elif len(args) == 2:
                x, y = args
            else:
                raise ValueError(f'{folder}:{label}: unsupported dynamic warp {args}')
            # Require the original same-floor branch and animation call before floor update.
            pattern = r'setvar VAR_0x8006, '+str(floor)+r'\s+setdynamicwarp [^\n]+\s+goto_if_eq VAR_ELEVATOR_FLOOR, '+str(floor)+r', \w+\s+call '+folder+r'_EventScript_MoveElevator\s+setvar VAR_ELEVATOR_FLOOR, '+str(floor)
            if not re.search(pattern, body):
                raise ValueError(f'{folder}:{label}: unsupported destination control flow')
            tail = re.sub(pattern, '', body, count=1).strip().splitlines()
            tail = [line.strip() for line in tail if line.strip()]
            if folder == 'TrainerTower_Elevator':
                expected = ['special CloseElevatorCurrentFloorWindow', 'delay 25',
                            'applymovement LOCALID_PLAYER, TrainerTower_Elevator_Movement_ExitElevator',
                            'waitmovement 0', 'warp MAP_TRAINER_TOWER_LOBBY, 17, 8', 'waitstate', 'releaseall', 'end']
                movement = [line.strip() for line in bodies['TrainerTower_Elevator_Movement_ExitElevator'].splitlines() if line.strip()]
                if movement != ['walk_in_place_faster_down', 'delay_16', 'walk_down', 'walk_right', 'walk_right', 'walk_down', 'step_end']:
                    raise ValueError(f'{folder}: unsupported automatic exit movement')
            else:
                expected = ['goto ' + folder + '_EventScript_ExitFloorSelect', 'end']
            if tail != expected:
                raise ValueError(f'{folder}:{label}: unsupported destination suffix {tail}')
            name = target[1]
            display = name.rsplit('_', 1)[-1]
            if display == 'LOBBY': display = 'B1F'  # MULTICHOICE_ROOFTOP_B1F in script_menu.c.
            choices.append({'label': display, 'floor': floor, 'destination': {'mapId':name,'warpId':-1,'x':x,'y':y},
                            'autoExit': folder == 'TrainerTower_Elevator'})
        if not choices:
            raise ValueError(f'{folder}: no choices')
        gate = re.search(r'goto_if_unset (FLAG_\w+), \w+_NeedKey', text)
        if gate:
            denied = [line.strip() for line in bodies[folder+'_EventScript_NeedKey'].splitlines() if line.strip()]
            if denied != ['msgbox RocketHideout_Elevator_Text_AppearsToNeedAKey','releaseall','end']:
                raise ValueError(f'{folder}: unsupported locked-elevator branch')
        # Resolve current floors from C cases, including the inert Trainer Tower roof choice.
        c = (DECOMP / 'src/field_specials.c').read_text()
        c = c[c.index('void GetElevatorFloor(void)'):c.index('u16 InitElevatorFloorSelectMenuPos(void)')]
        floors = {}
        pending = []
        for line in c.splitlines():
            m = re.search(r'case MAP_NUM\((MAP_\w+)\):', line)
            if m: pending.append(m[1])
            m = re.search(r'floor = (\d+);', line)
            if m:
                for mid in pending: floors[mid] = int(m[1])
                pending = []
        result[header['id']] = {'source':str(base.relative_to(DECOMP) / 'scripts.inc'),
            'panels':[{'x':e['x'],'y':e['y'],'elevation':e['elevation']} for e in header['bg_events']],
            'choices': choices, 'requiredFlag':gate[1] if gate else None,
            'deniedText':re.search(r'\.string "([^"]+)\$"', (base / 'text.inc').read_text())[1] if gate else None, 'floors':floors}
    return result

if __name__ == '__main__':
    data = {'generator':'tools/viewer/elevator_scripts.py','elevators':compile_all()}
    path = ROOT / 'public/viewer/elevators.json'
    path.write_text(json.dumps(data, separators=(',',':'))+'\n')
    print(f'{len(data["elevators"])} source elevator menus -> {path}')
