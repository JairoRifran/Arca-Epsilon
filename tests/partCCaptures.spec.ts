import { expect, test, type Page } from '@playwright/test';

/** Part C visual record. Run last; copied out of test-results afterwards. */
test.setTimeout(1_200_000);
const OUT = 'test-results/part-c';

const nav = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getShipNavigationState()) as unknown as
    Promise<Record<string, number | string | boolean>>;

test('part C navigation captures', async ({ page }) => {
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

  const shot = async (name: string) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    const s = await nav(page);
    console.log(`CAP ${name}`, JSON.stringify({
      dist: s.cameraDistance, h: s.cameraHeightAboveShip, fov: s.cameraFov,
      speed: s.planarSpeed, alt: s.altitudeAboveTerrain,
      brake: s.brakingActive, precision: s.precisionActive
    }));
  };

  // 1. The previous framing, reproduced by pinning the old offsets is not
  // possible without reverting code, so this is the parked reference frame the
  // old pose was judged against.
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  await page.waitForTimeout(1_200);
  await shot('01-reference-parked');

  // 2. Normal flight with the new pose.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(45));
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -18));
  await page.waitForTimeout(2_000);
  await shot('02-camera-normal-flight');

  // 3. Boost.
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2_500);
  await shot('03-camera-boost');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  // 4-5. Target selected ahead, and one off screen. Needs a live wave, so this
  // reuses the M19 corridor the visibility pass established.
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, 0));
  await page.waitForTimeout(1_000);
  await shot('04-target-ahead');
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(700);
  await shot('05-target-offscreen');

  // 6. Low flight near Nereida.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(12));
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -4));
  await page.waitForTimeout(2_500);
  await shot('06-low-flight-precision');

  // 7. Braking from cruise.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(45));
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -24));
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1_200);
  await shot('07-braking');
  await page.keyboard.up('KeyS');

  // 8. Approach and landing.
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  await page.waitForTimeout(2_000);
  await shot('08-landing-approach');

  console.log('ERRORS', JSON.stringify(errors));
  expect(errors).toEqual([]);
});
