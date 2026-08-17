import { expect, test, type Page } from '@playwright/test';

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
  'startMission13', 'secureStormGenerator', 'anchorStormAntenna', 'activateStormAntenna',
  'chargeStormShield', 'completeMission13', 'startMission14', 'completeTraceInspections',
  'completeReverseTriangulation', 'completeMission14', 'completeMission15', 'completeMission16',
  'completeMission17', 'completeMission18'
];

type Probe = {
  step: string;
  jammerLocated: boolean;
  actualDistance: number;
  markerOffset: number;
  objectiveDistance: number;
  jammerSignal: number;
  commsQuality: number;
  shipY: number;
};

async function reachLocateJammer(page: Page): Promise<void> {
  await page.evaluate((sequence) => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    const debug = window.__arcaDebug as unknown as Record<string, (arg?: unknown) => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
    debug?.startMission20?.();
    debug?.setPlayerMode?.('ship');
    debug?.clearDialogueQueue?.();
  }, TO_M18);

  await expect.poll(async () => {
    await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
    return page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()?.orbitalEnvironmentActive === true);
  }, { timeout: 240_000, intervals: [1500], message: 'M20 must be running in the orbital environment' }).toBe(true);

  await page.evaluate(() => {
    window.__arcaDebug?.rendezvousWithArk();
    window.__arcaDebug?.restoreArkLink(2);
    window.__arcaDebug?.clearArkFirstWave();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForFunction(() => {
    const state = window.__arcaDebug?.getMission20State();
    const jammer = window.__arcaScene?.children.find((object) => object.name.startsWith('Interferidor de la'));
    return state?.mission20Step === 'locateJammer' && jammer?.visible === true;
  }, undefined, { timeout: 60_000 });
}

async function moveToJammerRange(page: Page, range: number): Promise<void> {
  await page.evaluate((desiredRange) => {
    const jammer = window.__arcaScene?.children.find((object) => object.name.startsWith('Interferidor de la'));
    if (!jammer) throw new Error('M20 jammer object not found');
    jammer.updateWorldMatrix(true, false);
    window.__arcaDebug?.setShipWorldPosition([
      jammer.matrixWorld.elements[12] + desiredRange,
      jammer.matrixWorld.elements[13],
      jammer.matrixWorld.elements[14]
    ]);
  }, range);
  await page.waitForTimeout(350);
}

async function readProbe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const jammer = window.__arcaScene?.children.find((object) => object.name.startsWith('Interferidor de la'));
    const ship = window.__arcaScene?.getObjectByName('Player Scout Ship');
    const station = window.__arcaDebug?.getArkStationState();
    const mission = window.__arcaDebug?.getMission20State();
    const readout = window.__arcaDebug?.getArkBattleReadout();
    const objective = window.__arcaDebug?.getCurrentObjectiveDisplay();
    if (!jammer || !ship || !station || !mission || !readout || !objective) {
      throw new Error('M20 locate-jammer probe state unavailable');
    }
    jammer.updateWorldMatrix(true, false);
    ship.updateWorldMatrix(true, false);
    const jammerPosition = [
      jammer.matrixWorld.elements[12],
      jammer.matrixWorld.elements[13],
      jammer.matrixWorld.elements[14]
    ];
    const shipPosition = [
      ship.matrixWorld.elements[12],
      ship.matrixWorld.elements[13],
      ship.matrixWorld.elements[14]
    ];
    return {
      step: mission.mission20Step,
      jammerLocated: mission.jammerLocated,
      actualDistance: Math.hypot(
        shipPosition[0] - jammerPosition[0],
        shipPosition[1] - jammerPosition[1],
        shipPosition[2] - jammerPosition[2]
      ),
      markerOffset: Math.hypot(
        station.stationPosition[0] - jammerPosition[0],
        station.stationPosition[1] - jammerPosition[1],
        station.stationPosition[2] - jammerPosition[2]
      ),
      objectiveDistance: objective.distance,
      jammerSignal: readout.jammerSignal,
      commsQuality: readout.commsQuality,
      shipY: shipPosition[1]
    };
  }) as Promise<Probe>;
}

test('M20 locates the real jammer at its authored passive-detection range', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await reachLocateJammer(page);

  const signalSamples: number[] = [];
  for (const range of [1_000, 700, 420]) {
    await moveToJammerRange(page, range);
    const outside = await readProbe(page);
    expect(outside.actualDistance).toBeGreaterThan(320);
    expect(outside.step).toBe('locateJammer');
    expect(outside.jammerLocated).toBe(false);
    expect(outside.markerOffset, 'the INTERFERIDOR marker follows the physical jammer').toBeLessThan(2);
    expect(Math.abs(outside.objectiveDistance - outside.actualDistance)).toBeLessThan(3);
    signalSamples.push(outside.jammerSignal);
  }
  expect(signalSamples[1]).toBeGreaterThan(signalSamples[0]);
  expect(signalSamples[2]).toBeGreaterThan(signalSamples[1]);

  await expect(page.locator('#scanner-status')).toHaveText('Telemetría pasiva');
  await expect(page.locator('#signal-strength')).toHaveText('18%');
  await expect(page.locator('#mission-progress-label')).toContainText('alcance 320 m');
  const objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
  expect(objective?.target).toContain('INTERFERIDOR');
  expect(objective?.key).toBe('WASD');

  // The entry beat opens a gameplay-pausing comms card. Close it before
  // measuring flight input so this assertion probes the router, not dialogue.
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(100);
  const beforeE = await readProbe(page);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(150);
  const afterE = await readProbe(page);
  expect(afterE.shipY, 'E remains real upward thrust without a contextual interaction').toBeGreaterThan(beforeE.shipY + 0.1);
  expect(afterE.step, 'E is not the jammer scanner').toBe('locateJammer');
  await expect(page.locator('#mission-text')).not.toContainText('Acceso de superficie no disponible');

  await moveToJammerRange(page, 280);
  await expect.poll(async () => (await readProbe(page)).step, {
    timeout: 30_000,
    intervals: [250],
    message: 'entering the real 320 m lock range must complete passive detection'
  }).toBe('disableJammer');

  const complete = await readProbe(page);
  expect(complete.jammerLocated).toBe(true);
  expect(complete.actualDistance).toBeLessThanOrEqual(320);
  expect(errors).toEqual([]);
});
