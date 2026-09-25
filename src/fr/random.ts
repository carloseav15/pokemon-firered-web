// random.c: the GBA linear congruential generator.

let seed = 0;
let generatedTrainerIdLower = 0;
let wildEncounterSeed: number | undefined;
let seededFromTimer1 = false;

export function random(): number {
  seed = (Math.imul(seed, 1103515245) + 24691) >>> 0;
  return seed >>> 16;
}

export function random32(): number {
  // random.h Random32: first draw is the low halfword, second is high.
  return (random() | (random() << 16)) >>> 0;
}

export function seedRng(value: number): void {
  seed = value & 0xffff;
}

/** main.c SeedRngAndSetTrainerId: Timer1's low half seeds the LCG and trainer ID. */
export function SeedRngAndSetTrainerId(timer1Low: number): void {
  generatedTrainerIdLower = timer1Low & 0xffff;
  seedRng(generatedTrainerIdLower);
  // ResetMenuAndMonGlobals consumes Random() to seed wild encounters before the menu.
  wildEncounterSeed = random();
  seededFromTimer1 = true;
}

/** new_game.c InitPlayerTrainerId; upper half comes from the next Random() draw. */
export function generatePlayerTrainerId(): number {
  ensureTimerSeed();
  return ((random() << 16) | generatedTrainerIdLower) >>> 0;
}

/** Consume the Random() value reserved by ResetMenuAndMonGlobals. */
export function takeWildEncounterSeed(): number {
  ensureTimerSeed();
  const value = wildEncounterSeed;
  wildEncounterSeed = undefined;
  return value ?? random();
}

/** Fallback for direct ?fr=new/?fr=continue launches that skip the title. */
function ensureTimerSeed(): void {
  if (seededFromTimer1) return;
  const timer1Low = Math.floor(performance.now() * 16777.216) & 0xffff;
  SeedRngAndSetTrainerId(timer1Low);
}
