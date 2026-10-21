// PREPARED: Strength testing in Fuchsia City Warden's House and cave mechanics.
// Verifies source EventScript_StrengthBoulder dialogue, FLAG_SYS_USE_STRENGTH activation,
// obstacle blocking, pushing boulder into walkable tile with coordinates persistence,
// and floor switch activation (Victory Road 1F).
export default async function run(ctx) {
  const p = ctx.page;
  const base = process.env.PW_BASE ?? 'http://localhost:5173';

  // 1. Fuchsia City Warden's House: rock at localId 2 (x: 11, y: 6), item ball at (11, 5)
  // Player stands west of the boulder at (10, 6) facing East
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_FUCHSIA_CITY_WARDENS_HOUSE&px=10&py=6', base).href);
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(2000);

  const hold = async (k, ms = 130) => {
    await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    await p.keyboard.up(k);
    await p.waitForTimeout(600);
  };

  await p.locator('#viewport').focus();

  // Initially without Strength flag, walking into boulder bumps and doesn't move it
  const initialBoulderPos = await p.evaluate(() => {
    const el = document.querySelector('.world-npc[data-map="MAP_FUCHSIA_CITY_WARDENS_HOUSE"][data-local-id="2"]');
    return el ? { left: el.style.left, top: el.style.top } : null;
  });

  await hold('ArrowRight'); // bump into boulder
  await p.waitForTimeout(500);

  const bumpedBoulderPos = await p.evaluate(() => {
    const el = document.querySelector('.world-npc[data-map="MAP_FUCHSIA_CITY_WARDENS_HOUSE"][data-local-id="2"]');
    return el ? { left: el.style.left, top: el.style.top } : null;
  });

  if (initialBoulderPos?.top !== bumpedBoulderPos?.top || initialBoulderPos?.left !== bumpedBoulderPos?.left) {
    throw Error('Boulder moved without FLAG_SYS_USE_STRENGTH active');
  }

  // PREPARED: Give Rainbow Badge (Badge 4) and Strength move to party lead
  await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    s.flagSet(C.FLAG_BADGE04_GET);
    s.save.party[0].moves[0] = C.MOVE_STRENGTH;
    s.save.party[0].pp[0] = 15;
  });

  // Interact with boulder: EventScript_StrengthBoulder prompts to use Strength
  await hold('z');
  await p.locator('#engine-interaction').waitFor({state:'visible', timeout: 5000});

  // Accept prompt with YES, wait through field effect animation, and dismiss follow-up message
  for (let i = 0; i < 120; i++) {
    const visible = await p.locator('#engine-interaction').isVisible();
    if (!visible) break;
    await hold('z', 100);
    await p.waitForTimeout(200);
  }
  await p.locator('#engine-interaction').waitFor({state:'hidden', timeout: 15000});

  const hasStrength = await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    return s.flagGet(C.FLAG_SYS_USE_STRENGTH);
  });

  if (!hasStrength) throw Error('EventScript_StrengthBoulder did not activate FLAG_SYS_USE_STRENGTH');

  await p.locator('#viewport').focus();
  await hold('ArrowRight', 300);
  await p.waitForTimeout(400);
  await hold('ArrowRight', 400);
  await p.waitForTimeout(1500);

  await ctx.shot('boulder-pushed');

  // Verify coordinates in saved viewer objects
  const savedObjects = await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const st = await import('/src/viewer/objectState.ts');
    return st.savedViewerObjects('MAP_FUCHSIA_CITY_WARDENS_HOUSE');
  });
  const boulderObj = savedObjects.find(o => o.localId === 2);
  if (!boulderObj || boulderObj.x !== 12 || boulderObj.y !== 6) {
    throw Error('Pushed boulder coordinates did not persist in savedViewerObjects: ' + JSON.stringify(boulderObj));
  }

  // Save/continue on this map must preserve the actual Strength push result
  await p.getByRole('button', { name: "Menu · Esc" }).click();
  await p.locator('#explore-save').click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1000);

  await p.reload();
  await p.waitForFunction(() => performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(1500);

  // Verify boulder retained its pushed position (12, 6) after reload
  const reloadedSaved = await p.evaluate(async () => {
    const st = await import('/src/viewer/objectState.ts');
    return st.savedViewerObjects('MAP_FUCHSIA_CITY_WARDENS_HOUSE');
  });
  const reloadedBoulder = reloadedSaved.find(o => o.localId === 2);
  if (!reloadedBoulder || reloadedBoulder.x !== 12 || reloadedBoulder.y !== 6) {
    throw Error('Pushed boulder coordinates lost after reload: ' + JSON.stringify(reloadedBoulder));
  }

  // 2. Victory Road 1F: push boulder onto floor switch MB_STRENGTH_BUTTON at (20, 16)
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VICTORY_ROAD_1F&px=20&py=14', base).href);
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(2000);

  // PREPARED: Ensure FLAG_SYS_USE_STRENGTH is active and position boulder directly north of switch at (20, 15)
  await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    const st = await import('/src/viewer/objectState.ts');
    s.flagSet(C.FLAG_SYS_USE_STRENGTH);
    // Put boulder localId 5 at (20, 15)
    st.storeViewerObjects('MAP_VICTORY_ROAD_1F', [
      { mapId: 'MAP_VICTORY_ROAD_1F', localId: 5, x: 20, y: 15, direction: 'south', invisible: false, removed: false, graphicsId: C.OBJ_EVENT_GFX_PUSHABLE_BOULDER }
    ]);
    const sess = await import('/src/viewer/session.ts');
    sess.saveViewerSession({ mapId: 'MAP_VICTORY_ROAD_1F', x: 20, y: 14, direction: 'south', dynamic: null });
  });
  await p.reload();
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(2000);

  await p.locator('#viewport').focus();
  // Player at (20, 14), boulder at (20, 15), switch at (20, 16). Push South!
  await hold('ArrowDown', 250);
  await p.waitForTimeout(3000);

  const vrState = await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    return {
      scene: s.varGet(C.VAR_MAP_SCENE_VICTORY_ROAD_1F),
    };
  });

  if (vrState.scene !== 100) {
    throw Error('Pushing boulder onto switch did not trigger VictoryRoad_1F_EventScript_FloorSwitch: ' + JSON.stringify(vrState));
  }

  await ctx.shot('victory-road-switch');

  return {
    wardenBoulder: boulderObj,
    victoryRoadScene: vrState.scene,
    errors: ctx.errors(),
  };
}
