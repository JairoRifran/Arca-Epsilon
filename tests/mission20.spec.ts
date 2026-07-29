import { expect, test } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

/**
 * Mission 20 "Batalla por el Arca" probe: sequential state machine, orbital
 * waves reusing M18's drone fleet and the ship's WeaponSystem, the jammer's
 * suppression and release, engines/modules/data-core pressure, save/load and
 * the M21 hand-off.
 */
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

async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
}
function step(page: import('@playwright/test').Page, name: string, arg?: number) {
  return page.evaluate(({ n, a }) => {
    const d = window.__arcaDebug as unknown as Record<string, (x?: number) => unknown> | undefined;
    try { return d?.[n]?.(a); } catch { return undefined; }
  }, { n: name, a: arg });
}
const m20 = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission20State());

/** Meshes inside the jammer group: 0 until it is lazily built for M20. */
const jammerCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let n = 0;
    const walk = (o: import('three').Object3D) => {
      if (/^Interferidor de la Coalición/.test(o.name || '')) {
        o.traverse((c) => { if ((c as unknown as { isMesh?: boolean }).isMesh) n += 1; });
        return;
      }
      o.children.forEach(walk);
    };
    walk(scene);
    return n;
  });

test('mission 20 ark battle: sequence, waves, jammer, save/load, M21', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => { consoleErrors.push(`PAGEERROR: ${e.message}`); console.log('PAGEERROR:', e.message); });

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));

  // --- 1. M20 must not start before M19 --------------------------------------
  const before = await m20(page);
  expect(before?.mission20Started, 'M20 must not be started at game start').toBe(false);
  expect(before?.mission20Step).toBe('inactive');

  for (const s of TO_M19) await step(page, s);
  const m19done = await page.evaluate(() => window.__arcaDebug?.getMission19State());
  expect(m19done?.mission19Completed, 'M19 must complete before M20').toBe(true);
  expect(m19done?.mission20Unlocked, 'M19 must unlock M20').toBe(true);

  // M01-M19 never pay for M20's jammer: it is built on deployment.
  expect(await jammerCount(page), 'no jammer geometry allocated before M20').toBe(0);

  // --- 2/3. Ascent, rendezvous, external link -------------------------------
  await step(page, 'startMission20');
  let s20 = await m20(page);
  expect(s20?.mission20Started).toBe(true);
  expect(s20?.mission20Step).toBe('emergencyAscent');
  expect(s20?.mission21Unlocked, 'M21 must NOT be unlocked yet').toBe(false);

  await step(page, 'completeArkAscent');
  s20 = await m20(page);
  expect(s20?.ascentComplete).toBe(true);
  expect(s20?.mission20Step).toBe('rendezvousWithArk');

  await step(page, 'rendezvousWithArk');
  s20 = await m20(page);
  expect(s20?.arkReached).toBe(true);
  expect(s20?.mission20Step).toBe('restoreArkLink');

  // Link points sync one at a time, in order.
  await step(page, 'restoreArkLink', 0);
  s20 = await m20(page);
  expect(s20?.arkLinksRestored?.filter(Boolean).length, 'one link synced').toBe(1);
  expect(s20?.mission20Step, 'still restoring link').toBe('restoreArkLink');
  expect(s20?.arkFirstWaveCleared, 'waves cannot be skipped').toBe(false);

  await step(page, 'restoreArkLink', 2);
  s20 = await m20(page);
  expect(s20?.arkLinksRestored?.filter(Boolean).length, 'all three links synced').toBe(3);
  expect(s20?.mission20Step, 'first orbital wave begins').toBe('firstOrbitalWave');

  // Comms recover with the link (they drop again under the jammer).
  const linked = await page.evaluate(() => window.__arcaDebug?.getArkBattleReadout());
  expect(linked!.commsQuality, 'comms restored by the link').toBeGreaterThan(90);
  expect(linked!.jammed, 'not jammed yet').toBe(false);

  // --- 4/5. First wave, then the jammer suppresses lock-on ------------------
  await step(page, 'clearArkFirstWave');
  s20 = await m20(page);
  expect(s20?.arkFirstWaveCleared).toBe(true);
  expect(s20?.hostilesDestroyed, 'wave kills counted').toBeGreaterThan(0);
  expect(s20?.mission20Step, 'the jammer appears next').toBe('locateJammer');

  await page.waitForTimeout(2000);
  const jammed = await page.evaluate(() => window.__arcaDebug?.getArkBattleReadout());
  expect(jammed!.jammed, 'lock-on is suppressed while the jammer lives').toBe(true);
  expect(jammed!.commsQuality, 'comms degraded by the jammer').toBeLessThan(50);
  expect(await jammerCount(page), 'jammer geometry built lazily on deployment').toBeGreaterThan(0);

  await step(page, 'locateArkJammer');
  s20 = await m20(page);
  expect(s20?.jammerLocated).toBe(true);
  expect(s20?.mission20Step).toBe('disableJammer');
  expect(s20?.jammerDisabled, 'escorts must fall first').toBe(false);

  await step(page, 'disableArkJammer');
  s20 = await m20(page);
  expect(s20?.jammerDisabled).toBe(true);
  expect(s20?.mission20Step).toBe('defendEngines');
  const released = await page.evaluate(() => window.__arcaDebug?.getArkBattleReadout());
  expect(released!.jammed, 'systems released once the jammer is down').toBe(false);

  // --- Save/load at a wave checkpoint ---------------------------------------
  const reloaded = await reloadAndAwaitRestore(page, m20, (s) => s?.mission20Started === true, 'M20');
  expect(reloaded?.mission20Step, 'step survives reload').toBe('defendEngines');
  expect(reloaded?.arkLinksRestored?.filter(Boolean).length, 'links stay restored').toBe(3);
  expect(reloaded?.jammerDisabled, 'jammer stays down').toBe(true);
  expect(reloaded?.arkFirstWaveCleared, 'cleared wave stays cleared').toBe(true);
  expect(reloaded?.mission20Completed).toBe(false);
  expect(reloaded?.mission21Unlocked).toBe(false);
  const jammerMeshes = await jammerCount(page);
  expect(jammerMeshes, 'reload never duplicates the jammer').toBeLessThanOrEqual(8);

  // Engines are genuinely under pressure at this step.
  const engines = await page.evaluate(() => window.__arcaDebug?.getArkBattleReadout());
  expect(engines!.engineIntegrity, 'an engine took damage').toBeLessThan(100);

  // --- 6/7/8. Engines, civilian modules, data breach ------------------------
  await step(page, 'defendArkEngines');
  s20 = await m20(page);
  expect(s20?.enginesDefended).toBe(true);
  expect(s20?.mission20Step).toBe('protectCivilianModules');

  await step(page, 'protectCivilianModules');
  s20 = await m20(page);
  expect(s20?.civilianModulesProtected).toBe(true);
  expect(s20?.mission20Step).toBe('stopDataBreach');

  await step(page, 'stopArkDataBreach');
  s20 = await m20(page);
  expect(s20?.dataBreachStopped).toBe(true);
  // The Coalition only ever gets PARTIAL colonial data.
  expect(s20?.dataSiphoned, 'some data was lost').toBeGreaterThan(0);
  expect(s20?.dataSiphoned, 'but never all of it').toBeLessThan(60);
  expect(s20?.mission20Step).toBe('activateArkCounterattack');

  // --- 9/10/11. Counterattack, final wave, stabilisation --------------------
  await step(page, 'activateArkCounterattack');
  s20 = await m20(page);
  expect(s20?.arkCounterattackActive).toBe(true);
  expect(s20?.mission20Step).toBe('finalOrbitalWave');

  await step(page, 'clearArkFinalWave');
  s20 = await m20(page);
  expect(s20?.finalWaveCleared).toBe(true);
  expect(s20?.mission20Step).toBe('stabilizeArk');

  await step(page, 'stabilizeArk');
  s20 = await m20(page);
  expect(s20?.arkStabilized).toBe(true);
  expect(s20?.mission20Step, 'the far signature is the last beat').toBe('detectCapitalSignature');
  expect(s20?.mission20Completed, 'not complete until the signature lands').toBe(false);

  // The Ark survives: integrity never reaches zero.
  const stable = await page.evaluate(() => window.__arcaDebug?.getArkBattleReadout());
  expect(stable!.arkIntegrity, 'the Ark is never destroyed').toBeGreaterThan(15);

  // --- 12. The capital signature only appears at the very end ---------------
  await step(page, 'completeMission20');
  s20 = await m20(page);
  expect(s20?.capitalSignatureDetected, 'the larger signature is detected').toBe(true);
  expect(s20?.mission20Completed).toBe(true);
  expect(s20?.mission20Step).toBe('completed');
  expect(s20?.mission21Unlocked, 'M20 unlocks M21').toBe(true);

  // Sky cleared after the battle.
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.__arcaDebug?.getArkBattleReadout());
  expect(after!.hostilesActive, 'no hostiles left after the battle').toBe(0);

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
  const m19s = await page.evaluate(() => window.__arcaDebug?.getMission19State());
  expect(m19s?.mission19Completed, 'M19 still complete').toBe(true);
  const m18s = await page.evaluate(() => window.__arcaDebug?.getMission18State());
  expect(m18s?.mission18Completed, 'M18 still complete').toBe(true);
  // M18's own first-wave flag must not have been clobbered by M20's save field.
  expect(m18s?.firstWaveCleared, "M18's wave flag survives M20").toBe(true);
  const m17s = await page.evaluate(() => window.__arcaDebug?.getMission17State());
  expect(m17s?.mission17Completed, 'M17 still complete').toBe(true);

  const relevant = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  expect(relevant, `console errors: ${relevant.join(' | ')}`).toEqual([]);
});
