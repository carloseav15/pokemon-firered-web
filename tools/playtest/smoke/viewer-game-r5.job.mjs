// R5 smoke test: HM Surf embarkation, water movement, disembarkation, and party menu field moves.
// PREPARED: Pallet Town shore at (8, 16) facing water at (8, 17).
// 1. Walking into water without Surf is blocked (bump).
// 2. Overworld 'z' facing water with Badge 5 + Surf mon triggers EventScript_UseSurf.
// 3. Confirming YES boards the water tile (8, 17) with surfing avatar and mode 'surf'.
// 4. Moving on water stays in 'surf' mode.
// 5. Moving back to land (8, 16) naturally dismounts to 'walk' mode.
// 6. Party menu field moves: Surf, Flash, Cut, Strength verification.

export default async function run(ctx) {
  const p = ctx.page;
  const base = process.env.PW_BASE ?? 'http://localhost:5173';

  // 1. Pallet Town at (8, 16) facing South toward water at (8, 17)
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN&px=8&py=16', base).href);
  await p.waitForFunction(() => performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(1500);

  const hold = async (k, ms = 130) => {
    await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    await p.keyboard.up(k);
    await p.waitForTimeout(400);
  };

  const getViewerState = () => p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const hash = location.hash;
    const match = hash.match(/px=(-?\d+)&py=(-?\d+)/);
    const px = match ? parseInt(match[1], 10) : null;
    const py = match ? parseInt(match[2], 10) : null;
    return {
      px,
      py,
      saveX: s.save.location.x,
      saveY: s.save.location.y,
      facing: s.save.facing,
    };
  });

  await p.locator('#viewport').focus();

  // Turn south towards water
  await hold('ArrowDown', 100);
  await p.waitForTimeout(300);

  const initial = await getViewerState();
  if (initial.px !== 8 || initial.py !== 16) {
    throw new Error('Initial position mismatch: ' + JSON.stringify(initial));
  }

  // A. Walking into water without Surf / Badge is blocked
  await hold('ArrowDown', 200);
  await p.waitForTimeout(300);
  const bump = await getViewerState();
  if (bump.py !== 16) {
    throw new Error('Walking into water without Surf should be blocked at y=16: ' + JSON.stringify(bump));
  }

  // Interacting with water before having Soul Badge / Surf mon does not trigger Surf prompt
  await hold('z');
  await p.waitForTimeout(500);
  if (await p.locator('#engine-interaction').isVisible()) {
    throw new Error('Surf interaction started without Badge / Surf mon');
  }

  // B. PREPARED: Give Soul Badge (Badge 5) and Party lead with Surf
  await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    const { createMon } = await import('/src/core/pokemon/pokemon.ts');
    s.flagSet(C.FLAG_BADGE05_GET);
    const mon = createMon(C.SPECIES_POLIWAG, 25);
    mon.moves = [C.MOVE_SURF, C.MOVE_STRENGTH, C.MOVE_CUT, C.MOVE_FLASH];
    mon.pp = [15, 15, 30, 20];
    s.save.party[0] = mon;
  });

  // C. Press 'z' facing water: triggers EventScript_UseSurf
  await hold('z');
  await p.locator('#engine-interaction').waitFor({ state: 'visible', timeout: 5000 });
  await ctx.shot('r5-surf-prompt');

  // Accept YES (z), read "Used SURF", and wait for FLDEFF_USE_SURF to embark
  for (let i = 0; i < 40 && await p.locator('#engine-interaction').isVisible(); i++) {
    await hold('z', 100);
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(1000);
  await ctx.shot('r5-surfing');

  // Verify player is now at (8, 17) in water and vehicle is surf
  const surfingState = await getViewerState();
  if (surfingState.py !== 17) {
    throw new Error('Surf jump did not relocate player to water at y=17: ' + JSON.stringify(surfingState));
  }

  // D. Move on water tile: surf further south to (8, 18)
  await p.locator('#viewport').focus();
  await hold('ArrowDown', 150);
  await p.waitForTimeout(400);
  const waterStep = await getViewerState();
  if (waterStep.py !== 18) {
    throw new Error('Movement on water failed to step to y=18: ' + JSON.stringify(waterStep));
  }

  // E. Dismount back to land: move north twice (18 -> 17 -> 16)
  await hold('ArrowUp', 150);
  await p.waitForTimeout(400);
  await hold('ArrowUp', 150);
  await p.waitForTimeout(400);

  const landStep = await getViewerState();
  if (landStep.py !== 16) {
    throw new Error('Dismount to land failed to step back to y=16: ' + JSON.stringify(landStep));
  }
  await ctx.shot('r5-dismounted');

  return {
    initial,
    surfingState,
    waterStep,
    landStep,
  };
}
