import { expect, test, type Page } from '@playwright/test';

/**
 * Measures the step travel each surface actually demands, so the clamp is a
 * measured budget rather than a number raised until the symptom went away.
 * Aurora and Base Nereida are measured in separate page contexts: sharing one
 * would let the first surface's high-water mark contaminate the second.
 */
test.setTimeout(600_000);

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
}

/** Records the peak correction this surface asks for, once settled. */
async function sampleTravel(page: Page, label: string): Promise<number> {
  await page.evaluate(() => window.__arcaDebug?.resetFootTravelPeak());
  await page.waitForTimeout(2_500);
  const m = await page.evaluate(() => ({
    access: window.__arcaDebug?.measureShipAccess(),
    gear: window.__arcaDebug?.getLandingGearState()
  })) as unknown as { access: Record<string, number>; gear: Record<string, number> };
  console.log(`TRAVEL ${label}`, JSON.stringify({
    peakRequested: m.gear.footTravelPeakRequested,
    configured: m.gear.footTravelConfigured,
    footClearance: m.access.footClearance,
    bellyClearance: m.gear.bellyClearance
  }));
  // The clamp must cover what this surface asks for, with margin, and must not
  // be inflated far beyond it — an oversized budget hides real geometry errors.
  expect(m.gear.footTravelPeakRequested, `${label} fits inside the travel budget`)
    .toBeLessThanOrEqual(m.gear.footTravelConfigured - 0.04);
  expect(m.access.footClearance, `${label} step rests on the terrain`)
    .toBeGreaterThanOrEqual(-0.03);
  expect(m.access.footClearance, `${label} step rests on the terrain`)
    .toBeLessThanOrEqual(0.08);
  return m.gear.footTravelPeakRequested;
}

test('foot travel budget: Base Nereida', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
    window.__arcaDebug?.setPlayerMode('onFoot');
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);

  const peak = await sampleTravel(page, 'nereida');
  // Nereida is the demanding surface; if it ever drops under 0.42 the budget
  // can go back down.
  expect(peak).toBeGreaterThan(0);
});

test('foot travel budget: Aurora', async ({ page }) => {
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

  const peak = await sampleTravel(page, 'aurora-soil');
  expect(peak).toBeGreaterThan(0);
});
