import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

test.setTimeout(900000);

const TO_M19 = [
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
  'completeMission15', 'completeMission16', 'completeMission17', 'completeMission18', 'completeMission19'
];

type AscentSample = {
  step: string;
  position: [number, number, number];
  density: number;
  wind: number;
  cloudOpacity: number;
  starOpacity: number;
  curvature: number;
};

const STEP_ORDER = [
  'inactive', 'decodeReturnRoute', 'prepareLaunch', 'boardShip', 'ignitionSequence',
  'lowAtmosphereAscent', 'cloudLayerCrossing', 'midAtmosphereAscent', 'upperAtmosphereAscent',
  'vacuumTransition', 'orbitalInsertion', 'stabilizeOrbit', 'approachArk', 'arriveAtOrigin',
  'assessArkDamage', 'restoreEnclaveLinks', 'prepareArkSystems', 'integratePleyadianNetwork',
  'prepareCivilianShelters', 'assembleAlliedForces', 'revisitStartingSector', 'runDefenseRehearsal',
  'detectFinalFleet', 'enterFinalFormation', 'completed'
] as const;

const m24 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission24State());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible())) await launch.click();
  await page.waitForFunction(() => window.__arcaDebug !== undefined, undefined, { timeout: 180000 });
}

async function reloadM24(page: Page, step: string) {
  return reloadAndAwaitRestore(
    page,
    m24,
    (state) => Boolean(state?.mission24Started && state.mission24Step === step),
    `Mission 24 checkpoint ${step}`
  );
}

async function run(page: Page, names: string[]): Promise<void> {
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
  }, names);
}

async function driveAscentTo(page: Page, targetStep: string, samples: AscentSample[]): Promise<void> {
  const targetIndex = STEP_ORDER.indexOf(targetStep as typeof STEP_ORDER[number]);
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyW');
  try {
    await expect.poll(async () => {
      const sample = await page.evaluate(() => {
        const debug = window.__arcaDebug;
        if (!debug) return undefined;
        const state = debug.getMission24State();
        const ascent = debug.getMission24AscentState();
        const performance = debug.getPerformanceSnapshot();
        return {
          step: state.mission24Step,
          position: performance.shipPosition,
          density: ascent.density,
          wind: ascent.wind,
          cloudOpacity: ascent.cloudOpacity,
          starOpacity: ascent.starOpacity,
          curvature: ascent.curvature
        } satisfies AscentSample;
      });
      if (sample) samples.push(sample);
      return sample ? STEP_ORDER.indexOf(sample.step as typeof STEP_ORDER[number]) : -1;
    }, { timeout: 45000, intervals: [160], message: `M24 did not reach ${targetStep}` }).toBeGreaterThanOrEqual(targetIndex);
  } finally {
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyW');
  }
}

async function approachArkWithFlight(page: Page): Promise<{ initial: number; closest: number; maxDisplacement: number }> {
  const initial = await page.evaluate(() => window.__arcaDebug?.orientMission24ShipToTarget() ?? 0);
  let previous = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot().shipPosition ?? [0, 0, 0]);
  let closest = initial;
  let maxDisplacement = 0;
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  try {
    await expect.poll(async () => {
      const snapshot = await page.evaluate(() => ({
        step: window.__arcaDebug?.getMission24State().mission24Step,
        target: window.__arcaDebug?.getMission24Target(),
        position: window.__arcaDebug?.getPerformanceSnapshot().shipPosition
      }));
      if (snapshot.position) {
        const dx = snapshot.position[0] - previous[0];
        const dy = snapshot.position[1] - previous[1];
        const dz = snapshot.position[2] - previous[2];
        maxDisplacement = Math.max(maxDisplacement, Math.hypot(dx, dy, dz));
        previous = snapshot.position;
      }
      closest = Math.min(closest, snapshot.target?.distance ?? closest);
      return snapshot.step === 'arriveAtOrigin';
    }, { timeout: 30000, intervals: [120], message: 'The ship never physically reached the Ark approach radius' }).toBe(true);

    await page.evaluate(() => window.__arcaDebug?.orientMission24ShipToTarget());
    await expect.poll(async () => {
      const target = await page.evaluate(() => window.__arcaDebug?.getMission24Target());
      closest = Math.min(closest, target?.distance ?? closest);
      return target?.distance ?? Number.POSITIVE_INFINITY;
    }, { timeout: 15000, intervals: [80], message: 'The ship never entered the Ark interaction radius' }).toBeLessThan(68);
  } finally {
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
  }
  return { initial, closest, maxDisplacement };
}

