import { expect, test, type Page } from '@playwright/test';

test.setTimeout(240000);

type HudDiagnostics = {
  visible: boolean;
  updateRateHz: number;
  targetId: string;
  targetOnScreen: boolean;
  leadSolutionValid: boolean;
  solutionState: string;
  range: number;
  closingSpeed: number;
  interceptTime: number;
  horizonMode: string;
  weapon: string;
  torpedoLocked: boolean;
  solutionErrorDegrees: number;
};

type CombatDebug = {
  setupCombatHudProbe: () => HudDiagnostics;
  setCombatWeaponMode: (mode: 'laser' | 'torpedo') => string;
  setCombatHudTargetMotion: (x: number, y: number, z: number) => [number, number, number];
  setCombatProbeShipVelocity: (x: number, y: number, z: number) => [number, number, number];
  orientShipToCombatTarget: () => string;
  getFlightCombatHudState: () => HudDiagnostics;
  clearCombatProbes: () => boolean;
  clearDialogueQueue: () => void;
};

async function ready(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 180000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible())) await launch.click();
  await page.waitForFunction(() => Boolean(window.__arcaDebug), undefined, { timeout: 30000 });
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).clearDialogueQueue());
}

test('combat HUD uses real boresight, velocity and predictive intercept symbology', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  await ready(page);

  await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    debug.setupCombatHudProbe();
    debug.orientShipToCombatTarget();
    debug.setCombatProbeShipVelocity(0, 0, -12);
  });

  await expect(page.locator('#flight-combat-hud')).toHaveClass(/is-active/, { timeout: 10000 });
  await expect.poll(async () => page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    return debug.getFlightCombatHudState();
  }), { timeout: 10000, intervals: [100] }).toMatchObject({
    visible: true,
    updateRateHz: 25,
    targetId: 'diagnostics-combat-target',
    targetOnScreen: true,
    leadSolutionValid: true,
    horizonMode: 'inertial',
    weapon: 'laser'
  });

  const laserState = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    return debug.getFlightCombatHudState();
  });
  expect(laserState.range).toBeGreaterThan(380);
  expect(laserState.range).toBeLessThan(500);
  expect(laserState.solutionState, `alignment error ${laserState.solutionErrorDegrees} deg`).toBe('solution');
  await expect(page.locator('[data-role="boresight"]')).toBeVisible();
  await expect(page.locator('[data-role="flight-path"]')).toBeVisible();
  await expect(page.locator('[data-role="target"]')).toBeVisible();
  await expect(page.locator('[data-role="lead-pipper"]')).toBeVisible();

  await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    debug.setCombatWeaponMode('torpedo');
    debug.setCombatHudTargetMotion(58, 0, 6);
  });
  await expect.poll(async () => page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    return debug.getFlightCombatHudState();
  }), { timeout: 10000, intervals: [100] }).toMatchObject({
    weapon: 'torpedo',
    torpedoLocked: true,
    leadSolutionValid: true
  });
  const torpedoState = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    return debug.getFlightCombatHudState();
  });
  expect(torpedoState.interceptTime).toBeGreaterThan(1.5);
  await expect(page.locator('[data-role="torpedo-lock"]')).toBeVisible();

  await page.screenshot({ path: 'test-results/combat-hud-reticle.png', fullPage: false });
  const nonBlankRatio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    let samples = 0;
    for (let index = 0; index < pixels.length; index += 64) {
      samples += 1;
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 8) visible += 1;
    }
    return visible / Math.max(1, samples);
  });
  expect(nonBlankRatio).toBeGreaterThan(0.01);
  expect(errors).toEqual([]);
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).clearCombatProbes());
});

test('combat HUD remains inside the safe area at 21:9', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 720 });
  await ready(page);
  await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    debug.setupCombatHudProbe();
    debug.orientShipToCombatTarget();
  });
  await expect(page.locator('#flight-combat-hud')).toHaveClass(/is-active/, { timeout: 10000 });
  const boxes = await page.locator('[data-role="heading-tape"], [data-role="boresight"], [data-role="target"]').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    })
  );
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(1720);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(720);
  }
  await page.screenshot({ path: 'test-results/combat-hud-reticle-21x9.png', fullPage: false });
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).clearCombatProbes());
});
