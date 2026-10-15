"""PREPARED actor/weather/camera callbacks; unchanged Clang-extracted fall task family."""
from pathlib import Path
import json
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'decomp'))
import clang_ast
from common import BUILD
path=clang_ast.DECOMP/'src/field_effect.c'
ast=clang_ast.dump_clang_ast_json(path)
pre=clang_ast.preprocess_c_file(path).read_text()
names=['Task_FallWarpFieldEffect']+[f'FallWarpEffect_{i}' for i in range(1,8)]
funcs=clang_ast.extract_functions(ast,set(names))
def source(node):
 r=node['range'];return pre[r['begin']['offset']:r['end']['offset']+r['end']['tokLen']]
sequence=next(n for n in ast['inner'] if n.get('kind')=='VarDecl' and n.get('name')=='sFallWarpEffectCBPtrs')
prefix=r'''
#include <stdint.h>
#include <stdio.h>
#include <stddef.h>
#include <string.h>
typedef uint8_t u8;typedef uint8_t bool8;typedef int8_t s8;typedef int16_t s16;typedef int32_t s32;typedef uint16_t u16;
#define TRUE 1
#define FALSE 0
#define SUBSPRITES_IGNORE_PRIORITY 2
#define PLAYER_AVATAR_STATE_SURFING 3
struct ObjectEvent {u8 facingDirection,invisible,fixedPriority,triggerGroundEffectsOnMove,triggerGroundEffectsOnStop,landingJump;};
struct Sprite {s16 y,y2; s8 centerToCornerVecY; u8 subspriteMode;struct {u8 priority;}oam;};
struct Task {s16 data[16];};
static struct Sprite gSprites[1];static struct ObjectEvent gObjectEvents[1];static struct Task gTasks[1];
static struct {u8 objectEventId,spriteId,preventStep;}gPlayerAvatar;
static s16 gSpriteCoordOffsetY;
static int tick,weatherAfter,water,pan,active,lastSound,soundCount,surf;
static void CameraObjectReset1(void){}
static void CameraObjectReset2(void){}
static u8 GetPlayerFacingDirection(void){return gObjectEvents[0].facingDirection;}
static u8 GetFaceDirectionMovementAction(u8 d){return d;}
static bool8 ObjectEventSetHeldMovement(struct ObjectEvent*o,u8 d){o->facingDirection=d;return FALSE;}
static bool8 IsWeatherNotFadingIn(void){return tick>=weatherAfter;}
static void PlaySE(u16 id){lastSound=id;soundCount++;}
static void SetCameraPanningCallback(void(*fn)(void)){(void)fn;}
static void SetCameraPanning(s16 x,s16 y){(void)x;pan=y;}
static void UnlockPlayerFieldControls(void){}
static void UnfreezeObjectEvents(void){}
static void InstallCameraPanAheadCallback(void){pan=0;}
static void PlayerGetDestCoords(s16*x,s16*y){*x=*y=0;}
static u8 MapGridGetMetatileBehaviorAt(s16 x,s16 y){(void)x;(void)y;return 0;}
static bool8 MetatileBehavior_IsSurfableInSeafoamIslands(u8 behavior){(void)behavior;return water;}
static void VarSet(u16 id,u16 value){(void)id;(void)value;}
static void SetPlayerAvatarTransitionFlags(u16 flags){surf=flags;}
static void SetHelpContext(u8 id){(void)id;}
static u8 FindTaskIdByFunc(void(*fn)(u8)){(void)fn;return 0;}
static void DestroyTask(u8 id){(void)id;active=0;}
_Static_assert(sizeof(s16)==2&&sizeof(s8)==1,"GBA scalar widths");
'''
main=r'''
static void record(int y,int center,int weather,int wet){struct ObjectEvent*o=&gObjectEvents[0];struct Sprite*s=&gSprites[0];
 printf("[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]\n",y,center,weather,wet,tick,active,gTasks[0].data[0],o->invisible,o->fixedPriority,o->triggerGroundEffectsOnMove,o->triggerGroundEffectsOnStop,o->landingJump,s->y2,s->oam.priority,s->subspriteMode,gPlayerAvatar.preventStep,pan,soundCount,lastSound,surf);
}
int main(void){for(int y=32;y<=120;y+=(y==32?40:48))for(int center=-8;center>=-16;center-=8)for(int weather=0;weather<=20;weather+=20)for(int wet=0;wet<=1;wet++){
 memset(gSprites,0,sizeof(gSprites));memset(gObjectEvents,0,sizeof(gObjectEvents));memset(gTasks,0,sizeof(gTasks));
 gSprites[0].y=y;gSprites[0].centerToCornerVecY=center;gSprites[0].oam.priority=2;gSprites[0].subspriteMode=1;gObjectEvents[0].facingDirection=1;
 gPlayerAvatar.preventStep=0;pan=0;active=1;lastSound=soundCount=surf=0;weatherAfter=weather;water=wet;tick=0;record(y,center,weather,wet);
 while(active&&++tick<300){Task_FallWarpFieldEffect(0);record(y,center,weather,wet);}if(active)return 2;
}}
'''
folder=BUILD/'checks';folder.mkdir(parents=True,exist_ok=True)
c=folder/'fall-native.c';binary=folder/'fall-native'
bodies=[source(funcs[n].raw_node) for n in names]
prototypes='\n'.join(b[:b.index('{')].strip()+';' for b in bodies)
c.write_text(prefix+'\n'+prototypes+'\n'+source(sequence)+';\n'+'\n'.join(bodies)+'\n'+main)
subprocess.run(['clang','-std=c11','-Werror',str(c),'-o',str(binary)],check=True)
r=subprocess.run([str(binary)],text=True,capture_output=True,check=True)
print(json.dumps([json.loads(line) for line in r.stdout.splitlines()]))