test('mission 24 orbital stabilization and Ark approach remain physically playable', async ({ page }) => {
  await page.goto('/?test=1');
  await ready(page);
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.startMission24();
    window.__arcaDebug?.restoreMission24Checkpoint('orbitalInsertion');
    window.__arcaDebug?.clearDialogueQueue();
  });

  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 20000 }).toBe('stabilizeOrbit');
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 15000 }).toBe('approachArk');

  const before = await page.evaluate(() => ({
    position: window.__arcaDebug?.getPerformanceSnapshot().shipPosition,
    distance: window.__arcaDebug?.orientMission24ShipToTarget() ?? 0
  }));
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getMission24State().mission24Step)),
    { timeout: 30000, intervals: [120] }
  ).toBe('arriveAtOrigin');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => ({
    position: window.__arcaDebug?.getPerformanceSnapshot().shipPosition,
    distance: window.__arcaDebug?.getMission24Target().distance
  }));
  expect(before.distance).toBeGreaterThan(180);
  expect(after.distance).toBeLessThan(before.distance);
  expect(after.position).not.toEqual(before.position);

  await page.evaluate(() => {
    const debug = window.__arcaDebug;
    debug?.teleportToMission24Target();
    debug?.advanceMission24Interaction();
    debug?.assessAllMission24ArkSystems();
    debug?.restoreAllMission24EnclaveLinks();
    debug?.prepareAllMission24ArkSystems();
    debug?.integrateAllMission24PleyadianNodes();
    debug?.prepareMission24CivilianShelters();
    debug?.assembleMission24AlliedForces();
    debug?.revisitAllMission24StartingSectorPoints();
    debug?.completeMission24DefenseRehearsal();
    debug?.detectMission24FinalFleet();
  });
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getAudioState().requestedMusicTrack)),
    { timeout: 10000 }
  ).toBe('music-final-orbit-intro');
  expect((await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot()))?.activeThreats).toBe(0);
  await page.evaluate(() => window.__arcaDebug?.completeMission24());
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot().currentMissionId)),
    { timeout: 10000 }
  ).toBe('mission-24-return-to-origin');
});

