// pokeemerald trainer_see.c: the part the Hoenn scripts call after a trainer battle.
import { actionFace, MOVEMENT_ACTION_STEP_END } from "@core/field/objectEvents";
import { LOCALID_PLAYER, SetMovingNpcId } from "@core/script/commands";
import type { ScriptRunner } from "@core/script/context";
import { save } from "@game/save";

/** trainer_see.c PlayerFaceTrainerAfterBattle: gPostBattleMovementScript is two bytes (face, STEP_END). */
export function PlayerFaceTrainerAfterBattle(ctx: ScriptRunner): void {
  const ow = ctx.ow;
  const trainerSee = ow.game.trainerSee;
  const gPostBattleMovementScript: number[] = [];
  if (trainerSee.gTrainerApproachedPlayer) {
    const objEvent = ow.objects.objects[trainerSee.gApproachingTrainerObjectEventIds[trainerSee.gWhichTrainerToFaceAfterBattle]!]!;
    gPostBattleMovementScript[0] = actionFace(ow.objects.GetOppositeDirection(objEvent.facingDirection));
  } else {
    gPostBattleMovementScript[0] = actionFace(ow.player.object.facingDirection);
  }
  gPostBattleMovementScript[1] = MOVEMENT_ACTION_STEP_END;
  ow.game.scriptMovement.ScriptMovement_StartObjectMovementScript(LOCALID_PLAYER, save.location.mapNum, save.location.mapGroup, gPostBattleMovementScript);
  SetMovingNpcId(LOCALID_PLAYER);
}
