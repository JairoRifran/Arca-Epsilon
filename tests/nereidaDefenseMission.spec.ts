import { expect, test, type Page } from '@playwright/test';

/**
 * Mission 19 arrival at Base Nereida.
 *
 * The existing M19 probe advances this step with the `landAtNereida` debug
 * hook, which sets the state directly and therefore never exercises the real
 * arrival condition in `updateMission19Systems`. This probe deliberately does
 * NOT use that hook: it flies the ship to the apron and asserts the mission
 * advances on its own, which is what a player actually does.
 */
test.setTimeout(600_000);

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

/** Atlas resonator (620,-500) + nearAtlas(-58,44) — the apron anchor. */
const APRON_X = 562;
const APRON_Z = -456;

const m19 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission19State());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

async function run(page: Page, names: string[]): Promise<void> {
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of sequence) {
      try { debug?.[name]?.(); } catch { /* a step that no longer applies is not fatal */ }
    }
  }, names);
}

/** Everything the arrival gate depends on, read straight from the engine. */
const arrivalReadout = (page: Page, x: number, z: number) =>
  page.evaluate(({ ax, az }) => {
    const debug = window.__arcaDebug;
    const diag = window.__arcaDiagnostics;
    const ship = diag?.shipPosition ?? [0, 0, 0];
    const groundAtApron = debug?.getSurfaceGroundHeight?.(ax, az) ?? 0;
    const groundUnderShip = debug?.getSurfaceGroundHeight?.(ship[0], ship[2]) ?? 0;
    return {
      step: debug?.getMission19State?.().mission19Step,
      objective: diag?.objectiveText ?? '',
      shipPos: ship,
      apron: [ax, groundAtApron, az] as [number, number, number],
      horizontal: Math.hypot(ship[0] - ax, ship[2] - az),
      vertical: Math.abs(ship[1] - groundAtApron),
      altitudeAboveTerrain: ship[1] - groundUnderShip,
      insideShip: diag?.insideShip ?? false,
      onFoot: diag?.onFootActive ?? false,
      surfaceActive: diag?.surfaceModeActive ?? false,
      activeThreats: diag?.activeThreats ?? 0
    };
  }, { ax: x, az: z });

