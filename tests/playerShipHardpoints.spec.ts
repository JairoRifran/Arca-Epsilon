import { expect, test, type Page } from '@playwright/test';

/**
 * Hardpoint centralisation.
 *
 * Everything bolted onto the hull at runtime must derive from one bounds-based
 * source. The two defects this guards against were both "absolute offsets left
 * behind by the x1.7 rescale": the torpedo tubes kept a pre-scale spread and
 * bunched near the centreline, and the shield shell was a fixed 7.4 sphere the
 * hull had outgrown.
 */
test.setTimeout(600_000);

type HardpointState = {
  bounds: number[];
  shipScale: number[];
  engines: { id: string; position: number[]; direction: number[]; radius: number }[];
  cannonMuzzles: number[][];
  cannonMounts: number[][];
  torpedoTubes: number[][];
  podOffset: number[];
  shieldRadius: number;
  shieldScale: number[];
  weaponCannonOffsets: number[][];
  weaponTubeOffsets: number[][];
};

const hp = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getShipHardpointState()) as unknown as Promise<HardpointState>;

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);
  return errors;
}

test('hardpoints derive from one bounds-based source', async ({ page }) => {
  const errors = await boot(page);
  const s = await hp(page);
  console.log('HARDPOINTS', JSON.stringify(s));

  const [bw, , bd] = s.bounds;

  // 19. The ship node is not carrying a second scale factor.
  expect(s.shipScale).toEqual([1, 1, 1]);

  // The ship has exactly two main engines. Probed directly: nothing else in the
  // rear third of the hull carries nozzle-sized geometry, and nothing at all
  // sits beyond |x| > 3. The extra glows in an earlier boost capture were the
  // same two bells read at an angle, not a second pair.
  expect(s.engines.length, 'exactly two real engines, both plumed').toBe(2);

  // 3-5. Engines: two, with a real axis and a real radius.
  expect(s.engines.length, 'two main engines').toBe(2);
  for (const e of s.engines) {
    const dirLength = Math.hypot(e.direction[0], e.direction[1], e.direction[2]);
    expect(dirLength, `${e.id} has a unit axis`).toBeCloseTo(1, 3);
    expect(e.radius, `${e.id} has a usable radius`).toBeGreaterThan(0.2);
    // Bounds-derived, so the mouth must sit near the tail plane.
    expect(Math.abs(e.position[2]), `${e.id} sits at the tail`).toBeGreaterThan(bd * 0.4);
  }
  // Symmetric about the centreline.
  expect(s.engines[0].position[0]).toBeCloseTo(-s.engines[1].position[0], 2);

  // 6-8. The weapon system fires from the same muzzle list, not a copy.
  expect(s.weaponCannonOffsets, 'one cannon list').toEqual(s.cannonMuzzles);
  expect(s.weaponTubeOffsets, 'one tube list').toEqual(s.torpedoTubes);

  // 11. The firing origin is forward of the barrel tip, outside the hull.
  for (let i = 0; i < s.cannonMuzzles.length; i += 1) {
    expect(s.cannonMuzzles[i][2], 'muzzle is ahead of the mount')
      .toBeLessThan(s.cannonMounts[i][2]);
    expect(Math.abs(s.cannonMuzzles[i][2]), 'muzzle clears the nose')
      .toBeGreaterThan(bd * 0.4);
  }

  // 12-13. Exactly four tubes, all at distinct positions.
  expect(s.torpedoTubes.length, 'exactly four tubes').toBe(4);
  const keys = new Set(s.torpedoTubes.map((t) => t.join(',')));
  expect(keys.size, 'no two tubes share a position').toBe(4);

  // The regression itself: the spread must scale with the hull, not sit at the
  // old absolute 0.38 / 0.16 pattern.
  const spreadX = Math.abs(s.torpedoTubes[1][0] - s.torpedoTubes[0][0]);
  const spreadY = Math.abs(s.torpedoTubes[0][1] - s.torpedoTubes[2][1]);
  console.log('TUBE SPREAD', JSON.stringify({ spreadX, spreadY, width: bw }));
  expect(spreadX, 'tube spread grew with the hull').toBeGreaterThan(0.9);
  expect(spreadY, 'vertical spread grew with the hull').toBeGreaterThan(0.5);
  // ...and the mouths sit ahead of the pod, not buried at the ship centre.
  for (const t of s.torpedoTubes) {
    expect(t[2], 'tube mouth is forward of the pod').toBeLessThan(s.podOffset[2]);
    expect(t[1], 'tubes are ventral').toBeLessThan(0);
  }

  // 18. The shield contains the hull along its tightest axis.
  const shieldHalfDepth = s.shieldRadius * s.shieldScale[2];
  const shieldHalfWidth = s.shieldRadius * s.shieldScale[0];
  console.log('SHIELD', JSON.stringify({
    radius: s.shieldRadius, halfDepth: shieldHalfDepth, hullHalfDepth: bd / 2,
    halfWidth: shieldHalfWidth, hullHalfWidth: bw / 2
  }));
  expect(shieldHalfDepth, 'shield contains the hull nose to tail')
    .toBeGreaterThan(bd / 2);
  expect(shieldHalfWidth, 'shield contains the hull across')
    .toBeGreaterThan(bw / 2);

  expect(errors).toEqual([]);
});

