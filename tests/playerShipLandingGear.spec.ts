import { expect, test, type Page } from '@playwright/test';

/**
 * Landing gear: mechanical integrity and the parked contract.
 *
 * Focused on what is actually implemented — three legs, feet attached to their
 * struts, a deployment that passes through intermediate states rather than
 * snapping, and the belly/foot clearances the access depends on. Save/load,
 * walkable colliders and attitude levelling are deliberately out of scope.
 */
test.setTimeout(600_000);

type GearState = {
  landingGearState: string;
  deploymentProgress: number;
  settlingProgress: number;
  phases: { door: number; swing: number; extension: number; seeking: number; compression: number; stabilise: number };
  supports: {
    id: string;
    parentName: string;
    strutEndWorld: [number, number, number];
    footWorld: [number, number, number];
    legToFootDistance: number;
    extension: number;
    compression: number;
    terrainHeight: number;
    footClearance: number;
  }[];
  legCount: number;
  bellyClearance: number;
  footTravelConfigured: number;
  hatchDeckHeight: number;
  hullBottomLocalY: number;
};

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

const gear = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getLandingGearState() as unknown as GearState) as Promise<GearState>;

const setFraction = (page: Page, f: number) =>
  page.evaluate((v) => window.__arcaDebug?.setLandingGearFraction(v), f);

test('landing gear: three legs, attached feet, staged deployment and parked contract', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);

  // --- In flight: stowed ---------------------------------------------------
  const inFlight = await gear(page);
  expect(inFlight.landingGearState, 'gear is stowed in flight').toBe('retracted');

  // --- Park on a surface (this is what builds the gear) ---------------------------------------------------
  await page.evaluate(() => window.__arcaDebug?.startSurfacePhase());
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  await page.waitForTimeout(1_500);

  // --- Uniqueness ----------------------------------------------------------
  const counts = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let gears = 0;
    let lifts = 0;
    let ships = 0;
    let anchors = 0;
    let legs = 0;
    let feet = 0;
    let doorHinges = 0;
    scene.traverse((o) => {
      const n = o.name || '';
      if (n === 'Player Ship Landing Gear') gears += 1;
      if (n === 'Scout Ship Ventral Access Lift') lifts += 1;
      if (n === 'Player Scout Ship') ships += 1;
      if (n === 'shipBoardingAnchor') anchors += 1;
      if (/^Landing Gear Leg /.test(n)) legs += 1;
      if (/^Landing Gear Foot /.test(n)) feet += 1;
      if (/^Landing Gear Bay Door Hinge /.test(n)) doorHinges += 1;
    });
    return { gears, lifts, ships, anchors, legs, feet, doorHinges };
  });
  expect(counts.gears, 'exactly one landing gear system').toBe(1);
  expect(counts.lifts, 'exactly one access system').toBe(1);
  expect(counts.ships, 'exactly one player ship').toBe(1);
  expect(counts.anchors, 'exactly one boarding anchor').toBe(1);
  expect(counts.legs, 'exactly three legs').toBe(3);
  expect(counts.feet, 'exactly three feet').toBe(3);
  // Doors swing from hinge groups, not from the mesh centre.
  expect(counts.doorHinges, 'each door has its own hinge group').toBe(3);

  const parked = await gear(page);
  expect(parked.legCount, 'three supports registered').toBe(3);

  // --- Feet stay attached to their struts at every stage -------------------
  for (const fraction of [0, 0.5, 1]) {
    await setFraction(page, fraction);
    await page.waitForTimeout(500);
    const staged = await gear(page);
    for (const leg of staged.supports) {
      // The foot hangs off the piston: any real separation means it came off.
      expect(leg.legToFootDistance, `${leg.id} foot attached at ${fraction * 100}%`).toBeLessThan(0.25);
      expect(leg.parentName, `${leg.id} foot parented to its piston`).toContain('Piston');
    }
  }

  // --- The deployment passes through intermediate states -------------------
  const seen: string[] = [];
  for (const fraction of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    await setFraction(page, fraction);
    await page.waitForTimeout(350);
    const staged = await gear(page);
    seen.push(staged.landingGearState);
  }
  expect(seen[0], 'starts stowed').toBe('retracted');
  expect(seen[seen.length - 1], 'ends deployed').toBe('deployed');
  const intermediates = seen.slice(1, -1).filter((s) => s !== 'retracted' && s !== 'deployed');
  expect(intermediates.length, 'gear does not snap straight to deployed').toBeGreaterThan(0);

  // Phases advance in order: doors before swing before extension.
  await setFraction(page, 0.15);
  await page.waitForTimeout(350);
  const early = await gear(page);
  expect(early.phases.extension, 'extension has not started while doors open').toBeLessThan(0.5);

  // --- Settled contract ----------------------------------------------------
  await setFraction(page, 1);
  await page.waitForTimeout(800);
  const settled = await gear(page);
  expect(settled.bellyClearance, 'belly within the gear band').toBeGreaterThanOrEqual(1.7);
  expect(settled.bellyClearance, 'belly within the gear band').toBeLessThanOrEqual(2.1);

  // Every foot rests ON the terrain: not floating, not buried. The reach used
  // to be solved as if the strut hung vertically, which sank the feet ~0.9 m.
  for (const leg of settled.supports) {
    expect(leg.footClearance, `${leg.id} foot is not buried`).toBeGreaterThan(-0.12);
    expect(leg.footClearance, `${leg.id} foot is not floating`).toBeLessThan(0.15);
  }

  // Hatch derives from the hull underside, not the inherited 2.75 floor.
  expect(settled.hullBottomLocalY, 'hull bottom derives from bounds').toBeLessThan(0);
  expect(settled.hatchDeckHeight, 'hatch height is not pinned to the old 2.75 floor')
    .not.toBeCloseTo(2.75, 2);

  // --- Access reaches the ground ------------------------------------------
  const access = await page.evaluate(() => window.__arcaDebug?.measureShipAccess());
  expect(access!.footClearance, 'ladder step rests on the terrain').toBeGreaterThanOrEqual(-0.03);
  expect(access!.footClearance, 'ladder step rests on the terrain').toBeLessThanOrEqual(0.08);
  expect(access!.anchorToFootDistance, 'boarding anchor keeps its documented offset')
    .toBeCloseTo(0.35, 1);

  console.log('GEAR SETTLED', JSON.stringify({
    state: settled.landingGearState,
    belly: settled.bellyClearance,
    hatchDeck: settled.hatchDeckHeight,
    footTravelConfigured: settled.footTravelConfigured,
    supports: settled.supports.map((s) => ({ id: s.id, clr: s.footClearance, ext: s.extension, gap: s.legToFootDistance }))
  }));

  expect(consoleErrors).toEqual([]);
});
