import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rankMoves,typeMultiplier,hpItem,chooseMoveToForget,estimateDamage,simulateBattle} from './strategy.js';
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
// Full moveset: Razor Leaf (55/95, Grass STAB for Ivysaur) replaces the first move worth 0 to the attack policy;
// with four moves that all outrank it, nothing is forgotten; HM moves are never chosen.
const grass=[C.TYPE_GRASS,C.TYPE_POISON];
assert.equal(chooseMoveToForget([C.MOVE_SLEEP_POWDER,C.MOVE_GROWL,C.MOVE_LEECH_SEED,C.MOVE_VINE_WHIP],C.MOVE_RAZOR_LEAF,grass,rom,C),0);
assert.equal(chooseMoveToForget([C.MOVE_DOUBLE_EDGE,C.MOVE_SOLAR_BEAM,C.MOVE_BODY_SLAM,C.MOVE_EARTHQUAKE],C.MOVE_RAZOR_LEAF,grass,rom,C),-1);
assert.equal(chooseMoveToForget([C.MOVE_CUT,C.MOVE_VINE_WHIP,C.MOVE_TACKLE,C.MOVE_RAZOR_LEAF],C.MOVE_SLUDGE_BOMB,grass,rom,C),2);
assert.equal(chooseMoveToForget([C.MOVE_TACKLE,C.MOVE_GROWL,C.MOVE_TAIL_WHIP,C.MOVE_LEER],C.MOVE_GROWL,[C.TYPE_PSYCHIC,C.TYPE_PSYCHIC],rom,C),-1);
// Gen 3 base damage by hand (CalculateBaseDamage): L10, Atk 20 vs Def 20, Tackle 35 -> floor(floor(6*35*20/20)/50)+2 = 6,
// no STAB, neutral; expectation x0.925 mean roll x0.95 accuracy = 5.27.
const att={level:10,attack:20,spAttack:20,type1:C.TYPE_GRASS,type2:C.TYPE_GRASS,moves:[C.MOVE_TACKLE]};
const def={type1:C.TYPE_NORMAL,type2:C.TYPE_NORMAL,ability:0,status2:0,defense:20,spDefense:20};
assert.ok(Math.abs(estimateDamage(att,def,C.MOVE_TACKLE,rom,C)-6*0.925*0.95)<1e-9);
assert.equal(estimateDamage(att,{...def,type1:C.TYPE_GHOST,type2:C.TYPE_GHOST},C.MOVE_TACKLE,rom,C),0);
// A side that deals damage and takes none wins; a side that deals none loses.
const strong={...att,hp:50,maxHP:50,speed:10,defense:20,spDefense:20,ability:0,status2:0,species:1};
const wall={...def,level:10,attack:20,spAttack:20,moves:[C.MOVE_GROWL],hp:30,maxHP:30,speed:5,species:2};
assert.equal(simulateBattle([strong],[wall],rom,C).win,true);
assert.equal(simulateBattle([{...strong,moves:[C.MOVE_GROWL]}],[{...wall,moves:[C.MOVE_TACKLE]}],rom,C).win,false);
console.log('strategy source cases PASS (types, immunities, PP, restrictions, medicine)');
