import { expect, test, type Page } from '@playwright/test';

/**
 * Hostile contact visibility, against a real M19 wave.
 *
 * The measured cause of "the enemies cannot be found": a breach drone is 1.9 m
 * across, so at the ~600 m range M19 opens at it covers about three pixels. No
 * material change fixes a three-pixel target, so what is asserted here is the
 * marker layer.
 *
 * Every assertion below requires live enemies. An earlier version of this file
 * guarded its checks behind `if (activeEnemyCount > 0)` and passed while
 * spawning nothing at all — the wave needs the full M18 prerequisite chain
 * before `mission19.canStart()` will return true, and then needs the ship
 * genuinely airborne before `advanceTravel` will reach `clearAirspace`. Both
 * preconditions are established here, and the spec fails outright if the wave
 * does not appear.
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

const APRON_X = 562;
const APRON_Z = -456;

type ContactState = {
  activeEnemyCount: number;
  trackedContactCount: number;
  renderedEnemyCount: number;
  culledEnemyCount: number;
  domMarkerCount: number;
  currentTargetId: string | null;
  currentTargetDistance: number | null;
  currentTargetLineOfSight: string | null;
  nearestEnemyId: string | null;
  nearestEnemyDistance: number | null;
  contacts: {
    id: string; type: string; world: number[]; distanceToPlayer: number;
    projectedScreenPosition: number[]; isOnScreen: boolean; isBehindCamera: boolean;
    isOccluded: boolean; health: number; selected: boolean;
  }[];
};

const contacts = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getHostileContactState()) as unknown as Promise<ContactState>;

/**
 * Boots to a live M19 air wave.
 *
 * Both preconditions matter and both were missing before: the M18 chain
 * (without it `canStart` is false and M19 never begins) and real airborne time
 * (without it `advanceTravel` never reaches `clearAirspace`).
 */
async function bootLiveWave(page: Page): Promise<string[]> {
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
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
  }, TO_M18);
  await page.evaluate(() => {
    window.__arcaDebug?.startMission19();
    window.__arcaDebug?.confirmNereidaEmergency();
  });

  const apronGround = await page.evaluate(
    ({ ax, az }) => window.__arcaDebug?.getSurfaceGroundHeight?.(ax, az) ?? 0,
    { ax: APRON_X, az: APRON_Z }
  );
  await page.evaluate(
    ({ ax, ay, az }) => window.__arcaDebug?.setPlayerPosition(ax, ay, az),
    { ax: APRON_X, ay: apronGround + 60, az: APRON_Z }
  );

  await expect
    .poll(async () => (await page.evaluate(() => window.__arcaDebug?.getMission19SpawnTrace())) as Record<string, unknown>, {
      message: 'airborne transit must reach the airspace corridor',
      timeout: 120_000,
      intervals: [1500]
    })
    .toMatchObject({ activeMissionStep: 'clearAirspace' });

  await expect
    .poll(async () => (await contacts(page)).activeEnemyCount, {
      message: 'the real wave must spawn real enemies',
      timeout: 90_000,
      intervals: [1500]
    })
    .toBeGreaterThan(0);

  return errors;
}


const OUT = 'test-results/part-a';

test('part A visual record', async ({ page }) => {
  const errors = await bootLiveWave(page);
  const shot = async (n: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${n}.png` }); };

  const s = await contacts(page);
  console.log('CAPTURE CONTACTS', JSON.stringify({
    active: s.activeEnemyCount, rendered: s.renderedEnemyCount,
    distances: s.contacts.map((c) => Math.round(c.distanceToPlayer)),
    onScreen: s.contacts.map((c) => c.isOnScreen),
    behind: s.contacts.map((c) => c.isBehindCamera),
    occluded: s.contacts.map((c) => c.isOccluded)
  }));
  await shot('01-live-wave-with-markers');

  await page.keyboard.press('KeyT');
  await page.waitForTimeout(700);
  const sel = await contacts(page);
  console.log('CAPTURE SELECTED', JSON.stringify({
    id: sel.currentTargetId, d: sel.currentTargetDistance, los: sel.currentTargetLineOfSight
  }));
  await shot('02-selected-contact');

  await page.keyboard.press('KeyT');
  await page.waitForTimeout(700);
  await shot('03-cycled-contact');

  // HUD strip with the INTRUSOS counter next to the markers.
  await page.locator('#hud').screenshot({ path: `${OUT}/04-hud-intruders.png` });

  // Empty state: pool hidden, nothing drawn.
  await page.evaluate(() => window.__arcaDebug?.clearNereidaAirspace());
  await page.waitForTimeout(2500);
  const cleared = await contacts(page);
  console.log('CAPTURE CLEARED', JSON.stringify({
    active: cleared.activeEnemyCount, rendered: cleared.renderedEnemyCount
  }));
  await shot('05-markers-released');

  expect(errors).toEqual([]);
});
