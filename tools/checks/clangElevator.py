"""Execute unchanged Clang-extracted field_specials.c elevator tasks.
PREPARED camera/audio/map/script callbacks record their observable operations.
"""
from pathlib import Path
import json
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'decomp'))
import clang_ast
from common import BUILD

path = clang_ast.DECOMP / 'src/field_specials.c'
ast = clang_ast.dump_clang_ast_json(path)
pre = clang_ast.preprocess_c_file(path).read_text()
def source(node):
    r = node['range']
    return pre[r['begin']['offset']:r['end']['offset'] + r['end']['tokLen']]
names = {'AnimateElevator', 'Task_ElevatorShake', 'AnimateElevatorWindowView', 'Task_AnimateElevatorWindowView'}
functions = clang_ast.extract_functions(ast, names)
assert set(functions) == names
bodies = [source(functions[n].raw_node) for n in sorted(names)]
tables = {'sElevatorAnimationDuration', 'sElevatorWindowAnimDuration', 'sElevatorWindowMetatilesGoingUp', 'sElevatorWindowMetatilesGoingDown'}
arrays = [source(n) + ';' for n in ast['inner'] if n.get('kind') == 'VarDecl' and n.get('name') in tables and any(c.get('kind') == 'InitListExpr' for c in n.get('inner', []))]
assert len(arrays) == 4
prefix = r'''
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8; typedef uint16_t u16; typedef int16_t s16; typedef u8 bool8;
#define TRUE 1
#define FALSE 0
struct Task {void (*func)(u8); int priority, active; s16 data[16];};
static struct Task gTasks[16];
static u16 gSpecialVar_0x8005, gSpecialVar_0x8006;
static int pan, stop, restore, resume, sound, draw, writes, hash;
static u8 CreateTask(void (*func)(u8), int priority) {for(int i=0;i<16;i++)if(!gTasks[i].active){memset(&gTasks[i],0,sizeof(gTasks[i]));gTasks[i].func=func;gTasks[i].priority=priority;gTasks[i].active=1;return i;}return 0;}
static void DestroyTask(u8 id){gTasks[id].active=0;}
static int FuncIsActiveTask(void (*func)(u8)){for(int i=0;i<16;i++)if(gTasks[i].active&&gTasks[i].func==func)return 1;return 0;}
static void SetCameraPanningCallback(void *cb){(void)cb;stop++;}
static void SetCameraPanning(int x,int y){(void)x;pan=y;}
static void InstallCameraPanAheadCallback(void){restore++;}
static void ScriptContext_Enable(void){resume++;}
static void PlaySE(int id){sound=id;}
static void MapGridSetMetatileIdAt(int x,int y,int v){writes++;hash=(hash*31+x*17+y*13+v)&0xffff;}
static void DrawWholeMapView(void){draw++;}
_Static_assert(sizeof(s16)==2 && sizeof(u16)==2,"GBA scalar widths");
'''
main = r'''
int main(void){
 int values[]={0,1,2,3,4,7,8,9,14,15,65535};
 for(int a=0;a<11;a++)for(int b=0;b<11;b++){
  memset(gTasks,0,sizeof(gTasks));pan=stop=restore=resume=sound=draw=writes=hash=0;
  gSpecialVar_0x8005=values[a];gSpecialVar_0x8006=values[b];AnimateElevator();
  for(int frame=0;frame<220;frame++){
   int active=0;for(int i=0;i<16;i++)active+=gTasks[i].active;
   printf("[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]\n",values[a],values[b],frame,active,pan,stop,restore,resume,sound,draw,writes,hash,FuncIsActiveTask(Task_AnimateElevatorWindowView));
   if(!active)break;
   for(int priority=8;priority<=9;priority++)for(int i=0;i<16;i++)if(gTasks[i].active&&gTasks[i].priority==priority)gTasks[i].func(i);
  }
 }
}
'''
folder = BUILD / 'checks'; folder.mkdir(parents=True, exist_ok=True)
c = folder / 'elevator-native.c'; binary = folder / 'elevator-native'
prototypes = '\n'.join(b.split('{', 1)[0].strip() + ';' for b in bodies)
c.write_text(prefix + '\n' + prototypes + '\n' + '\n'.join(arrays) + '\n' + '\n'.join(bodies) + '\n' + main)
subprocess.run(['clang', '-std=c11', '-Werror', str(c), '-o', str(binary)], check=True)
result = subprocess.run([str(binary)], capture_output=True, text=True, check=True)
print(json.dumps([json.loads(line) for line in result.stdout.splitlines()]))