test('mission 24 return to origin: continuous ascent, Ark preparation and M25 hook', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.evaluate(() => window.__arcaDebug?.clearSave());

  const locked = await page.evaluate(() => ({
    mission23Completed: window.__arcaDebug?.getMission23State().mission23Completed,
    state: window.__arcaDebug?.getMission24State(),
    visual: window.__arcaDebug?.getMission24VisualState()
  }));
  expect(locked.mission23Completed).toBe(false);
  expect(locked.state?.mission24Started).toBe(false);
  expect(locked.state?.mission24Step).toBe('inactive');
  expect(locked.visual?.atmosphereBuilt).toBe(false);
  expect(locked.visual?.networkBuilt).toBe(false);
  expect(locked.visual?.mothershipSceneInstances).toBe(1);

  await run(page, TO_M19);
  await run(page, ['completeMission20', 'completeMission21', 'startMission22', 'completeMission22', 'startMission23', 'completeMission23']);
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 30000 }).toBe('decodeReturnRoute');
  expect((await page.evaluate(() => window.__arcaDebug?.getMission23State()))?.mission23Completed).toBe(true);
  const surfaceStart = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());
  expect(surfaceStart?.currentPhase).toMatch(/surface|colonization/);
  expect(surfaceStart?.playerMode).toMatch(/SHIP_SURFACE|COCKPIT/);
  expect(surfaceStart?.shipTerrainClearance).toBeGreaterThan(2);

  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.teleportToMission24Target();
  });
  await page.waitForTimeout(1200);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 10000 }).toBe('prepareLaunch');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  let restored = await reloadM24(page, 'prepareLaunch');
  expect(restored?.returnRouteDecoded).toBe(true);
  expect(restored?.launchPrepared).toBe(false);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.press('KeyF');
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getCharacterControlState().playerMode)) === 'ON_FOOT',
    { timeout: 15000 }
  ).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot().liftProgress)).toBeGreaterThan(0.95);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await m24(page))?.mission24Step).toBe('boardShip');
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.press('KeyF');
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 15000 }).toBe('ignitionSequence');
  expect(await page.evaluate(() => window.__arcaDebug?.getCharacterControlState().playerMode)).toMatch(/SHIP_SURFACE|COCKPIT/);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 12000 }).toBe('lowAtmosphereAscent');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  restored = await reloadM24(page, 'lowAtmosphereAscent');
  expect(restored?.ignitionComplete).toBe(true);
  expect(restored?.takeoffComplete).toBe(false);

  const samples: AscentSample[] = [];
  await driveAscentTo(page, 'cloudLayerCrossing', samples);
  let ascent = await page.evaluate(() => window.__arcaDebug?.getMission24AscentState());
  let visual = await page.evaluate(() => window.__arcaDebug?.getMission24VisualState());
  expect(ascent?.worldClearance).toBeGreaterThanOrEqual(34);
  expect(ascent?.cloudOpacity).toBeGreaterThan(0.18);
  expect(visual?.cloudLayerVisible).toBe(true);
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  restored = await reloadM24(page, 'cloudLayerCrossing');
  expect(restored?.lowAtmosphereComplete).toBe(true);

  await driveAscentTo(page, 'upperAtmosphereAscent', samples);
  ascent = await page.evaluate(() => window.__arcaDebug?.getMission24AscentState());
  visual = await page.evaluate(() => window.__arcaDebug?.getMission24VisualState());
  expect(ascent?.density).toBeLessThan(0.08);
  expect(ascent?.starOpacity).toBeGreaterThan(0.28);
  expect(ascent?.curvature).toBeGreaterThan(0.2);
  expect(visual?.starOpacity).toBeGreaterThan(0.25);
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  restored = await reloadM24(page, 'upperAtmosphereAscent');
  expect(restored?.midAtmosphereComplete).toBe(true);

  await driveAscentTo(page, 'orbitalInsertion', samples);
  const insertion = await page.evaluate(() => ({
    state: window.__arcaDebug?.getMission24State(),
    ascent: window.__arcaDebug?.getMission24AscentState(),
    visual: window.__arcaDebug?.getMission24VisualState(),
    audio: window.__arcaDebug?.getAudioState()
  }));
  expect(insertion.state?.vacuumTransitionComplete).toBe(true);
  expect(insertion.ascent?.density).toBeLessThan(0.01);
  expect(insertion.ascent?.wind).toBeLessThan(0.02);
  expect(insertion.visual?.planetLimbVisible).toBe(true);
  expect(insertion.audio?.requestedMusicTrack).toBe('music-return-to-origin');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  restored = await reloadM24(page, 'orbitalInsertion');
  expect(restored?.orbitalInsertionComplete).toBe(false);

  expect(samples.some((sample) => sample.step === 'cloudLayerCrossing')).toBe(true);
  expect(samples.some((sample) => sample.step === 'midAtmosphereAscent')).toBe(true);
  expect(samples.some((sample) => sample.step === 'upperAtmosphereAscent')).toBe(true);
  expect(samples[samples.length - 1].position[1]).toBeGreaterThan(samples[0].position[1] + 90);
  expect(Math.min(...samples.map((sample) => sample.density))).toBeLessThan(samples[0].density);
  expect(Math.max(...samples.map((sample) => sample.cloudOpacity))).toBeGreaterThan(0.45);
  expect(Math.max(...samples.map((sample) => sample.starOpacity))).toBeGreaterThan(0.75);
  let maxSampleDisplacement = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].position;
    const current = samples[index].position;
    maxSampleDisplacement = Math.max(
      maxSampleDisplacement,
      Math.hypot(current[0] - previous[0], current[1] - previous[1], current[2] - previous[2])
    );
  }
  expect(maxSampleDisplacement).toBeLessThan(25);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission24PerformanceState()))?.maxFrameDisplacement).toBeLessThan(4.2);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 20000 }).toBe('stabilizeOrbit');
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await m24(page))?.mission24Step, { timeout: 15000 }).toBe('approachArk');

  const mothershipBeforeApproach = await page.evaluate(() => window.__arcaDebug?.getMothershipIdentity());
  const approach = await approachArkWithFlight(page);
  expect(approach.initial).toBeGreaterThan(180);
  expect(approach.closest).toBeLessThan(68);
  expect(approach.maxDisplacement).toBeLessThan(30);
  const mothershipAfterApproach = await page.evaluate(() => window.__arcaDebug?.getMothershipIdentity());
  expect(mothershipAfterApproach?.uuid).toBe(mothershipBeforeApproach?.uuid);
  expect(mothershipAfterApproach?.scale).toEqual(mothershipBeforeApproach?.scale);
  expect(mothershipAfterApproach?.sceneInstances).toBe(1);
  expect(mothershipAfterApproach?.position[0]).toBeCloseTo(mothershipBeforeApproach?.position[0] ?? 0, 6);
  expect(mothershipAfterApproach?.position[2]).toBeCloseTo(mothershipBeforeApproach?.position[2] ?? 0, 6);
  expect(Math.abs((mothershipAfterApproach?.position[1] ?? 0) - (mothershipBeforeApproach?.position[1] ?? 0))).toBeLessThan(3.3);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await m24(page))?.mission24Step).toBe('assessArkDamage');
  expect((await page.evaluate(() => window.__arcaDebug?.getMission24VisualState()))?.networkBuilt).toBe(true);

  let state = await page.evaluate(() => window.__arcaDebug?.assessAllMission24ArkSystems());
  expect(state?.arkDamageAssessments).toEqual([true, true, true, true, true]);
  state = await page.evaluate(() => window.__arcaDebug?.restoreAllMission24EnclaveLinks());
  expect(state?.enclaveLinksRestored).toEqual([true, true, true, true]);
  expect(state?.mission24Step).toBe('prepareArkSystems');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  restored = await reloadM24(page, 'prepareArkSystems');
  expect(restored?.arkDamageAssessments).toEqual([true, true, true, true, true]);
  expect(restored?.enclaveLinksRestored).toEqual([true, true, true, true]);

  const returnScore = await page.evaluate(() => window.__arcaDebug?.getAudioState());
  expect(returnScore?.requestedMusicTrack).toBe('music-return-to-origin');
  state = await page.evaluate(() => window.__arcaDebug?.prepareAllMission24ArkSystems());
  expect(state?.arkSystemsPrepared).toEqual([true, true, true]);
  state = await page.evaluate(() => window.__arcaDebug?.integrateAllMission24PleyadianNodes());
  expect(state?.pleyadianNodesIntegrated).toEqual([true, true, true]);
  visual = await page.evaluate(() => window.__arcaDebug?.getMission24VisualState());
  expect(visual?.pleyadianNodeCount).toBe(3);
  await page.evaluate(() => window.__arcaDebug?.prepareMission24CivilianShelters());
  await page.evaluate(() => window.__arcaDebug?.assembleMission24AlliedForces());
  await page.evaluate(() => window.__arcaDebug?.revisitAllMission24StartingSectorPoints());
  state = await page.evaluate(() => window.__arcaDebug?.completeMission24DefenseRehearsal());
  expect(state?.defenseRehearsalComplete).toBe(true);
  visual = await page.evaluate(() => window.__arcaDebug?.getMission24VisualState());
  expect(visual?.rehearsalTargetCount).toBe(3);
  expect(visual?.finalFleetVisible).toBe(false);
  expect(visual?.finalFleetAttackable).toBe(false);
  expect((await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot()))?.activeThreats).toBe(0);

  state = await page.evaluate(() => window.__arcaDebug?.detectMission24FinalFleet());
  expect(state?.finalFleetDetected).toBe(true);
  expect(state?.mission24Step).toBe('enterFinalFormation');
  visual = await page.evaluate(() => window.__arcaDebug?.getMission24VisualState());
  expect(visual?.finalFleetVisible).toBe(true);
  expect(visual?.finalFleetAttackable).toBe(false);
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getAudioState().requestedMusicTrack)),
    { timeout: 10000 }
  ).toBe('music-final-orbit-intro');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  restored = await reloadM24(page, 'enterFinalFormation');
  expect(restored?.finalFleetDetected).toBe(true);
  expect(restored?.mission24Completed).toBe(false);

  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.teleportToMission24Target();
    window.__arcaDebug?.advanceMission24Interaction();
  });
  state = await m24(page);
  expect(state?.mission24Completed).toBe(true);
  expect(state?.mission25Unlocked).toBe(true);
  expect(state?.mission24Step).toBe('completed');
  expect(await page.locator('#mission-text').innerText()).toBe('Volvimos al lugar donde empezó todo. Esta vez, el Arca no está sola.');
  const finalSave = await page.evaluate(() => window.__arcaDebug?.saveGame());
  expect(finalSave?.mission24Completed).toBe(true);
  expect(finalSave?.mission25Unlocked).toBe(true);
  expect(finalSave?.currentMissionId).toBe('mission-24-return-to-origin');
  expect(finalSave?.playedDialogueIds).toContain('m24_final_line');
  expect((await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot()))?.currentMissionId).toBe('mission-24-return-to-origin');
  expect((await page.evaluate(() => window.__arcaDebug?.getMission24PerformanceState()))?.activeTimers).toBe(0);

  const pixels = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 0;
    const data = new Uint8Array(8 * 8 * 4);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let nonBlank = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] || data[index + 1] || data[index + 2] || data[index + 3]) nonBlank += 1;
    }
    return nonBlank;
  });
  expect(pixels).toBeGreaterThan(0);

  const relevant = errors.filter((error) => !/favicon|Failed to load resource/i.test(error));
  expect(relevant, `console/page errors: ${relevant.join(' | ')}`).toEqual([]);
});
