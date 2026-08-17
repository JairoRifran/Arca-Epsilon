import { expect, test, type Page } from '@playwright/test';

test.setTimeout(900_000);

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
  'startMission13', 'secureStormGenerator', 'anchorStormAntenna', 'activateStormAntenna',
  'chargeStormShield', 'completeMission13', 'startMission14', 'completeTraceInspections',
  'completeReverseTriangulation', 'completeMission14', 'completeMission15', 'completeMission16',
  'completeMission17', 'completeMission18'
];

type QaDebug = NonNullable<Window['__arcaDebug']> & {
  damageNearestScoutDrone: (amount?: number) => boolean;
  getActiveWeaponTargetIds: () => string[];
  getHostileContactState: () => { activeEnemyCount: number };
  orientShipToCombatTarget: () => string;
  clearCombatProbes: () => boolean;
};

const OUTPUT = 'artifacts/m20-final-qa';

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: false });
}

async function currentStep(page: Page): Promise<string> {
  return page.evaluate(() => window.__arcaDebug?.getMission20State().mission20Step ?? 'missing');
}

async function waitForWave(page: Page, count: number): Promise<void> {
  await expect.poll(() => page.evaluate(() =>
    (window.__arcaDebug as unknown as QaDebug).getHostileContactState().activeEnemyCount
  ) as Promise<number>, { timeout: 60_000, intervals: [350] }).toBe(count);
}

async function finishWave(page: Page, count: number, nextStep: string): Promise<void> {
  for (let remaining = count - 1; remaining >= 1; remaining -= 1) await destroyScout(page, remaining);
  await page.evaluate(() => (window.__arcaDebug as unknown as QaDebug).damageNearestScoutDrone(500));
  await expect.poll(() => currentStep(page), { timeout: 60_000, intervals: [250] }).toBe(nextStep);
}

async function moveToCurrentStation(page: Page, offsetX = 0): Promise<void> {
  await page.evaluate((xOffset) => {
    const station = window.__arcaDebug?.getArkStationState().stationPosition;
    if (!station) throw new Error('M20 station missing');
    window.__arcaDebug?.setShipWorldPosition([station[0] + xOffset, station[1], station[2]]);
    window.__arcaDebug?.clearDialogueQueue();
  }, offsetX);
  await page.waitForTimeout(450);
}

async function reachDisableJammer(page: Page): Promise<void> {
  await page.evaluate((sequence) => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    const debug = window.__arcaDebug as unknown as Record<string, (arg?: unknown) => unknown>;
    for (const name of sequence) debug[name]?.();
    debug.startMission20?.();
    debug.setPlayerMode?.('ship');
    debug.clearDialogueQueue?.();
  }, TO_M18);

  await expect.poll(async () => {
    await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
    return page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()?.orbitalEnvironmentActive === true);
  }, { timeout: 240_000, intervals: [1_000] }).toBe(true);

  await page.evaluate(() => {
    window.__arcaDebug?.rendezvousWithArk();
    window.__arcaDebug?.restoreArkLink(2);
    window.__arcaDebug?.clearArkFirstWave();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForFunction(() => {
    const jammer = window.__arcaScene?.children.find((object) => object.name.startsWith('Interferidor de la'));
    return window.__arcaDebug?.getMission20State().mission20Step === 'locateJammer' && jammer?.visible === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    const jammer = window.__arcaScene?.children.find((object) => object.name.startsWith('Interferidor de la'));
    if (!jammer) throw new Error('M20 jammer object not found');
    jammer.updateWorldMatrix(true, false);
    window.__arcaDebug?.setShipWorldPosition([
      jammer.matrixWorld.elements[12] + 280,
      jammer.matrixWorld.elements[13],
      jammer.matrixWorld.elements[14]
    ]);
  });
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission20State().mission20Step), {
    timeout: 60_000,
    intervals: [500]
  }).toBe('disableJammer');
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getHostileContactState().activeEnemyCount), {
    timeout: 60_000,
    intervals: [500]
  }).toBe(4);
}

async function destroyScout(page: Page, remaining: number): Promise<void> {
  await expect.poll(async () => {
    const count = await page.evaluate(() =>
      (window.__arcaDebug as unknown as QaDebug).getHostileContactState().activeEnemyCount
    ) as number;
    if (count > remaining) {
      await page.evaluate(() => (window.__arcaDebug as unknown as QaDebug).damageNearestScoutDrone(500));
    }
    return page.evaluate(() =>
      (window.__arcaDebug as unknown as QaDebug).getHostileContactState().activeEnemyCount
    ) as Promise<number>;
  }, { timeout: 60_000, intervals: [350] }).toBe(remaining);
}

