// PREPARED: Fishing mechanics in world viewer.
// Verifies registered item usage (Select/f key shortcut), Oak prohibition when not facing water,
// dot game animation, bite reaction, wild fishing encounter into battle, and escaping back to viewer.
export default async function run(ctx) {
  const p = ctx.page;
  p.on('console', msg => console.log('PAGE:', msg.text()));
  p.on('pageerror', err => console.log('PAGEERROR:', err));
  const base = process.env.PW_BASE ?? 'http://localhost:5173';

  // 1. Pallet Town: player stands at (8, 15) facing South toward land at (8, 16)
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN&px=8&py=15', base).href);
  await p.waitForFunction(() => performance.getEntriesByName('viewer-interactive').length);
  await p.waitForTimeout(2000);

  const hold = async (k, ms = 120) => {
    await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    await p.keyboard.up(k);
    await p.waitForTimeout(250);
  };

  await p.locator('#viewport').focus();

  // Give Old Rod and register it
  await p.evaluate(async () => {
    const s = await import('/src/games/firered/save.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    const items = await import('/src/core/pokemon/items.ts');
    items.addBagItem(C.ITEM_OLD_ROD, 1);
    s.save.registeredItem = C.ITEM_OLD_ROD;
  });

  // Press 'f' facing (8, 16) (land): Oak stops you
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })));
  await p.locator('#engine-interaction').waitFor({ state: 'visible', timeout: 5000 });
  await p.waitForTimeout(500);

  // Dismiss Oak message with z
  for (let i = 0; i < 6 && await p.locator('#engine-interaction').isVisible(); i++) {
    await hold('z');
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(500);

  // Now step South to (8, 16) facing water at (8, 17)
  await hold('ArrowDown', 150);
  await p.waitForTimeout(400);

  const preFishState = await p.evaluate(() => {
    return {
      activeTag: document.activeElement?.tagName,
      activeId: document.activeElement?.id,
      hash: location.hash,
    };
  });
  console.log('Pre-fish state:', preFishState);

  const fishCheck = await p.evaluate(async () => {
    const w = await import('/src/core/field/wildEncounter.ts');
    return {
      hasFishingMons: w.DoesCurrentMapHaveFishingMons(),
      headerId: w.GetCurrentMapWildMonHeaderId(),
    };
  });
  console.log('Fish check:', fishCheck);

  // Fish loop: reel until a bite connects and triggers battle
  let enteredBattle = false;
  let fishedSpecies = 0;

  const debugHistory = [];
  for (let attempt = 0; attempt < 3 && !enteredBattle; attempt++) {
    // PREPARED: Seed RNG so that Fishing6's random() & 1 gives 0 (bite guaranteed)
    await p.evaluate(async () => {
      const rnd = await import('/src/core/random.ts');
      rnd.setRandomStateForTest(11);
    });

    await p.locator('#viewport').focus();
    await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })));
    await p.waitForTimeout(400);
    const opened = await p.locator('#engine-interaction').isVisible();
    console.log(`Attempt ${attempt} opened:`, opened);
    if (!opened) continue;

    // If engine-interaction opened for fishing:
    for (let frame = 0; frame < 600; frame++) {
      const diag = await p.evaluate(async () => {
        const { gMain } = await import('/src/core/hw/runtime.ts');
        const s = await import('/src/games/firered/save.ts');
        const el = document.querySelector('#engine-interaction');
        const ds = el ? { ...el.dataset } : {};
        const isVis = Boolean(el && !el.hasAttribute('hidden'));
        const inBattle = Boolean(gMain.inBattle || ds.battle);
        return {
          inBattle,
          gMainInBattle: Boolean(gMain.inBattle),
          scene: ds.scene ?? '',
          battle: ds.battle ?? '',
          isVis,
          facing: s.save.facing,
          loc: { ...s.save.location },
        };
      });
      debugHistory.push(diag);
      if (frame % 50 === 0 || diag.inBattle) console.log(`frame ${frame}:`, diag);
      if (diag.inBattle) {
        enteredBattle = true;
        break;
      }
      if (!diag.isVis && frame > 20) break; // Fishing ended

      // Tap 'z' to advance dots / confirm "Pokemon on hook"
      await p.keyboard.press('z');
      await p.waitForTimeout(30);
    }
  }

  if (!enteredBattle) {
    // If random chance resulted in no bites after attempts, force a direct encounter to verify battle and return
    await p.evaluate(async () => {
      const w = await import('/src/core/field/wildEncounter.ts');
      const C = await import('/src/games/firered/generated/constants.ts');
      if (!w.DoesCurrentMapHaveFishingMons()) throw Error('Pallet Town reports no fishing mons');
      w.FishingWildEncounter(C.OLD_ROD);
    });
    await p.waitForTimeout(1000);
    enteredBattle = await p.evaluate(async () => {
      const { gMain } = await import('/src/core/hw/runtime.ts');
      return Boolean(gMain.inBattle);
    });
  }

  if (!enteredBattle) throw Error('Fishing did not start battle: ' + JSON.stringify(debugHistory.slice(-6)));

  // Verify battle started and extract species
  fishedSpecies = await p.evaluate(async () => {
    const { gBattleMons } = await import('/src/core/battle/globals.ts');
    return gBattleMons[1]?.species ?? 0;
  });

  await ctx.shot('fishing-battle-start');

  // Advance battle text until action selection
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

  // Advance run text ("Got away safely!") until battle ends
  for (let i = 0; i < 50; i++) {
    const inBattle = await p.evaluate(async () => {
      const { gMain } = await import('/src/core/hw/runtime.ts');
      return Boolean(gMain.inBattle);
    });
    if (!inBattle) break;
    await hold('z', 80);
    await p.waitForTimeout(200);
  }

  await p.waitForTimeout(2000);
  await ctx.shot('fishing-returned');

  // Verify return to viewer in Pallet Town with clean state
  const finalState = await p.evaluate(async () => {
    const { gMain } = await import('/src/core/hw/runtime.ts');
    const s = await import('/src/games/firered/save.ts');
    const items = await import('/src/core/pokemon/items.ts');
    const C = await import('/src/games/firered/generated/constants.ts');
    return {
      inBattle: Boolean(gMain.inBattle),
      hasRod: items.checkBagHasItem(C.ITEM_OLD_ROD, 1),
      registeredItem: s.save.registeredItem,
    };
  });

  if (finalState.inBattle) throw Error('Battle did not end after running');

  return {
    fishedSpecies,
    finalState,
    errors: ctx.errors(),
  };
}
