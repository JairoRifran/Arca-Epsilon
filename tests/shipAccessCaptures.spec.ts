import { expect, test, type Page } from '@playwright/test';

/**
 * Visual calibration harness for the crew access.
 *
 * Stage 2A was built and verified entirely through code, which cannot tell
 * whether the hatch clips the hull or the ladder folds through itself. This
 * pins the access at exact progress values, frames it from fixed angles and
 * writes one capture per stage, plus a live geometric measurement so the
 * numbers and the picture can be compared against each other.
 *
 * Captures land in `test-results/access/` and are regenerated every run.
 */
test.setTimeout(900_000);

const OUT = 'test-results/access';

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

/**
 * Parks the hull on real terrain and puts the pilot beside it.
 *
 * `setPlayerMode('onFoot')` runs the same `parkShipOnTerrain` a real disembark
 * does, so the ship sits at its true 0.12 m clearance rather than at the
 * surface spawn altitude — without that the access hangs 13 m in the air and
 * every measurement is meaningless. It also places the 1.78 m pilot next to
 * the ladder, which is the scale reference this stage needs.
 */
async function parkOnSurface(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__arcaDebug?.startSurfacePhase();
  });
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  await page.waitForTimeout(1_500);
  // Clean plate: the HUD covers most of the frame otherwise.
  await page.evaluate(() => {
    window.__arcaDebug?.hideExternalHudForCockpitCapture(true);
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForTimeout(400);
}

const inspect = (page: Page, open: number, lift: number, az = 62, el = 10, dist = 9) =>
  page.evaluate(
    ({ o, l, a, e, d }) => window.__arcaDebug?.inspectShipAccess(o, l, a, e, d),
    { o: open, l: lift, a: az, e: el, d: dist }
  );

const measure = (page: Page) => page.evaluate(() => window.__arcaDebug?.measureShipAccess());

test('ship access: staged captures and geometric calibration', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await parkOnSurface(page);

  const canvas = page.locator('#game-canvas');
  const shot = async (name: string) => {
    // Two frames so the pinned progress and camera have both been applied.
    await page.waitForTimeout(700);
    await canvas.screenshot({ path: `${OUT}/${name}.png` });
  };

  // 1-6: the deployment, stage by stage, from a three-quarter angle.
  await inspect(page, 0, 0, 55, -22, 6.5);
  await shot('01-underside-closed');
  const closed = await measure(page);

  await inspect(page, 0.5, 0, 55, -22, 6.5);
  await shot('02-underside-hatch-50');

  await inspect(page, 1, 0, 55, -22, 6.5);
  await shot('03-underside-hatch-open');
  const hatchOpen = await measure(page);

  await inspect(page, 1, 0.02, 0, -18, 6);
  await shot('04-hinges-front-low');

  await inspect(page, 1, 0.45, 90, -10, 7);
  await shot('05-lateral-low-first-segment');

  await inspect(page, 1, 1, 62, 6, 9);
  await shot('06-ladder-deployed');
  const deployed = await measure(page);

  // 7: lateral view, perpendicular to the ladder, for pilot-scale reference.
  await inspect(page, 1, 1, 75, -4, 4.2);
  await shot('07-step-contact-nereida');

  // 8: low view from the ground, which is where clipping shows up.
  await inspect(page, 1, 1, 75, -4, 4.2);
  await shot('08-step-contact-aurora');

  // 9: front-on to the aperture.
  await inspect(page, 1, 1, 90, 3, 7.5);
  await shot('09-pilot-scale');

  console.log('FOOT CHAIN', JSON.stringify(await page.evaluate(() => window.__arcaDebug?.debugShipAccessFoot()), null, 1));
  console.log('ACCESS CLOSED   ', JSON.stringify(closed));
  console.log('ACCESS HATCHOPEN', JSON.stringify(hatchOpen));
  console.log('ACCESS DEPLOYED ', JSON.stringify(deployed));

  await page.evaluate(() => window.__arcaDebug?.clearShipAccessInspection());
  expect(consoleErrors).toEqual([]);
});
