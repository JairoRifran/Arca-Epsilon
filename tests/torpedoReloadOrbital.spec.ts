import { expect, test, type Page } from '@playwright/test';

/**
 * Torpedo reload in the exact M20 jammer encounter.
 *
 * The common weapon tests fire all eight rounds across two complete cycles.
 * This probe isolates the reported M20 state: it keeps `disableJammer` active,
 * repeats two empty-to-full ladders through the real G handler and confirms a
 * real R launch remains available afterwards.
 */
test.setTimeout(1_800_000);

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

type Weapons = {
  torpedoTubeStates: boolean[];
  torpedoLoadedCount: number;
  torpedoReserveCurrent: number;
  torpedoReloading: boolean;
  torpedoReloadProgress: number;
  torpedoReloadTargetCount: number;
  torpedoesCreated: number;
  torpedoTotal: number;
  primaryMagazineCurrent: number;
  primaryReserveCurrent: number;
  primaryReloading: boolean;
  reloadRequestCount: number;
  hudTorpedo: string;
  hudPrimary: string;
  reloadMessage: string;
  playerMode: string;
};

type Mission20State = { mission20Step?: string; jammerLocated?: boolean; jammerDisabled?: boolean };
const w = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as unknown as Promise<Weapons>;

async function reachJammerEncounter(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.evaluate((seq) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of seq) debug?.[name]?.();
  }, TO_M18);
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__arcaDebug?.startMission20());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await expect
    .poll(async () => {
      await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
      const state = await page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as {
        orbitalEnvironmentActive?: boolean;
      };
      return state?.orbitalEnvironmentActive === true;
    }, { message: 'orbital hand-off', timeout: 240_000, intervals: [1500] })
    .toBe(true);

  await page.evaluate(() => {
    window.__arcaDebug?.rendezvousWithArk();
    window.__arcaDebug?.restoreArkLink(2);
    window.__arcaDebug?.clearArkFirstWave();
    window.__arcaDebug?.locateArkJammer();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getMission20State()) as Mission20State)?.mission20Step,
    { message: 'exact M20 disableJammer step', timeout: 120_000, intervals: [500] }
  ).toBe('disableJammer');
}

async function reloadTubesAndReadLadder(page: Page): Promise<number[]> {
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.press('KeyG');
  expect(await page.evaluate(() => window.__arcaDebug?.togglePause())).toBe(true);
  const start = await w(page);
  const ladder: number[] = [start.torpedoLoadedCount];
  for (let i = 0; i < 10; i += 1) {
    const state = await page.evaluate(() => window.__arcaDebug?.advanceWeaponReload(0.35)) as {
      loadedCount: number; reloading: boolean;
    };
    if (ladder[ladder.length - 1] !== state.loadedCount) ladder.push(state.loadedCount);
    if (!state.reloading && state.loadedCount === 4) break;
  }
  expect(await page.evaluate(() => window.__arcaDebug?.togglePause())).toBe(false);
  return ladder;
}

test('M20 disableJammer: two empty-to-full cycles reload sequentially without reserve', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await reachJammerEncounter(page);

  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    torpedoTubes: [false, false, false, false], torpedoReserve: 0
  }));
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());

  const emptyFirst = await w(page);
  expect(emptyFirst.torpedoLoadedCount).toBe(0);
  expect(emptyFirst.torpedoReserveCurrent).toBe(0);
  expect(emptyFirst.hudTorpedo).toContain('G');
  expect(emptyFirst.hudTorpedo).not.toContain('AGOTADOS');

  const firstLadder = await reloadTubesAndReadLadder(page);
  expect(firstLadder).toEqual([0, 1, 2, 3, 4]);
  const firstReload = await w(page);
  expect(firstReload.torpedoTubeStates).toEqual([true, true, true, true]);
  expect(firstReload.torpedoReserveCurrent).toBe(0);
  expect(firstReload.torpedoTotal).toBe(4);

  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    torpedoTubes: [false, false, false, false], torpedoReserve: 0
  }));
  const emptySecond = await w(page);
  expect(emptySecond.torpedoLoadedCount).toBe(0);

  const secondLadder = await reloadTubesAndReadLadder(page);
  expect(secondLadder).toEqual([0, 1, 2, 3, 4]);
  const secondReload = await w(page);
  expect(secondReload.torpedoTubeStates).toEqual([true, true, true, true]);
  expect(secondReload.torpedoReserveCurrent).toBe(0);
  expect(secondReload.torpedoTotal).toBe(4);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.keyboard.press('KeyR');
  await expect.poll(
    async () => (await w(page)).torpedoLoadedCount,
    { timeout: 30_000, intervals: [250], message: 'R launches again after repeated reloads' }
  ).toBe(3);
  expect((await w(page)).torpedoesCreated).toBe(1);

  const mission = await page.evaluate(() => window.__arcaDebug?.getMission20State()) as Mission20State;
  expect(mission.mission20Step).toBe('disableJammer');
  expect(mission.jammerLocated).toBe(true);
  expect(mission.jammerDisabled).not.toBe(true);
  expect(errors).toEqual([]);
});

test('M20 disableJammer: legacy reserve-zero save reloads and partial reload fills only empty tubes', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await reachJammerEncounter(page);

  await page.evaluate(() => {
    window.__arcaDebug?.setWeaponAmmo({
      primaryMagazine: 4,
      primaryReserve: 100,
      torpedoTubes: [false, false, false, false],
      torpedoReserve: 0
    });
    window.__arcaDebug?.saveGame();
    window.__arcaDebug?.setWeaponAmmo({ torpedoTubes: [true, true, true, true], torpedoReserve: 8 });
    window.__arcaDebug?.loadGame();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForTimeout(500);

  const restored = await w(page);
  expect(restored.torpedoTubeStates).toEqual([false, false, false, false]);
  expect(restored.torpedoReserveCurrent).toBe(0);
  expect(restored.hudTorpedo).toContain('G');
  expect(restored.hudTorpedo).not.toContain('AGOTADOS');

  const restoredLadder = await reloadTubesAndReadLadder(page);
  expect(restoredLadder).toEqual([0, 1, 2, 3, 4]);
  const both = await w(page);
  expect(both.primaryMagazineCurrent).toBe(32);
  expect(both.primaryReserveCurrent).toBe(72);
  expect(both.torpedoReserveCurrent).toBe(0);

  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    torpedoTubes: [true, false, true, false], torpedoReserve: 3
  }));
  const partialLadder = await reloadTubesAndReadLadder(page);
  expect(partialLadder).toEqual([2, 3, 4]);
  const partial = await w(page);
  expect(partial.torpedoTubeStates).toEqual([true, true, true, true]);
  expect(partial.torpedoReserveCurrent).toBe(0);

  const mission = await page.evaluate(() => window.__arcaDebug?.getMission20State()) as Mission20State;
  expect(mission.mission20Step).toBe('disableJammer');
  expect(errors).toEqual([]);
});
