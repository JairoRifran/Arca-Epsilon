import { expect, test, type Page } from '@playwright/test';

/**
 * Takeoff: the gear must come up when the ship leaves a surface.
 *
 * Boarding used to hand full flight control back the instant the pilot was
 * aboard, with no retract command anywhere in the codebase, so the ship flew
 * with its legs down. This walks one real F-boarding transition and asserts the
 * ordering — access shut before anything folds, suspension bled before the
 * struts shorten, feet clear before retraction, doors last.
 */
test.setTimeout(900_000);

type GearState = {
  landingGearState: string;
  takeoffPhase: string;
  deploymentProgress: number;
  settlingProgress: number;
  phases: { door: number; swing: number; extension: number; compression: number };
  supports: { id: string; extension: number; compression: number; footClearance: number }[];
  footContactCount: number;
  gearVisible: boolean;
  activeGearColliders: number;
  doorProgress: number;
  playerMode: string;
  accessState: string;
  parkingState: string;
  flightControlsEnabled: boolean;
  bellyClearance: number;
};

const gear = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getLandingGearState()) as unknown as Promise<GearState>;

async function bootParked(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
    window.__arcaDebug?.setPlayerMode('onFoot');
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);
  return errors;
}

/** Walks the pilot to the ladder and boards through the real F route. */
async function boardByF(page: Page): Promise<void> {
  const state = await page.evaluate(() => window.__arcaDebug?.getShipBoardingState());
  const anchor = state!.boardingAnchor;
  await page.evaluate(([x, y, z]) => window.__arcaDebug?.setPlayerPosition(x, y, z), anchor);
  await page.waitForFunction(() => window.__arcaDiagnostics?.shipAccessAvailable === true);
  await page.keyboard.press('KeyF');
}

test('takeoff retracts the gear in order and leaves nothing deployed', async ({ page }) => {
  const errors = await bootParked(page);

  // 1. Parked: gear is down.
  const parked = await gear(page);
  expect(parked.landingGearState, 'parked ship stands on deployed gear').toBe('deployed');
  expect(parked.footContactCount, 'all three feet are on the ground').toBe(3);
  expect(parked.bellyClearance).toBeGreaterThanOrEqual(1.7);
  expect(parked.bellyClearance).toBeLessThanOrEqual(2.1);

  await boardByF(page);

  // Sample the whole transition. One poll loop, no per-frame logging.
  const trace: GearState[] = [];
  const deadline = Date.now() + 120_000;
  for (;;) {
    const s = await gear(page);
    trace.push(s);
    if (s.landingGearState === 'retracted' && s.takeoffPhase === 'none') break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(120);
  }

  const seen = trace.map((s) => s.landingGearState);
  const phases = trace.map((s) => s.takeoffPhase);
  console.log('TAKEOFF TRACE', JSON.stringify(
    trace.filter((s, i) => i === 0 || s.landingGearState !== trace[i - 1].landingGearState)
      .map((s) => ({
        gear: s.landingGearState,
        takeoff: s.takeoffPhase,
        access: s.accessState,
        contacts: s.footContactCount,
        door: s.doorProgress,
        ext: s.phases.extension,
        swing: s.phases.swing,
        colliders: s.activeGearColliders,
        flight: s.flightControlsEnabled
      }))
  ));

  // 2-3. The access is shut before the gear does anything.
  for (const s of trace) {
    if (s.landingGearState !== 'deployed') {
      expect(s.accessState, 'gear never moves while the access is still open').not.toBe('deployed');
    }
  }

  // 4. Suspension bleeds off first: an unloading pass exists.
  expect(seen, 'suspension unloads before the struts fold').toContain('unloading');
  const unloadIdx = seen.indexOf('unloading');
  const retractIdx = seen.indexOf('retracting');
  expect(retractIdx, 'retraction happens after the unload').toBeGreaterThan(unloadIdx);

  // 6. Feet lose contact before retraction begins.
  expect(trace[retractIdx].footContactCount, 'feet are clear before anything folds').toBe(0);

  // 7-8. Extension comes down progressively rather than snapping.
  const retractSamples = trace.slice(retractIdx).filter((s) => s.landingGearState === 'retracting');
  expect(retractSamples.length, 'retraction is animated, not instant').toBeGreaterThan(1);
  const extensions = retractSamples.map((s) => s.phases.extension);
  expect(Math.max(...extensions), 'struts start out extended').toBeGreaterThan(0.3);

  // 10. Doors are still open while the arms are folding, and close last.
  const armsFolding = retractSamples.find((s) => s.phases.swing > 0.05 && s.phases.swing < 0.95);
  if (armsFolding) {
    expect(armsFolding.doorProgress, 'doors stay open until the arms are in').toBeGreaterThan(0.5);
  }

  // 11-13. Final state.
  const final = trace[trace.length - 1];
  expect(final.landingGearState, 'gear ends stowed').toBe('retracted');
  expect(final.takeoffPhase, 'takeoff hand-off completes').toBe('none');
  expect(final.gearVisible, 'no legs left visible').toBe(false);
  expect(final.activeGearColliders, 'no gear colliders left active').toBe(0);
  expect(final.footContactCount, 'no contacts left registered').toBe(0);
  expect(final.doorProgress, 'doors closed').toBeLessThan(0.02);
  expect(final.flightControlsEnabled, 'full flight control returned').toBe(true);

  // 14. Forbidden combinations never occurred.
  for (const s of trace) {
    expect(
      s.landingGearState === 'deployed' && s.takeoffPhase === 'none' && s.parkingState === 'airborne',
      'never airborne with a fully deployed gear and no transition running'
    ).toBe(false);
  }

  // Timing: brief enough not to feel like a freeze.
  const held = phases.filter((p) => p !== 'none').length * 0.12;
  console.log('TAKEOFF HOLD approx seconds', held.toFixed(2));

  expect(errors).toEqual([]);
});

test('instant routes into flight normalize the gear without a late animation', async ({ page }) => {
  const errors = await bootParked(page);
  expect((await gear(page)).landingGearState).toBe('deployed');

  // Debug/test teleport straight into the cockpit.
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.waitForTimeout(400);

  const after = await gear(page);
  expect(after.landingGearState, 'instant route stows the gear outright').toBe('retracted');
  expect(after.takeoffPhase, 'no animation left running').toBe('none');
  expect(after.gearVisible).toBe(false);
  expect(after.activeGearColliders).toBe(0);

  // And it stays stowed rather than animating itself away a second later.
  await page.waitForTimeout(1_200);
  expect((await gear(page)).landingGearState).toBe('retracted');

  expect(errors).toEqual([]);
});

test('M01 begins with the gear stowed', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.waitForTimeout(1_500);

  const s = await gear(page);
  expect(s.landingGearState, 'the opening mission does not start on legs').toBe('retracted');
  expect(s.gearVisible).toBe(false);
  expect(s.activeGearColliders).toBe(0);
  expect(errors).toEqual([]);
});
