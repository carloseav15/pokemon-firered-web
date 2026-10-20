import * as C from '../games/firered/generated/constants';
import {ForcedMovement,type ForcedAction,type ForcedObject} from '@core/field/forcedMovement';
import type {WorldGrid} from './data/worldGrid';
import {planStep,type StepPlan} from './movement';
import type {Direction} from './render/sprites';
import type {PlayerVehicle} from './state';

const directions:Direction[]=['south','north','west','east'];
export type ForcedStep={action:ForcedAction;direction:Direction;facing:Direction;plan:StepPlan;freeze:boolean};
/** Navigation adapter: source dispatch/state, resident grid collision, existing avatar actions.
 * Surf embark is still the viewer's automatic adaptation; source collision side effects
 * (dismount/ledge) enter the same navigation jump path as keypad movement.
 */
export class ViewerForcedMovement {
  constructor(private readonly canLoad:(x:number,y:number)=>boolean) {}
  private readonly state={flags:C.PLAYER_AVATAR_FLAG_CONTROLLABLE,runningState:C.NOT_MOVING,lastSpinTile:0};
  private readonly object:ForcedObject={heldMovementFinished:true,currentMetatileBehavior:0,movementDirection:C.DIR_SOUTH,
    facingDirection:C.DIR_SOUTH,facingDirectionLocked:false,disableAnim:false,enableAnim:false};
  private step:ForcedStep|null=null;
  private loading=false;
  private sounds=0;
  private context!: {grid:WorldGrid;x:number;y:number;vehicle:PlayerVehicle;elevation:number};
  private readonly movement=new ForcedMovement(this.state,{
    object:()=>this.object,
    clearHeldMovement:()=>{this.object.heldMovementFinished=false;},
    setDirection:d=>{this.object.movementDirection=d;if(!this.object.facingDirectionLocked)this.object.facingDirection=d;},
    collision:d=>{
      const c=this.context,dir=directions[d-1]!;
      const plan=planStep(c.grid,c.x,c.y,dir,c.vehicle,c.elevation);
      if(plan.status==='loading'){this.loading=this.canLoad(plan.x,plan.y);return C.COLLISION_IMPASSABLE;}
      if(plan.status!=='ready')return C.COLLISION_IMPASSABLE;
      if(plan.jump)return C.COLLISION_LEDGE_JUMP;
      if(c.vehicle==='surf'&&plan.vehicle!=='surf'){
        // CanStopSurfing begins the special-jump action before returning collision5.
        this.queue('PlayerWalkNormal',d);return C.COLLISION_STOP_SURFING;
      }
      return C.COLLISION_NONE;
    },
    move:(action,d)=>this.queue(action,d),spinSound:()=>{this.sounds++;},
    // Secret Base mats: ignored gracefully if stepped on outside full minigame logic.
    matJump:()=>{},
    matSpin:()=>{},
  });
  private queue(action:ForcedAction,d:number):void{
    const c=this.context,dir=directions[d-1]!;
    this.step={action,direction:dir,facing:this.object.facingDirectionLocked?directions[this.object.facingDirection-1]!:dir,
      plan:planStep(c.grid,c.x,c.y,dir,c.vehicle,c.elevation),freeze:this.object.disableAnim};
  }
  reset(direction:Direction):void{
    Object.assign(this.state,{flags:C.PLAYER_AVATAR_FLAG_CONTROLLABLE,runningState:C.NOT_MOVING,lastSpinTile:0});
    Object.assign(this.object,{movementDirection:directions.indexOf(direction)+1,facingDirection:directions.indexOf(direction)+1,
      heldMovementFinished:true,facingDirectionLocked:false,disableAnim:false,enableAnim:false});
  }
  moved(direction:Direction,normal:boolean):void{
    this.object.movementDirection=directions.indexOf(direction)+1;
    if(!this.object.facingDirectionLocked)this.object.facingDirection=this.object.movementDirection;
    if(normal){this.state.runningState=C.MOVING;this.state.flags&=~C.PLAYER_AVATAR_FLAG_CONTROLLABLE;}
  }
  next(grid:WorldGrid,x:number,y:number,facing:Direction,vehicle:PlayerVehicle,elevation:number){
    this.context={grid,x,y,vehicle,elevation};this.step=null;this.loading=false;this.sounds=0;
    const state={...this.state},object={...this.object};
    this.object.facingDirection=directions.indexOf(facing)+1;
    this.object.currentMetatileBehavior=grid.behaviorAt(x,y);this.object.heldMovementFinished=true;
    const spin=this.movement.TryUpdatePlayerSpinDirection();let consumed=spin;
    if(!spin){this.object.disableAnim=false;this.object.facingDirectionLocked=false;consumed=this.movement.TryDoMetatileBehaviorForcedMovement();}
    // Streaming cannot be a native collision. Retry with the unchanged native state.
    if(this.loading){Object.assign(this.state,state);Object.assign(this.object,object);return{step:null,consumed:true,loading:true,sounds:0};}
    return{step:this.step as ForcedStep|null,consumed,loading:false,sounds:this.sounds};
  }
}
