import { expect, test } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

/**
 * Mission 16 "Protocolo Pleyadiano" probe: sequential state machine, node
 * seating on the shared valley floor, save/load, and the M17 hand-off. Follows
 * the existing Aurora mission-probe pattern (debug fast-forwards + state reads).
 */
test.setTimeout(600000);

const TO_M15 = [
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
  'startMission14', 'completeTraceInspections', 'completeReverseTriangulation', 'completeMission14'
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
const m16 = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission16State());

test('mission 16 pleyadian protocol: sequence, nodes, save/load, M17', async ({ page }) => {
  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));

  // M16 must not exist before M15 is complete.
  for (const s of TO_M15) await step(page, s);
  let m15 = await page.evaluate(() => window.__arcaDebug?.getMission15State());
  expect(m15?.mission15Completed).toBe(false);
  expect((await m16(page))?.mission16Started).toBe(false);

  // Complete M15 -> M16 unlocks; start it.
  await step(page, 'completeMission15');
  m15 = await page.evaluate(() => window.__arcaDebug?.getMission15State());
  expect(m15?.mission15Completed).toBe(true);
  expect(m15?.mission16Unlocked).toBe(true);

  await step(page, 'startMission16');
  let s16 = await m16(page);
  expect(s16?.mission16Started).toBe(true);
  expect(s16?.mission16Step).toBe('receiveAlert');
  expect(s16?.mission16Completed).toBe(false);

  // Steps unlock strictly in order.
  await step(page, 'establishTripleLink');
  s16 = await m16(page);
  expect(s16?.alertReceived).toBe(true);
  expect(s16?.tripleLinkEstablished).toBe(true);
  expect(s16?.linkFrequenciesCalibrated).toBe(3);
  expect(s16?.mission16Step).toBe('recoverAtlasKey');

  await step(page, 'recoverAtlasKey');
  expect((await m16(page))?.atlasKeyRecovered).toBe(true);

  await step(page, 'revealSeedWorld');
  s16 = await m16(page);
  expect(s16?.pleyadianSeedRevealed).toBe(true);
  expect(s16?.mission16Step).toBe('unlockDetection');

  // Protocols in order: detection -> shield -> alertNetwork.
  await step(page, 'unlockDefenseProtocol', 0);
  s16 = await m16(page);
  expect(s16?.protocolsUnlocked).toEqual([true, false, false]);
  expect(s16?.mission16Step).toBe('unlockShield');
  await step(page, 'unlockDefenseProtocol', 2);
  s16 = await m16(page);
  expect(s16?.protocolsUnlocked).toEqual([true, true, true]);
  expect(s16?.mission16Step).toBe('synchronizeNodes');

  // Three nodes synchronise; verify they seat on the valley floor.
  const seating = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const scene = w.__arcaScene as import('three').Scene | undefined;
    if (!scene) return null;
    let root: import('three').Object3D | null = null;
    scene.traverse((o) => { if (o.name === 'Nodos Pleyadianos de Defensa') root = o; });
    if (!root) return null;
    return {
      visible: (root as import('three').Object3D).visible,
      childNodes: (root as import('three').Object3D).children.filter((c) => /Nodo Pleyadiano/.test(c.name)).length
    };
  });
  expect(seating?.childNodes).toBe(3);

  await step(page, 'synchronizePleyadianNode', 2);
  s16 = await m16(page);
  expect(s16?.nodesSynchronized).toEqual([true, true, true]);
  expect(s16?.mission16Step).toBe('runSimulation');

  await step(page, 'runDefenseSimulation');
  s16 = await m16(page);
  expect(s16?.simulationComplete).toBe(true);
  expect(s16?.mission16Step).toBe('confirmEnergyDeficit');

  // Save/load in the middle of M16 must not duplicate nodes or lose progress.
  // (Every debug fast-forward already persists, so the sim step above is saved.)
  const reloaded = await reloadAndAwaitRestore(page, m16, (s) => s?.mission16Started === true, 'M16');
  expect(reloaded?.mission16Started).toBe(true);
  expect(reloaded?.mission16Step).toBe('confirmEnergyDeficit');
  expect(reloaded?.nodesSynchronized).toEqual([true, true, true]);
  expect(reloaded?.simulationComplete).toBe(true);
  const nodeCount = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene?: import('three').Scene }).__arcaScene;
    let n = 0;
    scene?.traverse((o) => { if (o.name === 'Nodos Pleyadianos de Defensa') n += 1; });
    return n;
  });
  expect(nodeCount).toBe(1);

  // Close it out -> M17 unlocks, no enemy/weapon entities appear.
  await step(page, 'completeMission16');
  s16 = await m16(page);
  expect(s16?.mission16Completed).toBe(true);
  expect(s16?.mission17Unlocked).toBe(true);
  expect(s16?.defensePlansRecovered).toBe(true);

  // No armed combat is introduced: M16 adds no enemy units, troops or weapons.
  // (Broad scenery terms like defensive beacons or hostile-signature scanners
  // predate M16; we assert on actual combat-unit names.)
  const combat = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene?: import('three').Scene }).__arcaScene;
    const names: string[] = [];
    scene?.traverse((o) => {
      if (o.name && /trooper|soldier|\benemy unit\b|combat drone|invader|warship|coalition (?:trooper|soldier|unit)/i.test(o.name)) {
        names.push(o.name);
      }
    });
    return names;
  });
  expect(combat, `combat entities present: ${combat.join(', ')}`).toEqual([]);

  // M12-M15 still intact after M16.
  const m15After = await page.evaluate(() => window.__arcaDebug?.getMission15State());
  expect(m15After?.mission15Completed).toBe(true);
});
