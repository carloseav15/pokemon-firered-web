"""Conservative Emerald -> FireRed movement boundary, never a name/ID guess.

Compare each ordered action callback list and every callback body. This establishes
reuse of those bodies, not transitive engine/graphics or audiovisual parity.
Unsupported actions remain explicit errors until their regional bodies are ported.
Run: python3 tools/decomp/emerald_movement_contract.py [--check]
"""
from pathlib import Path
import argparse
import json
import os
import re
import subprocess

from common import ROOT, read_json

em_sibling = ROOT.parent / 'pokeemerald'
fr_sibling = ROOT.parent / 'pokefirered'
EM = Path(os.environ.get('POKEEMERALD', em_sibling if em_sibling.exists() else Path(os.environ.get('REFS_SRC', ROOT.parent / 'refs-src')) / 'pokeemerald'))
FR = Path(os.environ.get('POKEFIRERED', fr_sibling if fr_sibling.exists() else ROOT / 'pokefirered'))
OUT = ROOT / 'src/games/emerald/generated/movementContract.ts'


def strip_comments(text):
    return re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)


def numeric_constants(root):
    """MOVE_SPEED_* (enum in event_object_movement.c) and DISPLAY_HEIGHT (gba/defines.h) of one decomp."""
    source = strip_comments((root / 'src/event_object_movement.c').read_text())
    enum = re.search(r'enum\s*\{([^}]*MOVE_SPEED_NORMAL[^}]*)\}', source)[1]
    values = {name: i for i, name in enumerate(re.findall(r'\b(MOVE_SPEED_\w+)', enum))}
    values['DISPLAY_HEIGHT'] = int(re.search(r'#define\s+DISPLAY_HEIGHT\s+(\d+)', (root / 'include/gba/defines.h').read_text())[1])
    return values


# Literal substitution is valid only for values equal in both decomps (checked in generate()).
SHARED_NUMERIC_CONSTANTS = {}

# pokeemerald's WalkSlow* helpers are pokefirered's WalkSlower* (see REVIEWED_ACTION_REMAPS); a
# callback that names them is the same body as the FireRed callback naming the WalkSlower* form.
EMERALD_TO_FIRERED_HELPER_NAMES = {
    'InitWalkSlow': 'InitWalkSlower', 'UpdateWalkSlow': 'UpdateWalkSlower',
    'InitNpcForWalkSlow': 'InitNpcForWalkSlower', 'UpdateWalkSlowAnim': 'UpdateWalkSlowerAnim',
    'SetWalkSlowSpriteData': 'SetWalkSlowerSpriteData',
}


def rename_emerald_helpers(body):
    return re.sub(r'\b(%s)\b' % '|'.join(EMERALD_TO_FIRERED_HELPER_NAMES), lambda m: EMERALD_TO_FIRERED_HELPER_NAMES[m[1]], body)


def normalize(body):
    # event_object_movement.c defines sActionFuncId/data[2] and sDirection/data[3].
    # TRUE/FALSE are 1/0 in both targets. No control-flow or helper calls rewritten.
    body = body.replace('sprite->sActionFuncId', 'sprite->data[2]').replace('sprite->sDirection', 'sprite->data[3]')
    for name, value in SHARED_NUMERIC_CONSTANTS.items(): body = re.sub(r'\b%s\b' % name, str(value), body)
    body = re.sub(r'\bTRUE\b', '1', body)
    body = re.sub(r'\bFALSE\b', '0', body)
    body = re.sub(r'\s+', '', body)
    # `!x` and `x==0` for the sprite's y2 offset (MovementAction_FlyDown_Step1).
    body = body.replace('if(!sprite->y2)', 'if(sprite->y2==0)')
    # `if (...) { one statement; }` and `if (...) one statement;` are the same control flow.
    # Only a brace pair holding exactly one statement without nested blocks is unwrapped.
    return re.sub(r'(\bif\((?:[^(){};]|\((?:[^(){};]|\([^(){};]*\))*\))*\))\{([^{};]*;)\}', r'\1\2', body)


