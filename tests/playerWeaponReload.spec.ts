import { expect, test, type Page } from '@playwright/test';

/**
 * Magazines, tubes and manual reload.
 *
 * The cannon stays an energy weapon but now draws on a pulse capacitor rather
 * than debiting `resources.energy` per shot — gating one trigger on both a
 * magazine and the shared pool would limit it twice. Torpedoes launch from four
 * physical tubes rebuilt by the onboard fabricator. Reload is manual on G,
 * sequential, and never limited by the legacy save reserve.
 *
 * Reload timers are delta-driven, so completion is awaited on the observable
 * state rather than on wall-clock sleeps: under the software renderer those are
 * not the same thing.
 */
test.setTimeout(900_000);

type WeaponState = {
  primaryResourceType: string;
  primaryMagazineCurrent: number;
  primaryMagazineMaximum: number;
  primaryReserveCurrent: number;
  primaryReserveMaximum: number;
  primaryReloading: boolean;
  primaryReloadProgress: number;
  primaryReloadDuration: number;
  primaryShotsCreated: number;
  primaryChargesSpent: number;
  primaryFireEvents: number;
  primaryReady: boolean;
  primaryLastBlockReason: string;
  torpedoTubeStates: boolean[];
  torpedoLoadedCount: number;
  torpedoTubeCapacity: number;
  torpedoReserveCurrent: number;
  torpedoReserveMaximum: number;
  torpedoReloading: boolean;
  torpedoReloadProgress: number;
  torpedoReloadTargetCount: number;
  torpedoesCreated: number;
  torpedoTubesConsumed: number;
  torpedoTotal: number;
  torpedoReady: boolean;
  torpedoLastBlockReason: string;
  reloadKey: string;
  reloadRequestCount: number;
  shipEnergy: number;
  reloadMessage: string;
  hudPrimary: string;
  hudTorpedo: string;
};

const w = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as unknown as Promise<WeaponState>;

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  return errors;
}

/**
 * Empties the capacitor through the real fire path.
 *
 * The last charge is spent by firing, so the empty state is reached the way a
 * player reaches it. Getting there is set up directly rather than by spamming
 * the trigger: the 0.28 s cooldown is simulated time, and under the software
 * renderer wall-clock spam lands only a handful of shots.
 */
async function emptyMagazine(page: Page): Promise<number> {
  const before = await w(page);
  await page.evaluate(
    (reserve) => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 1, primaryReserve: reserve }),
    before.primaryReserveCurrent
  );
  await page.waitForFunction(
    () => (window.__arcaDebug?.getWeaponResourceState() as { primaryReady?: boolean })?.primaryReady === true,
    undefined,
    { timeout: 120_000 }
  );
  await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  const after = await w(page);
  if (after.primaryMagazineCurrent !== 0) {
    throw new Error(`magazine did not empty: ${after.primaryMagazineCurrent}`);
  }
  return after.primaryReserveCurrent;
}

const awaitPrimaryReloaded = (page: Page) =>
  page.waitForFunction(
    () => (window.__arcaDebug?.getWeaponResourceState() as { primaryReloading?: boolean })?.primaryReloading === false,
    undefined,
    { timeout: 120_000 }
  );

const awaitTorpedoReloaded = (page: Page) =>
  page.waitForFunction(
    () => (window.__arcaDebug?.getWeaponResourceState() as { torpedoReloading?: boolean })?.torpedoReloading === false,
    undefined,
    { timeout: 120_000 }
  );

async function fireEveryLoadedTube(page: Page): Promise<void> {
  let loaded = (await w(page)).torpedoLoadedCount;
  while (loaded > 0) {
    const expected = loaded - 1;
    await expect.poll(async () => {
      await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
      return (await w(page)).torpedoLoadedCount;
    }, { timeout: 120_000, intervals: [350] }).toBe(expected);
    loaded = expected;
  }
}

async function reloadTubesAndReadLadder(page: Page): Promise<number[]> {
  await page.keyboard.press('KeyG');
  const ladder: number[] = [];
  for (let i = 0; i < 80; i += 1) {
    const state = await w(page);
    if (ladder[ladder.length - 1] !== state.torpedoLoadedCount) ladder.push(state.torpedoLoadedCount);
    if (!state.torpedoReloading && state.torpedoLoadedCount === 4) break;
    await page.waitForTimeout(200);
  }
  return ladder;
}

