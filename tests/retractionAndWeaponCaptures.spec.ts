import { test, type Page } from '@playwright/test';

/**
 * Visual record for the retraction sequence and the weapon readouts.
 *
 * Run LAST: Playwright wipes `test-results/` at the start of every run, so
 * these are copied out to `artifacts/` immediately afterwards. Retraction
 * frames are pinned through `setLandingGearRetraction`, which drives the real
 * phase machine rather than posing the geometry.
 */
test.setTimeout(1_200_000);
const OUT = 'test-results/retraction-weapons';

const shotter = (page: Page) => async (name: string) => {
  await page.waitForTimeout(700);
  await page.locator('#game-canvas').screenshot({ path: `${OUT}/${name}.png` });
};

test('retraction sequence captures', async ({ page }) => {
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
  await page.evaluate(() => {
    window.__arcaDebug?.hideExternalHudForCockpitCapture(true);
    window.__arcaDebug?.clearDialogueQueue();
  });
  const shot = shotter(page);
  const frame = (az: number, el: number, d: number, open = 1) => page.evaluate(
    ({ a, e, dd, o }) => window.__arcaDebug?.inspectShipAccess(o, 1, a, e, dd, 'anchor'),
    { a: az, e: el, dd: d, o: open }
  );

  // 1. Parked, gear down, access open.
  await frame(58, 6, 15, 1);
  await shot('01-parked-gear-deployed');

  // 2. Access closed, gear still down and loaded.
  await frame(58, 6, 15, 0);
  await shot('02-access-closed');

  // 3-7. The fold, pinned at real points along the machine.
  const stages: [number, string][] = [
    [0.08, '03-suspension-unloading'],
    [0.22, '04-feet-leaving-contact'],
    [0.45, '05-struts-retracting'],
    [0.72, '06-arms-entering-bays'],
    [0.92, '07-doors-closing']
  ];
  for (const [fraction, name] of stages) {
    const state = await page.evaluate(
      (f) => window.__arcaDebug?.setLandingGearRetraction(f), fraction
    );
    const readout = await page.evaluate(() => window.__arcaDebug?.getLandingGearState()) as Record<string, unknown>;
    console.log(`RETRACT ${fraction}`, state, JSON.stringify(readout.phases), 'contacts', readout.footContactCount);
    await shot(name);
  }

  // 8. Fully stowed, in flight.
  await page.evaluate(() => window.__arcaDebug?.setLandingGearRetraction(1));
  await page.evaluate(() => window.__arcaDebug?.clearShipAccessInspection());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.waitForTimeout(1_200);
  await shot('08-in-flight-gear-stowed');
  const flying = await page.evaluate(() => window.__arcaDebug?.getLandingGearState()) as Record<string, unknown>;
  console.log('IN FLIGHT', JSON.stringify({
    gear: flying.landingGearState, visible: flying.gearVisible,
    colliders: flying.activeGearColliders, takeoff: flying.takeoffPhase
  }));
});

test('weapon HUD captures', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);

  // HUD captures need the HUD, so no hiding here. Crop to the weapon strip.
  const strip = page.locator('#hud');
  const hudShot = async (name: string) => {
    await page.waitForTimeout(600);
    await strip.screenshot({ path: `${OUT}/${name}.png` });
  };
  const report = async (label: string) => {
    const w = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, unknown>;
    console.log(`HUD ${label}`, JSON.stringify({
      primary: w.hudPrimary, torpedo: w.hudTorpedo,
      energy: w.primaryCurrent, rounds: w.torpedoCurrent, max: w.torpedoMaximum
    }));
  };

  // 9. Starting load.
  await page.evaluate(() => window.__arcaDebug?.setWeaponEnergy(100));
  await hudShot('09-hud-initial-load');
  await report('initial');

  // 10. After sustained primary fire.
  for (let i = 0; i < 30; i += 1) await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  await hudShot('10-hud-after-sustained-fire');
  await report('after-sustained-fire');

  // 11. Recovering.
  await page.evaluate(() => window.__arcaDebug?.setWeaponEnergy(8));
  await hudShot('11-hud-recovering');
  await report('recovering');

  // 12. Torpedo bay loaded.
  await page.evaluate(() => window.__arcaDebug?.setWeaponEnergy(100));
  await hudShot('12-hud-torpedoes-loaded');
  await report('torpedoes-loaded');

  // 13. Immediately after a launch: the tube shows its reload.
  await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
  await hudShot('13-hud-after-launch');
  await report('after-launch');

  // 14. Primary and torpedo readouts side by side, both live.
  await page.waitForFunction(
    () => (window.__arcaDebug?.getWeaponResourceState() as { torpedoReady?: boolean })?.torpedoReady === true,
    undefined,
    { timeout: 240_000 }
  );
  await hudShot('14-hud-primary-and-torpedoes');
  await report('both-readouts');
});
