import { expect, test } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

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

function step(page: import('@playwright/test').Page, name: string, arg?: unknown) {
  return page.evaluate(({ n, a }) => {
    const debug = window.__arcaDebug as unknown as Record<string, (value?: unknown) => unknown> | undefined;
    return debug?.[n]?.(a);
  }, { n: name, a: arg });
}

function steps(page: import('@playwright/test').Page, names: string[]) {
  return page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
  }, names);
}

const m21 = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission21State());

test('mission 21 rupture: ultimatum, response, links, routes, save/load and M22 hook', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());

  // M21 is unavailable before M20 and contributes no geometry.
  let state = await m21(page);
  expect(state?.mission21Started).toBe(false);
  expect(state?.mission21Step).toBe('inactive');
  const coldVisual = await page.evaluate(() => window.__arcaDebug?.getCoalitionCapitalVisualState());
  expect(coldVisual?.built, 'M01-M20 do not allocate the capital presence').toBe(false);
  expect(coldVisual?.meshCount).toBe(0);

  // Existing monotonic debug chain completes the real M01-M20 prerequisites.
  await steps(page, TO_M19);
  await step(page, 'completeMission20');
  const previous = await page.evaluate(() => window.__arcaDebug?.getMission20State());
  expect(previous?.mission20Completed).toBe(true);
  expect(previous?.mission21Unlocked).toBe(true);

  await step(page, 'startMission21');
  state = await m21(page);
  expect(state?.mission21Started).toBe(true);
  expect(state?.mission21Step).toBe('decryptTransmission');
  expect(state?.mission22Unlocked).toBe(false);

  // Three damaged carriers align in order, then the capital silhouette appears.
  expect(await step(page, 'alignMission21Channel', 0)).toBe(1);
  expect(await step(page, 'alignMission21Channel', 1)).toBe(2);
  expect(await step(page, 'alignMission21Channel', 2)).toBe(3);
  state = await m21(page);
  expect(state?.transmissionDecoded).toBe(true);
  expect(state?.mission21Step).toBe('detectCapitalShip');

  let visual = await page.evaluate(() => window.__arcaDebug?.getCoalitionCapitalVisualState());
  expect(visual?.built, 'capital presence is constructed lazily for M21').toBe(true);
  expect(visual?.visible).toBe(true);
  expect(visual?.meshCount).toBeGreaterThan(10);
  expect(visual?.attackable, 'the capital ship is never a WeaponTarget').toBe(false);

  await step(page, 'detectCoalitionCapitalShip');
  state = await m21(page);
  expect(state?.capitalShipDetected).toBe(true);
  expect(state?.mission21Step).toBe('analyzeSignature');

  await step(page, 'analyzeCoalitionCapitalSignature');
  state = await m21(page);
  expect(state?.capitalSignatureAnalyzed).toBe(true);
  expect(state?.mission21Step).toBe('receiveUltimatum');
  await page.waitForTimeout(700);

  // The three Coalition lines are queued once. Completing the beat opens the response checkpoint.
  await step(page, 'receiveCoalitionUltimatum');
  state = await m21(page);
  expect(state?.ultimatumReceived).toBe(true);
  expect(state?.mission21Step).toBe('chooseResponse');
  const ultimatumSave = await page.evaluate(() => window.__arcaDebug?.saveGame());
  expect(ultimatumSave?.mission21Started).toBe(true);
  expect(ultimatumSave?.ultimatumReceived).toBe(true);
  const persistedUltimatum = await page.evaluate(() => {
    const raw = window.localStorage.getItem('arca-epsilon-save-v2');
    if (!raw) return undefined;
    const save = JSON.parse(raw) as { mission21Started?: boolean; ultimatumReceived?: boolean };
    return { started: save.mission21Started, received: save.ultimatumReceived };
  });
  expect(persistedUltimatum).toEqual({ started: true, received: true });
  const ultimatumDialogueIds = ultimatumSave?.playedDialogueIds?.filter((id) => id.startsWith('m21_ultimatum_')) ?? [];
  expect(new Set(ultimatumDialogueIds).size).toBe(ultimatumDialogueIds.length);

  const restoredUltimatum = await reloadAndAwaitRestore(page, m21, (value) => value?.ultimatumReceived === true, 'M21 ultimatum');
  expect(restoredUltimatum?.mission21Step).toBe('chooseResponse');
  visual = await page.evaluate(() => window.__arcaDebug?.getCoalitionCapitalVisualState());
  expect(visual?.visible).toBe(true);
  expect(visual?.attackable).toBe(false);

  // The player's tone changes dialogue only and survives save/load.
  await step(page, 'chooseCoalitionResponse', 'diplomatic');
  state = await m21(page);
  expect(state?.coalitionResponseTone).toBe('diplomatic');
  expect(state?.mission21Step).toBe('restoreThreeChannels');

  expect(await step(page, 'restoreMission21Channel', 0)).toBe(1);
  const restoredLinks = await reloadAndAwaitRestore(
    page,
    m21,
    (value) => value?.coalitionResponseTone === 'diplomatic' && value.enclaveChannelsRestored.filter(Boolean).length >= 1,
    'M21 links'
  );
  expect(restoredLinks?.coalitionResponseTone).toBe('diplomatic');
  expect(restoredLinks?.enclaveChannelsRestored[0]).toBe(true);

  await step(page, 'restoreMission21Channel', 2);
  state = await m21(page);
  expect(state?.enclaveChannelsRestored.filter(Boolean).length).toBe(3);
  expect(state?.mission21Step).toBe('witnessDemonstration');

  // One remote beacon is lost; no enclave or Ark is destroyed.
  await step(page, 'witnessCoalitionDemonstration');
  state = await m21(page);
  expect(state?.demonstrationObserved).toBe(true);
  expect(state?.mission21Step).toBe('classifyAttackRoutes');
  visual = await page.evaluate(() => window.__arcaDebug?.getCoalitionCapitalVisualState());
  expect(visual?.remoteBeaconDestroyed).toBe(true);

  expect(await step(page, 'classifyMission21Route', 0)).toBe(1);
  expect(await step(page, 'classifyMission21Route', 1)).toBe(2);
  expect(await step(page, 'classifyMission21Route', 2)).toBe(3);
  state = await m21(page);
  expect(state?.attackRoutesClassified).toEqual([true, true, true]);
  expect(state?.mission21Step).toBe('activatePleyadianNetwork');

  await step(page, 'activateMission21PleyadianNetwork');
  state = await m21(page);
  expect(state?.pleyadianNetworkActivated).toBe(true);
  expect(state?.mission21Step).toBe('detectSimultaneousAssault');
  visual = await page.evaluate(() => window.__arcaDebug?.getCoalitionCapitalVisualState());
  expect(visual?.networkVisible).toBe(true);
  expect(visual?.activeRouteCount).toBe(3);

  // Final beat only unlocks M22; it never starts or implements it.
  await step(page, 'completeMission21');
  state = await m21(page);
  expect(state?.simultaneousAssaultDetected).toBe(true);
  expect(state?.mission21Completed).toBe(true);
  expect(state?.mission21Step).toBe('completed');
  expect(state?.mission22Unlocked).toBe(true);

  const restoredClose = await reloadAndAwaitRestore(page, m21, (value) => value?.mission21Completed === true, 'M21 closure');
  expect(restoredClose?.mission22Unlocked).toBe(true);
  expect(restoredClose?.coalitionResponseTone).toBe('diplomatic');
  expect(restoredClose?.enclaveChannelsRestored).toEqual([true, true, true]);
  expect(restoredClose?.attackRoutesClassified).toEqual([true, true, true]);

  const m20After = await page.evaluate(() => window.__arcaDebug?.getMission20State());
  const m19After = await page.evaluate(() => window.__arcaDebug?.getMission19State());
  const m18After = await page.evaluate(() => window.__arcaDebug?.getMission18State());
  expect(m20After?.mission20Completed).toBe(true);
  expect(m19After?.mission19Completed).toBe(true);
  expect(m18After?.mission18Completed).toBe(true);

  const pixels = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 0;
    const data = new Uint8Array(8 * 8 * 4);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let nonBlank = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] || data[i + 1] || data[i + 2] || data[i + 3]) nonBlank += 1;
    }
    return nonBlank;
  });
  expect(pixels, 'canvas remains nonblank').toBeGreaterThan(0);

  const relevant = errors.filter((error) => !/favicon|Failed to load resource/i.test(error));
  expect(relevant, `console/page errors: ${relevant.join(' | ')}`).toEqual([]);
});
