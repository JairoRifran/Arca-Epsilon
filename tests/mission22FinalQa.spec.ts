import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

test.setTimeout(2_400_000);
test.use({ viewport: { width: 800, height: 450 } });

const TO_M19 = [
  'completeArkDeparture', 'startSurfacePhase', 'makeBaseOperational', 'startMission03', 'calibrateMission03Communications',
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

const OUTPUT = 'artifacts/m22-final-qa';

type M22QaDebug = NonNullable<Window['__arcaDebug']> & {
  getMission22TargetState: () => {
    step: string;
    targetId: string;
    targetLabel: string;
    targetPosition: number[];
    distance: number;
    range: number;
    inRange: boolean;
    waveRequired: number;
    waveDestroyed: number;
    waveRemaining: number;
  };
  getScoutDroneVisualProbePosition: () => [number, number, number] | null;
  orientShipToCombatTarget: () => string;
};

const m22 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission22State());
const m23 = (page: Page) => page.evaluate(() => window.__arcaDebug?.getMission23State());

async function waitForStep(page: Page, step: string, timeout = 240_000): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission22State().mission22Step), {
    timeout,
    intervals: [300]
  }).toBe(step);
}

async function drainDialogue(page: Page, timeout = 180_000, runtimeErrors: readonly string[] = []): Promise<void> {
  const deadline = Date.now() + timeout;
  let quiet = 0;
  const advanceButton = page.locator('#comms-dialogue button[aria-label="Avanzar diálogo"]');
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
    if (state?.currentDialogueId) {
      quiet = 0;
      await advanceButton.dispatchEvent('click');
    } else if ((state?.queueLength ?? 0) === 0) {
      quiet += 1;
      if (quiet >= 4) return;
    } else {
      quiet = 0;
    }
    await page.waitForTimeout(300);
  }
  const detail = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
  throw new Error(`M22 dialogue queue did not drain through player input: ${JSON.stringify({ detail, runtimeErrors })}`);
}

async function moveToTarget(page: Page, offset: [number, number, number] = [0, 0, 42]): Promise<void> {
  await page.evaluate((delta) => {
    const debug = window.__arcaDebug as M22QaDebug | undefined;
    const target = debug?.getMission22TargetState().targetPosition;
    if (!target) throw new Error('M22 target unavailable');
    debug.setShipWorldPosition([target[0] + delta[0], target[1] + delta[1], target[2] + delta[2]]);
  }, offset);
  await page.waitForTimeout(400);
}

async function capture(page: Page, name: string, frameTarget = true): Promise<void> {
  if (frameTarget) {
    await page.evaluate(() => {
      const debug = window.__arcaDebug as M22QaDebug | undefined;
      const target = debug?.getMission22TargetState().targetPosition;
      if (target) debug?.frameCameraTarget(target as [number, number, number], [520, 220, 720], 0);
    });
  }
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: false });
}

async function captureMap(page: Page, name: string): Promise<string> {
  await page.keyboard.press('KeyM');
  await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
  await page.waitForTimeout(350);
  const text = await page.locator('#starmap-poi-list').innerText();
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: false });
  await page.locator('#starmap-close').dispatchEvent('click');
  await expect(page.locator('#starmap-overlay')).toHaveClass(/is-hidden/);
  return text;
}

async function readPerformance(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const snapshot = window.__arcaDebug?.getPerformanceSnapshot() as Record<string, unknown> | undefined;
    const contacts = window.__arcaDebug?.getHostileContactState();
    const visual = window.__arcaDebug?.getThreeFrontVisualState();
    const numberValue = (key: string): number => Number(snapshot?.[key] ?? 0);
    return {
      drawCalls: numberValue('drawCalls'),
      triangles: numberValue('triangles'),
      activeParticles: numberValue('activeParticles'),
      activeBeams: numberValue('activeBeams'),
      activeMissiles: numberValue('activeMissiles'),
      activeEnemies: Number(contacts?.activeEnemyCount ?? 0),
      networkInstances: Number(visual?.sceneInstances ?? 0)
    };
  });
}

