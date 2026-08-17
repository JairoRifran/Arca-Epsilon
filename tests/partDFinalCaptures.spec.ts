import { expect, test } from '@playwright/test';

/** Part D closing record: five frames, aimed with the feature-inspection rig. */
test.setTimeout(1_200_000);
const OUT = 'test-results/part-d-final';

test('part D final captures', async ({ page }) => {
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
  // In flight, so terrain cannot block the underside views.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(70));
  await page.evaluate(() => window.__arcaDebug?.hideExternalHudForCockpitCapture(true));
  await page.waitForTimeout(1_000);

  const shot = async (n: string) => {
    await page.waitForTimeout(800);
    await page.locator('#game-canvas').screenshot({ path: `${OUT}/${n}.png` });
  };
  const look = (f: 'engines' | 'torpedoBay' | 'accessories', az: number, el: number, d: number) =>
    page.evaluate(
      ({ ff, a, e, dd }) => window.__arcaDebug?.inspectShipFeature(ff as 'engines', a, e, dd),
      { ff: f, a: az, e: el, dd: d }
    );

  // 1-2. Engines: normal thrust, then boost, from directly behind.
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -10));
  await look('engines', 0, 4, 11);
  await shot('01-engines-normal');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2_500);
  await look('engines', 0, 4, 11);
  await shot('02-engines-boost');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  // 3. The four tubes from below, looking up at the ventral pod.
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, 0));
  const bay = await look('torpedoBay', 200, -30, 6);
  console.log('BAY FOCUS', JSON.stringify(bay));
  await shot('03-four-tubes-underside');

  // 4. A torpedo leaving its tube, framed on the bay.
  await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
  await page.waitForTimeout(350);
  await shot('04-torpedo-leaving-tube');

  // 5. Lights, accessories and the shield shell around the hull.
  await look('accessories', 55, 12, 26);
  await page.evaluate(() => {
    const s = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    s.traverse((o) => { if (o.name === 'Player Shield Shell') o.visible = true; });
  });
  await shot('05-accessories-and-shield');

  const hp = await page.evaluate(() => window.__arcaDebug?.getShipHardpointState());
  console.log('HP', JSON.stringify(hp));
  console.log('ERRORS', JSON.stringify(errors));
  expect(errors).toEqual([]);
});
