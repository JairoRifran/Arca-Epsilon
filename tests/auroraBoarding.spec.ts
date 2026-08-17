import { expect, test, type Page } from '@playwright/test';

test.setTimeout(600000);

const TO_AURORA = [
  'startSurfacePhase',
  'makeBaseOperational',
  'startMission03',
  'calibrateMission03Communications',
  'placeRelayBeacon',
  'completeSignalSync',
  'completeMission03Translation',
  'completePleyadanContact',
  'completeMission03',
  'startMission04',
  'completeMission04',
  'startMission05',
  'detectSilentProbe',
  'triggerInterference',
  'resolveAllEchoes',
  'completeCounterSignal',
  'completeMission05',
  'startMission06',
  'placeAllCloakingProjectors',
  'completeCloakingSync',
  'completeMission06',
  'startMission07',
  'scanAllAtlasEchoNodes',
  'activateAtlasSeedArchive',
  'completeMission07',
  'startMission08',
  'stabilizeAllFractureFoci',
  'completeSignalPurge',
  'completeMission08',
  'completeMission09',
  'startMission10',
  'surveyAuroraValley'
] as const;

async function bootAurora(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  await page.locator('#launch-button').click();
  await page.evaluate((steps) => {
    window.__arcaDebug?.clearSave();
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown> | undefined;
    for (const step of steps) debug?.[step]?.();
    window.__arcaDebug?.teleportToAuroraSample('soil');
    window.__arcaDebug?.setPlayerMode('ship');
  }, TO_AURORA);
  await page.waitForFunction(
    () => window.__arcaDebug?.getShipBoardingState().surfaceZone === 'aurora' && window.__arcaDiagnostics?.insideShip === true
  );
  return errors;
}

