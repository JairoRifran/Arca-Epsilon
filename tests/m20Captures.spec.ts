import { expect, test } from '@playwright/test';

/** Three frames of the M20 ascent. */
test.setTimeout(900_000);
const OUT = 'test-results/m20';

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

test('m20 ascent captures', async ({ page }) => {
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

  const shot = async (n: string) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${n}.png` });
    const s = await page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as Record<string, unknown>;
    console.log(`CAP ${n}`, JSON.stringify({ step: s.missionStep, y: s.shipY, ceiling: s.surfaceCeiling }));
  };

  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(120));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await shot('01-ascending-over-nereida');

  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(860));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await shot('02-just-below-threshold');

  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as Record<string, number>).shipY,
      { timeout: 240_000, intervals: [1500] })
    .toBeGreaterThan(900);
  await page.keyboard.up('Space');
  await shot('03-past-threshold');

  console.log('ERRORS', JSON.stringify(errors));
  expect(errors).toEqual([]);
});