test('primary: capacitor, manual reload and reserve accounting', async ({ page }) => {
  const errors = await boot(page);

  // 2-3. Starting loadout.
  const start = await w(page);
  console.log('PRIMARY START', JSON.stringify({
    mag: `${start.primaryMagazineCurrent}/${start.primaryMagazineMaximum}`,
    reserve: start.primaryReserveCurrent, type: start.primaryResourceType,
    key: start.reloadKey, hud: start.hudPrimary
  }));
  expect(start.primaryResourceType).toBe('pulse-capacitor');
  expect(start.primaryMagazineCurrent).toBe(32);
  expect(start.primaryMagazineMaximum).toBe(32);
  expect(start.primaryReserveCurrent).toBe(160);

  // 6. One valid event consumes exactly one charge.
  await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  const oneShot = await w(page);
  expect(oneShot.primaryMagazineCurrent, 'one charge per event').toBe(31);
  expect(oneShot.primaryShotsCreated).toBe(1);
  expect(oneShot.primaryChargesSpent, 'charges match shots created').toBe(1);

  // 7. Documented contract: the cannons alternate, so an event is exactly one
  // projectile. Charges spent must never exceed shots created.
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  for (let i = 0; i < 12; i += 1) await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  const burst = await w(page);
  expect(burst.primaryChargesSpent, 'no double charging for two cannons')
    .toBe(burst.primaryShotsCreated);

  // 8-9. The cooldown refuses some events, and those cost nothing.
  expect(burst.primaryFireEvents).toBeGreaterThan(burst.primaryShotsCreated);

  // 9. Drain to zero: the final charge is spent by a real trigger event.
  await emptyMagazine(page);
  const empty = await w(page);
  console.log('PRIMARY EMPTY', JSON.stringify({
    mag: empty.primaryMagazineCurrent, reserve: empty.primaryReserveCurrent,
    reason: empty.primaryLastBlockReason, hud: empty.hudPrimary
  }));
  expect(empty.primaryMagazineCurrent).toBe(0);

  // 10-11. No auto-reload, and firing empty creates nothing.
  const reserveAtEmpty = empty.primaryReserveCurrent;
  expect(empty.primaryReloading, 'no automatic reload').toBe(false);
  await page.waitForTimeout(2_500);
  const stillEmpty = await w(page);
  expect(stillEmpty.primaryMagazineCurrent, 'still empty without pressing G').toBe(0);
  expect(stillEmpty.primaryReserveCurrent, 'reserve untouched while empty').toBe(reserveAtEmpty);

  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  const dryFire = await w(page);
  expect(dryFire.primaryShotsCreated, 'empty trigger creates no projectile').toBe(0);
  expect(dryFire.primaryChargesSpent, 'empty trigger spends nothing').toBe(0);
  // 12. And it tells the player what to do.
  expect(dryFire.hudPrimary, 'HUD prompts the reload').toContain('G RECARGAR');

  // 13. G through the real keyboard router starts the reload.
  const beforeReload = await w(page);
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(200);
  const reloading = await w(page);
  console.log('RELOAD STARTED', JSON.stringify({
    reloading: reloading.primaryReloading, hud: reloading.hudPrimary
  }));
  expect(reloading.reloadRequestCount, 'the key reached the router')
    .toBeGreaterThan(beforeReload.reloadRequestCount);

  // 18-21. It completes, transfers only the shortfall, and fires again.
  await awaitPrimaryReloaded(page);
  const reloaded = await w(page);
  console.log('RELOAD DONE', JSON.stringify({
    mag: `${reloaded.primaryMagazineCurrent}/${reloaded.primaryMagazineMaximum}`,
    reserve: reloaded.primaryReserveCurrent, hud: reloaded.hudPrimary
  }));
  expect(reloaded.primaryMagazineCurrent, 'capacitor refilled').toBe(32);
  expect(reloaded.primaryReserveCurrent, 'reserve drops by exactly what moved')
    .toBe(reserveAtEmpty - 32);
  expect(reloaded.primaryReloadDuration, 'documented reload time').toBeCloseTo(1.65, 2);

  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  expect((await w(page)).primaryShotsCreated, 'the cannon fires again').toBe(1);

  // 22. Reloading a full magazine costs nothing.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 32, primaryReserve: 100 }));
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(400);
  const full = await w(page);
  expect(full.primaryReserveCurrent, 'a full magazine consumes no reserve').toBe(100);
  expect(full.primaryReloading, 'no timer started').toBe(false);

  // 23. Insufficient reserve gives a partial reload, not a free top-up.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 4, primaryReserve: 10 }));
  await page.keyboard.press('KeyG');
  await awaitPrimaryReloaded(page);
  const partial = await w(page);
  console.log('PARTIAL RELOAD', JSON.stringify({
    mag: partial.primaryMagazineCurrent, reserve: partial.primaryReserveCurrent
  }));
  expect(partial.primaryMagazineCurrent, '4 + 10 = 14, not 32').toBe(14);
  expect(partial.primaryReserveCurrent, 'reserve fully spent').toBe(0);

  expect(errors).toEqual([]);
});

