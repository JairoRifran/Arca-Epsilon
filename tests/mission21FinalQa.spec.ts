import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

test.setTimeout(900_000);

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
  'startMission13', 'secureStormGenerator', 'anchorStormAntenna', 'activateStormAntenna',
  'chargeStormShield', 'completeMission13', 'startMission14', 'completeTraceInspections',
  'completeReverseTriangulation', 'completeMission14', 'completeMission15', 'completeMission16',
  'completeMission17', 'completeMission18', 'completeMission19'
];

const OUTPUT = 'artifacts/m21-final-qa';

type M21QaDebug = NonNullable<Window['__arcaDebug']> & {
  getMission21TargetState: () => {
    step: string;
    targetId: string;
    targetLabel: string;
    targetPosition: number[];
    shipPosition: number[];
    distance: number;
    range: number;
    inRange: boolean;
    phaseProgress: number;
  };
  getActiveWeaponTargetIds: () => string[];
  getJammerVisualState: () => { active: boolean; alive: boolean };
  getEnemyCombatVisualState: () => { playerShipInstances: number };
};

const m21 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission21State());
const m22 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission22State());

async function capture(page: Page, name: string, frameTarget = true): Promise<void> {
  if (frameTarget) {
    await page.evaluate(() => {
      const debug = window.__arcaDebug as M21QaDebug | undefined;
      const target = debug?.getMission21TargetState().targetPosition;
      if (target) debug?.frameCameraTarget(target as [number, number, number], [520, 210, 760], 0);
    });
  }
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: false });
}

async function waitForStep(page: Page, step: string, timeout = 120_000): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission21State().mission21Step), {
    timeout,
    intervals: [300]
  }).toBe(step);
}

async function moveToCurrentTarget(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.__arcaDebug as M21QaDebug | undefined;
    const target = debug?.getMission21TargetState().targetPosition;
    if (!target) throw new Error('M21 target position unavailable');
    debug?.setShipWorldPosition(target);
  });
  await page.waitForTimeout(350);
}

async function drainDialogueWithPlayerInput(page: Page, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  let quietSamples = 0;
  while (Date.now() < deadline) {
    const dialogue = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
    if (dialogue?.currentDialogueId) {
      quietSamples = 0;
      await page.keyboard.press('Enter');
    } else if ((dialogue?.queueLength ?? 0) === 0) {
      quietSamples += 1;
      if (quietSamples >= 4) return;
    } else {
      quietSamples = 0;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('Dialogue queue did not drain through player input');
}

async function waitForPlayedDialogues(page: Page, ids: string[], timeout = 180_000): Promise<string[]> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const dialogue = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
    const played = dialogue?.playedDialogueIds ?? [];
    if (ids.every((id) => played.includes(id))) return played;
    if (dialogue?.currentDialogueId) await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  throw new Error(`Required dialogue ids were not played: ${ids.join(', ')}`);
}

async function waitForM22Handoff(page: Page, timeout = 180_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => window.__arcaDebug?.getMission22State().mission22Started === true)) return;
    const dialogue = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
    if (dialogue?.currentDialogueId) await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  throw new Error('M21 closing communications never handed control to M22');
}