# Sprite-data macros #defined only around these functions (read in both sources):
# pokeemerald sTimer=data[4], sNumSteps=data[5], sDirection=data[3]; pokefirered tDirection=data[3],
# tDelay=data[4], tStepNo=data[5] (event_object_movement.c, around SetWalkSlow*SpriteData).
SCOPED_DATA_MACROS = {
    'emerald': (('SetWalkSlowSpriteData', 'UpdateWalkSlowAnim'), {'sTimer': 'data[4]', 'sNumSteps': 'data[5]'}),
    'firered': (('SetWalkSlowerSpriteData', 'UpdateWalkSlowerAnim'), {'tDirection': 'data[3]', 'tDelay': 'data[4]', 'tStepNo': 'data[5]'}),
}


def read_source(root, kind):
    source = strip_comments((root / 'src/event_object_movement.c').read_text())
    funcs = {}
    for match in re.finditer(r'^\w[^\n;]*?\b(\w+)\([^;]*?\)\s*\{', source, re.M):
        start = source.index('{', match.start())
        end, depth = start + 1, 1
        while depth:
            if source[end] == '{': depth += 1
            elif source[end] == '}': depth -= 1
            end += 1
        funcs[match[1]] = source[start:end]
    names, macros = SCOPED_DATA_MACROS[kind]
    for name in names:
        for macro, expansion in macros.items(): funcs[name] = re.sub(r'\b%s\b' % macro, expansion, funcs[name])
    tables = strip_comments((root / 'src/data/object_events/movement_action_func_tables.h').read_text())
    actions = dict(re.findall(r'\[(MOVEMENT_ACTION_\w+)\]\s*=\s*(\w+MovementActionFuncs_\w+)', tables))
    callbacks = {}
    # Fly's table definitions live in the .c; most other tables live in the header.
    for name, body in re.findall(r'(\w+MovementActionFuncs_\w+)\[\]\)\([^;]*?=\s*\{(.*?)\};', tables + '\n' + source, re.S):
        callbacks[name] = re.findall(r'\bMovementAction_\w+', body)
    return funcs, actions, callbacks


# Helpers called (transitively) by action callbacks whose source text differs between the decomps.
# Each was read against both bodies: the difference is a sprite-data macro name (sDirection/tDirection,
# sTimer/tStepNo, sDistance/tDirection...), a cast, ARRAY_COUNT/NELEMS, TRUE/1, braces, a renamed
# parameter or table, or the Emerald-only animation lock in InitNpcForMovement (ported by
# games/emerald/rotatingTileMovement.ts and honored by the shared InitNpcForMovement).
# A differing helper outside this set rejects every action that reaches it.
REVIEWED_HELPER_DIFFERENCES = frozenset([
    'SetObjectEventDirection', 'GetStepAnimTable', 'SetJumpSpriteData', 'MoveCoordsInDirection',
    'UpdateJumpAnim', 'InitJump', 'StartFieldEffectForObjectEvent', 'NpcTakeStep',
    'SetSpriteDataForNormalStep', 'InitNpcForMovement', 'InitMovementNormal', 'GetOppositeDirection',
    'GetDirectionToFace', 'SetMovementDelay', 'WaitForMovementDelay', 'GetAcroWheelieDirectionAnimNum',
    'GetAcroWheeliePedalDirectionAnimNum', 'GetAcroEndWheelieDirectionAnimNum',
])

# Emerald-only helper reached from InitNpcForMovement; ported with its allocation state in
# games/emerald/rotatingTileMovement.ts (FindLockedObjectEventIndex), so it does not block reuse.
REVIEWED_EMERALD_ONLY_HELPERS = frozenset(['FindLockedObjectEventIndex'])

# pokeemerald's WalkSlow* helpers move every other frame, which pokefirered names WalkSlower*
# (UpdateWalkSlowerAnim: `!(timer & 1)`); pokefirered's own WalkSlow* uses a three-frame cycle.
# Bodies read in both sources: Emerald InitWalkSlow/UpdateWalkSlow(Anim)/SetWalkSlowSpriteData
# equal FireRed InitWalkSlower/UpdateWalkSlower(Anim)/SetWalkSlowerSpriteData.
REVIEWED_ACTION_REMAPS = {
    f'MOVEMENT_ACTION_WALK_SLOW_{d}': f'MOVEMENT_ACTION_WALK_SLOWER_{d}' for d in ('DOWN', 'UP', 'LEFT', 'RIGHT')
}


