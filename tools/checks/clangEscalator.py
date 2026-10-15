"""PREPARED movement/fade/map callbacks; unchanged Clang-extracted escalator task families.
field_effect.c supplies the warp-out/warp-in states and special_field_anim.c the tile task.
"""
from pathlib import Path
import json
import re
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'decomp'))
import clang_ast
from common import BUILD

def load(name):
    path = clang_ast.DECOMP / 'src' / name
    ast = clang_ast.dump_clang_ast_json(path)
    return ast, clang_ast.preprocess_c_file(path).read_text()

def source(node, text):
    r = node['range']
    return text[r['begin']['offset']:r['end']['offset'] + r['end']['tokLen']]

fe_ast, fe = load('field_effect.c')
sa_ast, sa = load('special_field_anim.c')
fe_names = ['StartEscalatorWarp', 'Task_EscalatorWarpFieldEffect', 'Escalator_AnimatePlayerGoingDown', 'Escalator_AnimatePlayerGoingUp',
            'Escalator_BeginFadeOutToNewMap', 'Escalator_TransitionToWarpInEffect', 'FieldCB_EscalatorWarpIn', 'Task_EscalatorWarpInFieldEffect'] \
    + [f'EscalatorWarpEffect_{i}' for i in range(1, 7)] + [f'EscalatorWarpInEffect_{i}' for i in range(1, 8)]
sa_names = ['SetEscalatorMetatile', 'Task_DrawEscalator', 'CreateEscalatorTask', 'StartEscalator', 'StopEscalator', 'IsEscalatorMoving']
fe_funcs = clang_ast.extract_functions(fe_ast, set(fe_names))
sa_funcs = clang_ast.extract_functions(sa_ast, set(sa_names))
def var(ast, text, name):
    return source(next(n for n in ast['inner'] if n.get('kind') == 'VarDecl' and n.get('name') == name), text)
tables = [var(fe_ast, fe, 'sEscalatorWarpFieldEffectFuncs') + ';', var(fe_ast, fe, 'sEscalatorWarpInFieldEffectFuncs') + ';'] + \
    [var(sa_ast, sa, n) + ';' for n in ['sEscalatorMetatiles_BottomNextRail', 'sEscalatorMetatiles_BottomRail', 'sEscalatorMetatiles_BottomNext',
                                   'sEscalatorMetatiles_Bottom', 'sEscalatorMetatiles_TopNext', 'sEscalatorMetatiles_Top', 'sEscalatorMetatiles_TopNextRail']]
fe_bodies = [source(fe_funcs[n].raw_node, fe) for n in fe_names]
sa_bodies = [source(sa_funcs[n].raw_node, sa) for n in sa_names]
tokens = {k for k in json.loads(Path('public/fr/constants.json').read_text()) if k.startswith('METATILE_PokemonCenter_Escalator_')}
consts = json.loads(Path('public/fr/constants.json').read_text())
defines = '\n'.join(f'#define {t} {consts[t]}' for t in sorted(tokens))
ts = dict(re.findall(r'export const (\w+) = (\d+);', Path('src/games/firered/generated/constants.ts').read_text()))
for t in ['MB_UP_ESCALATOR', 'MB_DOWN_ESCALATOR', 'QL_ESCALATOR_OUT', 'QL_ESCALATOR_IN', 'SE_ESCALATOR', 'DIR_EAST']:
    defines += f'\n#define {t} {ts[t]}'
