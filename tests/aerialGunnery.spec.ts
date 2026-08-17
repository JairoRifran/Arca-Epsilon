import { expect, test, type Page } from '@playwright/test';

/**
 * Aerial gunnery against a live M19 air wave.
 *
 * Measured before the assist existed: 60 trigger events, 2 shots created, and
 * all four drones still on full health — at ~600 m the 16 m hit tolerance is
 * under 1.5 degrees of pointing error, so a locked contact was information the
 * player could not act on. This asserts the lock is now worth making.
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

type Combat = {
  weaponImpacts: number;
  weaponDestructions: number;
  aimAssistEngaged: boolean;
  lockedContactId: string | null;
  primaryShotsCreated: number;
};

const combat = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as unknown as Promise<Combat>;
const health = (page: Page) =>
  page.evaluate(() =>
    ((window.__arcaDebug?.getHostileContactState() as Record<string, unknown>).contacts as { health: number }[])
      .map((c) => c.health));

test('a locked air contact can actually be shot down', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.evaluate((seq) => {
    const d = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const n of seq) d?.[n]?.();
  }, TO_M18);
  await page.evaluate(() => {
    window.__arcaDebug?.startMission19();
    window.__arcaDebug?.confirmNereidaEmergency();
  });
  const g = await page.evaluate(
    ({ ax, az }) => window.__arcaDebug?.getSurfaceGroundHeight?.(ax, az) ?? 0, { ax: APRON_X, az: APRON_Z });
  await page.evaluate(({ ax, ay, az }) => window.__arcaDebug?.setPlayerPosition(ax, ay, az),
    { ax: APRON_X, ay: g + 60, az: APRON_Z });
  await expect
    .poll(async () => (await page.evaluate(() => window.__arcaDebug?.getHostileContactState()) as Record<string, number>).activeEnemyCount,
      { message: 'need a live air wave', timeout: 150_000, intervals: [1500] })
    .toBeGreaterThan(0);
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());

  // Lock the nearest contact ahead, then point the nose at it so the shot is
  // inside the assist cone — the assist narrows the requirement, it does not
  // remove the need to aim.
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(600);
  const aimed = await page.evaluate(() => {
    const c = window.__arcaDebug?.getHostileContactState() as Record<string, unknown>;
    const sel = (c.contacts as { selected: boolean; world: number[] }[]).find((x) => x.selected);
    if (!sel) return null;
    const p = window.__arcaDebug?.getShipNavigationState() as Record<string, number[]>;
    const dx = sel.world[0] - p.position[0];
    const dz = sel.world[2] - p.position[2];
    // Hull forward is -Z, so this is the yaw that points the nose at the lock.
    window.__arcaDebug?.setShipYaw?.(Math.atan2(-dx, -dz));
    return { world: sel.world };
  });
  console.log('LOCKED', JSON.stringify(aimed));

  const before = await health(page);
  console.log('HEALTH BEFORE', JSON.stringify(before));

  // Re-aim as we shoot. The drones are flying, so aiming once and firing for
  // several seconds tests a stale bearing, not the assist.
  const reaim = () => page.evaluate(() => {
    const c = window.__arcaDebug?.getHostileContactState() as Record<string, unknown>;
    const sel = (c.contacts as { selected: boolean; world: number[] }[]).find((x) => x.selected);
    if (!sel) return;
    const p = window.__arcaDebug?.getShipNavigationState() as Record<string, number[]>;
    window.__arcaDebug?.setShipYaw?.(
      Math.atan2(-(sel.world[0] - p.position[0]), -(sel.world[2] - p.position[2]))
    );
  });

  for (let i = 0; i < 80; i += 1) {
    if (i % 5 === 0) await reaim();
    await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
    if (i % 10 === 0) await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1_500);

  const after = await health(page);
  const c = await combat(page);
  console.log('HEALTH AFTER', JSON.stringify(after));
  console.log('COMBAT', JSON.stringify(c));

  expect(c.primaryShotsCreated, 'shots were actually created').toBeGreaterThan(0);
  const damaged = before.some((h, i) => (after[i] ?? h) < h) || after.length < before.length;
  expect(damaged || c.weaponImpacts > 0, 'a locked contact takes damage').toBe(true);

  expect(errors).toEqual([]);
});
