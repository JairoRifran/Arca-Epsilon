import { expect, test, type Page } from '@playwright/test';

/** Part D visual record. Run last; copied out of test-results afterwards. */
test.setTimeout(1_200_000);
const OUT = 'test-results/part-d';

test('part D hardpoint captures', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
  });
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__arcaDebug?.hideExternalHudForCockpitCapture(true));

  const shot = async (name: string) => {
    await page.waitForTimeout(800);
    await page.locator('#game-canvas').screenshot({ path: `${OUT}/${name}.png` });
  };

  // The access inspection camera is the only free-orbit rig available, and it
  // frames the ship rather than the chase pose — exactly what is needed to look
  // at nozzles and tubes.
  const orbit = (az: number, el: number, dist: number, focus: 'anchor' | 'hatch' = 'anchor') =>
    page.evaluate(
      ({ a, e, d, f }) => window.__arcaDebug?.inspectShipAccess(0, 1, a, e, d, f as 'anchor' | 'hatch'),
      { a: az, e: el, d: dist, f: focus }
    );

  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  await page.waitForTimeout(1_500);

  const hp = await page.evaluate(() => window.__arcaDebug?.getShipHardpointState());
  console.log('HARDPOINTS', JSON.stringify(hp));

  // 1-2. Engines from behind, then closer.
  await orbit(0, 6, 20);
  await shot('01-engines-rear');
  await orbit(8, 4, 11);
  await shot('02-nozzles-detail');

  // 3. Boost. Board and hold shift so the plumes run hot.
  await page.evaluate(() => window.__arcaDebug?.clearShipAccessInspection());
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(45));
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2_500);
  await shot('03-nozzles-boost');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  // 4. Side-on, plume axis against the hull line.
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  await page.waitForTimeout(1_500);
  await orbit(90, 4, 22);
  await shot('04-plume-axis-side');

  // 5-6. Cannons firing, one side then the other.
  await page.evaluate(() => window.__arcaDebug?.clearShipAccessInspection());
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(45));
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  await shot('05-cannon-a-firing');
  await page.waitForFunction(
    () => (window.__arcaDebug?.getWeaponResourceState() as { primaryReady?: boolean })?.primaryReady === true,
    undefined, { timeout: 60_000 }
  ).catch(() => undefined);
  await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  await shot('06-cannon-b-firing');

  // 7. A torpedo leaving its tube.
  await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
  await shot('07-torpedo-from-tube');

  // 8. The four tubes from underneath.
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  await page.waitForTimeout(1_500);
  await orbit(150, -34, 9, 'hatch');
  await shot('08-four-tubes-underside');

  // 9. General accessory / light pass.
  await orbit(52, 10, 18);
  await shot('09-lights-and-accessories');

  // 10. Shield shell around the hull.
  await page.evaluate(() => window.__arcaDebug?.clearShipAccessInspection());
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(45));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    s.traverse((o) => { if (o.name === 'Player Shield Shell') o.visible = true; });
  });
  await shot('10-shield-shell');

  console.log('ERRORS', JSON.stringify(errors));
  expect(errors).toEqual([]);
});
