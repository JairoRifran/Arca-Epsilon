import { expect, test, type Page } from '@playwright/test';

test.setTimeout(600000);

async function bootSurface(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
    window.__arcaDebug?.setPlayerMode('onFoot');
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);
  return errors;
}

test('Base Nereida parks the real hull on terrain and boards only near its anchor', async ({ page }) => {
  const errors = await bootSurface(page);

  let state = await page.evaluate(() => window.__arcaDebug?.getShipBoardingState());
  expect(state?.parked).toBe(true);
  expect(state?.terrainSeparation).toBeGreaterThanOrEqual(0.04);
  expect(state?.terrainSeparation).toBeLessThanOrEqual(0.3);
  expect(state?.hullBottom).toBeCloseTo((state?.terrainHeight ?? 0) + (state?.terrainSeparation ?? 0), 3);
  expect(state?.playerShipInstances).toBe(1);
  expect(state?.horizontalDistance).toBeLessThan(1);
  expect(state?.verticalDifference).toBeLessThan(0.5);
  expect(state?.boardingAvailable).toBe(true);
  await expect(page.locator('#interact-label')).toHaveText('SUBIR A LA NAVE');

  const anchor = state!.boardingAnchor;
  await page.evaluate(([x, y, z]) => window.__arcaDebug?.setPlayerPosition(x + 12, y, z), anchor);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__arcaDiagnostics?.shipAccessAvailable)).toBe(false);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__arcaDiagnostics?.onFootActive)).toBe(true);

  await page.evaluate(([x, y, z]) => window.__arcaDebug?.setPlayerPosition(x, y, z), anchor);
  await page.waitForFunction(() => window.__arcaDiagnostics?.shipAccessAvailable === true);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    () => window.__arcaDiagnostics?.insideShip === true && window.__arcaDiagnostics?.inputMode !== 'boarding-transition',
    undefined,
    { timeout: 30000 }
  );
  expect(await page.evaluate(() => window.__arcaDiagnostics?.playerShipInstances)).toBe(1);

  await page.evaluate(() => {
    window.__arcaDebug?.setPlayerMode('onFoot');
    window.__arcaDebug?.saveGame();
  });
  const beforeCharacter = await page.evaluate(() => {
    const raw = localStorage.getItem('arca-epsilon-save-v2');
    return (JSON.parse(raw ?? '{}') as { characterPosition?: [number, number, number] }).characterPosition;
  });
  const corruptedY = await page.evaluate(() => {
    const raw = localStorage.getItem('arca-epsilon-save-v2');
    const save = JSON.parse(raw ?? '{}') as { shipSurfacePosition?: [number, number, number] };
    if (!save.shipSurfacePosition) throw new Error('Missing surface ship position');
    save.shipSurfacePosition[1] += 18;
    localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(save));
    window.__arcaDebug?.loadGame();
    return save.shipSurfacePosition[1];
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);
  state = await page.evaluate(() => window.__arcaDebug?.getShipBoardingState());
  expect(state?.shipPosition[1]).toBeLessThan(corruptedY - 10);
  expect(state?.terrainSeparation).toBeGreaterThanOrEqual(0.04);
  expect(state?.terrainSeparation).toBeLessThanOrEqual(0.3);
  const restoredCharacter = await page.evaluate(() => window.__arcaDiagnostics?.characterPosition);
  expect(restoredCharacter?.[0]).toBeCloseTo(beforeCharacter?.[0] ?? 0, 1);
  expect(restoredCharacter?.[2]).toBeCloseTo(beforeCharacter?.[2] ?? 0, 1);

  const flightY = (state?.terrainHeight ?? 0) + 26;
  await page.evaluate((y) => {
    window.__arcaDebug?.setPlayerMode('ship');
    const current = window.__arcaDiagnostics?.shipPosition ?? [0, y, 0];
    window.__arcaDebug?.setPlayerPosition(current[0], y, current[2]);
    window.__arcaDebug?.saveGame();
    window.__arcaDebug?.loadGame();
  }, flightY);
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === false);
  expect(await page.evaluate(() => window.__arcaDiagnostics?.shipRealY)).toBeCloseTo(flightY, 1);

  const canvasRatio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 128) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 12) visible += 1;
    return visible / Math.max(1, Math.ceil(pixels.length / 128));
  });
  expect(canvasRatio).toBeGreaterThan(0.03);
  expect(errors).toEqual([]);
});
