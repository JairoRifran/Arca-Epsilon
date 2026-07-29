import { expect, test, type Page } from '@playwright/test';

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

const m22 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission22State());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
}

async function run(page: Page, names: string[]): Promise<void> {
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
  }, names);
}

async function roundTripMission22(
  page: Page,
  mutation: 'pressure' | 'support' | 'network' = 'pressure'
) {
  return page.evaluate((kind) => {
    const debug = window.__arcaDebug;
    if (!debug) return undefined;
    const before = debug.getMission22State();
    debug.saveGame();
    const checkpoint = window.localStorage.getItem('arca-epsilon-save-v2');
    if (kind === 'support') debug.chooseMission22Support('aurora');
    else if (kind === 'network') debug.restoreMission22JointNetwork();
    else debug.applyMission22Pressure(8);
    if (checkpoint) window.localStorage.setItem('arca-epsilon-save-v2', checkpoint);
    debug.loadGame();
    return { before, after: debug.getMission22State() };
  }, mutation);
}

test('mission 22 broken fronts: pressure, choices, checkpoints, nodes and M23 hook', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());

  expect(await page.evaluate(() => window.__arcaDebug?.startMission22())).toBe(false);
  expect((await m22(page))?.mission22Step).toBe('inactive');
  expect((await page.evaluate(() => window.__arcaDebug?.getThreeFrontVisualState()))?.built).toBe(false);

  await run(page, TO_M19);
  await run(page, ['completeMission20', 'completeMission21']);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission21State()))?.mission21Completed).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.startMission22())).toBe(true);
  expect((await m22(page))?.mission22Started).toBe(true);

  let visual = await page.evaluate(() => window.__arcaDebug?.getThreeFrontVisualState());
  expect(visual?.built).toBe(true);
  expect(visual?.visible).toBe(true);
  expect(visual?.sceneInstances).toBe(1);
  expect(visual?.visibleRelayCount).toBe(3);

  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.simulateAction('map');
  });
  await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
  const mapText = await page.locator('#starmap-poi-list').innerText();
  expect(mapText).toContain('FRENTE AURORA');
  expect(mapText).toContain('FRENTE NEREIDA');
  expect(mapText).toContain('RELÉ ORBITAL 1');
  expect(mapText).toContain('ARCA // MANDO');
  await page.evaluate(() => window.__arcaDebug?.simulateAction('map'));

  expect(await page.evaluate(() => window.__arcaDebug?.acknowledgeMission22Alarm())).toBe('accessCommandTerminal');
  expect(await page.evaluate(() => window.__arcaDebug?.accessMission22CommandTerminal())).toBe('assignInitialResources');
  expect(await page.evaluate(() => window.__arcaDebug?.assignMission22InitialResource('energy', 'aurora'))).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.assignMission22InitialResource('defense', 'nereida'))).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.assignMission22InitialResource('communications', 'orbital'))).toBe(true);

  let state = await m22(page);
  expect(state?.mission22Step).toBe('defendAuroraFront');
  expect(state?.mission22InitialEnergyFront).toBe('aurora');
  expect(state?.mission22InitialDefenseFront).toBe('nereida');
  expect(state?.mission22InitialCommsFront).toBe('orbital');

  const beforePressure = state?.auroraIntegrity ?? 0;
  state = await page.evaluate(() => window.__arcaDebug?.applyMission22Pressure(40));
  expect(state?.auroraIntegrity).toBeLessThan(beforePressure);
  expect(state?.auroraIntegrity).toBeGreaterThanOrEqual(18);
  expect(state?.mission22Completed).toBe(false);

  await page.evaluate(() => window.__arcaDebug?.completeMission22AuroraFront());
  let checkpoint = await roundTripMission22(page);
  expect(checkpoint?.after).toEqual(checkpoint?.before);
  expect(checkpoint?.after.auroraFrontDefended).toBe(true);
  expect(checkpoint?.after.mission22InitialEnergyFront).toBe('aurora');

  await page.evaluate(() => window.__arcaDebug?.completeMission22NereidaFront());
  checkpoint = await roundTripMission22(page);
  expect(checkpoint?.after).toEqual(checkpoint?.before);
  expect(checkpoint?.after.nereidaFrontDefended).toBe(true);

  await page.evaluate(() => window.__arcaDebug?.protectAllMission22Relays());
  checkpoint = await roundTripMission22(page);
  expect(checkpoint?.after).toEqual(checkpoint?.before);
  expect(checkpoint?.after.orbitalRelaysProtected).toEqual([true, true, true]);

  await page.evaluate(() => window.__arcaDebug?.manageMission22CrossFrontCrisis());
  checkpoint = await roundTripMission22(page, 'support');
  expect(checkpoint?.after).toEqual(checkpoint?.before);
  expect(checkpoint?.after.crossFrontCrisisManaged).toBe(true);
  expect(checkpoint?.after.mission22Step).toBe('chooseSupportPriority');

  await page.evaluate(() => window.__arcaDebug?.chooseMission22Support('nereida'));
  checkpoint = await roundTripMission22(page, 'network');
  expect(checkpoint?.after).toEqual(checkpoint?.before);
  expect(checkpoint?.after.mission22SupportPriority).toBe('nereida');

  await page.evaluate(() => window.__arcaDebug?.restoreMission22JointNetwork());
  expect((await m22(page))?.jointNetworkRestored).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.detectMission22CoordinationNode(0))).toBe(1);
  expect(await page.evaluate(() => window.__arcaDebug?.detectMission22CoordinationNode(1))).toBe(2);
  expect(await page.evaluate(() => window.__arcaDebug?.detectMission22CoordinationNode(2))).toBe(3);

  state = await m22(page);
  expect(state?.coordinationNodesDetected).toEqual([true, true, true]);
  expect(state?.mission22Step).toBe('surviveFinalPressure');
  state = await page.evaluate(() => window.__arcaDebug?.completeMission22());
  expect(state?.mission22Completed).toBe(true);
  expect(state?.mission22Step).toBe('completed');
  expect(state?.mission23Unlocked).toBe(true);

  await page.reload();
  await ready(page);
  const launch = page.locator('#launch-button');
  if (await launch.isVisible()) await launch.click();
  await expect.poll(async () => (await m22(page))?.mission22Completed, { timeout: 120000 }).toBe(true);
  const completed = await m22(page);
  expect(completed?.mission23Unlocked).toBe(true);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission21State()))?.mission21Completed).toBe(true);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission20State()))?.mission20Completed).toBe(true);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission19State()))?.mission19Completed).toBe(true);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission18State()))?.mission18Completed).toBe(true);

  visual = await page.evaluate(() => window.__arcaDebug?.getThreeFrontVisualState());
  expect(visual?.sceneInstances).toBe(1);
  expect(visual?.visibleNodeCount).toBe(3);
  expect(visual?.jointNetworkVisible).toBe(true);
  expect(visual?.activeAirHostiles).toBe(0);
  expect(visual?.activeBreachHostiles).toBe(0);

  const save = await page.evaluate(() => window.__arcaDebug?.saveGame());
  expect(save?.mission22Completed).toBe(true);
  expect(save?.mission23Unlocked).toBe(true);
  const m22Dialogues = save?.playedDialogueIds?.filter((id) => id.startsWith('m22_')) ?? [];
  expect(new Set(m22Dialogues).size).toBe(m22Dialogues.length);

  const pixels = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 0;
    const data = new Uint8Array(8 * 8 * 4);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let nonBlank = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] || data[index + 1] || data[index + 2] || data[index + 3]) nonBlank += 1;
    }
    return nonBlank;
  });
  expect(pixels).toBeGreaterThan(0);

  const relevant = errors.filter((error) => !/favicon|Failed to load resource/i.test(error));
  expect(relevant, `console/page errors: ${relevant.join(' | ')}`).toEqual([]);
});
