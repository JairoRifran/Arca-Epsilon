import { expect, test, type Page } from '@playwright/test';

/**
 * M20's emergency ascent out of the Nereida basin.
 *
 * Surface flight clamps the hull at 160 m and zeroes any upward velocity, but
 * the mission waits for `ship.position.y > 900` before the ascent step can
 * complete. Those two numbers made the step unreachable: holding Space climbed
 * to the clamp and stopped there for ever. The ceiling now lifts while — and
 * only while — the ascent is authorised.
 */
test.setTimeout(900_000);

const TO_M18 = [
  'startSurfacePhase', 'makeBaseOperational', 'startMission03', 'calibrateMission03Communications',
  'placeRelayBeacon', 'completeSignalSync', 'completeMission03Translation', 'completePleyadanContact',
  'completeMission03', 'startMission04', 'completeMission04', 'startMission05', 'detectSilentProbe',
  'triggerInterference', 'resolveAllEchoes', 'completeCounterSignal', 'completeMission05',
  'startMission06', 'placeAllCloakingProjectors', 'completeCloakingSync', 'completeMission06',
  'startMission07', 'scanAllAtlasEchoNodes', 'activateAtlasSeedArchive', 'completeMission07',
  'startMission08', 'stabilizeAllFractureFoci', 'completeSignalPurge', 'completeMission08',
  'completeMission09', 'startMission10', 'surveyAuroraValley', 'analyzeAllAuroraSamples',
  'markAuroraSettlementSite', 'deployAuroraModule', 'stabilizeAuroraModule', 'completeMission10',
  'startMission11', 'runAuroraCoreDiagnostic', 'markAuroraSecondModuleSite', 'deployAuroraSecondModule',
  'connectAuroraEnergyLink', 'installAuroraWaterFilter', 'calibrateAuroraWaterFlow',
  'prepareAuroraCultivationBed', 'startAuroraBioTrial', 'completeAuroraImpactAssessment', 'completeMission11',
  'startMission12', 'landAuroraCrewCapsule', 'disembarkAuroraCrew', 'completeMission12',
  'startMission13', 'secureStormGenerator', 'anchorStormAntenna', 'activateStormAntenna', 'chargeStormShield', 'completeMission13',
  'startMission14', 'completeTraceInspections', 'completeReverseTriangulation', 'completeMission14',
  'completeMission15', 'completeMission16', 'completeMission17', 'completeMission18'
];

type AscentState = {
  missionStep: string;
  mission20Started: boolean;
  ascentComplete: boolean;
  ascentProgress: number;
  insideShip: boolean;
  shipY: number;
  altitudeAboveTerrain: number;
  verticalSpeed: number;
  ascendInput: number;
  surfaceCeiling: number;
  orbitalTransitionAltitude: number;
  orbitalAscentAllowed: boolean;
  precisionAssistActive: boolean;
  inSurfacePhase: boolean;
  landingGearState: string;
};

const asc = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as unknown as Promise<AscentState>;

test('M20: holding Space climbs past the old ceiling and completes the ascent', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
  });
  // M20 sits behind M19, which sits behind the whole M18 chain: without it
  // `startMission20` silently no-ops and the mission never begins.
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
  }, TO_M18);
  await page.waitForTimeout(1_500);

  // 1-3. Into M20's ascent step, aboard, gear stowed.
  await page.evaluate(() => window.__arcaDebug?.startMission20());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  // Starting M20 queues its briefing, and a blocking dialogue makes the keydown
  // handler return before it ever records the key — Space would be swallowed.
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);

  const start = await asc(page);
  console.log('ASCENT START', JSON.stringify({
    step: start.missionStep, y: start.shipY, ceiling: start.surfaceCeiling,
    target: start.orbitalTransitionAltitude, allowed: start.orbitalAscentAllowed,
    gear: start.landingGearState
  }));
  expect(start.mission20Started, 'M20 is running').toBe(true);
  expect(start.insideShip, 'pilot is aboard').toBe(true);
  expect(start.landingGearState, 'gear is stowed before the climb').toBe('retracted');

  // The authorisation, and the ceiling it lifts, must clear the trigger.
  expect(start.orbitalAscentAllowed, 'the ascent is authorised on this step').toBe(true);
  expect(start.surfaceCeiling, 'the ceiling now clears the orbital trigger')
    .toBeGreaterThan(start.orbitalTransitionAltitude);

  // 4-7. Holding Space climbs. Flying the whole 900 m is not possible here —
  // the software renderer advances simulated time far too slowly — so this
  // proves the climb is live and unclamped, then the run is completed from just
  // below the threshold. The blocker being tested is the ceiling, not the
  // frame rate.
  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await asc(page)).shipY, {
      message: 'holding Space must actually raise the hull',
      timeout: 120_000,
      intervals: [1000]
    })
    .toBeGreaterThan(30);
  const climbing = await asc(page);
  console.log('CLIMBING', JSON.stringify({
    y: climbing.shipY, vSpeed: climbing.verticalSpeed, precision: climbing.precisionAssistActive
  }));
  expect(climbing.verticalSpeed, 'still ascending, not pinned').toBeGreaterThan(0);
  expect(climbing.precisionAssistActive, 'the precision assist is not holding it down').toBe(false);

  // 8. Approach the trigger and cross it under thrust. Before the fix the clamp
  // made everything above 160 m unreachable, so this is the case that used to
  // be impossible.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(870));
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await expect
    .poll(async () => (await asc(page)).shipY, {
      message: 'the hull must cross the orbital transition altitude',
      timeout: 240_000,
      intervals: [1500]
    })
    .toBeGreaterThan(900);

  // 9, 12. The ascent step completes exactly once and the mission moves on.
  await expect
    .poll(async () => (await asc(page)).missionStep, {
      message: 'M20 must leave the ascent step',
      timeout: 180_000,
      intervals: [1500]
    })
    .not.toBe('emergencyAscent');
  await page.keyboard.up('Space');

  const done = await asc(page);
  console.log('ASCENT DONE', JSON.stringify({
    step: done.missionStep, complete: done.ascentComplete, y: done.shipY,
    gear: done.landingGearState, inSurfacePhase: done.inSurfacePhase
  }));
  expect(done.ascentComplete, 'the ascent registered as complete').toBe(true);

  // 13. The gear stays stowed through the whole climb.
  expect(done.landingGearState, 'gear never redeployed').toBe('retracted');

  // The raised ceiling persists past the ascent step, so the hull is not yanked
  // back down to 160 m the frame the mission advances.
  expect(done.shipY, 'the hull stays up after the hand-off').toBeGreaterThan(800);
  expect(done.surfaceCeiling, 'the ceiling is still raised').toBeGreaterThan(900);

  expect(errors).toEqual([]);
});