def callees(body, funcs):
    return set(re.findall(r'\b(\w+)\s*\(', body)) & set(funcs)


def reachable(name, funcs, seen):
    if name in seen: return seen
    seen.add(name)
    for callee in callees(funcs[name], funcs): reachable(callee, funcs, seen)
    return seen


def helper_difference(bodies, emerald, firered):
    """First transitive helper (not a MovementAction_ callback) whose normalized body differs, or None."""
    ef, ff = emerald[0], firered[0]
    seen = set()
    for body in bodies: reachable(body, ef, seen)
    for helper in sorted(seen):
        if helper.startswith('MovementAction_') or helper in REVIEWED_HELPER_DIFFERENCES: continue
        if helper in REVIEWED_EMERALD_ONLY_HELPERS: continue
        counterpart = EMERALD_TO_FIRERED_HELPER_NAMES.get(helper, helper)
        if counterpart not in ff: return f'{helper} has no FireRed body'
        if normalize(rename_emerald_helpers(ef[helper])) != normalize(ff[counterpart]): return f'unreviewed helper difference {helper}'
    return None


def compare_action(action, emerald, firered, em_constants, fr_constants):
    # Same callback text still cannot reuse a known incompatible regional helper.
    if action == 'MOVEMENT_ACTION_RESTORE_ANIMATION':
        return 'GetObjectEventGraphicsInfo requires Emerald bounds and Mauville old-man variants'
    if action in REVIEWED_ACTION_REMAPS: return None
    ef, ea, ec = emerald
    ff, fa, fc = firered
    if action not in fa: return 'no FireRed action'
    left, right = ec.get(ea[action]), fc.get(fa[action])
    if not left or not right: return 'unresolved callback table'
    if len(left) != len(right): return 'different callback count'
    for e, f in zip(left, right):
        if e not in ef or f not in ff: return f'unresolved body {e}/{f}'
        if normalize(rename_emerald_helpers(ef[e])) != normalize(ff[f]): return f'different bodies {e}/{f}'
        for token in set(re.findall(r'\b[A-Z][A-Z_0-9]+\b', ef[e])):
            if token in em_constants and token in fr_constants and em_constants[token] != fr_constants[token]:
                return f'different target constant {token}'
    return helper_difference(left, emerald, firered)


def load_shared_constants():
    left, right = numeric_constants(EM), numeric_constants(FR)
    assert left == right, f'MOVE_SPEED_*/DISPLAY_HEIGHT differ between decomps: {left} vs {right}'
    SHARED_NUMERIC_CONSTANTS.clear()
    SHARED_NUMERIC_CONSTANTS.update(left)


def generate():
    load_shared_constants()
    emerald, firered = read_source(EM, 'emerald'), read_source(FR, 'firered')
    emc = read_json(ROOT / 'public/emerald/constants.json')
    frc = read_json(ROOT / 'public/fr/constants.json')
    accepted, rejected = [], []
    for action in emerald[1]:
        reason = compare_action(action, emerald, firered, emc, frc)
        (rejected if reason else accepted).append((action, reason))
    revision = lambda root: subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    lines = [
        '// Generated by tools/decomp/emerald_movement_contract.py; do not edit.',
        f'// pokeemerald {revision(EM)}; pokefirered {revision(FR)}.',
        '// Ordered callback tables + bodies compared, with sprite-data macros and bool constants normalized.',
        '// Reuse contract only; transitive engine/graphics behavior still needs regional validation.',
        "import * as EM from './constants';", "import * as FR from '../../firered/generated/constants';",
        'export const EMERALD_SHARED_MOVEMENT_ACTIONS = new Map<number, number>([',
    ]
    lines += [f'  [EM.{a}, FR.{REVIEWED_ACTION_REMAPS.get(a, a)}],' for a, _ in accepted]
    lines += ['  [EM.MOVEMENT_ACTION_STEP_END, FR.MOVEMENT_ACTION_STEP_END],', ']);',
              '// These source actions require a regional implementation; never dispatch their raw byte as FireRed.',
              'export const EMERALD_REGIONAL_MOVEMENT_ACTIONS = new Map<number, string>([']
    lines += [f'  [EM.{a}, {json.dumps(a + ": " + reason)}],' for a, reason in rejected]
    lines += [']);', '']
    return '\n'.join(lines), len(accepted), len(rejected)