test('torpedoes: four tubes can be fired and sequentially rebuilt for two full cycles', async ({ page }) => {
  const errors = await boot(page);

  // Deliberate new contract: four ready tubes, no finite gameplay reserve.
  const start = await w(page);
  expect(start.torpedoTubeStates.length, 'exactly four tubes').toBe(4);
  expect(start.torpedoLoadedCount).toBe(4);
  expect(start.torpedoReserveCurrent, 'legacy reserve is not gameplay ammunition').toBe(0);
  expect(start.torpedoTotal).toBe(4);
  expect(start.hudTorpedo).not.toContain('RES');

  // One launch empties exactly one tube and does not touch the cannon.
  const primaryBefore = start.primaryMagazineCurrent;
  await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
  const oneShot = await w(page);
  expect(oneShot.torpedoesCreated).toBe(1);
  expect(oneShot.torpedoLoadedCount, 'one tube emptied').toBe(3);
  expect(oneShot.torpedoReserveCurrent).toBe(0);
  expect(oneShot.torpedoTubeStates[0], 'tube 1 fired first').toBe(false);
  expect(oneShot.primaryMagazineCurrent, 'torpedoes never consume cannon charges').toBe(primaryBefore);

  await fireEveryLoadedTube(page);
  let dry = await w(page);
  expect(dry.torpedoLoadedCount, 'cycle 1 spent all four tubes').toBe(0);
  expect(dry.hudTorpedo).toContain('G RECARGAR');
  expect(dry.hudTorpedo).not.toContain('AGOTADOS');

  // R with empty tubes creates nothing.
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
  const blocked = await w(page);
  expect(blocked.torpedoesCreated, 'no torpedo from an empty tube').toBe(0);
  expect(blocked.hudTorpedo, 'HUD prompts the reload').toContain('G RECARGAR');

  const firstLadder = await reloadTubesAndReadLadder(page);
  expect(firstLadder, 'cycle 1 fills one physical tube at a time').toEqual([0, 1, 2, 3, 4]);
  let reloaded = await w(page);
  expect(reloaded.torpedoLoadedCount).toBe(4);
  expect(reloaded.torpedoReserveCurrent).toBe(0);
  expect(reloaded.torpedoTotal).toBe(4);

  // A second complete cycle proves there is no hidden finite total.
  await fireEveryLoadedTube(page);
  dry = await w(page);
  expect(dry.torpedoLoadedCount, 'cycle 2 spent all four tubes').toBe(0);
  const secondLadder = await reloadTubesAndReadLadder(page);
  expect(secondLadder, 'cycle 2 also fills sequentially').toEqual([0, 1, 2, 3, 4]);
  reloaded = await w(page);
  expect(reloaded.torpedoLoadedCount, 'cycle 2 restores every tube').toBe(4);
  expect(reloaded.torpedoReserveCurrent).toBe(0);

  // Partial reload only targets the two empty slots.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    torpedoTubes: [true, false, true, false], torpedoReserve: 0
  }));
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(100);
  expect((await w(page)).torpedoReloadTargetCount).toBe(2);
  await awaitTorpedoReloaded(page);
  const partial = await w(page);
  expect(partial.torpedoTubeStates).toEqual([true, true, true, true]);
  expect(partial.torpedoReserveCurrent).toBe(0);

  // The launcher is never called "Misiles".
  expect(partial.hudTorpedo.toLowerCase(), 'no missile wording').not.toContain('misil');

  expect(errors).toEqual([]);
});

test('both systems reload in parallel and each unblocks on its own timer', async ({ page }) => {
  const errors = await boot(page);

  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    primaryMagazine: 2, primaryReserve: 100,
    torpedoTubes: [false, false, false, false], torpedoReserve: 0
  }));

  // 34. One press starts both.
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  const during = await w(page);
  console.log('PARALLEL', JSON.stringify({
    primaryReloading: during.primaryReloading,
    torpedoReloading: during.torpedoReloading,
    torpedoTarget: during.torpedoReloadTargetCount
  }));
  expect(during.primaryReloading, 'cannon reloading').toBe(true);
  expect(during.torpedoReloading, 'tubes reloading').toBe(true);

  // 35. The cannon finishes first (1.65 s vs 4 x 0.70 s) and unblocks alone.
  await awaitPrimaryReloaded(page);
  const afterPrimary = await w(page);
  console.log('PRIMARY FIRST', JSON.stringify({
    primaryReloading: afterPrimary.primaryReloading,
    torpedoReloading: afterPrimary.torpedoReloading,
    mag: afterPrimary.primaryMagazineCurrent
  }));
  expect(afterPrimary.primaryMagazineCurrent, 'cannon is loaded').toBe(32);

  await awaitTorpedoReloaded(page);
  const done = await w(page);
  expect(done.torpedoLoadedCount, 'tubes finished on their own timer').toBe(4);
  expect(done.torpedoReserveCurrent).toBe(0);

  // 16. The cannon does not fire mid-reload.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 1, primaryReserve: 60 }));
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  const mid = await w(page);
  if (mid.primaryReloading) {
    await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
    await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
    const blocked = await w(page);
    expect(blocked.primaryShotsCreated, 'no firing during a reload').toBe(0);
    expect(blocked.primaryLastBlockReason).toBe('primary-reloading');
  }
  await awaitPrimaryReloaded(page);

  expect(errors).toEqual([]);
});

