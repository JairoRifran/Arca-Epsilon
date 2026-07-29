import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

test.setTimeout(1200000);

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

const m23 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission23State());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
}

async function run(page: Page, names: string[]): Promise<void> {
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
  }, names);
}

async function reloadM23(page: Page, step: string) {
  return reloadAndAwaitRestore(
    page,
    m23,
    (state) => Boolean(state?.mission23Started && state.mission23Step === step),
    `Mission 23 checkpoint ${step}`
  );
}

test('mission 23 counteroffensive: ordered nodes, stable checkpoints, escape and M24 hook', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());

  expect(await page.evaluate(() => window.__arcaDebug?.startMission23())).toBe(false);
  expect((await m23(page))?.mission23Step).toBe('inactive');
  let visual = await page.evaluate(() => window.__arcaDebug?.getMission23VisualState());
  expect(visual?.platformBuilt).toBe(false);
  expect(visual?.beaconBuilt).toBe(false);
  expect(visual?.platformSceneInstances).toBe(1);
  expect(visual?.beaconSceneInstances).toBe(1);

  await run(page, TO_M19);
  await run(page, ['completeMission20', 'completeMission21', 'startMission22', 'completeMission22']);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission22State()))?.mission22Completed).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.startMission23())).toBe(true);
  expect((await m23(page))?.mission23Step).toBe('counteroffensiveCouncil');

  await page.evaluate(() => window.__arcaDebug?.completeMission23Council());
  let state = await page.evaluate(() => window.__arcaDebug?.synchronizeMission23Forces());
  expect(state?.jointForcesSynchronized).toBe(true);
  expect(state?.mission23Step).toBe('chooseTargetOrder');
  state = await page.evaluate(() => window.__arcaDebug?.chooseMission23TargetOrder('jammer'));
  expect(state?.mission23TargetOrder).toEqual(['jammer', 'logistics', 'jumpBeacon']);
  expect(state?.mission23Step).toBe('approachJammerNode');

  await page.evaluate(() => window.__arcaDebug?.recordMission23JammerReading(0));
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  state = await reloadM23(page, 'approachJammerNode');
  expect(state?.jammerTriangulationReadings).toEqual([true, false, false]);
  visual = await page.evaluate(() => window.__arcaDebug?.getMission23VisualState());
  expect(visual?.lockDegraded).toBe(true);
  expect(visual?.jammerActive).toBe(true);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.evaluate(() => window.__arcaDebug?.simulateAction('map'));
  await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
  const jammerMap = await page.locator('#starmap-poi-list').innerText();
  expect(jammerMap).toContain('INTERFERIDOR ORBITAL');
  expect(jammerMap).toContain('PLATAFORMA LOG');
  expect(jammerMap).toContain('BALIZA DE SALTO');
  await page.evaluate(() => window.__arcaDebug?.simulateAction('map'));

  expect(await page.evaluate(() => window.__arcaDebug?.recordAllMission23JammerReadings())).toBe(3);
  state = await page.evaluate(() => window.__arcaDebug?.destroyMission23Jammer());
  expect(state?.jammerNodeDestroyed).toBe(true);
  expect(state?.mission23Step).toBe('approachLogisticsPlatform');
  visual = await page.evaluate(() => window.__arcaDebug?.getMission23VisualState());
  expect(visual?.lockDegraded).toBe(false);

  state = await page.evaluate(() => window.__arcaDebug?.reachMission23Platform());
  expect(state?.mission23Step).toBe('disablePlatformDefenses');
  visual = await page.evaluate(() => window.__arcaDebug?.getMission23VisualState());
  expect(visual?.platformBuilt).toBe(true);
  expect(visual?.platformVisible).toBe(true);
  expect(visual?.platformSceneInstances).toBe(1);
  expect(visual?.platformActiveModules).toBe(1);

  await page.evaluate(() => window.__arcaDebug?.disableMission23PlatformDefense());
  await page.evaluate(() => window.__arcaDebug?.disableMission23PlatformEnergy());
  state = await page.evaluate(() => window.__arcaDebug?.chooseMission23PlatformMethod('overload'));
  expect(state?.platformDefensesDisabled).toBe(true);
  expect(state?.platformEnergyDisabled).toBe(true);
  expect(state?.mission23PlatformMethod).toBe('overload');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  state = await reloadM23(page, 'destroyLogisticsCore');
  expect(state?.mission23PlatformMethod).toBe('overload');
  expect(state?.jammerNodeDestroyed).toBe(true);

  state = await page.evaluate(() => window.__arcaDebug?.destroyMission23Platform('overload'));
  expect(state?.logisticsPlatformDestroyed).toBe(true);
  expect(state?.mission23Step).toBe('approachJumpBeacon');
  state = await page.evaluate(() => window.__arcaDebug?.reachMission23JumpBeacon());
  expect(state?.mission23Step).toBe('disableBeaconAnchors');
  visual = await page.evaluate(() => window.__arcaDebug?.getMission23VisualState());
  expect(visual?.beaconBuilt).toBe(true);
  expect(visual?.beaconVisible).toBe(true);
  expect(visual?.beaconSceneInstances).toBe(1);
  expect(visual?.anchorTargetCount).toBe(3);
  expect(visual?.visibleAnchorCount).toBe(3);

  expect(await page.evaluate(() => window.__arcaDebug?.disableMission23BeaconAnchor(1))).toBe(2);
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  state = await reloadM23(page, 'disableBeaconAnchors');
  expect(state?.jumpBeaconAnchorsDisabled).toEqual([true, true, false]);
  visual = await page.evaluate(() => window.__arcaDebug?.getMission23VisualState());
  expect(visual?.anchorTargetCount).toBe(3);
  expect(visual?.visibleAnchorCount).toBe(1);

  expect(await page.evaluate(() => window.__arcaDebug?.disableAllMission23BeaconAnchors())).toBe(3);
  state = await page.evaluate(() => window.__arcaDebug?.collapseMission23JumpBeacon());
  expect(state?.jumpBeaconDestroyed).toBe(true);
  expect(state?.mission23Step).toBe('escapeDistortion');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  expect((await m23(page))?.mission23Step).toBe('escapeDistortion');
  state = await reloadM23(page, 'escapeDistortion');
  expect(state?.jumpBeaconDestroyed).toBe(true);
  expect(state?.escapeCompleted).toBe(false);

  state = await page.evaluate(() => window.__arcaDebug?.completeMission23Escape());
  expect(state?.escapeCompleted).toBe(true);
  expect(state?.mission23Step).toBe('recoverEnemyRoute');
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  state = await reloadM23(page, 'recoverEnemyRoute');
  expect(state?.escapeCompleted).toBe(true);
  expect(state?.jumpBeaconDestroyed).toBe(true);

  state = await page.evaluate(() => window.__arcaDebug?.recoverMission23EnemyRoute());
  expect(state?.enemyRouteRecovered).toBe(true);
  expect(state?.mission23Step).toBe('confirmReturnToArk');
  state = await page.evaluate(() => window.__arcaDebug?.completeMission23());
  expect(state?.mission23Completed).toBe(true);
  expect(state?.mission23Step).toBe('completed');
  expect(state?.mission24Unlocked).toBe(true);
  expect(state?.returnToArkConfirmed).toBe(true);

  const previous = await page.evaluate(() => ({
    m20: window.__arcaDebug?.getMission20State().mission20Completed,
    m21: window.__arcaDebug?.getMission21State().mission21Completed,
    m22: window.__arcaDebug?.getMission22State().mission22Completed,
    threeFront: window.__arcaDebug?.getThreeFrontVisualState(),
    visual: window.__arcaDebug?.getMission23VisualState(),
    save: window.__arcaDebug?.saveGame(),
    audio: window.__arcaDebug?.getAudioState()
  }));
  expect(previous.m20).toBe(true);
  expect(previous.m21).toBe(true);
  expect(previous.m22).toBe(true);
  expect(previous.threeFront?.sceneInstances).toBe(1);
  expect(previous.visual?.platformSceneInstances).toBe(1);
  expect(previous.visual?.beaconSceneInstances).toBe(1);
  expect(previous.visual?.anchorTargetCount).toBe(3);
  expect(previous.visual?.activeHostiles).toBe(0);
  expect(previous.save?.mission24Unlocked).toBe(true);
  expect(previous.save?.mission23TargetOrder).toEqual(['jammer', 'logistics', 'jumpBeacon']);
  expect(previous.audio?.missingMusicAssets).not.toContain('music-counteroffensive');

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
