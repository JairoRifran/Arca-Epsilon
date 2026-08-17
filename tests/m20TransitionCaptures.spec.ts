import { expect, test, type Page } from '@playwright/test';

/** Four frames of M20's climb out of the atmosphere. */
test.setTimeout(900_000);
const OUT = 'test-results/m20-transition';

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

const asc = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as unknown as
    Promise<Record<string, number | string | boolean>>;

test('m20 atmospheric transition captures', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.evaluate((seq) => {
    const d = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const n of seq) d?.[n]?.();
  }, TO_M18);
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__arcaDebug?.startMission20());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);

  const lift = async (m: number) => {
    await page.evaluate((v) => {
      window.__arcaDebug?.liftShipToAltitude(v);
      window.__arcaDebug?.setPlayerMode('ship');
      window.__arcaDebug?.clearDialogueQueue();
    }, m);
  };
  const shot = async (n: string) => {
    await page.waitForTimeout(2_200);
    await page.screenshot({ path: `${OUT}/${n}.png` });
    const s = await asc(page);
    console.log(`CAP ${n}`, JSON.stringify({
      alt: s.altitudeAboveTerrain, progress: s.transitionProgress,
      stars: s.starOpacity, curvature: s.curvature,
      orbital: s.orbitalEnvironmentActive, ark: s.arkDistance
    }));
  };

  await lift(1100);
  await shot('01-1100m-atmosphere');
  await lift(1600);
  await shot('02-1600m-transition');
  await lift(2100);
  await shot('03-2100m-near-vacuum');
  await lift(2400);
  await shot('04-2400m-space');

  console.log('ERRORS', JSON.stringify(errors));
  expect(errors).toEqual([]);
});