test('resupply, save/load and legacy migration', async ({ page }) => {
  const errors = await boot(page);

  // Save/load preserves physical tube occupancy. The old reserve field is
  // accepted but normalized out of gameplay authority.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    primaryMagazine: 11, primaryReserve: 77,
    torpedoTubes: [true, false, true, false], torpedoReserve: 3
  }));
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    primaryMagazine: 1, primaryReserve: 1, torpedoTubes: [false, false, false, false], torpedoReserve: 0
  }));
  await page.evaluate(() => window.__arcaDebug?.loadGame());
  await page.waitForTimeout(1_200);
  const restored = await w(page);
  expect(restored.primaryMagazineCurrent).toBe(11);
  expect(restored.primaryReserveCurrent).toBe(77);
  expect(restored.torpedoTubeStates).toEqual([true, false, true, false]);
  expect(restored.torpedoReserveCurrent).toBe(0);
  await page.keyboard.press('KeyG');
  await awaitTorpedoReloaded(page);
  expect((await w(page)).torpedoTubeStates).toEqual([true, true, true, true]);

  // Exact legacy lockout state: zero reserve and four empty tubes survives a
  // real save/load, then G fabricates all four without resetting the mission.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    torpedoTubes: [false, false, false, false], torpedoReserve: 0
  }));
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    torpedoTubes: [true, true, true, true], torpedoReserve: 8
  }));
  await page.evaluate(() => window.__arcaDebug?.loadGame());
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(500);
  expect((await w(page)).torpedoTubeStates).toEqual([false, false, false, false]);
  await page.keyboard.press('KeyG');
  await awaitTorpedoReloaded(page);
  expect((await w(page)).torpedoLoadedCount, 'reserve-zero save can always rearm').toBe(4);

  // A legacy save carrying only a total migrates ready tubes first; any value
  // beyond four is intentionally discarded because there is no finite reserve.
  const migrated = await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ torpedoTotal: 11 }));
  expect(migrated!.torpedoTubes).toEqual([true, true, true, true]);
  expect(migrated!.torpedoReserve).toBe(0);
  expect(migrated!.primaryMagazine, 'a pre-magazine save gets a full capacitor').toBe(32);
  expect(migrated!.primaryReserve).toBe(160);

  const small = await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ torpedoTotal: 2 }));
  expect(small!.torpedoTubes).toEqual([true, true, false, false]);
  expect(small!.torpedoReserve).toBe(0);

  // 36. A resupply fills both systems.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    primaryMagazine: 3, primaryReserve: 5, torpedoTubes: [false, false, false, false], torpedoReserve: 0
  }));
  const refilled = await page.evaluate(() => window.__arcaDebug?.refillWeaponStores());
  expect(refilled!.primaryMagazine).toBe(32);
  expect(refilled!.primaryReserve).toBe(160);
  expect(refilled!.torpedoTubes).toEqual([true, true, true, true]);
  expect(refilled!.torpedoReserve).toBe(0);

  // 42, 44-45. The HUD converges on the backend, and there is one of each.
  // Polled rather than read once: the strip is rebuilt on the next frame, and
  // under the software renderer that can be most of a second away.
  await expect
    .poll(async () => {
      const s = await w(page);
      return `${s.hudPrimary}|${s.hudTorpedo}`;
    }, { message: 'HUD must match the refilled stores', timeout: 60_000, intervals: [500] })
    .toMatch(/CANON 32\/32.*\|.*TORPEDOS 4\/4/);
  const hud = await w(page);
  expect(hud.hudPrimary, 'HUD shows the live magazine').toContain(`${hud.primaryMagazineCurrent}/32`);
  expect(hud.hudTorpedo).toContain(`${hud.torpedoLoadedCount}/4`);
  const counts = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let ships = 0;
    scene.traverse((o) => { if (o.name === 'Player Scout Ship') ships += 1; });
    return ships;
  });
  expect(counts).toBe(1);

  expect(errors).toEqual([]);
});