async function fireRealWeaponsUntilWaveClears(page: Page, timeout = 240_000): Promise<void> {
  const initialStep = await page.evaluate(() =>
    (window.__arcaDebug as M22QaDebug | undefined)?.getMission22TargetState().step ?? ''
  );
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const targetState = await page.evaluate(() => (window.__arcaDebug as M22QaDebug | undefined)?.getMission22TargetState());
    if (!targetState || targetState.step !== initialStep || targetState.waveRemaining <= 0) return;
    const magazine = await page.evaluate(() =>
      Number(window.__arcaDebug?.getWeaponResourceState().primaryMagazineCurrent ?? 0)
    );
    if (magazine <= 4) {
      await page.keyboard.press('KeyG');
      await expect.poll(() => page.evaluate(() =>
        Number(window.__arcaDebug?.getWeaponResourceState().primaryMagazineCurrent ?? 0)
      ), { timeout: 30_000, intervals: [250] }).toBeGreaterThan(4);
    }
    const target = await page.evaluate(() => (window.__arcaDebug as M22QaDebug | undefined)?.getScoutDroneVisualProbePosition());
    if (target) {
      await page.evaluate((position) => {
        const debug = window.__arcaDebug as M22QaDebug | undefined;
        debug?.setShipWorldPosition([position[0], position[1], position[2] + 105]);
      }, target);
      await page.keyboard.press('KeyT');
      await page.evaluate(() => (window.__arcaDebug as M22QaDebug | undefined)?.orientShipToCombatTarget());
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(500);
  }
  const diagnostic = await page.evaluate(() => ({
    mission: (window.__arcaDebug as M22QaDebug | undefined)?.getMission22TargetState(),
    visuals: window.__arcaDebug?.getThreeFrontVisualState(),
    weapon: window.__arcaDebug?.getWeaponResourceState(),
    contacts: window.__arcaDebug?.getHostileContactState(),
    navigation: window.__arcaDebug?.getShipNavigationState(),
    input: window.__arcaDebug?.getInputGateState()
  }));
  throw new Error(`Real M22 weapon/defense loop did not clear the current wave: ${JSON.stringify(diagnostic)}`);
}

async function destroyOneWithRealWeapons(page: Page, timeout = 90_000): Promise<void> {
  const initial = await page.evaluate(() =>
    (window.__arcaDebug as M22QaDebug | undefined)?.getMission22TargetState().waveDestroyed ?? 0
  );
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() =>
      (window.__arcaDebug as M22QaDebug | undefined)?.getMission22TargetState()
    );
    if ((state?.waveDestroyed ?? initial) > initial) return;
    const magazine = await page.evaluate(() =>
      Number(window.__arcaDebug?.getWeaponResourceState().primaryMagazineCurrent ?? 0)
    );
    if (magazine <= 4) {
      await page.keyboard.press('KeyG');
      await expect.poll(() => page.evaluate(() =>
        Number(window.__arcaDebug?.getWeaponResourceState().primaryMagazineCurrent ?? 0)
      ), { timeout: 30_000, intervals: [250] }).toBeGreaterThan(4);
    }
    const target = await page.evaluate(() =>
      (window.__arcaDebug as M22QaDebug | undefined)?.getScoutDroneVisualProbePosition()
    );
    if (target) {
      await page.evaluate((position) => {
        const debug = window.__arcaDebug as M22QaDebug | undefined;
        debug?.setShipWorldPosition([position[0], position[1], position[2] + 105]);
      }, target);
      await page.keyboard.press('KeyT');
      await page.evaluate(() => (window.__arcaDebug as M22QaDebug | undefined)?.orientShipToCombatTarget());
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(450);
  }
  throw new Error('No hostile was destroyed through the real weapon path');
}

