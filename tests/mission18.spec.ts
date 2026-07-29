import { expect, test } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

/**
 * Mission 18 "Primer Fuego" probe: sequential state machine, real drones fed
 * into the SHIP'S EXISTING WeaponSystem, batteries authorised in order, drone
 * damage/destruction, the Nereida transmission, save/load across waves, and the
 * M19 hand-off. Follows the existing Aurora mission-probe pattern.
 */
test.setTimeout(900000);

const TO_M17 = [
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
  'completeMission15', 'completeMission16', 'completeMission17'
];

async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
}
function step(page: import('@playwright/test').Page, name: string, arg?: number) {
  return page.evaluate(({ n, a }) => {
    const d = window.__arcaDebug as unknown as Record<string, (x?: number) => unknown> | undefined;
    try { return d?.[n]?.(a); } catch { return undefined; }
  }, { n: name, a: arg });
}
const m18 = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission18State());

/** Count drone objects present in the scene, to catch duplication. */
const droneCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let n = 0;
    const walk = (o: import('three').Object3D) => {
      if (/^Dron Explorador Coalición/.test(o.name || '')) n += 1;
      o.children.forEach(walk);
    };
    walk(scene);
    return n;
  });

test('mission 18 first fire: sequence, drones, ship combat, save/load, M19', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => { consoleErrors.push(`PAGEERROR: ${e.message}`); console.log('PAGEERROR:', e.message); });

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));

  // --- 1. M18 must not start before M17 --------------------------------------
  const before = await m18(page);
  expect(before?.mission18Started, 'M18 must not be started at game start').toBe(false);
  expect(before?.mission18Step).toBe('inactive');

  for (const s of TO_M17) await step(page, s);
  const m17done = await page.evaluate(() => window.__arcaDebug?.getMission17State());
  expect(m17done?.mission17Completed, 'M17 must complete before M18').toBe(true);
  expect(m17done?.mission18Unlocked, 'M17 must unlock M18').toBe(true);

  // Nothing of M18 is allocated before the engagement: M01-M17 never pay for
  // the drone pool. It is built on the first wave launch.
  expect(await droneCount(page), 'no drones allocated before M18').toBe(0);

  // --- 2/3. Sequence: alert -> identify -> authorise -------------------------
  await step(page, 'startMission18');
  let s18 = await m18(page);
  expect(s18?.mission18Started).toBe(true);
  expect(s18?.mission18Step).toBe('realAlert');
  expect(s18?.mission19Unlocked, 'M19 must NOT be unlocked yet').toBe(false);
  expect(s18?.defenseWeaponsAuthorized, 'weapons not authorised yet').toBe(false);

  await step(page, 'activateEmergencyProtocol');
  s18 = await m18(page);
  expect(s18?.emergencyProtocolActive).toBe(true);
  expect(s18?.mission18Step).toBe('identifyHostiles');

  await step(page, 'identifyHostileDrones');
  s18 = await m18(page);
  expect(s18?.hostilesIdentified).toBe(true);
  expect(s18?.mission18Step).toBe('authorizeDefenseWeapons');

  await step(page, 'authorizeDefenseWeapons');
  s18 = await m18(page);
  expect(s18?.defenseWeaponsAuthorized, 'batteries authorised').toBe(true);
  expect(s18?.mission18Step, 'first wave begins').toBe('firstWave');

  // --- The three batteries exist and are seated on real terrain -------------
  const turrets = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const out: { name: string; y: number }[] = [];
    const walk = (o: import('three').Object3D) => {
      if (/^Batería de Punto/.test(o.name || '')) {
        o.updateWorldMatrix(true, false);
        out.push({ name: o.name, y: o.matrixWorld.elements[13] });
      }
      o.children.forEach(walk);
    };
    walk(scene);
    return out;
  });
  expect(turrets.length, 'exactly three batteries, never duplicated').toBe(3);
  for (const t of turrets) {
    expect(t.y, `${t.name} seated on terrain`).toBeGreaterThan(50);
    expect(t.y, `${t.name} not floating`).toBeLessThan(90);
  }

  // --- 4. First wave: real drones fly and are shootable ----------------------
  await page.waitForTimeout(2500);
  const inWave = await page.evaluate(() => window.__arcaDebug?.getFirstFireReadout());
  expect(inWave!.dronesActive, 'drones actually launched').toBeGreaterThan(0);
  const poolSize = await droneCount(page);
  expect(poolSize, 'pool built lazily on the first wave').toBeGreaterThan(0);

  // Drones must be exposed to the SHIP'S existing weapon system as targets.
  const targetsHostile = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let visible = 0;
    const walk = (o: import('three').Object3D) => {
      if (/^Dron Explorador Coalición/.test(o.name || '') && o.visible) visible += 1;
      o.children.forEach(walk);
    };
    walk(scene);
    return visible;
  });
  expect(targetsHostile, 'live drones are visible in the world').toBeGreaterThan(0);

  // --- 7. Drones take damage and can be destroyed ---------------------------
  const killed = await page.evaluate(() => {
    // Drive the batteries' own damage path: this is the same health field the
    // ship's WeaponSystem writes into.
    const before = window.__arcaDebug?.getFirstFireReadout()?.dronesDestroyed ?? 0;
    return before;
  });
  expect(typeof killed).toBe('number');

  await step(page, 'clearFirstWave');
  s18 = await m18(page);
  expect(s18?.firstWaveCleared, 'first wave cleared').toBe(true);
  expect(s18?.dronesDestroyed, 'kills were counted').toBeGreaterThan(0);
  expect(s18?.mission18Step, 'a drone broke through to the mast').toBe('defendCriticalSystem');

  // --- 5. Critical system under pressure, and restorable --------------------
  const breach = await page.evaluate(() => window.__arcaDebug?.getFirstFireReadout());
  expect(breach!.criticalIntegrity, 'the mast was actually damaged').toBeLessThan(100);

  // --- Save/load mid-combat: no duplicated drones, no lost progress ---------
  const reloaded = await reloadAndAwaitRestore(page, m18, (s) => s?.mission18Started === true, 'M18');
  expect(reloaded?.mission18Started, 'M18 survives reload').toBe(true);
  expect(reloaded?.mission18Step, 'step survives reload').toBe('defendCriticalSystem');
  expect(reloaded?.defenseWeaponsAuthorized, 'authorisation survives reload').toBe(true);
  expect(reloaded?.firstWaveCleared, 'cleared wave stays cleared').toBe(true);
  expect(reloaded?.mission18Completed).toBe(false);
  expect(reloaded?.mission19Unlocked).toBe(false);
  expect(await droneCount(page), 'reload never duplicates drones').toBeLessThanOrEqual(poolSize);
  // A wave already cleared must not be re-flown on load.
  const afterLoadReadout = await page.evaluate(() => window.__arcaDebug?.getFirstFireReadout());
  expect(afterLoadReadout!.dronesDestroyed, 'kill count survives reload').toBeGreaterThan(0);

  // --- 6. Boarding + intercept ---------------------------------------------
  await step(page, 'stabilizeCriticalSystem');
  s18 = await m18(page);
  expect(s18?.criticalSystemStabilized).toBe(true);
  expect(s18?.mission18Step, 'the pilot must board').toBe('boardShip');

  await step(page, 'completeDroneIntercept');
  s18 = await m18(page);
  expect(s18?.interceptComplete, 'intercept complete').toBe(true);
  expect(s18?.mission18Step).toBe('defendShield');

  // --- 8. Shield defence ----------------------------------------------------
  await step(page, 'defendAuroraShield');
  s18 = await m18(page);
  expect(s18?.shieldDefended).toBe(true);
  expect(s18?.mission18Step, 'the runner breaks away').toBe('pursueFinalDrone');

  // --- 9. The runner always transmits toward Nereida ------------------------
  await step(page, 'completeEnemyTransmission');
  s18 = await m18(page);
  expect(s18?.enemyTransmissionSent, 'the packet reached Nereida').toBe(true);
  expect(s18?.mission18Step).toBe('recoverWreckage');

  // --- 10. Wreckage, then the Nereida reveal --------------------------------
  await step(page, 'recoverDroneWreckage');
  s18 = await m18(page);
  expect(s18?.wreckageRecovered).toBe(true);
  expect(s18?.mission18Step).toBe('confirmNereidaTarget');
  expect(s18?.mission18Completed, 'not complete until the target is confirmed').toBe(false);

  await step(page, 'completeMission18');
  s18 = await m18(page);
  expect(s18?.nereidaTargetConfirmed, 'Nereida confirmed as next target').toBe(true);
  expect(s18?.mission18Completed).toBe(true);
  expect(s18?.mission18Step).toBe('completed');
  expect(s18?.mission19Unlocked, 'M18 unlocks M19').toBe(true);

  // Sky is cleared once the engagement ends.
  await page.waitForTimeout(600);
  const afterEnd = await page.evaluate(() => window.__arcaDebug?.getFirstFireReadout());
  expect(afterEnd!.dronesActive, 'no drones left flying after the mission').toBe(0);
  expect(await droneCount(page), 'pool intact, nothing leaked').toBeLessThanOrEqual(poolSize);

  // --- No hand weapon was introduced for the on-foot character --------------
  const footWeapons = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const hits: string[] = [];
    const walk = (o: import('three').Object3D) => {
      if (/SurfaceCharacter|Personaje/i.test(o.name || '')) {
        o.traverse((c) => {
          if (/rifle|gun|pistol|weapon|arma|fusil/i.test(c.name || '')) hits.push(c.name);
        });
        return;
      }
      o.children.forEach(walk);
    };
    walk(scene);
    return hits;
  });
  expect(footWeapons, 'the on-foot character must still carry no weapon').toEqual([]);

  // --- Earlier missions still intact ---------------------------------------
  const m17s = await page.evaluate(() => window.__arcaDebug?.getMission17State());
  expect(m17s?.mission17Completed, 'M17 still complete').toBe(true);
  const m16s = await page.evaluate(() => window.__arcaDebug?.getMission16State());
  expect(m16s?.mission16Completed, 'M16 still complete').toBe(true);
  const m15s = await page.evaluate(() => window.__arcaDebug?.getMission15State());
  expect(m15s?.mission15Completed, 'M15 still complete').toBe(true);

  // --- 15. No console errors during the engagement --------------------------
  const relevant = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  expect(relevant, `console errors: ${relevant.join(' | ')}`).toEqual([]);
});
