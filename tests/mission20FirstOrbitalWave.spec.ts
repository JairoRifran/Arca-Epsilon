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

type Mission20State = {
  mission20Step: string;
  arkFirstWaveCleared: boolean;
  hostilesDestroyed: number;
};

type ContactState = {
  activeEnemyCount: number;
  contacts: Array<{ world: number[]; health: number }>;
};

const mission = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission20State()) as unknown as Promise<Mission20State>;

const contacts = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getHostileContactState()) as unknown as Promise<ContactState>;

async function reachFirstOrbitalWave(page: Page): Promise<void> {
  await page.evaluate((sequence) => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    const debug = window.__arcaDebug as unknown as Record<string, (arg?: unknown) => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
    window.__arcaDebug?.startMission20();
    window.__arcaDebug?.setPlayerMode('ship');
    window.__arcaDebug?.clearDialogueQueue();
  }, TO_M18);

  await expect.poll(async () => {
    await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
    return page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()?.orbitalEnvironmentActive === true);
  }, { timeout: 240_000, intervals: [1500], message: 'M20 must hand over to the orbital environment' }).toBe(true);

  await page.evaluate(() => {
    window.__arcaDebug?.rendezvousWithArk();
    window.__arcaDebug?.restoreArkLink(2);
    window.__arcaDebug?.clearDialogueQueue();
  });

  await expect.poll(async () => (await contacts(page)).activeEnemyCount, {
    timeout: 90_000,
    intervals: [1000],
    message: 'the real first orbital wave must spawn'
  }).toBe(5);
}

async function destroyOneThroughFleetDamage(page: Page, expectedRemaining: number): Promise<void> {
  await expect.poll(async () => {
    const current = await contacts(page);
    if (current.activeEnemyCount <= expectedRemaining) return current.activeEnemyCount;
    await page.evaluate(() => {
      const debug = window.__arcaDebug as unknown as {
        clearDialogueQueue?: () => void;
        damageNearestScoutDrone?: (amount?: number) => boolean;
      } | undefined;
      debug?.clearDialogueQueue?.();
      debug?.damageNearestScoutDrone?.(96);
    });
    return (await contacts(page)).activeEnemyCount;
  }, {
    timeout: 60_000,
    intervals: [500],
    message: `a real fleet damage/death cycle must leave ${expectedRemaining} M20 hostiles`
  }).toBe(expectedRemaining);
}

test('M20 first orbital wave advances only after its last real hostile dies', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await reachFirstOrbitalWave(page);

  expect((await mission(page)).mission20Step).toBe('firstOrbitalWave');
  const weaponTargets = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as { getActiveWeaponTargetIds?: () => string[] } | undefined;
    return debug?.getActiveWeaponTargetIds?.() ?? [];
  });
  expect(weaponTargets.filter((id) => id.startsWith('coalition-scout-')), 'M20 drones belong to the real WeaponSystem target list')
    .toHaveLength(5);

  for (let remaining = 4; remaining >= 1; remaining -= 1) {
    await destroyOneThroughFleetDamage(page, remaining);
  }

  const oneAlive = await mission(page);
  expect((await contacts(page)).activeEnemyCount, 'one member of this wave is still alive').toBe(1);
  expect(oneAlive.hostilesDestroyed, 'four real deaths reached M20').toBe(4);
  expect(oneAlive.mission20Step, 'the wave cannot clear early').toBe('firstOrbitalWave');
  expect(oneAlive.arkFirstWaveCleared).toBe(false);

  await destroyOneThroughFleetDamage(page, 0);
  await expect.poll(async () => (await mission(page)).mission20Step, {
    timeout: 60_000,
    intervals: [500],
    message: 'the fifth real death must leave firstOrbitalWave'
  }).toBe('locateJammer');

  const cleared = await mission(page);
  expect(cleared.hostilesDestroyed).toBe(5);
  expect(cleared.arkFirstWaveCleared).toBe(true);
  expect((await contacts(page)).activeEnemyCount).toBe(0);
  await expect.poll(async () => (await page.evaluate(() => window.__arcaDebug?.getArkBattleReadout()))?.jammed, {
    timeout: 30_000,
    intervals: [500],
    message: 'the next real step must deploy the jammer state'
  }).toBe(true);
  expect(errors).toEqual([]);
});
