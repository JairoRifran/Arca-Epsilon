import { expect, test } from '@playwright/test';

test.setTimeout(360_000);

test('performance flag exposes only the live performance authority', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?debugPerformance=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });

  const surface = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as Record<string, unknown> | undefined;
    return {
      exists: Boolean(debug),
      profileFrames: typeof debug?.profileFrames,
      setRenderDiagnostic: typeof debug?.setRenderDiagnostic,
      getRenderDiagnosticState: typeof debug?.getRenderDiagnosticState,
      resetRenderDiagnostics: typeof debug?.resetRenderDiagnostics,
      missionCheatExposed: typeof debug?.startMission25 === 'function'
    };
  });
  expect(surface).toEqual({
    exists: true,
    profileFrames: 'function',
    setRenderDiagnostic: 'function',
    getRenderDiagnosticState: 'function',
    resetRenderDiagnostics: 'function',
    missionCheatExposed: false
  });

  const profile = await page.evaluate(() => window.__arcaDebug?.profileFrames('smoke-test', 3));
  expect(profile?.label).toBe('smoke-test');
  expect(profile?.frames.frames).toBeGreaterThan(0);
  expect(profile?.device.drawingBufferWidth).toBeGreaterThan(0);

  await page.keyboard.press('F9');
  await expect(page.locator('#performance-debug-overlay')).toBeVisible();
  await expect(page.locator('#performance-debug-overlay')).toContainText('P95');
  await page.keyboard.press('F9');
  await expect(page.locator('#performance-debug-overlay')).toBeHidden();

  await page.evaluate(() => window.__arcaDebug?.setRenderDiagnostic({ bypassPost: true }));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect((await page.evaluate(() => window.__arcaDebug?.getRenderDiagnosticState()))?.lastRenderPath).toBe('direct');

  await page.evaluate(() => window.__arcaDebug?.resetRenderDiagnostics());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect((await page.evaluate(() => window.__arcaDebug?.getRenderDiagnosticState()))?.lastRenderPath).toBe('post');

  await page.evaluate(() => window.__arcaDebug?.setRenderDiagnostic({
    bypassPost: true,
    pixelRatio: 1.5,
    shadows: true
  }));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const configured = await page.evaluate(() => window.__arcaDebug?.getRenderDiagnosticState());
  expect(configured?.actualPixelRatio).toBe(1.5);
  expect(configured?.shadowsEnabled).toBe(true);
  expect(configured?.lastRenderPath).toBe('direct');
  await page.evaluate(() => window.__arcaDebug?.resetRenderDiagnostics());
  const optimizedPost = await page.evaluate(() => window.__arcaDebug?.getRenderDiagnosticState()) as {
    composerSamples: number;
    bloomScale: number;
    fusedOutputGrade: boolean;
  };
  expect(optimizedPost?.composerSamples).toBe(0);
  expect(optimizedPost?.bloomScale).toBe(0.75);
  expect(optimizedPost?.fusedOutputGrade).toBe(true);

  await page.evaluate(() => window.__arcaDebug?.setRenderDiagnostic({
    composerSamples: 4,
    bloomScale: 1,
    fusedOutputGrade: false,
    postPasses: { bloom: false }
  }));
  const isolatedPass = await page.evaluate(() => window.__arcaDebug?.getRenderDiagnosticState()) as {
    composerSamples: number;
    bloomScale: number;
    fusedOutputGrade: boolean;
    postPasses: Record<string, boolean>;
  };
  expect(isolatedPass?.composerSamples).toBe(4);
  expect(isolatedPass?.bloomScale).toBe(1);
  expect(isolatedPass?.fusedOutputGrade).toBe(false);
  expect(isolatedPass.postPasses.bloom).toBe(false);
  await page.evaluate(() => window.__arcaDebug?.resetRenderDiagnostics());
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('normal runtime does not expose the performance surface', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__arcaDebug)).toBeUndefined();
  expect(await page.locator('#performance-debug-overlay').count()).toBe(0);
});
