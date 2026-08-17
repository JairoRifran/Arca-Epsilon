import { expect, test, type Page } from '@playwright/test';

/** One frame of M20 already in orbit, for visual review. */
test.setTimeout(900_000);
const OUT = 'test-results/m20-orbit';

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
    Promise<Record<string, unknown>>;

test('m20 orbital frame capture', async ({ page }) => {
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
  await page.waitForTimeout(1_000);

  await page.evaluate(() => {
    window.__arcaDebug?.liftShipToAltitude(2380);
    window.__arcaDebug?.setPlayerMode('ship');
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await asc(page)).transitionHandedOver, { timeout: 120_000, intervals: [1000] })
    .toBe(true);
  await page.keyboard.up('Space');
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(4_000);

  await page.screenshot({ path: `${OUT}/orbit.png` });
  const s = await asc(page);
  console.log('ORBIT', JSON.stringify({
    y: s.shipY, arkY: s.arkY, arkDistance: s.arkDistance, step: s.missionStep
  }));
  console.log('ERRORS', JSON.stringify(errors));
});