async function waitForResponsePanel(page: Page): Promise<void> {
  const panel = page.locator('#mission21-response-panel');
  const comms = page.locator('#comms-dialogue');
  const deadline = Date.now() + 30_000;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const dialogue = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
    if (dialogue?.currentDialogueId) {
      stableSamples = 0;
      await page.keyboard.press('Enter');
    } else if (
      (dialogue?.queueLength ?? 0) === 0 &&
      await panel.isVisible() &&
      !(await comms.evaluate((element) => element.classList.contains('is-visible')))
    ) {
      stableSamples += 1;
      if (stableSamples >= 3) return;
    } else {
      stableSamples = 0;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('M21 response panel never became exclusively actionable');
}

async function assertTargetAuthority(
  page: Page,
  expectedTargetId: string,
  expectedMapLabel?: string
): Promise<void> {
  const state = await page.evaluate(() => ({
    target: (window.__arcaDebug as M21QaDebug | undefined)?.getMission21TargetState(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay()
  }));
  expect(state.target?.targetId).toBe(expectedTargetId);
  expect(state.objective?.target).toBe(state.target?.targetLabel);
  expect(Math.abs((state.objective?.distance ?? 0) - (state.target?.distance ?? 0))).toBeLessThan(1.5);

  if (expectedMapLabel) {
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
    await expect(page.locator(
      '#starmap-poi-list .starmap-entity.is-target strong, #starmap-poi-list .poi-item.is-target .poi-name'
    )).toContainText(expectedMapLabel);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).toHaveClass(/is-hidden/);
  }
}

test('M21 completa: transición real de M20, flujo jugable, restores y arranque automático de M22', async ({ page }) => {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  const trace: string[] = [];
  const performance: Record<string, unknown> = {};
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });

  await page.goto('/?test=1');
  await page.waitForFunction(
    () => window.__arcaGameReady === true && window.__arcaDebug !== undefined,
    undefined,
    { timeout: 300_000 }
  );
  await page.locator('#launch-button').click();

  // Prerequisite checkpoint only. From the first M21 frame onward this probe
  // uses real timers, UI input and ship travel; no M21 force helper is called.
  await page.evaluate((sequence) => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown>;
    for (const name of sequence) debug[name]?.();
    debug.startMission20?.();
    window.__arcaDebug?.setPlayerMode('ship');
  }, TO_M19);
  await expect.poll(async () => {
    await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
    return page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()?.orbitalEnvironmentActive === true);
  }, { timeout: 240_000, intervals: [1_000] }).toBe(true);
  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.completeMission20();
  });

  await expect.poll(() => page.evaluate(() => ({
    m20: window.__arcaDebug?.getMission20State().mission20Completed,
    m21: window.__arcaDebug?.getMission21State().mission21Started
  })), { timeout: 30_000, intervals: [250] }).toEqual({ m20: true, m21: true });
  trace.push('M20 completed -> M21 auto-started');

  const entry = await page.evaluate(() => ({
    debugReady: Boolean(window.__arcaDebug),
    state: window.__arcaDebug?.getMission21State(),
    contacts: window.__arcaDebug?.getHostileContactState(),
    targets: (window.__arcaDebug as M21QaDebug | undefined)?.getActiveWeaponTargetIds(),
    jammer: (window.__arcaDebug as M21QaDebug | undefined)?.getJammerVisualState(),
    ark: window.__arcaDebug?.getMothershipIdentity(),
    ships: (window.__arcaDebug as M21QaDebug | undefined)?.getEnemyCombatVisualState(),
    input: window.__arcaDebug?.getInputGateState(),
    audio: window.__arcaDebug?.getAudioState()
  }));
  expect(entry.state?.mission21Step).toBe('decryptTransmission');
  expect(entry.contacts?.activeEnemyCount).toBe(0);
  expect(entry.targets?.some((id) => id.startsWith('coalition-scout-') || id === 'coalition-heavy-jammer')).toBe(false);
  expect(entry.jammer?.active).toBe(false);
  expect(entry.ark?.sceneInstances).toBe(1);
  expect(entry.ships?.playerShipInstances).toBe(1);
  expect(entry.input?.dialoguePausesGameplay).toBe(false);
  expect(entry.audio?.requestedMusicTrack).toBe('music-war-ambient');
  await moveToCurrentTarget(page);
  await assertTargetAuthority(page, 'mission21-ark', 'ARCA EPSILON');
  await capture(page, '01-m21-inicio-transmision');
  performance.start = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());
  await drainDialogueWithPlayerInput(page);

  await expect.poll(() => page.evaluate(() =>
    window.__arcaDebug?.getMission21State().transmissionChannelsAligned.filter(Boolean).length
  ), { timeout: 120_000, intervals: [300] }).toBeGreaterThanOrEqual(1);
  await waitForStep(page, 'analyzeSignature', 180_000);
  await drainDialogueWithPlayerInput(page);
  await assertTargetAuthority(page, 'mission21-ark', 'ARCA EPSILON');
  await capture(page, '02-presencia-capital');
  const capital = await page.evaluate(() => window.__arcaDebug?.getCoalitionCapitalVisualState());
  expect(capital?.visible).toBe(true);
  expect(capital?.attackable).toBe(false);

  // Save A: first third, at the stable signature-analysis checkpoint.
  const playedBeforeA = await page.evaluate(() => window.__arcaDebug?.getDialogueState().playedDialogueIds ?? []);
  expect(await page.evaluate(() => Boolean(window.__arcaDebug?.saveGame()))).toBe(true);
  const restoredA = await reloadAndAwaitRestore(
    page,
    m21,
    (state) => state?.mission21Step === 'analyzeSignature' && state.capitalShipDetected,
    'M21 first-third checkpoint'
  );
  expect(restoredA?.transmissionChannelsAligned).toEqual([true, true, true]);
  expect(await page.evaluate(() => window.__arcaDebug?.getDialogueState().playedDialogueIds ?? [])).toEqual(playedBeforeA);
  await moveToCurrentTarget(page);
  await capture(page, '03-analisis-firma-arca');

  await waitForStep(page, 'receiveUltimatum');
  await assertTargetAuthority(page, 'coalition-capital');
  await capture(page, '04-ultimatum-coalicion');
  await waitForStep(page, 'chooseResponse');
  await waitForResponsePanel(page);
  await capture(page, '05-respuesta-conjunta', false);
  await page.locator('#mission21-response-panel button[data-tone="strategic"]').click();
  await waitForStep(page, 'restoreThreeChannels');
  await drainDialogueWithPlayerInput(page);
  trace.push('Ultimatum -> strategic response through UI');

  await moveToCurrentTarget(page);
  await assertTargetAuthority(page, 'mission21-link-0');
  await expect.poll(() => page.evaluate(() =>
    window.__arcaDebug?.getMission21State().enclaveChannelsRestored.filter(Boolean).length
  ), { timeout: 180_000, intervals: [300] }).toBe(1);
  await capture(page, '06-primer-enlace-restaurado');

  // Save B: the interaction-heavy hull-link sequence resumes at link two.
  const playedBeforeB = await page.evaluate(() => window.__arcaDebug?.getDialogueState().playedDialogueIds ?? []);
  expect(await page.evaluate(() => Boolean(window.__arcaDebug?.saveGame()))).toBe(true);
  const restoredB = await reloadAndAwaitRestore(
    page,
    m21,
    (state) => state?.mission21Step === 'restoreThreeChannels' && state.enclaveChannelsRestored[0],
    'M21 restored-link checkpoint'
  );
  expect(restoredB?.coalitionResponseTone).toBe('strategic');
  expect(restoredB?.enclaveChannelsRestored).toEqual([true, false, false]);
  expect(await page.evaluate(() => window.__arcaDebug?.getDialogueState().playedDialogueIds ?? [])).toEqual(playedBeforeB);

  for (const expectedCount of [2, 3]) {
    await moveToCurrentTarget(page);
    await expect.poll(() => page.evaluate(() =>
      window.__arcaDebug?.getMission21State().enclaveChannelsRestored.filter(Boolean).length
    ), { timeout: 180_000, intervals: [300] }).toBe(expectedCount);
  }
  await waitForStep(page, 'witnessDemonstration');
  await assertTargetAuthority(page, 'remote-orbital-beacon');
  await capture(page, '07-demostracion-baliza');
  await waitForStep(page, 'classifyAttackRoutes');
  await drainDialogueWithPlayerInput(page);

  await moveToCurrentTarget(page);
  await assertTargetAuthority(page, 'mission21-ark', 'ARCA EPSILON');
  await expect.poll(() => page.evaluate(() =>
    window.__arcaDebug?.getMission21State().attackRoutesClassified.filter(Boolean).length
  ), { timeout: 180_000, intervals: [300] }).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('KeyM');
  await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
  await capture(page, '08-rutas-en-mapa', false);
  await page.keyboard.press('KeyM');
  await expect(page.locator('#starmap-overlay')).toHaveClass(/is-hidden/);
  await expect.poll(() => page.evaluate(() =>
    window.__arcaDebug?.getMission21State().attackRoutesClassified.filter(Boolean).length
  ), { timeout: 240_000, intervals: [300] }).toBe(3);

  await waitForStep(page, 'activatePleyadianNetwork');
  await assertTargetAuthority(page, 'mission21-ark');
  await moveToCurrentTarget(page);
  await capture(page, '09-red-pleyadiana');
  performance.network = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());
  await waitForStep(page, 'detectSimultaneousAssault');
  await expect.poll(() => page.evaluate(() =>
    window.__arcaDebug?.getMission21State().mission21Completed
  ), { timeout: 120_000, intervals: [300] }).toBe(true);
  await waitForM22Handoff(page);
  trace.push('Pleyadian network -> simultaneous assault -> M21 complete -> M22 auto-started');
  await capture(page, '10-m22-frentes-rotos', false);

  const closure = await page.evaluate(() => ({
    m21: window.__arcaDebug?.getMission21State(),
    m22: window.__arcaDebug?.getMission22State(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay(),
    capital: window.__arcaDebug?.getCoalitionCapitalVisualState(),
    contacts: window.__arcaDebug?.getHostileContactState(),
    targets: (window.__arcaDebug as M21QaDebug | undefined)?.getActiveWeaponTargetIds(),
    ark: window.__arcaDebug?.getMothershipIdentity(),
    ships: (window.__arcaDebug as M21QaDebug | undefined)?.getEnemyCombatVisualState(),
    interferenceClass: document.getElementById('hud')?.classList.contains('is-interference') ?? false,
    audio: window.__arcaDebug?.getAudioState()
  }));
  expect(closure.m21?.mission21Completed).toBe(true);
  expect(closure.m21?.mission22Unlocked).toBe(true);
  expect(closure.m22?.mission22Started).toBe(true);
  expect(closure.m22?.mission22Step).toBe('simultaneousAlarm');
  expect(closure.objective?.missionTitle).toContain('Misión 22');
  expect(closure.capital?.attackable).toBe(false);
  expect(closure.contacts?.activeEnemyCount).toBe(0);
  expect(closure.targets?.some((id) => id.startsWith('coalition-scout-') || id === 'coalition-heavy-jammer')).toBe(false);
  expect(closure.ark?.sceneInstances).toBe(1);
  expect(closure.ships?.playerShipInstances).toBe(1);
  expect(closure.interferenceClass).toBe(false);
  expect(closure.audio?.requestedMusicTrack).toBe('music-war-alert');

  const requiredM21DialogueIds = [
    'm21_start', 'm21_channels_aligned', 'm21_capital_detected', 'm21_signature_analyzed',
    'm21_ultimatum_open', 'm21_ultimatum_demands', 'm21_ultimatum_close',
    'm21_response_strategic', 'm21_total_interference', 'm21_channels_restored',
    'm21_demonstration', 'm21_routes', 'm21_pleyadian_network', 'm21_assault', 'm21_closing'
  ];
  const playedAtClose = await waitForPlayedDialogues(page, [
    ...requiredM21DialogueIds,
    'm22_start', 'm22_aurora_alarm', 'm22_nereida_alarm', 'm22_orbital_alarm'
  ]);
  const playedM21 = playedAtClose.filter((id) => id.startsWith('m21_'));
  expect(new Set(playedM21).size).toBe(playedM21.length);
  expect(playedM21).toEqual(expect.arrayContaining(requiredM21DialogueIds));

  // Save C: completed M21 and the real M22 opening both survive reload.
  const savedM22Step = (await m22(page))?.mission22Step;
  expect(savedM22Step).not.toBe('inactive');
  expect(await page.evaluate(() => Boolean(window.__arcaDebug?.saveGame()))).toBe(true);
  const restoredC = await reloadAndAwaitRestore(
    page,
    m22,
    (state) => state?.mission22Started === true && state.mission22Step === savedM22Step,
    'M21 completion / M22 opening checkpoint'
  );
  expect(restoredC?.mission22Started).toBe(true);
  expect(restoredC?.mission22Step).toBe(savedM22Step);
  expect((await m21(page))?.mission21Completed).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.getDialogueState().playedDialogueIds ?? [])).toEqual(playedAtClose);
  expect(await page.evaluate(() => document.getElementById('hud')?.classList.contains('is-interference') ?? false)).toBe(false);

  const canvasPixels = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl) return 0;
    const pixels = new Uint8Array(16 * 16 * 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let nonBlank = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] || pixels[index + 1] || pixels[index + 2] || pixels[index + 3]) nonBlank += 1;
    }
    return nonBlank;
  });
  expect(canvasPixels).toBeGreaterThan(0);
  performance.close = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());

  const relevantErrors = errors.filter((error) => !/favicon|Failed to load resource/i.test(error));
  const relevantRequestFailures = failedRequests.filter((error) => !/favicon/i.test(error));
  console.log('M21_EVENT_TRACE', trace.join(' -> '));
  console.log('M21_PERFORMANCE', JSON.stringify(performance));
  console.log('M21_FAILED_REQUESTS', JSON.stringify(relevantRequestFailures));
  expect(relevantErrors).toEqual([]);
  expect(relevantRequestFailures).toEqual([]);
});
