import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rankMoves,typeMultiplier,hpItem} from './strategy.js';
const text=readFileSync('src/fr/generated/constants.ts','utf8');
const C=Object.fromEntries([...text.matchAll(/export const (\w+) = (\d+);/g)].map(m=>[m[1],Number(m[2])]));
const rom=JSON.parse(readFileSync('public/fr/data/moves.json','utf8'));
const foe=(type1,type2=type1,ability=0)=>({type1,type2,ability,status2:0,defense:20,spDefense:20});
const ivy={moves:[C.MOVE_SLEEP_POWDER,C.MOVE_GROWL,C.MOVE_LEECH_SEED,C.MOVE_VINE_WHIP],pp:[15,40,10,10],type1:C.TYPE_GRASS,type2:C.TYPE_POISON,attack:25,spAttack:30,status1:0};
const bird={moves:[C.MOVE_TACKLE,C.MOVE_SAND_ATTACK,C.MOVE_GUST,0],pp:[35,15,35,0],type1:C.TYPE_NORMAL,type2:C.TYPE_FLYING,attack:20,spAttack:20,status1:0};
// FireRed Tackle has power 35/accuracy 95; Gust has 40/100.
// Tackle wins here against Electric, which resists Flying.
// Independent expectations from gTypeEffectiveness (battle_main.c).
assert.equal(typeMultiplier(C.TYPE_GRASS,foe(C.TYPE_ROCK,C.TYPE_GROUND),rom.typeEffectiveness,C),4);
assert.equal(typeMultiplier(C.TYPE_GRASS,foe(C.TYPE_POISON,C.TYPE_FLYING),rom.typeEffectiveness,C),0.25);
assert.equal(typeMultiplier(C.TYPE_NORMAL,foe(C.TYPE_GHOST),rom.typeEffectiveness,C),0);
assert.equal(typeMultiplier(C.TYPE_NORMAL,{...foe(C.TYPE_GHOST),status2:C.STATUS2_FORESIGHT},rom.typeEffectiveness,C),1);
assert.equal(typeMultiplier(C.TYPE_GROUND,foe(C.TYPE_POISON,C.TYPE_POISON,C.ABILITY_LEVITATE),rom.typeEffectiveness,C),0);
assert.equal(typeMultiplier(C.TYPE_WATER,foe(C.TYPE_NORMAL,C.TYPE_NORMAL,C.ABILITY_WATER_ABSORB),rom.typeEffectiveness,C),0);
assert.equal(rankMoves(ivy,foe(C.TYPE_ROCK,C.TYPE_GROUND),rom,C)[0].move,C.MOVE_VINE_WHIP);
assert.equal(rankMoves(bird,foe(C.TYPE_BUG,C.TYPE_GRASS),rom,C)[0].move,C.MOVE_GUST);
assert.equal(rankMoves(bird,foe(C.TYPE_ELECTRIC),rom,C)[0].move,C.MOVE_TACKLE);
assert.deepEqual(rankMoves({...ivy,pp:[15,40,10,0]},foe(C.TYPE_NORMAL),rom,C),[]);
assert.equal(rankMoves(bird,foe(C.TYPE_POISON),rom,C,{disabledMove:C.MOVE_TACKLE})[0].move,C.MOVE_GUST);
assert.deepEqual(rankMoves(ivy,foe(C.TYPE_NORMAL),rom,C,{encoredMove:C.MOVE_SLEEP_POWDER}),[]);
assert.equal(hpItem({hp:10,maxHP:50},[{item:C.ITEM_POTION,quantity:1},{item:C.ITEM_SUPER_POTION,quantity:1}],C).item,C.ITEM_SUPER_POTION);
assert.equal(hpItem({hp:50,maxHP:50},[{item:C.ITEM_POTION,quantity:1}],C),null);
assert.equal(hpItem({hp:0,maxHP:50},[{item:C.ITEM_POTION,quantity:1}],C),null);
const mixed={...ivy,moves:[C.MOVE_TACKLE,C.MOVE_VINE_WHIP,0,0],pp:[35,10,0,0],attack:20,spAttack:20};
assert.equal(rankMoves(mixed,foe(C.TYPE_NORMAL),rom,C)[0].move,C.MOVE_VINE_WHIP);
assert.equal(rankMoves({...mixed,statStages:[6,6,6,6,0,6,6,6]},foe(C.TYPE_NORMAL),rom,C)[0].move,C.MOVE_TACKLE);
console.log('strategy source cases PASS (types, immunities, PP, restrictions, medicine)');
