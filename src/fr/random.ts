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

/** main.c GetGeneratedTrainerIdLower. */
export function GetGeneratedTrainerIdLower(): number { return generatedTrainerIdLower; }

/** new_game.c InitPlayerTrainerId; upper half comes from the next Random() draw. */
export function InitPlayerTrainerId(): number {
  ensureTimerSeed();
  const trainerId = ((random() << 16) | generatedTrainerIdLower) >>> 0;
  const bytes = [0, 0, 0, 0];
  SetTrainerId(trainerId, bytes);
  return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

/** new_game.c SetTrainerId: write a trainer ID in SaveBlock2 little-endian order. */
export function SetTrainerId(trainerId: number, dst: number[], offset = 0): void {
  const value = trainerId >>> 0;
  for (let i = 0; i < 4; i++) dst[offset + i] = (value >>> (i * 8)) & 0xff;
}

/** new_game.c CopyTrainerId: copy the four bytes used by link/mail records. */
export function CopyTrainerId(dst: number[], src: ArrayLike<number>, dstOffset = 0, srcOffset = 0): void {
  for (let i = 0; i < 4; i++) dst[dstOffset + i] = src[srcOffset + i] & 0xff;
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
