import { expect, test } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

/**
 * Mission 19 "Nereida bajo Ataque" probe: sequential state machine, the air
 * wave reusing M18's drone fleet, the ground incursion walking real lanes, the
 * three Nereida defences, the Atlas gate, the operational priority, the
 * one-shot data leak, save/load across waves and the M20 hand-off.
 */
test.setTimeout(900000);

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

async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
}
function step(page: import('@playwright/test').Page, name: string, arg?: number | string) {
  return page.evaluate(({ n, a }) => {
    const d = window.__arcaDebug as unknown as Record<string, (x?: number | string) => unknown> | undefined;
    try { return d?.[n]?.(a); } catch { return undefined; }
  }, { n: name, a: arg });
}
const m19 = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission19State());

/** Count breach units in the scene, to catch duplication and lazy allocation. */
const breachCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let n = 0;
    const walk = (o: import('three').Object3D) => {
      if (/^Unidad de Brecha Coalición/.test(o.name || '')) n += 1;
      o.children.forEach(walk);
    };
    walk(scene);
    return n;
  });

test('mission 19 nereida under attack: sequence, waves, atlas, save/load, M20', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => { consoleErrors.push(`PAGEERROR: ${e.message}`); console.log('PAGEERROR:', e.message); });

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));

  // --- 1. M19 must not start before M18 --------------------------------------
  const before = await m19(page);
  expect(before?.mission19Started, 'M19 must not be started at game start').toBe(false);
  expect(before?.mission19Step).toBe('inactive');

  for (const s of TO_M18) await step(page, s);
  const m18done = await page.evaluate(() => window.__arcaDebug?.getMission18State());
  expect(m18done?.mission18Completed, 'M18 must complete before M19').toBe(true);
  expect(m18done?.mission19Unlocked, 'M18 must unlock M19').toBe(true);

  // Nothing of M19 is allocated before its ground wave: M01-M18 never pay.
  expect(await breachCount(page), 'no breach units allocated before M19').toBe(0);

  // --- 2/3. Emergency call, flight, airspace --------------------------------
  await step(page, 'startMission19');
  let s19 = await m19(page);
  expect(s19?.mission19Started).toBe(true);
  expect(s19?.mission19Step).toBe('emergencyTransmission');
  expect(s19?.mission20Unlocked, 'M20 must NOT be unlocked yet').toBe(false);

  await step(page, 'confirmNereidaEmergency');
  s19 = await m19(page);
  expect(s19?.emergencyCallConfirmed).toBe(true);
  expect(s19?.mission19Step, 'flight to Nereida begins').toBe('travelToNereida');

  await step(page, 'clearNereidaAirspace');
  s19 = await m19(page);
  expect(s19?.airspaceCleared, 'air corridor cleared').toBe(true);
  expect(s19?.intrudersDestroyed, 'air kills counted').toBeGreaterThan(0);
  expect(s19?.mission19Step).toBe('landAtNereida');

  await step(page, 'landAtNereida');
  s19 = await m19(page);
  expect(s19?.landedAtNereida).toBe(true);
  expect(s19?.arrivedAtNereida).toBe(true);
  expect(s19?.mission19Step).toBe('restoreDefenses');

  // --- 4. The three defences, restored in order ------------------------------
  await step(page, 'restoreNereidaDefense', 0);
  s19 = await m19(page);
  expect(s19?.defensesRestored?.filter(Boolean).length, 'one defence back').toBe(1);
  expect(s19?.mission19Step, 'still restoring').toBe('restoreDefenses');
  expect(s19?.groundIncursionRepelled, 'incursion cannot be skipped').toBe(false);

  await step(page, 'restoreNereidaDefense', 2);
  s19 = await m19(page);
  expect(s19?.defensesRestored?.filter(Boolean).length, 'all three defences back').toBe(3);
  expect(s19?.mission19Step, 'ground incursion begins').toBe('repelGroundIncursion');

  // --- Save/load at the incursion checkpoint --------------------------------
  // Reload at the step boundary, before the wave spawns: the design guarantees
  // a reload resumes the current wave from a STABLE state, and this is exactly
  // that state. The wave is then verified after the reload, below.
  const reloaded = await reloadAndAwaitRestore(page, m19, (s) => s?.mission19Started === true, 'M19');
  expect(reloaded?.mission19Step, 'step survives reload').toBe('repelGroundIncursion');
  expect(reloaded?.defensesRestored?.filter(Boolean).length, 'defences stay restored').toBe(3);
  expect(reloaded?.landedAtNereida, 'arrival stays').toBe(true);
  expect(reloaded?.airspaceCleared, 'cleared airspace stays cleared').toBe(true);
  expect(reloaded?.mission19Completed).toBe(false);
  expect(reloaded?.mission20Unlocked).toBe(false);

  // --- 6. The ground incursion actually walks toward Atlas ------------------
  await page.waitForTimeout(4000);
  const incursion = await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout());
  expect(incursion!.intrudersActive, 'breach units launched after reload').toBeGreaterThan(0);
  expect(incursion!.defensesActive, 'defences online during the push').toBe(3);
  const poolSize = await breachCount(page);
  expect(poolSize, 'breach pool built lazily, never duplicated').toBeGreaterThan(0);
  expect(poolSize, 'pool stays within its budget').toBeLessThanOrEqual(6);

  // Units are on Nereida's real terrain, near the Atlas side of the map.
  const seating = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const out: { name: string; x: number; y: number; z: number }[] = [];
    const walk = (o: import('three').Object3D) => {
      if (/^Unidad de Brecha Coalición/.test(o.name || '') && o.visible) {
        o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements;
        out.push({ name: o.name, x: e[12], y: e[13], z: e[14] });
      }
      o.children.forEach(walk);
    };
    walk(scene);
    return out;
  });
  expect(seating.length, 'live breach units in the world').toBeGreaterThan(0);
  for (const u of seating) {
    // Atlas sits at (620,-500); the lanes converge there.
    expect(Math.hypot(u.x - 620, u.z + 500), `${u.name} within the Nereida approach`).toBeLessThan(400);
  }

  // --- 7/8. Atlas gate, priority, counterattack ----------------------------
  await step(page, 'repelNereidaIncursion');
  s19 = await m19(page);
  expect(s19?.groundIncursionRepelled).toBe(true);
  expect(s19?.mission19Step, 'one unit reached the gate').toBe('protectAtlas');
  const underAttack = await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout());
  expect(underAttack!.atlasStability, 'Atlas is genuinely destabilised').toBeLessThan(100);

  await step(page, 'protectAtlasCore');
  s19 = await m19(page);
  expect(s19?.atlasProtected, 'gate sealed').toBe(true);
  expect(s19?.mission19Step).toBe('chooseOperationalPriority');
  expect(s19?.operationalPriority, 'no priority chosen yet').toBe('none');

  await step(page, 'setOperationalPriority', 'pleyadianRecords');
  s19 = await m19(page);
  expect(s19?.operationalPriority, 'priority recorded').toBe('pleyadianRecords');
  expect(s19?.mission19Step, 'priority does not fork the mission').toBe('activateCounterattack');

  await step(page, 'activateNereidaCounterattack');
  s19 = await m19(page);
  expect(s19?.counterattackActivated).toBe(true);
  expect(s19?.mission19Step).toBe('detectDataLeak');

  // --- 9. The leak happens exactly once ------------------------------------
  await step(page, 'confirmNereidaDataLeak');
  s19 = await m19(page);
  expect(s19?.dataLeakConfirmed, 'the Coalition got its fraction').toBe(true);
  expect(s19?.mission19Step).toBe('recoverEnemyWreckage');
  // Calling it again must not re-run or double-count the leak.
  await step(page, 'confirmNereidaDataLeak');
  const afterSecond = await m19(page);
  expect(afterSecond?.dataLeakConfirmed).toBe(true);
  expect(afterSecond?.mission19Step, 'leak is one-shot').toBe('recoverEnemyWreckage');

  // --- 10/11. Wreckage, link, and the Ark reveal ---------------------------
  await step(page, 'recoverNereidaWreckage');
  s19 = await m19(page);
  expect(s19?.nereidaWreckageRecovered).toBe(true);
  expect(s19?.auroraLinkRepaired, 'Nereida-Aurora link repaired').toBe(true);
  expect(s19?.mission19Step).toBe('confirmArkTarget');
  expect(s19?.mission19Completed, 'not complete until the Ark is confirmed').toBe(false);

  await step(page, 'completeMission19');
  s19 = await m19(page);
  expect(s19?.arkTargetConfirmed, 'the Ark is the next target').toBe(true);
  expect(s19?.mission19Completed).toBe(true);
  expect(s19?.mission19Step).toBe('completed');
  expect(s19?.mission20Unlocked, 'M19 unlocks M20').toBe(true);

  // Field cleared once the engagement ends.
  await page.waitForTimeout(600);
  const afterEnd = await page.evaluate(() => window.__arcaDebug?.getNereidaDefenseReadout());
  expect(afterEnd!.intrudersActive, 'no intruders left after the mission').toBe(0);

  // --- The on-foot character still carries no weapon -----------------------
  const footWeapons = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const hits: string[] = [];
    const walk = (o: import('three').Object3D) => {
      if (/SurfaceCharacter|Personaje/i.test(o.name || '')) {
        o.traverse((c) => { if (/rifle|gun|pistol|weapon|arma|fusil/i.test(c.name || '')) hits.push(c.name); });
        return;
      }
      o.children.forEach(walk);
    };
    walk(scene);
    return hits;
  });
  expect(footWeapons, 'the on-foot character must still carry no weapon').toEqual([]);

  // --- Earlier missions still intact ---------------------------------------
  const m18s = await page.evaluate(() => window.__arcaDebug?.getMission18State());
  expect(m18s?.mission18Completed, 'M18 still complete').toBe(true);
  const m17s = await page.evaluate(() => window.__arcaDebug?.getMission17State());
  expect(m17s?.mission17Completed, 'M17 still complete').toBe(true);
  const m16s = await page.evaluate(() => window.__arcaDebug?.getMission16State());
  expect(m16s?.mission16Completed, 'M16 still complete').toBe(true);
  const m15s = await page.evaluate(() => window.__arcaDebug?.getMission15State());
  expect(m15s?.mission15Completed, 'M15 still complete').toBe(true);

  const relevant = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  expect(relevant, `console errors: ${relevant.join(' | ')}`).toEqual([]);
});