test('M22 completa: entrada automática, tres frentes, restores parciales y transición real a M23', async ({ page }) => {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  const trace: string[] = [];
  const performance: Record<string, unknown> = {};
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true && window.__arcaDebug !== undefined, undefined, { timeout: 300_000 });
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.locator('#new-game-button').click();
  await page.locator('#confirm-new-game-button').click();
  await expect(page.locator('#boot-screen')).toHaveClass(/is-hidden/);

  // M21 was already proven end-to-end by mission21FinalQa. This recreates its
  // stable completed checkpoint, then lets production code start M22 itself.
  // From the first M22 frame onward no mission setter or completion helper runs.
  await page.evaluate((sequence) => {
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
    window.__arcaDebug?.chooseCoalitionResponse('strategic');
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.completeMission21();
    window.__arcaDebug?.setPlayerMode('ship');
  });

  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission22State().mission22Started), {
    timeout: 60_000,
    intervals: [300]
  }).toBe(true);
  const inputGate = await page.evaluate(() => window.__arcaDebug?.getInputGateState());
  expect(inputGate?.weaponsLocked).toBe(false);
  expect((await m22(page))?.mission22Step).toBe('simultaneousAlarm');
  trace.push('M21 completed -> M22 auto-started');
  performance.start = await readPerformance(page);
  await capture(page, '01-inicio-m22');

  const initialMap = await captureMap(page, '02-mapa-inicial');
  expect(initialMap).toContain('ARCA // MANDO');
  expect(initialMap).toContain('FRENTE AURORA');
  expect(initialMap).toContain('FRENTE NEREIDA');
  expect(initialMap).toContain('REL');
  expect(initialMap).not.toContain('RESONADOR ATLAS');
  expect(initialMap).not.toContain('CUENCA NEREIDA (ATERRIZAJE)');

  await drainDialogue(page, 180_000, errors);
  await waitForStep(page, 'accessCommandTerminal');
  await moveToTarget(page);
  const terminalAuthority = await page.evaluate(() => ({
    target: (window.__arcaDebug as M22QaDebug | undefined)?.getMission22TargetState(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay()
  }));
  expect(terminalAuthority.target?.inRange).toBe(true);
  expect(terminalAuthority.objective?.target).toBe(terminalAuthority.target?.targetLabel);
  await page.keyboard.press('KeyE');
  await waitForStep(page, 'assignInitialResources');
  await drainDialogue(page);

  const commandPanel = page.locator('#mission22-command-panel');
  await expect(commandPanel).toBeVisible();
  await commandPanel.locator('button[data-front="aurora"]').click();
  await commandPanel.locator('button[data-front="nereida"]').click();
  await commandPanel.locator('button[data-front="orbital"]').click();
  await waitForStep(page, 'defendAuroraFront');
  trace.push('terminal E -> three resource assignments through UI -> Aurora');
  await drainDialogue(page);

  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getThreeFrontVisualState().activeAirHostiles), {
    timeout: 90_000,
    intervals: [300]
  }).toBeGreaterThan(0);
  await capture(page, '03-primer-frente-aurora');

  // Save A: first operational block, before any mission completion mutation.
  const saveA = await m22(page);
  expect(await page.evaluate(() => Boolean(window.__arcaDebug?.saveGame()))).toBe(true);
  const restoredA = await reloadAndAwaitRestore(
    page,
    m22,
    (state) => state?.mission22Step === 'defendAuroraFront',
    'M22 first operational block'
  );
  expect(restoredA?.mission22InitialEnergyFront).toBe(saveA?.mission22InitialEnergyFront);
  expect(restoredA?.auroraIntegrity).toBe(saveA?.auroraIntegrity);
  await expect.poll(() => page.evaluate(() => {
    const debug = window.__arcaDebug as M22QaDebug | undefined;
    const active = debug?.getThreeFrontVisualState().activeAirHostiles ?? 0;
    const remaining = debug?.getMission22TargetState().waveRemaining ?? 0;
    return active > 0 && active <= remaining;
  }), {
    timeout: 90_000,
    intervals: [300]
  }).toBe(true);

  await fireRealWeaponsUntilWaveClears(page);
  await waitForStep(page, 'defendNereidaFront');
  await drainDialogue(page);
  trace.push('Aurora wave cleared by real weapons/defenses -> Nereida');
  await captureMap(page, '04-mapa-frente-nereida');
  await capture(page, '05-multiples-amenazas');

  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission22State().mission22Step), {
    timeout: 240_000,
    intervals: [500]
  }).toBe('defendOrbitalFront');
  await drainDialogue(page);
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getThreeFrontVisualState().activeAirHostiles), {
    timeout: 90_000,
    intervals: [300]
  }).toBe(4);
  await capture(page, '06-frente-orbital');

  // Save B: kill one orbital attacker through the real weapon path, then prove
  // restore launches only the remaining attackers instead of resetting to 0/4.
  await destroyOneWithRealWeapons(page);
  const partial = await m22(page);
  if (partial?.mission22Step === 'defendOrbitalFront' && partial.orbitalHostilesDestroyed > 0 && partial.orbitalHostilesDestroyed < 4) {
    expect(await page.evaluate(() => Boolean(window.__arcaDebug?.saveGame()))).toBe(true);
    const restoredB = await reloadAndAwaitRestore(
      page,
      m22,
      (state) => state?.mission22Step === 'defendOrbitalFront' && state.orbitalHostilesDestroyed === partial.orbitalHostilesDestroyed,
      'M22 partial orbital wave'
    );
    expect(restoredB?.orbitalHostilesDestroyed).toBe(partial.orbitalHostilesDestroyed);
    await expect.poll(() => page.evaluate(() => {
      const debug = window.__arcaDebug as M22QaDebug | undefined;
      const active = debug?.getThreeFrontVisualState().activeAirHostiles ?? 0;
      const remaining = debug?.getMission22TargetState().waveRemaining ?? 0;
      return active > 0 && active <= remaining;
    }), {
      timeout: 90_000,
      intervals: [300]
    }).toBe(true);
    await capture(page, '07-oleada-parcial-restaurada');
  }
  await fireRealWeaponsUntilWaveClears(page);
  await waitForStep(page, 'manageCrossFrontCrisis');
  await drainDialogue(page);
  trace.push('Nereida held -> orbital relays held -> cross-front crisis');

  await moveToTarget(page);
  await waitForStep(page, 'chooseSupportPriority', 300_000);
  await expect(commandPanel).toBeVisible({ timeout: 90_000 });
  await commandPanel.locator('button[data-front="nereida"]').click();
  await waitForStep(page, 'restoreJointNetwork');
  await drainDialogue(page);
  await moveToTarget(page, [0, 0, 80]);
  await waitForStep(page, 'detectCoordinationNodes', 300_000);
  await drainDialogue(page);
  trace.push('cross-front recovery -> support UI -> joint network');

  await expect.poll(() => page.evaluate(() =>
    window.__arcaDebug?.getMission22State().coordinationNodesDetected.filter(Boolean).length
  ), { timeout: 180_000, intervals: [300] }).toBeGreaterThanOrEqual(1);
  const nodesMap = await captureMap(page, '08-mapa-nodos-coordinacion');
  expect(nodesMap).toContain('INTERFERIDOR');
  await expect.poll(() => page.evaluate(() =>
    window.__arcaDebug?.getMission22State().coordinationNodesDetected.filter(Boolean).length
  ), { timeout: 360_000, intervals: [300] }).toBe(3);
  await waitForStep(page, 'surviveFinalPressure');
  await drainDialogue(page);
  performance.stress = await readPerformance(page);
  await capture(page, '09-presion-final');

  await fireRealWeaponsUntilWaveClears(page, 300_000);
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission22State().mission22Completed), {
    timeout: 300_000,
    intervals: [300]
  }).toBe(true);
  expect((await m23(page))?.mission23Started).toBe(false);
  await capture(page, '10-m22-completa');
  await drainDialogue(page);
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission23State().mission23Started), {
    timeout: 120_000,
    intervals: [300]
  }).toBe(true);
  trace.push('final pressure survived -> M22 complete -> closing comms -> M23 auto-started');
  await capture(page, '11-inicio-m23', false);

  // Save C: the clean handoff is stable and does not reopen M22.
  expect(await page.evaluate(() => Boolean(window.__arcaDebug?.saveGame()))).toBe(true);
  const restoredC = await reloadAndAwaitRestore(
    page,
    m23,
    (state) => state?.mission23Started === true,
    'M22 complete / M23 start'
  );
  expect(restoredC?.mission23Started).toBe(true);
  expect((await m22(page))?.mission22Completed).toBe(true);

  const closure = await page.evaluate(() => ({
    m22: window.__arcaDebug?.getMission22State(),
    m23: window.__arcaDebug?.getMission23State(),
    visual: window.__arcaDebug?.getThreeFrontVisualState(),
    contacts: window.__arcaDebug?.getHostileContactState(),
    ark: window.__arcaDebug?.getMothershipIdentity(),
    dialogue: window.__arcaDebug?.getDialogueState(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay(),
    pixels: (() => {
      const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      if (!gl) return 0;
      const data = new Uint8Array(8 * 8 * 4);
      gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, data);
      let nonBlank = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] || data[index + 1] || data[index + 2] || data[index + 3]) nonBlank += 1;
      }
      return nonBlank;
    })()
  }));
  expect(closure.m22?.mission22Completed).toBe(true);
  expect(closure.m22?.mission23Unlocked).toBe(true);
  expect(closure.m23?.mission23Started).toBe(true);
  expect(closure.visual?.sceneInstances).toBe(1);
  expect(closure.visual?.activeAirHostiles).toBe(0);
  expect(closure.visual?.activeBreachHostiles).toBe(0);
  expect(closure.contacts?.activeEnemyCount).toBe(0);
  expect(closure.ark?.sceneInstances).toBe(1);
  expect(closure.objective?.missionTitle).toContain('23');
  expect(closure.pixels).toBeGreaterThan(0);
  const m22Dialogues = closure.dialogue?.playedDialogueIds.filter((id) => id.startsWith('m22_')) ?? [];
  expect(new Set(m22Dialogues).size).toBe(m22Dialogues.length);
  performance.cleanup = await readPerformance(page);
  const cleanupPerformance = performance.cleanup as Record<string, number>;
  expect(cleanupPerformance.activeEnemies).toBe(0);
  expect(cleanupPerformance.activeBeams).toBe(0);
  expect(cleanupPerformance.activeMissiles).toBe(0);
  expect(cleanupPerformance.networkInstances).toBe(1);

  const relevantErrors = errors.filter((error) => !/favicon|Failed to load resource/i.test(error));
  const relevantRequests = failedRequests.filter((error) => !/favicon/i.test(error));
  console.log('M22_EVENT_TRACE', trace.join(' -> '));
  console.log('M22_PERFORMANCE', JSON.stringify(performance));
  console.log('M22_FAILED_REQUESTS', JSON.stringify(relevantRequests));
  expect(relevantErrors).toEqual([]);
  expect(relevantRequests).toEqual([]);
});
