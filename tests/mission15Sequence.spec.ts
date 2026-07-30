import { expect, test, type Page } from '@playwright/test';

test.setTimeout(600000);

async function bootMission15Comms(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  await page.locator('#launch-button').click();
  const setup = await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    const surface = window.__arcaDebug?.startSurfacePhase();
    const base = window.__arcaDebug?.makeBaseOperational();
    window.__arcaDebug?.startMission03();
    window.__arcaDebug?.calibrateMission03Communications();
    window.__arcaDebug?.placeRelayBeacon();
    window.__arcaDebug?.completeSignalSync();
    window.__arcaDebug?.completeMission03Translation();
    window.__arcaDebug?.completePleyadanContact();
    window.__arcaDebug?.completeMission03();
    window.__arcaDebug?.startMission04();
    window.__arcaDebug?.setPlayerMode('onFoot');
    window.__arcaDebug?.completeMission04();
    window.__arcaDebug?.startMission05();
    window.__arcaDebug?.detectSilentProbe();
    window.__arcaDebug?.triggerInterference();
    window.__arcaDebug?.resolveAllEchoes();
    window.__arcaDebug?.completeCounterSignal();
    window.__arcaDebug?.completeMission05();
    window.__arcaDebug?.startMission06();
    window.__arcaDebug?.placeAllCloakingProjectors();
    window.__arcaDebug?.completeCloakingSync();
    window.__arcaDebug?.completeMission06();
    window.__arcaDebug?.startMission07();
    window.__arcaDebug?.scanAllAtlasEchoNodes();
    window.__arcaDebug?.activateAtlasSeedArchive();
    window.__arcaDebug?.completeMission07();
    window.__arcaDebug?.startMission08();
    window.__arcaDebug?.stabilizeAllFractureFoci();
    window.__arcaDebug?.completeSignalPurge();
    window.__arcaDebug?.completeMission08();
    window.__arcaDebug?.completeMission09();
    window.__arcaDebug?.completeMission13();
    window.__arcaDebug?.completeMission14();
    const started = window.__arcaDebug?.startMission15();
    const energy = window.__arcaDebug?.disableParasite(0);
    const life = window.__arcaDebug?.disableParasite(1);
    const located = window.__arcaDebug?.locateParasite(2);
    const position = window.__arcaDebug?.teleportToSabotageStation('comms');
    window.__arcaDebug?.clearDialogueQueue();
    return {
      surface,
      base,
      started,
      energy,
      life,
      located,
      position,
      state: window.__arcaDebug?.getMission15State()
    };
  });
  expect(setup.state?.mission15Step, JSON.stringify(setup)).toBe('disableCommsParasite');
  await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'disableCommsParasite', undefined, { timeout: 30000 });
  return errors;
}

async function expectCanvasNonBlank(page: Page): Promise<void> {
  const ratio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sampled = 0;
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 128) {
      sampled += 1;
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 12) visible += 1;
    }
    return visible / Math.max(1, sampled);
  });
  expect(ratio).toBeGreaterThan(0.03);
}

test('M15 comms sequence keeps HUD, input and save state synchronized', async ({ page }) => {
  const errors = await bootMission15Comms(page);

  let sequence = await page.evaluate(() => window.__arcaDebug?.getMission15SequenceState());
  expect(sequence?.sequence).toHaveLength(4);
  expect(new Set(sequence?.sequence).size).toBe(4);
  expect(sequence?.visualStep).toBe(1);
  expect(sequence?.logicalStep).toBe(0);
  expect(sequence?.highlightedSymbol).toBe(sequence?.expectedSymbol);
  await expect(page.locator('#warning-overlay')).toContainText('SECUENCIA 1/4');
  await expect(page.locator('#next-action')).toContainText('con E: 0/4');

  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__arcaDiagnostics?.mission15SequenceLogicalStep === 1);
  sequence = await page.evaluate(() => window.__arcaDebug?.getMission15SequenceState());
  expect(sequence?.visualStep).toBe(2);
  expect(sequence?.inputConsumed).toBe(true);

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', repeat: true, bubbles: true }));
  });
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => window.__arcaDebug?.getMission15SequenceState()))?.logicalStep).toBe(1);

  await page.evaluate(() => window.__arcaDebug?.saveGame());
  await page.evaluate(() => window.__arcaDebug?.loadGame());
  await page.waitForFunction(() => window.__arcaDiagnostics?.mission15SequenceLogicalStep === 1);
  sequence = await page.evaluate(() => window.__arcaDebug?.getMission15SequenceState());
  expect(sequence?.highlightedSymbol).toBe(sequence?.expectedSymbol);

  const wrongResult = await page.evaluate(() => {
    const state = window.__arcaDebug?.getMission15SequenceState();
    return window.__arcaDebug?.answerMission15Symbol(((state?.expectedSymbol ?? 0) + 1) % 4);
  });
  expect(wrongResult).toBe('missed');
  sequence = await page.evaluate(() => window.__arcaDebug?.getMission15SequenceState());
  expect(sequence?.logicalStep).toBe(0);
  expect(sequence?.visualStep).toBe(1);
  expect(sequence?.highlightedSymbol).toBe(sequence?.expectedSymbol);
  expect(sequence?.errorActive).toBe(true);

  await page.evaluate(() => {
    const raw = localStorage.getItem('arca-epsilon-save-v2');
    const save = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    save.mission15Step = 'disableCommsParasite';
    save.auroraParasiteStates = ['disabled', 'disabled', 'active'];
    save.auroraCommsSequence = [2, 0, 3, 1];
    save.auroraCommsSequenceStep = 4;
    save.auroraCommsSequenceCompleted = false;
    localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(save));
    window.__arcaDebug?.loadGame();
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.mission15SequenceLogicalStep === 0);
  sequence = await page.evaluate(() => window.__arcaDebug?.getMission15SequenceState());
  expect(sequence?.visualStep).toBe(1);
  expect(sequence?.highlightedSymbol).toBe(sequence?.expectedSymbol);
  expect(sequence?.completed).toBe(false);

  for (let step = 1; step <= 4; step += 1) {
    await page.waitForTimeout(350);
    await page.keyboard.press('KeyE');
    if (step < 4) {
      await page.waitForFunction((expected) => window.__arcaDiagnostics?.mission15SequenceLogicalStep === expected, step);
    }
  }
  await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'centralOverload');
  expect(await page.evaluate(() => window.__arcaDiagnostics?.mission15SequenceCompleted)).toBe(true);
  expect(await page.evaluate(() => window.__arcaDiagnostics?.mission15SequenceLogicalStep)).toBe(4);

  await expectCanvasNonBlank(page);
  expect(errors).toEqual([]);
});
