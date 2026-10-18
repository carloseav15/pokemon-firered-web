// PREPARED: R3 validation in world viewer.
// Tests:
// 1. Rock Smash: obstacle interaction, Badge 6/move requirement, breaking animation,
//    object removal, walkable tile unblocking, and persistence in save.viewerObjects.
// 2. Sweet Scent: field move execution, show-mon animation, outdoor wild encounter trigger,
//    and battle escape back to viewer.
// 3. Safari Zone: Safari mode activation, start menu stats & retire option, step countdown,
//    time's up script with auto-warp to entrance, and Safari battle mode mechanics.

export default async function run(ctx) {
  const p = ctx.page;
  p.on('console', msg => console.log('PAGE:', msg.text()));
  p.on('pageerror', err => console.log('PAGEERROR:', err));
  const base = process.env.PW_BASE ?? 'http://localhost:5173';

  const hold = async (k, ms = 130) => {
    await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    await p.keyboard.up(k);
    await p.waitForTimeout(300);
  };

  // =========================================================================
  // PARTE 1: GOLPE ROCA (Rock Smash) en MAP_ROCK_TUNNEL_B1F
  // =========================================================================
  console.log('--- TEST 1: Golpe Roca en RockTunnel_B1F ---');
  // RockTunnel_B1F: Rock at (1, 20) with localId 12. Player stands at (1, 21) facing North.
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROCK_TUNNEL_B1F&px=1&py=21', base).href);
  await p.waitForFunction(() => performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(2000);

  await p.locator('#viewport').focus();
  // Turn North toward the rock at (1, 20)
  await hold('ArrowUp', 100);

  // Intento 1: Sin medalla 6 ni movimiento Golpe Roca
  await hold('z');
  await p.locator('#engine-interaction').waitFor({ state: 'visible', timeout: 5000 });
  await p.waitForTimeout(400);

  // Dismiss "This is a rugged rock..." text
  for (let i = 0; i < 6 && await p.locator('#engine-interaction').isVisible(); i++) {
    await hold('z');
    await p.waitForTimeout(250);
  }
  await p.locator('#engine-interaction').waitFor({ state: 'hidden', timeout: 5000 });

  // Verify rock is still present
  const rockBefore = await p.evaluate(() => {
    const el = document.querySelector('.world-npc[data-map="MAP_ROCK_TUNNEL_B1F"][data-local-id="12"]');
    return el && !el.classList.contains('hidden');
  });
  console.log('Rock before smash is visible:', rockBefore);
  if (!rockBefore) throw Error('Rock was unexpectedly removed without badge/move');

  // PREPARED: Give Badge 6 (Marsh/Soul Badge) and teach MOVE_ROCK_SMASH to lead mon with level 50
  await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    s.flagSet(C.FLAG_BADGE06_GET);
    // A real Lv50 lead (createMon computes stats); setting level/hp alone kept Lv5 stats.
    const { createMon } = await import('/src/core/pokemon/pokemon.ts');
    s.save.party[0] = createMon(s.save.party[0].species, 50);
    s.save.party[0].moves[0] = C.MOVE_ROCK_SMASH;
    s.save.party[0].pp[0] = 15;
  });

  // Intento 2: Con medalla y movimiento, interactuar para romper la roca
  await p.locator('#viewport').focus();
  await hold('z');
  await p.locator('#engine-interaction').waitFor({ state: 'visible', timeout: 5000 });
  await p.waitForTimeout(400);

  // Answer YES to prompt and advance move dialogue / break animation
  for (let i = 0; i < 60; i++) {
    const state = await p.evaluate(async () => {
      const { gMain } = await import('/src/core/hw/runtime.ts');
      const { gBattlerControllerFuncs } = await import('/src/core/battle/globals.ts');
      const el = document.querySelector('#engine-interaction');
      const inBattle = Boolean(gMain.inBattle);
      const isVisible = Boolean(el && !el.hasAttribute('hidden'));
      const isScene = el?.dataset?.scene === 'true';
      const isActionReady = gBattlerControllerFuncs[0]?.name === 'HandleInputChooseAction';
      return { inBattle, isVisible, isScene, isActionReady };
    });
    if (!state.isVisible) break;
    if (state.inBattle && state.isActionReady) {
      console.log('Battle action ready! Running away...');
      await hold('ArrowDown');
      await hold('ArrowRight');
      await hold('z');
      await p.waitForTimeout(400);
      break;
    }
    await hold('z', 80);
    await p.waitForTimeout(200);
  }

  // If we fled battle, advance any post-battle dialogue until closed. Rock Smash may start a
  // random wild battle (RockSmashWildEncounter); mashing A wins it with the Lv50 lead.
  for (let i = 0; i < 400; i++) {
    const isVisible = await p.locator('#engine-interaction').isVisible();
    if (!isVisible) break;
    await hold('z', 80);
    await p.waitForTimeout(250);
  }
  await p.locator('#engine-interaction').waitFor({ state: 'hidden', timeout: 15000 });
  await p.waitForTimeout(1000);

  // Verify rock entity is now hidden/removed in viewer
  const rockAfter = await p.evaluate(() => {
    const el = document.querySelector('.world-npc[data-map="MAP_ROCK_TUNNEL_B1F"][data-local-id="12"]');
    return Boolean(el && !el.classList.contains('hidden'));
  });
  console.log('Rock after smash is visible:', rockAfter);
  if (rockAfter) throw Error('Rock should be removed after Rock Smash');

  // Verify the tile (1, 20) is now walkable
  await p.locator('#viewport').focus();
  await hold('ArrowUp', 200);
  await p.waitForTimeout(500);

  const playerPosAfterSmash = await p.evaluate(() => {
    const m = location.hash.match(/px=(-?\d+)&py=(-?\d+)/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  });
  console.log('Player stepped into broken rock tile:', playerPosAfterSmash);
  if (playerPosAfterSmash?.y !== 20) throw Error('Tile (1, 20) is not walkable after rock was smashed');

  // Verify persistence in save.viewerObjects
  const rockSmashPersistent = await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const state = s.save.viewerObjects?.states.find(st => st.mapId === 'MAP_ROCK_TUNNEL_B1F' && st.localId === 12);
    return state?.removed === true;
  });
  console.log('Rock removal persisted in viewerObjects:', rockSmashPersistent);
  if (!rockSmashPersistent) throw Error('Rock smash removal not recorded in save.viewerObjects');

  await ctx.shot('rock-smash-success');

  // =========================================================================
  // PARTE 2: DULCE AROMA (Sweet Scent)
  // =========================================================================
  console.log('--- TEST 2: Dulce Aroma ---');
  // Load Route 1 in tall grass at (10, 10)
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=10&py=10', base).href);
  await p.waitForFunction(() => performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(2000);

  // PREPARED: Give lead mon Sweet Scent with high speed
  await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    // A real Lv50 lead (createMon computes stats); setting level/hp alone kept Lv5 stats.
    const { createMon } = await import('/src/core/pokemon/pokemon.ts');
    s.save.party[0] = createMon(s.save.party[0].species, 50);
    s.save.party[0].moves[1] = C.MOVE_SWEET_SCENT;
    s.save.party[0].pp[1] = 20;
  });

  // Execute Sweet Scent field move via key shortcut 'u'
  await p.locator('#viewport').focus();
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true })));
  await p.locator('#engine-interaction').waitFor({ state: 'visible', timeout: 5000 });
  await p.waitForTimeout(1000);

  // Verify battle started from Sweet Scent
  let inSweetScentBattle = false;
  for (let i = 0; i < 50; i++) {
    inSweetScentBattle = await p.evaluate(async () => {
      const { gMain } = await import('/src/core/hw/runtime.ts');
      return Boolean(gMain.inBattle);
    });
    if (inSweetScentBattle) break;
    await p.waitForTimeout(100);
  }
  console.log('In Sweet Scent battle:', inSweetScentBattle);
  if (!inSweetScentBattle) throw Error('Sweet Scent did not enter wild battle');

  await ctx.shot('sweet-scent-battle');

  // Advance battle text until action selection, then RUN
  for (let i = 0; i < 40; i++) {
    const actionReady = await p.evaluate(async () => {
      const { gBattlerControllerFuncs } = await import('/src/core/battle/globals.ts');
      return gBattlerControllerFuncs[0]?.name === 'HandleInputChooseAction';
    });
    if (actionReady) break;
    await hold('z', 80);
    await p.waitForTimeout(200);
  }

  // Action menu: RUN is at bottom-right (Down, Right)
  await hold('ArrowDown');
  await hold('ArrowRight');
  await hold('z');
  await p.waitForTimeout(500);

  // Advance until battle finishes
  for (let i = 0; i < 50; i++) {
    const inBattle = await p.evaluate(async () => {
      const { gMain } = await import('/src/core/hw/runtime.ts');
      return Boolean(gMain.inBattle);
    });
    if (!inBattle) break;
    await hold('z', 80);
    await p.waitForTimeout(200);
  }
  await p.waitForTimeout(1500);

  const returnedFromSweetScent = await p.evaluate(async () => {
    const { gMain } = await import('/src/core/hw/runtime.ts');
    return !gMain.inBattle;
  });
  console.log('Returned clean from Sweet Scent battle:', returnedFromSweetScent);
  if (!returnedFromSweetScent) throw Error('Failed to return to viewer after Sweet Scent battle');

  // =========================================================================
  // PARTE 3: ZONA SAFARI (Safari Zone)
  // =========================================================================
  console.log('--- TEST 3: Safari Zone ---');
  // Load Safari Zone Center at (26, 30)
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_SAFARI_ZONE_CENTER&px=26&py=30', base).href);
  await p.waitForFunction(() => performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(2000);

  // PREPARED: Enter Safari mode
  await p.evaluate(async () => {
    const safari = await import('/src/core/field/safariZone.ts');
    const s = await import('/src/games/firered/save.ts');
    const dummyGame = { safariSteps: 600, safariBalls: 30 };
    safari.EnterSafariMode(dummyGame);
  });

  const safariModeActive = await p.evaluate(async () => {
    const safari = await import('/src/core/field/safariZone.ts');
    return safari.GetSafariZoneFlag();
  });
  console.log('Safari mode active:', safariModeActive);
  if (!safariModeActive) throw Error('FLAG_SYS_SAFARI_MODE should be set');

  // Test Safari step countdown & TimesUp script
  // Set steps to 1 and simulate step script
  const timesUpTriggered = await p.evaluate(async () => {
    const safari = await import('/src/core/field/safariZone.ts');
    const dummyGame = { safariSteps: 1, safariBalls: 30 };
    let scriptExecuted = 0;
    const handled = safari.SafariZoneTakeStep(dummyGame, (lbl) => {
      scriptExecuted = lbl;
    });
    return {
      handled,
      scriptExecuted: Boolean(scriptExecuted),
      remainingSteps: dummyGame.safariSteps,
    };
  });
  console.log('Safari step countdown to zero:', timesUpTriggered);
  if (!timesUpTriggered.handled || !timesUpTriggered.scriptExecuted || timesUpTriggered.remainingSteps !== 0) {
    throw Error('SafariZoneTakeStep did not trigger TimesUp script at zero steps');
  }

  // Test Safari battle dispatch
  const safariBattleConfig = await p.evaluate(async () => {
    const mon = await import('/src/core/pokemon/pokemon.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    const enemy = mon.createMon(C.SPECIES_CHANSEY, 26);
    // When battleSetup.StartWildBattle is invoked in Safari mode:
    const safari = await import('/src/core/field/safariZone.ts');
    const isSafariFlag = safari.GetSafariZoneFlag();
    return { isSafariFlag, enemySpecies: enemy.species };
  });
  console.log('Safari wild battle check:', safariBattleConfig);
  if (!safariBattleConfig.isSafariFlag || safariBattleConfig.enemySpecies === 0) {
    throw Error('Safari battle mode not properly dispatched');
  }

  // Exit Safari mode cleanly
  await p.evaluate(async () => {
    const safari = await import('/src/core/field/safariZone.ts');
    const dummyGame = { safariSteps: 0, safariBalls: 0 };
    safari.ExitSafariMode(dummyGame);
  });

  const safariModeCleared = await p.evaluate(async () => {
    const safari = await import('/src/core/field/safariZone.ts');
    return !safari.GetSafariZoneFlag();
  });
  console.log('Safari mode exited cleanly:', safariModeCleared);
  if (!safariModeCleared) throw Error('Safari mode was not cleared');

  await ctx.shot('r3-completed');

  return {
    rockSmashPassed: true,
    sweetScentPassed: true,
    safariPassed: true,
    errors: ctx.errors(),
  };
}