test('M20 completes from the real jammer encounter through the M21 transition', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(
    () => window.__arcaGameReady === true && window.__arcaDebug !== undefined,
    undefined,
    { timeout: 300_000 }
  );
  await page.locator('#launch-button').click();
  await reachDisableJammer(page);
  const trace: string[] = ['disableJammer: checkpoint de entrada'];
  const performance: Record<string, unknown> = {};

  const disableStart = await page.evaluate(() => ({
    state: window.__arcaDebug?.getMission20State(),
    readout: window.__arcaDebug?.getArkBattleReadout(),
    targetIds: (window.__arcaDebug as unknown as QaDebug).getActiveWeaponTargetIds(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay()
  }));
  console.log('M20_REPRO_DISABLE_START', JSON.stringify(disableStart));
  expect(disableStart.objective?.target).toBe('INTERFERIDOR');
  expect(disableStart.objective?.key).toBe('ESPACIO');
  await capture(page, '01-disable-jammer');
  performance.disableJammer = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());

  for (let remaining = 3; remaining >= 1; remaining -= 1) await destroyScout(page, remaining);
  await page.evaluate(() => (window.__arcaDebug as unknown as QaDebug).damageNearestScoutDrone(500));
  await expect.poll(() => page.evaluate(() => ({
    step: window.__arcaDebug?.getMission20State().mission20Step,
    targets: (window.__arcaDebug as unknown as QaDebug).getActiveWeaponTargetIds(),
    contacts: (window.__arcaDebug as unknown as QaDebug).getHostileContactState().activeEnemyCount
  })), {
    timeout: 60_000,
    intervals: [350]
  }).toMatchObject({ step: 'disableJammer', contacts: 1, targets: expect.arrayContaining(['coalition-heavy-jammer']) });

  const afterEscorts = await page.evaluate(() => {
    const jammer = window.__arcaScene?.children.find((object) => object.name.startsWith('Interferidor de la'));
    return {
      state: window.__arcaDebug?.getMission20State(),
      readout: window.__arcaDebug?.getArkBattleReadout(),
      targetIds: (window.__arcaDebug as unknown as QaDebug).getActiveWeaponTargetIds(),
      jammerVisible: jammer?.visible ?? false,
      jammerVisual: (window.__arcaDebug as unknown as { getJammerVisualState?: () => unknown })?.getJammerVisualState?.()
    };
  });
  console.log('M20_REPRO_AFTER_ESCORTS', JSON.stringify(afterEscorts));
  trace.push('disableJammer: 4 escoltas destruidas -> interferidor expuesto');

  await page.evaluate(() => {
    const jammer = window.__arcaScene?.children.find((object) => object.name.startsWith('Interferidor de la'));
    if (!jammer) throw new Error('M20 jammer object not found after escort wave');
    jammer.updateWorldMatrix(true, false);
    window.__arcaDebug?.setShipWorldPosition([
      jammer.matrixWorld.elements[12],
      jammer.matrixWorld.elements[13],
      jammer.matrixWorld.elements[14] + 190
    ]);
    (window.__arcaDebug as unknown as QaDebug).orientShipToCombatTarget();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForTimeout(350);
  await page.keyboard.press('KeyT');
  for (let shot = 0; shot < 96; shot += 1) {
    if (await page.evaluate(() => window.__arcaDebug?.getMission20State().mission20Step !== 'disableJammer')) break;
    if (shot > 0 && shot % 8 === 0) {
      await page.evaluate(() => (window.__arcaDebug as unknown as QaDebug).orientShipToCombatTarget());
    }
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
  }
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getMission20State().mission20Step), {
    timeout: 60_000,
    intervals: [350]
  }).toBe('defendEngines');
  trace.push('disableJammer: interferidor destruido -> defendEngines');
  await capture(page, '02-jammer-neutralizado');

  await moveToCurrentStation(page);
  const enginePrompt = await page.evaluate(() => {
    const prompt = document.querySelector('#interact-prompt') as HTMLElement | null;
    return {
      visible: prompt?.classList.contains('is-active') ?? false,
      text: prompt?.innerText.trim().replace(/\s+/g, ' ') ?? '',
      objective: window.__arcaDebug?.getCurrentObjectiveDisplay(),
      readout: window.__arcaDebug?.getArkBattleReadout()
    };
  });
  console.log('M20_REPRO_ENGINE_PROMPT', JSON.stringify(enginePrompt));
  expect(enginePrompt.readout?.engineIntegrity).toBe(100);
  expect(enginePrompt.visible).toBe(true);
  expect(enginePrompt.text).toContain('ESPACIO');
  expect(enginePrompt.text).not.toMatch(/^E\b/);
  expect(enginePrompt.objective?.key).toBe('ESPACIO');
  await capture(page, '03-defend-engines');

  // A missing fleet must relaunch only the owed shortfall and never replay the
  // whole wave. One real kill leaves three owed; clearing the live pool mimics
  // a despawn/lost callback without changing mission state.
  await destroyScout(page, 3);
  await page.evaluate(() => (window.__arcaDebug as unknown as QaDebug).clearCombatProbes());
  await waitForWave(page, 3);
  expect(await currentStep(page)).toBe('defendEngines');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() =>
    (window.__arcaDebug as unknown as QaDebug).getHostileContactState().activeEnemyCount
  )).toBe(3);

  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getArkBattleReadout().engineIntegrity), {
    timeout: 90_000,
    intervals: [1_000]
  }).toBeLessThan(100);
  await moveToCurrentStation(page);
  await expect(page.locator('#interact-prompt')).toBeVisible();
  await expect(page.locator('#interact-prompt kbd')).toHaveText('E');
  await capture(page, '04-engine-repair');
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__arcaDebug?.getArkBattleReadout().engineIntegrity), {
    timeout: 30_000,
    intervals: [250]
  }).toBe(100);

  await finishWave(page, 3, 'protectCivilianModules');
  trace.push('defendEngines: 4 bajas registradas -> protectCivilianModules');
  await waitForWave(page, 4);
  const moduleObjective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
  expect(moduleObjective?.target).toBe('MODULOS CIVILES');
  expect(moduleObjective?.key).toBe('ESPACIO');
  await capture(page, '05-protect-civilian-modules');

  await finishWave(page, 4, 'stopDataBreach');
  trace.push('protectCivilianModules: 4 bajas registradas -> stopDataBreach');
  await waitForWave(page, 3);
  await moveToCurrentStation(page);
  await expect.poll(() => page.evaluate(() => {
    const prompt = document.querySelector('#interact-prompt') as HTMLElement | null;
    return prompt?.classList.contains('is-active') ? prompt.innerText.trim().replace(/\s+/g, ' ') : '';
  }), { timeout: 5_000, intervals: [250] }).toContain('ESPACIO');
  const guardedBreach = await page.evaluate(() => ({
    state: window.__arcaDebug?.getMission20State(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay(),
    promptVisible: (document.querySelector('#interact-prompt') as HTMLElement | null)?.classList.contains('is-active') ?? false,
    prompt: (document.querySelector('#interact-prompt') as HTMLElement | null)?.innerText.trim() ?? ''
  }));
  expect(guardedBreach.objective?.key).toBe('ESPACIO');
  expect(guardedBreach.promptVisible).toBe(true);
  expect(guardedBreach.prompt).not.toMatch(/^E\b/);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission20State()))?.dataBreachStopped).toBe(false);

  for (let remaining = 2; remaining >= 1; remaining -= 1) await destroyScout(page, remaining);
  await page.evaluate(() => (window.__arcaDebug as unknown as QaDebug).damageNearestScoutDrone(500));
  await expect.poll(() => page.evaluate(() => ({
    step: window.__arcaDebug?.getMission20State().mission20Step,
    remaining: window.__arcaDebug?.getArkBattleReadout().hostilesRemaining
  })), { timeout: 30_000, intervals: [250] }).toEqual({ step: 'stopDataBreach', remaining: 0 });
  await moveToCurrentStation(page);
  await expect(page.locator('#interact-prompt kbd')).toHaveText('E');
  await capture(page, '06-data-breach-exposed');
  await page.keyboard.press('KeyE');
  await expect.poll(() => currentStep(page), { timeout: 30_000, intervals: [250] }).toBe('activateArkCounterattack');
  trace.push('stopDataBreach: escoltas eliminadas + E -> activateArkCounterattack');

  await moveToCurrentStation(page);
  await expect(page.locator('#interact-prompt kbd')).toHaveText('E');
  await page.keyboard.press('KeyE');
  await expect.poll(() => currentStep(page), { timeout: 30_000, intervals: [250] }).toBe('finalOrbitalWave');
  trace.push('activateArkCounterattack: batería activada con E -> finalOrbitalWave');
  await waitForWave(page, 6);
  await capture(page, '07-final-orbital-wave');
  performance.finalWave = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());

  await finishWave(page, 6, 'stabilizeArk');
  trace.push('finalOrbitalWave: 6 bajas registradas -> stabilizeArk');

  const beforeRestore = await page.evaluate(() => ({
    state: window.__arcaDebug?.getMission20State(),
    ark: window.__arcaDebug?.getMothershipIdentity(),
    saved: Boolean(window.__arcaDebug?.saveGame())
  }));
  expect(beforeRestore.saved).toBe(true);
  const restoredSave = await page.evaluate(() => window.__arcaDebug?.loadGame());
  expect(restoredSave).toBeTruthy();
  await expect.poll(() => currentStep(page), { timeout: 30_000, intervals: [250] }).toBe('stabilizeArk');
  const afterRestoreArk = await page.evaluate(() => window.__arcaDebug?.getMothershipIdentity());
  expect(afterRestoreArk?.uuid).toBe(beforeRestore.ark?.uuid);
  expect(afterRestoreArk?.sceneInstances).toBe(1);

  await moveToCurrentStation(page, 255);
  await expect(page.locator('#interact-prompt kbd')).toHaveText('E');
  await page.keyboard.press('KeyE');
  await expect.poll(() => currentStep(page), { timeout: 30_000, intervals: [250] }).toBe('detectCapitalSignature');
  trace.push('stabilizeArk: save/load + confirmación con E -> detectCapitalSignature');
  const capitalObjective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
  expect(capitalObjective?.key).toBe('');
  await capture(page, '08-capital-signature');

  await expect.poll(() => page.evaluate(() => ({
    m20: window.__arcaDebug?.getMission20State(),
    m21: window.__arcaDebug?.getMission21State()
  })), { timeout: 45_000, intervals: [500] }).toMatchObject({
    m20: { mission20Completed: true, mission21Unlocked: true, mission20Step: 'completed' },
    m21: { mission21Started: true }
  });
  trace.push('detectCapitalSignature: lectura temporal real -> M20 complete -> M21 start');
  await capture(page, '09-m20-complete-transition');

  const finalState = await page.evaluate(() => ({
    m20: window.__arcaDebug?.getMission20State(),
    m21: window.__arcaDebug?.getMission21State(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay(),
    contacts: (window.__arcaDebug as unknown as QaDebug).getHostileContactState(),
    targets: (window.__arcaDebug as unknown as QaDebug).getActiveWeaponTargetIds(),
    jammer: (window.__arcaDebug as unknown as { getJammerVisualState: () => { active: boolean; alive: boolean } }).getJammerVisualState(),
    ark: window.__arcaDebug?.getMothershipIdentity(),
    dialogue: window.__arcaDebug?.getDialogueState()
  }));
  expect(finalState.objective?.missionTitle).toContain('Misión 21');
  expect(finalState.contacts.activeEnemyCount).toBe(0);
  expect(finalState.targets.some((id) => id.startsWith('coalition-scout-') || id === 'coalition-heavy-jammer')).toBe(false);
  expect(finalState.jammer.active).toBe(false);
  expect(finalState.jammer.alive).toBe(false);
  expect(finalState.ark?.sceneInstances).toBe(1);
  expect(new Set(finalState.dialogue?.playedDialogueIds).size).toBe(finalState.dialogue?.playedDialogueIds.length);

  const playedBeforeFinalRestore = finalState.dialogue?.playedDialogueIds ?? [];
  expect(await page.evaluate(() => Boolean(window.__arcaDebug?.saveGame()))).toBe(true);
  expect(await page.evaluate(() => Boolean(window.__arcaDebug?.loadGame()))).toBe(true);
  await expect.poll(() => page.evaluate(() => ({
    m20Complete: window.__arcaDebug?.getMission20State().mission20Completed,
    m21Started: window.__arcaDebug?.getMission21State().mission21Started
  })), { timeout: 30_000, intervals: [250] }).toEqual({ m20Complete: true, m21Started: true });
  const playedAfterFinalRestore = await page.evaluate(() => window.__arcaDebug?.getDialogueState().playedDialogueIds ?? []);
  expect(playedAfterFinalRestore).toEqual(playedBeforeFinalRestore);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(400);
  await capture(page, '10-mission-21-start');
  performance.mission21 = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());
  console.log('M20_EVENT_TRACE', trace.join(' -> '));
  console.log('M20_PERFORMANCE', JSON.stringify(performance));
  expect(errors).toEqual([]);
});