test('the launcher uses the tube that was consumed, and nothing else changed', async ({ page }) => {
  const errors = await boot(page);

  // 14-15. Round-robin still walks the tubes in order.
  const seen: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const before = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, unknown>;
    const beforeTubes = before.torpedoTubeStates as boolean[];
    await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
    const after = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, unknown>;
    const afterTubes = after.torpedoTubeStates as boolean[];
    const fired = beforeTubes.findIndex((loaded, idx) => loaded && !afterTubes[idx]);
    if (fired >= 0) seen.push(fired);
    await page.waitForFunction(
      () => (window.__arcaDebug?.getWeaponResourceState() as { torpedoReady?: boolean })?.torpedoReady === true,
      undefined, { timeout: 120_000 }
    ).catch(() => undefined);
  }
  console.log('TUBE ORDER', JSON.stringify(seen));
  expect(seen.length, 'tubes were consumed').toBeGreaterThan(1);
  expect(new Set(seen).size, 'a different tube each time').toBe(seen.length);

  // 20-25. The earlier stages are untouched.
  const weapons = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, number>;
  expect(weapons.primaryMagazineMaximum, 'magazine scaled with the cadence').toBe(90);
  expect(weapons.primaryReserveMaximum, 'reserve keeps its five-magazine ratio').toBe(450);
  expect(weapons.torpedoTubeCapacity, 'still four tubes').toBe(4);
  expect(weapons.torpedoReserveMaximum, 'finite torpedo reserve is retired').toBe(0);

  // The hull reference the gear and access both hang off. 2.455 is half the
  // scaled hull height; if the x1.7 were ever applied twice this is the first
  // number that would move. The parked hatch height itself belongs to
  // playerShipLandingGear.spec.ts, which measures it with the ship on its legs
  // — it reads differently in flight, so asserting it here would be wrong.
  const gear = await page.evaluate(() => window.__arcaDebug?.getLandingGearState()) as Record<string, number>;
  expect(gear.hullBottomLocalY, 'hull reference unchanged, no double scaling')
    .toBeCloseTo(-2.455, 2);

  expect(errors).toEqual([]);
});

test('VEL reports physical speed, not the scaled display value', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
  });
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(45));
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -18));
  await page.waitForTimeout(600);

  const nav = await page.evaluate(() => window.__arcaDebug?.getShipNavigationState()) as Record<string, unknown>;
  const shown = Number(String(nav.hudVelocity).match(/VEL\s+(\d+)/)?.[1] ?? NaN);
  console.log('VEL', JSON.stringify({ hud: nav.hudVelocity, physical: nav.linearSpeed }));
  expect(Number.isFinite(shown), 'the readout parses').toBe(true);
  // Was `velocity.length() * 12`, which showed 394 for a 36 m/s ship.
  expect(Math.abs(shown - (nav.linearSpeed as number)), 'HUD matches the physical speed')
    .toBeLessThan(1.5);

  expect(errors).toEqual([]);
});
