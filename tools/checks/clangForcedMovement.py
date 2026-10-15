"""PREPARED collision/action callbacks; unchanged C dispatch/predicates from Clang.
The source, not a second hand-written decision table, supplies the oracle.
"""
from pathlib import Path
import json
import re
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'decomp'))
import clang_ast
from common import BUILD

path = clang_ast.DECOMP / 'src/field_player_avatar.c'
ast = clang_ast.dump_clang_ast_json(path)
pre = clang_ast.preprocess_c_file(path).read_text()
def source(node, text=pre):
    r = node['range']
    return text[r['begin']['offset']:r['end']['offset']+r['end']['tokLen']]
table = next(n for n in ast['inner'] if n.get('kind')=='VarDecl' and n.get('name')=='sForcedMovementFuncs')
table_src = source(table)
names = set(re.findall(r'ForcedMovement_\w+', table_src)) | {'TryUpdatePlayerSpinDirection','TryDoMetatileBehaviorForcedMovement','DoForcedMovement','DoForcedMovementInCurrentDirection','ForcedMovement_Slide','PlaySpinSound','PlayerApplyTileForcedMovement'}
funcs = clang_ast.extract_functions(ast, names)
predicates = set(re.findall(r'MetatileBehavior_\w+', table_src)) | {'MetatileBehavior_IsSpinTile','MetatileBehavior_IsStopSpinning'}
mb_path = clang_ast.DECOMP / 'src/metatile_behavior.c'
mb_ast = clang_ast.dump_clang_ast_json(mb_path)
mb_pre = clang_ast.preprocess_c_file(mb_path).read_text()
mb_funcs = clang_ast.extract_functions(mb_ast,predicates)
bodies = [source(funcs[n].raw_node) for n in sorted(names)] + [source(mb_funcs[n].raw_node,mb_pre) for n in sorted(predicates)]
constants = dict(re.findall(r'export const (\w+) = (\d+);', Path('src/games/firered/generated/constants.ts').read_text()))
tokens = set(re.findall(r'\b(?:MB_|DIR_|COLLISION_|PLAYER_AVATAR_(?:FLAG|STATE)_|SE_)\w+\b', '\n'.join(bodies))) | {'MOVING','PLAYER_AVATAR_FLAG_CONTROLLABLE','PLAYER_AVATAR_FLAG_FORCED','MB_SPIN_RIGHT'}
defines='\n'.join('#define '+t+' '+constants[t] for t in sorted(tokens))
prefix=r'''
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8; typedef uint8_t bool8;
typedef void (*MovementAction)(u8);
#define TRUE 1
#define FALSE 0
struct ObjectEvent {u8 heldMovementFinished,currentMetatileBehavior,movementDirection,facingDirection,facingDirectionLocked,disableAnim,enableAnim;};
struct PlayerAvatar {u8 flags,objectEventId,lastSpinTile,runningState;};
static struct PlayerAvatar gPlayerAvatar;
static struct ObjectEvent gObjectEvents[1],*sPlayerObjectPtr;
static int collision, action, actionDir, soundCount, clearCount, setCount,collisionCount;
static u8 CheckForPlayerAvatarCollision(u8 d){(void)d;collisionCount++;return collision;}
static void SetObjectEventDirection(struct ObjectEvent*o,u8 d){setCount++;o->movementDirection=d;if(!o->facingDirectionLocked)o->facingDirection=d;}
static void ObjectEventClearHeldMovement(struct ObjectEvent*o){clearCount++;o->heldMovementFinished=0;}
static void PlaySE(int id){(void)id;soundCount++;}
static void PlayerWalkFast(u8 d){action=1;actionDir=d;}
static void PlayerWalkNormal(u8 d){action=2;actionDir=d;}
static void PlayerRideWaterCurrent(u8 d){action=3;actionDir=d;}
static void PlayerGoSpin(u8 d){action=4;actionDir=d;}
static void PlayerJumpLedge(u8 d){action=5;actionDir=d;}
static void DoPlayerMatJump(void){action=6;}
static void DoPlayerMatSpin(void){action=7;}
_Static_assert(sizeof(u8)==1,"GBA scalar widths");
'''
main=r'''
int main(void){
 int collisions[]={0,1,5,6,7,8};
 for(int b=0;b<256;b++)for(int f=0;f<4;f++)for(int d=1;d<=4;d++)for(int c=0;c<6;c++)for(int held=0;held<2;held++){
  memset(&gPlayerAvatar,0,sizeof(gPlayerAvatar));memset(gObjectEvents,0,sizeof(gObjectEvents));
  gPlayerAvatar.flags=(f&1?PLAYER_AVATAR_FLAG_CONTROLLABLE:0)|(f&2?PLAYER_AVATAR_FLAG_FORCED:0);
  gPlayerAvatar.lastSpinTile=f&2?MB_SPIN_RIGHT:0;gPlayerAvatar.runningState=0;
  struct ObjectEvent *o=&gObjectEvents[0];o->currentMetatileBehavior=b;o->heldMovementFinished=held;
  o->movementDirection=d;o->facingDirection=d;o->facingDirectionLocked=1;o->disableAnim=1;
  collision=collisions[c];action=actionDir=soundCount=clearCount=setCount=collisionCount=0;
  int spin=TryUpdatePlayerSpinDirection(), result=spin;
  if(!spin){o->disableAnim=0;o->facingDirectionLocked=0;result=TryDoMetatileBehaviorForcedMovement();}
  printf("[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]\n",b,f,d,collision,held,spin,result,gPlayerAvatar.flags,gPlayerAvatar.lastSpinTile,gPlayerAvatar.runningState,o->movementDirection,o->facingDirection,o->facingDirectionLocked,o->disableAnim,o->enableAnim,action,actionDir,soundCount,clearCount,setCount,collisionCount);
 }
}
'''
folder=BUILD/'checks';folder.mkdir(parents=True,exist_ok=True)
c=folder/'forced-native.c';binary=folder/'forced-native'
prototypes='\n'.join(b.split('{',1)[0].strip()+';' for b in bodies)
c.write_text(prefix+'\n'+defines+'\n'+prototypes+'\n'+table_src+';\n'+'\n'.join(bodies)+'\n'+main)
subprocess.run(['clang','-std=c11','-Werror',str(c),'-o',str(binary)],check=True)
result=subprocess.run([str(binary)],text=True,capture_output=True,check=True)
print(json.dumps([json.loads(line) for line in result.stdout.splitlines()]))
