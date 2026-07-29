import { expect, test } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

/**
 * Mission 17 "Preparativos de Defensa" probe: sequential state machine, defence
 * hardware seated on the shared valley floor, save/load mid-deployment, the
 * no-weapons guarantee and the M18 hand-off. Follows the existing Aurora
 * mission-probe pattern (debug fast-forwards + state reads).
 */
test.setTimeout(600000);

const TO_M16 = [
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
  'completeMission15'
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
const m17 = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission17State());

/**
 * Names in the scene that look like weapons/enemies. The player ship carries
 * its own integrated cannons from M01, so the guarantee M17 has to meet is that
 * this set does not GROW — not that it is empty.
 */
const combatNames = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const hits: string[] = [];
    const walk = (o: import('three').Object3D) => {
      if (/weapon|turret|cannon|enemy|hostile|proyectil|projectile|arma|torreta/i.test(o.name || '')) {
        hits.push(o.name);
      }
      o.children.forEach(walk);
    };
    walk(scene);
    return hits.sort();
  });

test('mission 17 defense preparations: sequence, defences, save/load, M18', async ({ page }) => {
  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));

  // --- M17 must not start before M16 is complete -----------------------------
  const beforeM16 = await m17(page);
  expect(beforeM16?.mission17Started, 'M17 must not be started at game start').toBe(false);
  expect(beforeM16?.mission17Step).toBe('inactive');

  for (const s of TO_M16) await step(page, s);
  // Drive M16 to completion so M17 legitimately unlocks.
  await step(page, 'completeMission16');
  const m16done = await page.evaluate(() => window.__arcaDebug?.getMission16State());
  expect(m16done?.mission16Completed, 'M16 must complete before M17').toBe(true);
  expect(m16done?.mission17Unlocked, 'M16 must unlock M17').toBe(true);

  // Baseline of weapon-ish objects BEFORE M17 exists (the player ship's own
  // integrated cannons). M17 must not add to this set.
  const combatBefore = await combatNames(page);

  // --- Sequential state machine ---------------------------------------------
  await step(page, 'startMission17');
  let s17 = await m17(page);
  expect(s17?.mission17Started).toBe(true);
  expect(s17?.mission17Step, 'first step is the emergency council').toBe('emergencyCouncil');
  expect(s17?.mission18Unlocked, 'M18 must NOT be unlocked yet').toBe(false);

  await step(page, 'reviewDefenseCouncil');
  s17 = await m17(page);
  expect(s17?.councilReviewed).toBe(true);
  expect(s17?.mission17Step).toBe('installEnergyReserve');

  await step(page, 'activateEnergyReserve');
  s17 = await m17(page);
  expect(s17?.energyReserveOnline, 'energy reserve online').toBe(true);
  expect(s17?.energyCircuitsBalanced, 'all three circuits balanced').toBe(3);
  expect(s17?.mission17Step).toBe('deploySensors');

  // Sensors deploy one at a time, in order.
  await step(page, 'deployDefenseSensor', 0);
  s17 = await m17(page);
  expect(s17?.sensorsDeployed?.filter(Boolean).length, 'one sensor deployed').toBe(1);
  expect(s17?.mission17Step, 'still deploying sensors').toBe('deploySensors');
  expect(s17?.sensorsCalibrated, 'cannot calibrate before all sensors are up').toBe(false);

  await step(page, 'deployDefenseSensor', 2);
  s17 = await m17(page);
  expect(s17?.sensorsDeployed?.filter(Boolean).length, 'all three sensors deployed').toBe(3);
  expect(s17?.mission17Step).toBe('calibrateDetection');

  await step(page, 'calibrateDefenseDetection');
  s17 = await m17(page);
  expect(s17?.sensorsCalibrated).toBe(true);
  expect(s17?.mission17Step).toBe('installShieldEmitters');

  // --- Defences are seated on the real valley floor --------------------------
  const seating = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const out: { name: string; bottom: number; visible: boolean }[] = [];
    const box = { min: { y: Infinity }, max: { y: -Infinity } };
    const walk = (o: import('three').Object3D) => {
      if (/Sensor Hostil|Emisor de Escudo|Reserva Energ/.test(o.name || '')) {
        let vis = true;
        let p: import('three').Object3D | null = o;
        while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
        // world Y of the group's own origin == the seated ground point
        o.updateWorldMatrix(true, false);
        out.push({ name: o.name, bottom: o.matrixWorld.elements[13], visible: vis });
      }
      o.children.forEach(walk);
    };
    walk(scene);
    void box;
    return out;
  });
  expect(seating.length, 'sensors + emitters + reserve exist exactly once each').toBe(7);
  // Every part must be seated on real terrain (Aurora valley floor is ~56-67 m),
  // never at the origin or under the water line.
  for (const part of seating) {
    expect(part.bottom, `${part.name} seated on terrain`).toBeGreaterThan(50);
    expect(part.bottom, `${part.name} not floating in the sky`).toBeLessThan(90);
  }

  await step(page, 'installShieldEmitter', 2);
  s17 = await m17(page);
  expect(s17?.shieldEmittersInstalled?.filter(Boolean).length, 'all emitters installed').toBe(3);
  expect(s17?.mission17Step).toBe('establishAlertNetwork');

  await step(page, 'establishAlertNetwork');
  s17 = await m17(page);
  expect(s17?.alertNetworkOnline, 'Aurora-Nereida-Arca network online').toBe(true);
  expect(s17?.alertChannelsVerified, 'three channels verified').toBe(3);
  expect(s17?.mission17Step).toBe('markEvacuationRoutes');

  await step(page, 'markEvacuationRoutes');
  s17 = await m17(page);
  expect(s17?.evacuationRoutesMarked).toBe(true);
  expect(s17?.evacMarkersSet, 'shelter + medical + extraction').toBe(3);
  expect(s17?.mission17Step).toBe('runDefenseDrill');

  // --- Save/load mid-mission: no duplicated defences, no lost progress -------
  await step(page, 'runDefenseDrill');
  s17 = await m17(page);
  expect(s17?.defenseDrillComplete).toBe(true);
  expect(s17?.mission17Step, 'drill leaves the network overloaded').toBe('stabilizeOverload');
  const beforeReload = s17;

  const afterReload = await reloadAndAwaitRestore(page, m17, (s) => s?.mission17Started === true, 'M17');
  expect(afterReload?.mission17Step, 'step survives reload').toBe(beforeReload?.mission17Step);
  expect(afterReload?.energyReserveOnline, 'reserve survives reload').toBe(true);
  expect(afterReload?.sensorsDeployed?.filter(Boolean).length, 'sensors survive reload').toBe(3);
  expect(afterReload?.sensorsCalibrated, 'calibration survives reload').toBe(true);
  expect(afterReload?.shieldEmittersInstalled?.filter(Boolean).length, 'emitters survive reload').toBe(3);
  expect(afterReload?.alertNetworkOnline, 'alert network survives reload').toBe(true);
  expect(afterReload?.evacuationRoutesMarked, 'evac routes survive reload').toBe(true);
  expect(afterReload?.defenseDrillComplete, 'drill survives reload').toBe(true);
  expect(afterReload?.mission17Completed, 'still not complete').toBe(false);
  expect(afterReload?.mission18Unlocked, 'M18 still locked').toBe(false);

  // Defence hardware must exist exactly once after a load — never duplicated.
  const afterCount = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let n = 0;
    const walk = (o: import('three').Object3D) => {
      if (/Sensor Hostil|Emisor de Escudo|Reserva Energ/.test(o.name || '')) n += 1;
      o.children.forEach(walk);
    };
    walk(scene);
    return n;
  });
  expect(afterCount, 'no duplicated defences after load').toBe(7);

  // --- Close: overload -> real signatures -> M18 ----------------------------
  await step(page, 'stabilizeDefenseOverload');
  s17 = await m17(page);
  expect(s17?.overloadStabilized).toBe(true);
  expect(s17?.mission17Step, 'real signatures are the last beat').toBe('detectIncomingSignatures');
  expect(s17?.mission17Completed, 'not complete until the signatures land').toBe(false);

  await step(page, 'completeMission17');
  s17 = await m17(page);
  expect(s17?.incomingSignaturesDetected, 'real signatures detected').toBe(true);
  expect(s17?.mission17Completed).toBe(true);
  expect(s17?.mission17Step).toBe('completed');
  expect(s17?.mission18Unlocked, 'M17 unlocks M18').toBe(true);

  // --- No weapons / no enemies were introduced ------------------------------
  // The set of weapon-ish objects must be identical to the pre-M17 baseline:
  // M17 builds sensors, emitters and a reserve — never a usable weapon, and
  // never a physical enemy (the drill uses echoes only).
  const combatAfter = await combatNames(page);
  expect(combatAfter, 'M17 must not introduce weapons or enemies').toEqual(combatBefore);
  // And nothing M17 owns may be weapon-like.
  const defenceParts = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const names: string[] = [];
    const walk = (o: import('three').Object3D) => {
      if (/Red de Defensa Aurora|Defensas Aurora/.test(o.name || '')) {
        o.traverse((c) => names.push(c.name || ''));
        return;
      }
      o.children.forEach(walk);
    };
    walk(scene);
    return names.filter((n) => /weapon|turret|cannon|arma|torreta|proyectil/i.test(n));
  });
  expect(defenceParts, 'M17 defence hardware contains no weapons').toEqual([]);

  // --- Earlier missions still intact ----------------------------------------
  const m16 = await page.evaluate(() => window.__arcaDebug?.getMission16State());
  expect(m16?.mission16Completed, 'M16 still complete').toBe(true);
  const m15 = await page.evaluate(() => window.__arcaDebug?.getMission15State());
  expect(m15?.mission15Completed, 'M15 still complete').toBe(true);
});