test('Aurora parks on the visible valley floor and remains boardable', async ({ page }, testInfo) => {
  const errors = await bootAurora(page);

  // Use the real F route for disembark: the transition must settle the hull
  // before the pilot reaches the floor.
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    () => window.__arcaDiagnostics?.onFootActive === true && window.__arcaDiagnostics?.inputMode !== 'boarding-transition',
    undefined,
    { timeout: 30000 }
  );

  let state = await page.evaluate(() => window.__arcaDebug?.getShipBoardingState());
  expect(state?.surfaceZone).toBe('aurora');
  expect(state?.parkingState).toBe('parked');
  expect(state?.parked).toBe(true);
  // Belly clearance is now set by the landing gear, not by the hull resting
  // on the terrain: the ship stands on three legs so a ventral hatch fits
  // underneath. Band matches LANDING_GEAR_TUNING min/max belly clearance.
  expect(state?.terrainSeparation).toBeGreaterThanOrEqual(1.7);
  expect(state?.terrainSeparation).toBeLessThanOrEqual(2.1);
  expect(state?.terrainSeparation).toBeCloseTo(state?.clearanceTarget ?? 0, 2);
  expect(state?.hullBottom).toBeCloseTo((state?.terrainHeight ?? 0) + (state?.terrainSeparation ?? 0), 3);
  expect(state?.visualOscillationActive).toBe(false);
  expect(state?.playerShipInstances).toBe(1);
  expect(state?.horizontalDistance).toBeLessThan(1);
  expect(state?.verticalDifference).toBeLessThan(0.5);
  expect(state?.boardingAvailable).toBe(true);
  expect(state?.fConsumed).toBe(true);

  const groundedY = state?.characterPosition[1] ?? 0;
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.__arcaDebug?.getShipBoardingState().characterPosition[1])) ?? 0).toBeCloseTo(groundedY, 1);

  await expect(page.locator('#interact-prompt')).toBeVisible();
  await expect(page.locator('#interact-prompt kbd')).toHaveText('F');
  await expect(page.locator('#interact-label')).toHaveText('SUBIR A LA NAVE');
  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    for (let index = 0; index < 16; index += 1) window.__arcaDebug?.advanceDialogue();
    window.__arcaDebug?.setCameraLookAt('Nave');
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath('aurora-boarding.png'), fullPage: true });

  // F must not be accepted merely because the ship exists: both horizontal
  // and vertical boarding checks remain active around the live anchor.
  const anchor = state!.boardingAnchor;
  await page.evaluate(([x, y, z]) => window.__arcaDebug?.setPlayerPosition(x + 12, y, z), anchor);
  await page.waitForFunction(() => window.__arcaDiagnostics?.shipAccessAvailable === false);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__arcaDiagnostics?.onFootActive)).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.getShipBoardingState().fConsumed)).toBe(false);

  await page.evaluate(([x, y, z]) => window.__arcaDebug?.setPlayerPosition(x, y, z), anchor);
  await page.waitForFunction(() => window.__arcaDiagnostics?.shipAccessAvailable === true);
  await expect(page.locator('#interact-label')).toHaveText('SUBIR A LA NAVE');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    () => window.__arcaDiagnostics?.insideShip === true && window.__arcaDiagnostics?.inputMode !== 'boarding-transition',
    undefined,
    { timeout: 30000 }
  );
  expect(await page.evaluate(() => window.__arcaDebug?.getShipBoardingState().fConsumed)).toBe(true);
  expect(await page.evaluate(() => window.__arcaDiagnostics?.playerShipInstances)).toBe(1);

  // Legacy Aurora saves may contain the old analytic-ground Y. Only the ship
  // is normalized; the pilot XZ and mission state must remain untouched.
  await page.evaluate(() => {
    window.__arcaDebug?.setPlayerMode('onFoot');
    window.__arcaDebug?.saveGame();
  });
  const beforeRestore = await page.evaluate(() => ({
    character: window.__arcaDebug?.getShipBoardingState().characterPosition,
    mission10: window.__arcaDebug?.getMission10State()
  }));
  const corruptedY = await page.evaluate(() => {
    const raw = localStorage.getItem('arca-epsilon-save-v2');
    const save = JSON.parse(raw ?? '{}') as { shipSurfacePosition?: [number, number, number] };
    if (!save.shipSurfacePosition) throw new Error('Missing Aurora ship position');
    save.shipSurfacePosition[1] += 18;
    localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(save));
    window.__arcaDebug?.loadGame();
    return save.shipSurfacePosition[1];
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);
  state = await page.evaluate(() => window.__arcaDebug?.getShipBoardingState());
  expect(state?.restoreChecked).toBe(true);
  expect(state?.saveCorrected).toBe(true);
  expect(state?.shipPosition[1]).toBeLessThan(corruptedY - 10);
  // Belly clearance is now set by the landing gear, not by the hull resting
  // on the terrain: the ship stands on three legs so a ventral hatch fits
  // underneath. Band matches LANDING_GEAR_TUNING min/max belly clearance.
  expect(state?.terrainSeparation).toBeGreaterThanOrEqual(1.7);
  expect(state?.terrainSeparation).toBeLessThanOrEqual(2.1);
  expect(state?.characterPosition[0]).toBeCloseTo(beforeRestore.character?.[0] ?? 0, 1);
  expect(state?.characterPosition[2]).toBeCloseTo(beforeRestore.character?.[2] ?? 0, 1);
  expect(await page.evaluate(() => window.__arcaDebug?.getMission10State())).toEqual(beforeRestore.mission10);

  // Saves made in flight retain their real altitude and bypass parked-save
  // normalization.
  const flightY = (state?.terrainHeight ?? 0) + 26;
  await page.evaluate((y) => {
    window.__arcaDebug?.setPlayerMode('ship');
    const current = window.__arcaDiagnostics?.shipPosition ?? [0, y, 0];
    window.__arcaDebug?.setPlayerPosition(current[0], y, current[2]);
    window.__arcaDebug?.saveGame();
    window.__arcaDebug?.loadGame();
  }, flightY);
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === false);
  const flightState = await page.evaluate(() => window.__arcaDebug?.getShipBoardingState());
  expect(flightState?.shipPosition[1]).toBeCloseTo(flightY, 1);
  expect(flightState?.restoreChecked).toBe(false);
  expect(flightState?.saveCorrected).toBe(false);

  const canvasRatio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 128) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 12) visible += 1;
    }
    return visible / Math.max(1, Math.ceil(pixels.length / 128));
  });
  expect(canvasRatio).toBeGreaterThan(0.03);
  expect(errors).toEqual([]);
});