def check_rejections():
    # Mutated source inputs, never mutated generated output: no fallback can
    # silently accept a changed body, callback ordering, or GBA target constant.
    import copy
    load_shared_constants()
    emerald, firered = read_source(EM, 'emerald'), read_source(FR, 'firered')
    emc = read_json(ROOT / 'public/emerald/constants.json')
    frc = read_json(ROOT / 'public/fr/constants.json')
    action = 'MOVEMENT_ACTION_FACE_RIGHT'
    assert compare_action(action, emerald, firered, emc, frc) is None
    body_name = emerald[2][emerald[1][action]][0]
    changed = copy.deepcopy(emerald)
    changed[0][body_name] = changed[0][body_name].replace('return TRUE;', 'return FALSE;')
    assert compare_action(action, changed, firered, emc, frc).startswith('different bodies')
    del changed[0][body_name]
    assert compare_action(action, changed, firered, emc, frc).startswith('unresolved body')
    reordered = copy.deepcopy(emerald)
    reordered[2][reordered[1][action]].reverse()
    assert compare_action(action, reordered, firered, emc, frc).startswith('different bodies')
    # A transitively reached helper that differs and was not reviewed rejects the action;
    # a reviewed difference keeps it accepted.
    drifted = copy.deepcopy(emerald)
    drifted[0]['ShiftObjectEventCoords'] += ' x++;'
    assert compare_action(action, drifted, firered, emc, frc) == 'unreviewed helper difference ShiftObjectEventCoords'
    assert 'SetObjectEventDirection' in REVIEWED_HELPER_DIFFERENCES
    reviewed = copy.deepcopy(emerald)
    reviewed[0]['SetObjectEventDirection'] += ' x++;'
    assert compare_action(action, reviewed, firered, emc, frc) is None
    assert compare_action('MOVEMENT_ACTION_WALK_SLOW_DOWN', emerald, firered, emc, frc) is None
    # Sprite-data macros, MOVE_SPEED_* and renamed WalkSlow helpers are reviewed, not guessed.
    pop = 'MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_DOWN'
    assert compare_action(pop, emerald, firered, emc, frc) is None
    assert compare_action('MOVEMENT_ACTION_FLY_DOWN', emerald, firered, emc, frc) is None
    assert compare_action('MOVEMENT_ACTION_WALK_DOWN_AFFINE', emerald, firered, emc, frc) is None
    speed = copy.deepcopy(emerald)
    pop_body = emerald[2][emerald[1][pop]][0]
    speed[0][pop_body] = speed[0][pop_body].replace(', 1)', ', 2)')
    assert compare_action(pop, speed, firered, emc, frc).startswith('different bodies')
    saved = dict(SHARED_NUMERIC_CONSTANTS)
    SHARED_NUMERIC_CONSTANTS['MOVE_SPEED_FAST_1'] = 2
    assert compare_action(pop, emerald, firered, emc, frc).startswith('different bodies')
    SHARED_NUMERIC_CONSTANTS.update(saved)
    renamed = copy.deepcopy(emerald)
    renamed[0]['UpdateWalkSlowAnim'] += ' x++;'
    assert compare_action('MOVEMENT_ACTION_WALK_DOWN_AFFINE', renamed, firered, emc, frc) == 'unreviewed helper difference UpdateWalkSlowAnim'
    # Brace unwrapping stays limited to a single statement.
    assert normalize('if(a){x;y;}') != normalize('if(a)x;y;')
    assert normalize('if(a){x;}') == normalize('if(a)x;')
    assert 'DIR_EAST' in emc and 'DIR_EAST' in frc
    assert compare_action(action, emerald, firered, {**emc, 'DIR_EAST': -1}, frc) == 'different target constant DIR_EAST'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result, accepted, rejected = generate()
    if args.check:
        check_rejections()
        if not OUT.exists() or OUT.read_text() != result: raise SystemExit('Stale Emerald movement contract; regenerate')
    else: OUT.write_text(result)
    print(f'Movement source contract: {accepted} shared, {rejected} regional (not implemented by this generator)')
