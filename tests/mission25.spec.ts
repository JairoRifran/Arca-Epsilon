import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

test.setTimeout(900000);

const evidenceDir = 'test-results/mission25-evidence';
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

async function ready(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible())) await launch.click();
  await page.waitForFunction(() => window.__arcaDebug !== undefined, undefined, { timeout: 180000 });
}

async function prepareM24WithInheritance(page: Page): Promise<void> {
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug;
    debug?.clearSave();
    const callable = debug as unknown as Record<string, () => unknown> | undefined;
    for (const name of sequence) callable?.[name]?.();
    debug?.completeMission20();
    debug?.completeMission21();
    debug?.startMission22();
    debug?.chooseMission22Support('aurora');
    debug?.completeMission22();
    debug?.startMission23();
    debug?.synchronizeMission23Forces();
    debug?.chooseMission23TargetOrder('jammer');
    debug?.completeMission23();
    debug?.startMission24();
    debug?.completeMission24();
    debug?.teleportToMission24Target();
    debug?.clearDialogueQueue();
  }, TO_M19);
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${evidenceDir}/${name}.png`, fullPage: false, timeout: 60000 });
}

async function expectCanvasNonBlank(page: Page): Promise<void> {
  const ratio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    let samples = 0;
    for (let index = 0; index < pixels.length; index += 64) {
      samples += 1;
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 8) visible += 1;
    }
    return visible / Math.max(1, samples);
  });
  expect(ratio).toBeGreaterThan(0.01);
}

test('M25 runs from briefing through the Chapter I ending around the real Ark', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await ready(page);
  const locked = await page.evaluate(() => ({
    started: window.__arcaDebug?.startMission25(),
    visual: window.__arcaDebug?.getMission25VisualState(),
    identity: window.__arcaDebug?.getMothershipIdentity()
  }));
  expect(locked.started).toBe(false);
  expect(locked.visual?.defenseNetworkBuilt).toBe(false);
  expect(locked.visual?.commandTargetBuilt).toBe(false);
  expect(locked.identity?.sceneInstances).toBe(1);

  await prepareM24WithInheritance(page);
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getMission25State().mission25Unlocked)),
    { timeout: 10000, intervals: [50], message: 'M25 unlock was not handed over on the frame after M24' }
  ).toBe(true);
  const beforeStart = await page.evaluate(() => ({
    ship: window.__arcaDebug?.getShipTransform().position,
    ark: window.__arcaDebug?.getMothershipIdentity(),
    m22: window.__arcaDebug?.getMission22State().mission22SupportPriority,
    m23: window.__arcaDebug?.getMission23State().jointForcesSynchronized,
    m25: window.__arcaDebug?.getMission25State()
  }));
  expect(beforeStart.m25?.mission25Unlocked).toBe(true);
  expect(beforeStart.m25?.mission25Started).toBe(false);
  expect(beforeStart.m22).toBe('aurora');
  expect(beforeStart.m23).toBe(true);

  expect(await page.evaluate(() => window.__arcaDebug?.startMission25())).toBe(true);
  let state = await page.evaluate(() => window.__arcaDebug?.getMission25State());
  let visual = await page.evaluate(() => window.__arcaDebug?.getMission25VisualState());
  const afterStart = await page.evaluate(() => ({
    ship: window.__arcaDebug?.getShipTransform().position,
    ark: window.__arcaDebug?.getMothershipIdentity()
  }));
  expect(state?.mission25State).toBe('finalBriefing');
  expect(state?.mission25InheritedM22Priority).toBe(beforeStart.m22);
  expect(state?.mission25InheritedM23Support).toBe(beforeStart.m23);
  expect(afterStart.ship).toEqual(beforeStart.ship);
  expect(afterStart.ark?.uuid).toBe(beforeStart.ark?.uuid);
  expect(afterStart.ark?.sceneInstances).toBe(1);
  expect(visual?.playerShipSceneInstances).toBe(1);
  expect(visual?.defenseNetworkBuilt).toBe(true);
  await screenshot(page, '01-briefing');

  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.teleportToMission25Target();
    window.__arcaDebug?.advanceMission25Interaction();
  });
  state = await page.evaluate(() => window.__arcaDebug?.getMission25State());
  visual = await page.evaluate(() => window.__arcaDebug?.getMission25VisualState());
  expect(state?.mission25State).toBe('threatDetected');
  expect(visual?.contactSignaturesVisible).toBe(true);
  expect((await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay().target))).toBe('CONTACTOS HOSTILES');
  await page.evaluate(() => window.__arcaDebug?.setCameraLookAt(window.__arcaDebug.getMission25Target().position));
  await screenshot(page, '02-contactos-entrantes');

  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.teleportToMission25Target();
    window.__arcaDebug?.advanceMission25Interaction();
  });
  await expect.poll(async () => (await page.evaluate(() => window.__arcaDebug?.getMission25Diagnostics().activeEnemies)), {
    timeout: 10000,
    intervals: [100]
  }).toBe(3);
  let diagnostics = await page.evaluate(() => window.__arcaDebug?.getMission25Diagnostics());
  expect(diagnostics?.minimumEnemyArkDistance).toBeGreaterThan(75);
  expect(diagnostics?.mothershipCount).toBe(1);
  expect(diagnostics?.playerShipCount).toBe(1);
  await screenshot(page, '03-defensa-perimetro');

  const damaged = await page.evaluate(() => window.__arcaDebug?.applyMission25SystemDamage(0, 90));
  expect(damaged?.mission25SystemIntegrities[0]).toBeLessThan(40);
  expect(damaged?.mission25ArkIntegrity).toBeLessThan(100);
  await page.waitForTimeout(250);
  await screenshot(page, '04-arca-bajo-presion');
  await screenshot(page, '05-sistema-critico');

  await page.evaluate(() => window.__arcaDebug?.saveGame());
  state = await reloadAndAwaitRestore(
    page,
    (activePage) => activePage.evaluate(() => window.__arcaDebug?.getMission25State()),
    (snapshot) => snapshot?.mission25State === 'defensePerimeter',
    'M25 defense checkpoint'
  );
  expect(state?.mission25SystemIntegrities[0]).toBe(damaged?.mission25SystemIntegrities[0]);
  expect(state?.mission25InheritedM22Priority).toBe('aurora');
  expect(state?.mission25InheritedM23Support).toBe(true);

  for (let wave = 1; wave <= 4; wave += 1) {
    state = await page.evaluate(() => window.__arcaDebug?.completeMission25Wave());
    if (wave < 4) expect(state?.mission25Wave).toBe(wave + 1);
  }
  expect(state?.mission25State).toBe('counterattackPreparation');
  await page.evaluate(() => window.__arcaDebug?.setCameraLookAt('Nave'));
  await screenshot(page, '06-contraataque');

  state = await page.evaluate(() => window.__arcaDebug?.prepareMission25Counterattack());
  expect(state?.mission25State).toBe('commandTargetLocated');
  await page.evaluate(() => {
    window.__arcaDebug?.teleportToMission25Target();
    window.__arcaDebug?.advanceMission25Interaction();
  });
  state = await page.evaluate(() => window.__arcaDebug?.getMission25State());
  visual = await page.evaluate(() => window.__arcaDebug?.getMission25VisualState());
  expect(state?.mission25State).toBe('commandTargetProtected');
  expect(visual?.commandTargetBuilt).toBe(true);
  expect(visual?.commandTargetVisible).toBe(true);
  expect(visual?.commandActiveNodes).toBe(3);
  expect(visual?.commandCoreExposed).toBe(false);
  await page.evaluate(() => window.__arcaDebug?.setCameraLookAt(window.__arcaDebug.getMission25Target().position));
  await screenshot(page, '07-objetivo-protegido');

  await page.evaluate(() => window.__arcaDebug?.saveGame());
  state = await reloadAndAwaitRestore(
    page,
    (activePage) => activePage.evaluate(() => window.__arcaDebug?.getMission25State()),
    (snapshot) => snapshot?.mission25State === 'commandTargetProtected',
    'M25 command target checkpoint'
  );
  expect(state?.mission25CommandNodesDestroyed).toEqual([false, false, false]);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission25VisualState()))?.commandCoreExposed).toBe(false);

  await page.evaluate(() => {
    window.__arcaDebug?.destroyMission25CommandNode(0);
    window.__arcaDebug?.destroyMission25CommandNode(1);
    window.__arcaDebug?.destroyMission25CommandNode(2);
  });
  state = await page.evaluate(() => window.__arcaDebug?.getMission25State());
  expect(state?.mission25State).toBe('commandTargetExposed');
  expect(state?.mission25CommandNodesDestroyed).toEqual([true, true, true]);
  await screenshot(page, '08-nucleo-expuesto');

  state = await page.evaluate(() => window.__arcaDebug?.beginMission25FinalAssault());
  expect(state?.mission25State).toBe('finalAssault');
  visual = await page.evaluate(() => window.__arcaDebug?.getMission25VisualState());
  expect(visual?.commandCoreExposed).toBe(true);
  state = await page.evaluate(() => window.__arcaDebug?.damageMission25CommandCore(80));
  expect(state?.mission25CommandCoreIntegrity).toBeGreaterThan(0);
  expect(state?.mission25CommandCoreIntegrity).toBeLessThan(100);
  await screenshot(page, '09-climax');

  await page.evaluate(() => window.__arcaDebug?.saveGame());
  const partialCore = state?.mission25CommandCoreIntegrity;
  state = await reloadAndAwaitRestore(
    page,
    (activePage) => activePage.evaluate(() => window.__arcaDebug?.getMission25State()),
    (snapshot) => snapshot?.mission25State === 'finalAssault',
    'M25 final target checkpoint'
  );
  expect(state?.mission25CommandCoreIntegrity).toBe(partialCore);
  const finalRuntimeUuid = await page.evaluate(() => window.__arcaDebug?.getMothershipIdentity().uuid);
  state = await page.evaluate(() => window.__arcaDebug?.damageMission25CommandCore(9999));
  expect(state?.mission25State).toBe('threatCollapse');
  expect(state?.mission25ThreatNeutralized).toBe(true);
  diagnostics = await page.evaluate(() => window.__arcaDebug?.getMission25Diagnostics());
  expect(diagnostics?.activeEnemies).toBe(0);
  expect(diagnostics?.activeProjectiles).toBe(0);
  await screenshot(page, '10-retirada-enemiga');

  state = await page.evaluate(() => window.__arcaDebug?.completeMission25Collapse());
  expect(state?.mission25State).toBe('arkStabilization');
  await page.evaluate(() => window.__arcaDebug?.teleportToMission25Target());
  await screenshot(page, '11-estabilizacion');
  state = await page.evaluate(() => window.__arcaDebug?.completeMission25Stabilization());
  expect(state?.mission25State).toBe('chapterResolution');
  await page.evaluate(() => {
    window.__arcaDebug?.teleportToMission25Target();
    window.__arcaDebug?.advanceMission25Interaction();
  });
  await expect(page.locator('#chapter-end-screen')).toHaveClass(/is-visible/);
  await expect(page.locator('#chapter-end-screen')).toContainText('ARCA EPSILON');
  await expect(page.locator('#chapter-end-screen')).toContainText('CAPÍTULO I');
  await expect(page.locator('#chapter-end-screen')).toContainText('EL MUNDO SEMILLA');
  await screenshot(page, '12-pantalla-final');

  state = await page.evaluate(() => window.__arcaDebug?.getMission25State());
  diagnostics = await page.evaluate(() => window.__arcaDebug?.getMission25Diagnostics());
  expect(state?.mission25Completed).toBe(true);
  expect(state?.chapterCompleted).toBe(true);
  expect(diagnostics?.activeTimers).toBe(0);
  expect(diagnostics?.activeEnemies).toBe(0);
  expect(diagnostics?.mothershipUuid).toBe(finalRuntimeUuid);
  expect(diagnostics?.mothershipCount).toBe(1);
  expect(diagnostics?.playerShipCount).toBe(1);

  await page.evaluate(() => window.__arcaDebug?.continueAfterChapterEnd());
  await expect(page.locator('#chapter-end-screen')).not.toHaveClass(/is-visible/);
  await page.evaluate(() => window.__arcaDebug?.saveGame());
  state = await reloadAndAwaitRestore(
    page,
    (activePage) => activePage.evaluate(() => window.__arcaDebug?.getMission25State()),
    (snapshot) => Boolean(snapshot?.mission25Completed && snapshot.chapterCompleted),
    'completed Chapter I save'
  );
  expect(state?.mission25ChapterEndShown).toBe(true);
  expect(state?.mission25ChapterEndDismissed).toBe(true);
  expect(await page.locator('#chapter-end-screen.is-visible').count()).toBe(0);
  diagnostics = await page.evaluate(() => window.__arcaDebug?.getMission25Diagnostics());
  expect(diagnostics?.activeEnemies).toBe(0);
  expect(diagnostics?.activeTimers).toBe(0);
  expect(diagnostics?.saveRestored).toBe(true);
  await expectCanvasNonBlank(page);
  expect(errors).toEqual([]);
});

test('legacy M24 save derives the M25 awaiting checkpoint without building combat resources', async ({ page }) => {
  await ready(page);
  await prepareM24WithInheritance(page);
  await page.evaluate(() => {
    window.__arcaDebug?.saveGame();
    const raw = window.localStorage.getItem('arca-epsilon-save-v2');
    if (!raw) return;
    const save = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(save)) {
      if (key.startsWith('mission25') || key === 'chapterCompleted') delete save[key];
    }
    save.mission25Unlocked = true;
    window.localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(save));
  });

  const restored = await reloadAndAwaitRestore(
    page,
    (activePage) => activePage.evaluate(() => ({
      state: window.__arcaDebug?.getMission25State(),
      visual: window.__arcaDebug?.getMission25VisualState()
    })),
    (snapshot) => snapshot?.state?.mission25State === 'awaitingTrigger',
    'legacy M24 to M25 hook'
  );
  const state = restored?.state;
  const visual = restored?.visual;
  expect(state?.mission25Unlocked).toBe(true);
  expect(state?.mission25Started).toBe(false);
  expect(visual?.defenseNetworkBuilt).toBe(false);
  expect(visual?.commandTargetBuilt).toBe(false);
  expect(visual?.mothershipSceneInstances).toBe(1);
  expect(visual?.playerShipSceneInstances).toBe(1);
});
