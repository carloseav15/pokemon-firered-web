"""PREPARED actor/scheduler callbacks; compile unchanged teleport task bodies from Clang AST.
Print native traces for the shared TS check. This is arithmetic/state coverage, not map or rendering parity.
"""
from pathlib import Path
import json
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'decomp'))
import clang_ast
from common import BUILD

path = clang_ast.DECOMP / 'src/field_player_avatar.c'
ast = clang_ast.dump_clang_ast_json(path)
pre = clang_ast.preprocess_c_file(path).read_text()
names = ['SavePlayerFacingDirectionForTeleport', 'GetTeleportSavedFacingDirection', 'TeleportAnim_RotatePlayer',
         'Task_TeleportWarpOutPlayerAnim', 'Task_TeleportWarpInPlayerAnim', 'StartTeleportWarpOutPlayerAnim',
         'WaitTeleportWarpOutPlayerAnim', 'StartTeleportInPlayerAnim', 'WaitTeleportInPlayerAnim']
funcs = clang_ast.extract_functions(ast, set(names))
def source(node):
    r = node['range']
    return pre[r['begin']['offset']:r['end']['offset']+r['end']['tokLen']]
sequence = next(n for n in ast['inner'] if n.get('kind') == 'VarDecl' and n.get('name') == 'sTeleportFacingDirectionSequence')
prefix = r'''
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8; typedef int16_t s16; typedef uint16_t u16; typedef uint32_t bool32;
#define TRUE 1
#define FALSE 0
#define DIR_NONE 0
#define DIR_SOUTH 1
#define DIR_NORTH 2
#define DIR_WEST 3
#define DIR_EAST 4
#define SUBSPRITES_OFF 0
struct ObjectEvent { u8 spriteId, facingDirection, fixedPriority; };
struct Sprite { s16 y, y2; struct {u8 priority;} oam; u8 subpriority, subspriteMode; };
struct Task { s16 data[16]; };
static struct ObjectEvent gObjectEvents[1]; static struct Sprite gSprites[1]; static struct Task gTasks[1];
static struct {u8 objectEventId, spriteId;} gPlayerAvatar;
static s16 gTotalCameraPixelOffsetY;
static u8 sTeleportSavedFacingDirection;
static int active, tick, heldDelay, pendingFace;
static void (*callback)(u8);
static u8 CreateTask(void (*fn)(u8), u8 priority) { (void)priority; memset(gTasks,0,sizeof(gTasks));callback=fn;active=1;return 0; }
static void DestroyTask(u8 id) { (void)id; active=0; }
static int FuncIsActiveTask(void (*fn)(u8)) { return active && callback==fn; }
static void CameraObjectReset1(void) {}
static void CameraObjectReset2(void) {}
static int ObjectEventClearHeldMovementIfFinished(struct ObjectEvent *o) { (void)o;return tick>=heldDelay; }
static int ObjectEventCheckHeldMovementStatus(struct ObjectEvent *o) { (void)o;return tick%17!=8 && tick%17!=9; }
static u8 GetFaceDirectionMovementAction(u8 d) { return d; }
static void ObjectEventForceSetHeldMovement(struct ObjectEvent *o,u8 d) { (void)o;pendingFace=d; }
_Static_assert(sizeof(s16)==2 && sizeof(u8)==1,"GBA scalar widths");
'''
main = r'''
static void print_state(int direction,int y,int delay,int phase) {
 struct Sprite *s=&gSprites[0];struct ObjectEvent *o=&gObjectEvents[0];
 printf("[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]\n",direction,y,delay,phase,tick,active,o->facingDirection,s->y+s->y2,s->oam.priority,s->subpriority,o->fixedPriority,s->subspriteMode);
}
int main(void) {
 for(int direction=1;direction<=4;direction++)for(int y=32;y<=172;y+=(y==32?48:92))for(int delay=0;delay<=3;delay+=3){
  heldDelay=delay;sTeleportSavedFacingDirection=0;
  for(int phase=0;phase<2;phase++){
   memset(gSprites,0,sizeof(gSprites));memset(gObjectEvents,0,sizeof(gObjectEvents));
   gSprites[0].y=y;gSprites[0].oam.priority=2;gSprites[0].subpriority=80;gSprites[0].subspriteMode=1;
   gObjectEvents[0].facingDirection=phase?1:direction;
   pendingFace=-1;tick=0;if(phase)StartTeleportInPlayerAnim();else StartTeleportWarpOutPlayerAnim();
   if(pendingFace>=0){gObjectEvents[0].facingDirection=pendingFace;pendingFace=-1;}
   print_state(direction,y,delay,phase);
   while(active && ++tick<400){callback(0);if(pendingFace>=0){gObjectEvents[0].facingDirection=pendingFace;pendingFace=-1;}print_state(direction,y,delay,phase);}
   if(active)return 2;
  }
 }
}
'''
folder = BUILD / 'checks'; folder.mkdir(parents=True, exist_ok=True)
c = folder / 'teleport-native.c'; binary = folder / 'teleport-native'
c.write_text(prefix+'\n'+source(sequence)+';\n'+'\n'.join(source(funcs[n].raw_node) for n in names)+'\n'+main)
subprocess.run(['clang','-std=c11','-Werror',str(c),'-o',str(binary)],check=True)
result = subprocess.run([str(binary)],text=True,capture_output=True,check=True)
print(json.dumps([json.loads(line) for line in result.stdout.splitlines()]))