test('mission 19: arriving at the Nereida apron starts the defence', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

  await run(page, TO_M18);
  await page.evaluate(() => window.__arcaDebug?.startMission19());
  await page.evaluate(() => window.__arcaDebug?.confirmNereidaEmergency());

  // --- The air corridor, flown rather than forced --------------------------
  // `advanceTravel` only counts seconds spent airborne, so put the ship high
  // over the apron and let the real timer run. This is the segment a player
  // actually flies, and the one where "no enemies appear" was reported.
  const apronGround = await page.evaluate(
    ({ ax, az }) => window.__arcaDebug?.getSurfaceGroundHeight?.(ax, az) ?? 0,
    { ax: APRON_X, az: APRON_Z }
  );
  await page.evaluate(
    ({ ax, ay, az }) => window.__arcaDebug?.setPlayerPosition(ax, ay, az),
    { ax: APRON_X, ay: apronGround + 60, az: APRON_Z }
  );
  await expect
    .poll(async () => (await m19(page))?.mission19Step, {
      message: 'flying airborne must complete the transit to Nereida',
      timeout: 90_000,
      intervals: [1500]
    })
    .toBe('clearAirspace');



  // The air wave must actually spawn: this is the reported symptom.
  await expect
    .poll(async () => (await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout()?.airDronesActive ?? 0)), {
      message: 'the air wave must spawn on entering the corridor',
      timeout: 60_000,
      intervals: [1500]
    })
    .toBe(4);

  // The contact tracker must receive that same wave. Without this, the
  // visibility spec could regress to spawning nothing and still pass here.
  const tracked = await page.evaluate(() => window.__arcaDebug?.getHostileContactState()) as Record<string, number>;
  expect(tracked.activeEnemyCount, 'the tracker sees the live wave').toBe(4);
  expect(tracked.trackedContactCount, 'the tracker holds one contact per enemy').toBe(4);
  expect(tracked.renderedEnemyCount, 'the wave reaches the marker layer').toBeGreaterThan(0);
  const intruders = await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout()?.intrudersActive ?? -1);
  expect(intruders, 'the INTRUSOS counter matches the live entities').toBe(4);

  // It must STAY spawned. The wave used to be launched and wiped on
  // alternating frames by a finished mission's cleanup, so a single sample
  // could catch it alive; sampling across several seconds is what proves the
  // fleet actually belongs to M19 now.
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(1_200);
    const live = await page.evaluate(() => ({
      active: window.__arcaDebug?.getNereidaDefenseReadout()?.airDronesActive ?? 0,
      objects: (() => {
        const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
        let n = 0;
        scene.traverse((o) => { if (/^Dron Explorador Coalición/.test(o.name || '')) n += 1; });
        return n;
      })()
    }));
    expect(live.active, `the wave must survive frame batch ${i}`).toBe(4);
    // The pool is fixed-size: more objects than the pool would mean a duplicate
    // fleet was built.
    expect(live.objects, 'the drone pool must not be duplicated').toBeLessThanOrEqual(6);
  }

  await page.evaluate(() => window.__arcaDebug?.clearNereidaAirspace());

  let state = await m19(page);
  expect(state?.mission19Step, 'the mission must be waiting at the apron').toBe('landAtNereida');
  expect(state?.landedAtNereida).toBe(false);

  // --- Fly to the apron and land, exactly as a player would ----------------
  // No `landAtNereida` hook: the engine's own arrival condition must fire.
  const ground = await page.evaluate(
    ({ ax, az }) => window.__arcaDebug?.getSurfaceGroundHeight?.(ax, az) ?? 0,
    { ax: APRON_X, az: APRON_Z }
  );
  await page.evaluate(
    ({ ax, ay, az }) => window.__arcaDebug?.setPlayerPosition(ax, ay, az),
    { ax: APRON_X, ay: ground + 3, az: APRON_Z }
  );
  // Diagnostics publish on an interval and this environment runs at a few
  // frames a second, so give the snapshot time to catch up before reading it.
  await page.waitForTimeout(2_000);

  const before = await arrivalReadout(page, APRON_X, APRON_Z);
  console.log('NEREIDA ARRIVAL READOUT', JSON.stringify(before, null, 2));

  // The ship is parked on the apron: the gate must resolve within a couple of
  // seconds (the landing hold is 3 s of contact).
  await expect
    .poll(async () => (await m19(page))?.mission19Step, {
      message: `arriving at the apron must advance the mission (readout: ${JSON.stringify(before)})`,
      timeout: 45_000,
      intervals: [1500]
    })
    .toBe('restoreDefenses');

  state = await m19(page);
  expect(state?.landedAtNereida, 'landing is recorded').toBe(true);
  expect(state?.arrivedAtNereida, 'arrival is recorded').toBe(true);

  // --- The objective actually changed --------------------------------------
  const after = await arrivalReadout(page, APRON_X, APRON_Z);
  expect(after.objective, 'the HUD objective must move on').not.toBe(before.objective);

  // --- The defence begins: the ground incursion can be reached -------------
  await page.evaluate(() => {
    window.__arcaDebug?.restoreNereidaDefense(0);
    window.__arcaDebug?.restoreNereidaDefense(1);
    window.__arcaDebug?.restoreNereidaDefense(2);
  });
  state = await m19(page);
  expect(state?.defensesRestored?.filter(Boolean).length, 'all three defences restored').toBe(3);
  expect(state?.mission19Step, 'the ground incursion follows').toBe('repelGroundIncursion');

  // The first wave must actually be able to spawn. `activeThreats` is pinned
  // to 0 on the surface by design, so the mission's own intruder count is the
  // only honest signal here.
  await expect
    .poll(async () => (await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout()?.intrudersActive ?? 0)), {
      message: 'the first ground wave must spawn',
      timeout: 60_000,
      intervals: [1500]
    })
    .toBeGreaterThan(0);

  // --- Save/load does not re-block or duplicate ----------------------------
  const threatsBefore = await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout()?.intrudersActive ?? 0);
  await page.evaluate(() => {
    window.__arcaDebug?.saveGame();
    window.__arcaDebug?.loadGame();
  });
  await page.waitForTimeout(2_500);
  const restored = await m19(page);
  expect(restored?.mission19Step, 'the step survives a reload').toBe('repelGroundIncursion');
  expect(restored?.landedAtNereida, 'arrival is not undone').toBe(true);
  const threatsAfter = await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout()?.intrudersActive ?? 0);
  expect(threatsAfter, 'reloading must not duplicate the wave').toBeLessThanOrEqual(threatsBefore + 1);

  expect(consoleErrors).toEqual([]);
});