sine = json.loads(Path('public/fr/cdata/trig.json').read_text())['defs']['gSineTable']['value']
prefix = r'''
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8;typedef uint8_t bool8;typedef int8_t s8;typedef int16_t s16;typedef int32_t s32;typedef uint16_t u16;typedef uint16_t bool16;
#define TRUE 1
#define FALSE 0
#define MAPGRID_COLLISION_MASK 0x0C00
''' + defines + r'''
typedef void (*TaskFunc)(u8);
struct Task {TaskFunc func;s16 data[16];u8 prev,next,priority,isActive;};
#define NUM_TASKS 16
#define HEAD 0xFE
#define TAIL 0xFF
static struct Task gTasks[NUM_TASKS];
struct Sprite {s16 x2,y2;};
static struct Sprite gSprites[1];
static struct {u8 objectEventId,spriteId;} gPlayerAvatar;
struct ObjectEvent {u8 facing;};
static struct ObjectEvent gObjectEvents[1];
static struct {u8 active;} gPaletteFade;
static const s16 gSineTable[320]={''' + ','.join(map(str, sine)) + r'''};
static s16 Sin(u16 i,s16 a){return (s16)((a*gSineTable[i])>>8);}
static s16 Cos(u16 i,s16 a){return (s16)((a*gSineTable[i+64])>>8);}
static int tick,fadeAfter,busyUntil,busy,destDown,facing,frozen,locks,fades,fadeIns,warps,callbackSet,sounds,qlOut,qlIn,lastHeld,music,loadMap;
static u16 grid[5][5];
static void (*gFieldCallback)(void);
static u8 FindFirstActive(void){for(int i=0;i<NUM_TASKS;i++)if(gTasks[i].isActive&&gTasks[i].prev==HEAD)return i;return NUM_TASKS;}
static void InsertTask(u8 n){u8 id=FindFirstActive();if(id==NUM_TASKS){gTasks[n].prev=HEAD;gTasks[n].next=TAIL;return;}
 while(1){if(gTasks[n].priority<gTasks[id].priority){u8 p=gTasks[id].prev;gTasks[n].prev=p;gTasks[n].next=id;if(p!=HEAD)gTasks[p].next=n;gTasks[id].prev=n;return;}
  if(gTasks[id].next==TAIL){gTasks[n].prev=id;gTasks[n].next=TAIL;gTasks[id].next=n;return;}id=gTasks[id].next;}}
static u8 CreateTask(TaskFunc f,u8 pr){for(int i=0;i<NUM_TASKS;i++)if(!gTasks[i].isActive){gTasks[i].func=f;gTasks[i].priority=pr;memset(gTasks[i].data,0,sizeof(gTasks[i].data));InsertTask(i);gTasks[i].isActive=1;return i;}return 0;}
static void DestroyTask(u8 id){struct Task*t=&gTasks[id];if(!t->isActive)return;t->isActive=0;
 if(t->prev==HEAD){if(t->next!=TAIL)gTasks[t->next].prev=HEAD;}else if(t->next==TAIL){gTasks[t->prev].next=TAIL;}else{gTasks[t->prev].next=t->next;gTasks[t->next].prev=t->prev;}}
static u8 FindTaskIdByFunc(TaskFunc f){for(int i=0;i<NUM_TASKS;i++)if(gTasks[i].isActive&&gTasks[i].func==f)return i;return TAIL;}
static void RunTasks(void){u8 id=FindFirstActive();if(id==NUM_TASKS)return;do{gTasks[id].func(id);id=gTasks[id].next;}while(id!=TAIL);}
static void FreezeObjectEvents(void){frozen=1;}
static void UnfreezeObjectEvents(void){frozen=0;}
static void CameraObjectReset1(void){}
static void CameraObjectReset2(void){}
static void QuestLog_OnEscalatorWarp(u8 d){if(d==QL_ESCALATOR_OUT)qlOut++;else qlIn++;}
static bool8 ObjectEventIsMovementOverridden(struct ObjectEvent*o){(void)o;return busy;}
static bool8 ObjectEventClearHeldMovementIfFinished(struct ObjectEvent*o){(void)o;if(tick>=busyUntil){busy=0;return 1;}return 0;}
static bool8 ObjectEventSetHeldMovement(struct ObjectEvent*o,u8 a){(void)o;lastHeld=a;busy=1;busyUntil=tick+2;return 0;}
static u8 GetFaceDirectionMovementAction(u8 d){return 100+d;}
static u8 GetWalkNormalMovementAction(u8 d){return 200+d;}
static u8 GetPlayerFacingDirection(void){return facing;}
static void PlaySE(u16 id){(void)id;sounds++;}
static void TryFadeOutOldMapMusic(void){music=1;}
static void WarpFadeOutScreen(void){fades++;gPaletteFade.active=1;}
static bool8 BGMusicStopped(void){return tick>=fadeAfter;}
static void WarpIntoMap(void){warps++;}
static void SetMainCallback2(void(*f)(void)){(void)f;loadMap=1;}
static void CB2_LoadMap(void){}
static void Overworld_PlaySpecialMapMusic(void){}
static void WarpFadeInScreen(void){fadeIns++;}
static void QuestLog_DrawPreviouslyOnQuestHeaderIfInPlaybackMode(void){}
static void LockPlayerFieldControls(void){locks++;}
static void UnlockPlayerFieldControls(void){locks--;}
static void PlayerGetDestCoords(s16*x,s16*y){*x=2;*y=2;}
static u8 MapGridGetMetatileBehaviorAt(s16 x,s16 y){(void)x;(void)y;return destDown?MB_DOWN_ESCALATOR:MB_UP_ESCALATOR;}
static u16 MapGridGetMetatileIdAt(s16 x,s16 y){return grid[y][x]&0x3ff;}
static void MapGridSetMetatileIdAt(s16 x,s16 y,u16 v){grid[y][x]=v;}
static void DrawWholeMapView(void){}
static u8 sEscalatorTaskId;
static void FieldCB_EscalatorWarpIn(void);
_Static_assert(sizeof(s16)==2,"GBA widths");
'''
main = r'''
static void record(int behavior,int fade,int moveBusy,int face,int down){
 printf("[%d,%d,%d,%d,%d,%d,%d",behavior,fade,moveBusy,face,down,tick,gSprites[0].x2*0+0);
 printf(",%d,%d",gSprites[0].x2,gSprites[0].y2);
 u8 out=FindTaskIdByFunc(Task_EscalatorWarpFieldEffect),in=FindTaskIdByFunc(Task_EscalatorWarpInFieldEffect),dr=FindTaskIdByFunc(Task_DrawEscalator);
 printf(",%d,%d,%d",out==TAIL?-1:gTasks[out].data[0],in==TAIL?-1:gTasks[in].data[0],dr==TAIL?-1:gTasks[dr].data[0]);
 printf(",%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d",frozen,locks,fades,fadeIns,warps,loadMap,sounds,qlOut,qlIn,lastHeld,busy,gFieldCallback!=0,IsEscalatorMoving()?1:0);
 for(int y=1;y<4;y++)for(int x=1;x<4;x++)printf(",%d",grid[y][x]);
 printf("]\n");
}
int main(void){
 static const u16 layout[9]={METATILE_PokemonCenter_Escalator_TopNextRail_Normal,METATILE_PokemonCenter_Escalator_Top_Normal,METATILE_PokemonCenter_Escalator_TopNext_Normal,
  METATILE_PokemonCenter_Escalator_BottomNextRail_Normal,METATILE_PokemonCenter_Escalator_BottomRail_Normal,METATILE_PokemonCenter_Escalator_BottomNext_Normal,
  METATILE_PokemonCenter_Escalator_Bottom_Normal,METATILE_PokemonCenter_Escalator_Top_Normal,METATILE_PokemonCenter_Escalator_Bottom_Normal};
 int behaviors[2]={MB_UP_ESCALATOR,MB_DOWN_ESCALATOR};
 for(int b=0;b<2;b++)for(int fade=1;fade<=5;fade+=4)for(int mb=0;mb<=3;mb+=3)for(int face=1;face<=4;face++)for(int down=0;down<=1;down++){
  memset(gTasks,0,sizeof(gTasks));for(int i=0;i<NUM_TASKS;i++){gTasks[i].prev=i;gTasks[i].next=i+1;}gTasks[0].prev=HEAD;gTasks[NUM_TASKS-1].next=TAIL;
  memset(gSprites,0,sizeof(gSprites));memset(grid,0,sizeof(grid));
  for(int i=0;i<9;i++)grid[1+i/3][1+i%3]=layout[i];
  gPlayerAvatar.objectEventId=0;gPlayerAvatar.spriteId=0;gPaletteFade.active=0;gFieldCallback=0;
  tick=0;fadeAfter=fade;busy=mb>0;busyUntil=mb;destDown=down;facing=face;frozen=locks=fades=fadeIns=warps=loadMap=sounds=qlOut=qlIn=lastHeld=music=0;
  StartEscalatorWarp(behaviors[b],10);record(behaviors[b],fade,mb,face,down);
  int pendingIn=-1;
  while(++tick<400){
   if(gPaletteFade.active&&tick>=fadeAfter)gPaletteFade.active=0;
   RunTasks();
   if(loadMap&&pendingIn<0){pendingIn=tick+3;}
   if(pendingIn==tick&&gFieldCallback){void(*cb)(void)=gFieldCallback;cb();}
   record(behaviors[b],fade,mb,face,down);
   if(pendingIn>=0&&tick>pendingIn&&FindTaskIdByFunc(Task_EscalatorWarpInFieldEffect)==TAIL&&FindTaskIdByFunc(Task_DrawEscalator)==TAIL)break;
  }
  if(tick>=400)return 2;
 }
}
'''
folder = BUILD / 'checks'
folder.mkdir(parents=True, exist_ok=True)
c = folder / 'escalator-native.c'
binary = folder / 'escalator-native'
protos = '\n'.join(b[:b.index('{')].strip() + ';' for b in fe_bodies + sa_bodies if b[:b.index('{')].strip().startswith('static') is False or True)
# static prototypes already declared in the extracted bodies' signatures
decl = []
for b in fe_bodies + sa_bodies:
    head = b[:b.index('{')].strip()
    decl.append((head if head.startswith('static') else 'static ' + head) + ';')
text = prefix + '\n' + '\n'.join(sorted(set(decl))) + '\n' + '\n'.join(tables[2:]) + '\n' + tables[0] + '\n' + tables[1] + '\n' + \
    '\n'.join(('static ' + b if not b.lstrip().startswith('static') else b) for b in sa_bodies) + '\n' + \
    '\n'.join(('static ' + b if not b.lstrip().startswith('static') else b) for b in fe_bodies) + '\n' + main
c.write_text(text)
subprocess.run(['clang', '-std=gnu11', '-w', str(c), '-o', str(binary)], check=True)
r = subprocess.run([str(binary)], text=True, capture_output=True)
if r.returncode:
    sys.exit(f'native escalator harness failed ({r.returncode})')
print(json.dumps([json.loads(line) for line in r.stdout.splitlines()]))
