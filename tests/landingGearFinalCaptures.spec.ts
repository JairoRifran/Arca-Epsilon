import { test, type Page } from '@playwright/test';

/**
 * Final visual record for the landing gear and the ventral hatch.
 *
 * Run LAST: Playwright wipes `test-results/` at the start of every run, so
 * anything generated here is destroyed by the next invocation. The captures are
 * copied out to `artifacts/player-ship-landing-gear-final/` afterwards.
 *
 * The deployment frames are driven through `setLandingGearFraction`, which
 * advances the real phase machine — `forceDeployed` would jump straight to the
 * end state and prove nothing about the sequence.
 */
test.setTimeout(1_200_000);

const OUT = 'test-results/gear-final';

const TO_AURORA = [
  'startSurfacePhase', 'makeBaseOperational', 'startMission03',
  'calibrateMission03Communications', 'placeRelayBeacon', 'completeSignalSync',
  'completeMission03Translation', 'completePleyadanContact', 'completeMission03',
  'startMission04', 'completeMission04', 'startMission05', 'detectSilentProbe',
  'triggerInterference', 'resolveAllEchoes', 'completeCounterSignal',
  'completeMission05', 'startMission06', 'placeAllCloakingProjectors',
  'completeCloakingSync', 'completeMission06', 'startMission07',
  'scanAllAtlasEchoNodes', 'activateAtlasSeedArchive', 'completeMission07',
  'startMission08', 'stabilizeAllFractureFoci', 'completeSignalPurge',
  'completeMission08', 'completeMission09', 'startMission10', 'surveyAuroraValley'
] as const;

async function boot(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
}

/** Clean plate: the HUD covers most of the frame otherwise. */
async function cleanPlate(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__arcaDebug?.hideExternalHudForCockpitCapture(true);
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForTimeout(400);
}

const shotter = (page: Page) => async (name: string) => {
  await page.waitForTimeout(750);
  await page.locator('#game-canvas').screenshot({ path: `${OUT}/${name}.png` });
};

const frame = (
  page: Page, az: number, el: number, dist: number, focus: 'anchor' | 'hatch'
) => page.evaluate(
  ({ a, e, d, f }) => window.__arcaDebug?.inspectShipAccess(1, 1, a, e, d, f as 'anchor' | 'hatch'),
  { a: az, e: el, d: dist, f: focus }
);

const setGear = (page: Page, f: number) =>
  page.evaluate((v) => window.__arcaDebug?.setLandingGearFraction(v), f);

test('landing gear final captures: Base Nereida', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
    window.__arcaDebug?.setPlayerMode('onFoot');
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);
  await cleanPlate(page);
  const shot = shotter(page);

  // --- 1-6: the deployment, driven through the real phase machine ---------
  await frame(page, 62, 6, 13, 'anchor');
  for (const [i, f] of [0, 0.2, 0.4, 0.6, 0.8, 1].entries()) {
    await setGear(page, f);
    const state = await page.evaluate(() => window.__arcaDebug?.getLandingGearState()) as Record<string, unknown>;
    console.log(`SEQUENCE ${Math.round(f * 100)}%`, state.landingGearState, JSON.stringify(state.phases));
    await shot(`0${i + 1}-deploy-${String(Math.round(f * 100)).padStart(3, '0')}pct`);
  }

  // --- 7-10: the hatch, framed on the hatch itself, from underneath -------
  await setGear(page, 1);
  await frame(page, 0, -18, 4.2, 'hatch');
  await shot('07-hatch-from-below-front');
  await frame(page, 180, -18, 4.2, 'hatch');
  await shot('08-hatch-from-below-rear');
  await frame(page, 90, -22, 4.2, 'hatch');
  await shot('09-hatch-from-below-outboard');
  await frame(page, 45, -40, 3.4, 'hatch');
  await shot('10-hatch-from-below-perpendicular');

  // --- 11-12: mechanical detail -------------------------------------------
  await frame(page, 115, -6, 5.0, 'hatch');
  await shot('11-bay-door-and-seal');
  await frame(page, 70, -30, 3.0, 'anchor');
  await shot('12-foot-contact');

  // --- 13: the parked stance on this surface -------------------------------
  await frame(page, 55, 8, 17, 'anchor');
  await shot('13-parked-stance-nereida');

  // --- 15: the ladder reaching the ground ----------------------------------
  await frame(page, 88, 2, 8.5, 'anchor');
  await shot('15-ladder-to-ground-nereida');

  const settled = await page.evaluate(() => window.__arcaDebug?.getLandingGearState()) as Record<string, unknown>;
  console.log('FINAL NEREIDA', JSON.stringify(settled));
});

test('landing gear final captures: Aurora', async ({ page }) => {
  await boot(page);
  await page.evaluate((steps) => {
    window.__arcaDebug?.clearSave();
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown> | undefined;
    for (const step of steps) debug?.[step]?.();
    window.__arcaDebug?.teleportToAuroraSample('soil');
    window.__arcaDebug?.setPlayerMode('ship');
  }, TO_AURORA);
  await page.waitForFunction(
    () => window.__arcaDebug?.getShipBoardingState().surfaceZone === 'aurora'
      && window.__arcaDiagnostics?.insideShip === true
  );
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    () => window.__arcaDiagnostics?.onFootActive === true
      && window.__arcaDiagnostics?.inputMode !== 'boarding-transition',
    undefined,
    { timeout: 60_000 }
  );
  await cleanPlate(page);
  const shot = shotter(page);

  // --- 14: the same stance on genuinely different ground -------------------
  await setGear(page, 1);
  await frame(page, 55, 8, 17, 'anchor');
  await shot('14-parked-stance-aurora');
  await frame(page, 70, -30, 3.0, 'anchor');
  await shot('14b-foot-contact-aurora');

  const zone = await page.evaluate(() => window.__arcaDebug?.getShipBoardingState().surfaceZone);
  const settled = await page.evaluate(() => window.__arcaDebug?.getLandingGearState()) as Record<string, unknown>;
  console.log('FINAL AURORA', zone, JSON.stringify(settled));
});
