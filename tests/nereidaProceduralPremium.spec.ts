import { expect, test, type Page } from '@playwright/test';

test.setTimeout(600_000);

const OUT = 'artifacts/nereida-premium/after';

type Vec3 = [number, number, number];

type NereidaDebug = {
  clearSave: () => boolean;
  clearDialogueQueue: () => number;
  startSurfacePhase: () => string;
  makeBaseOperational: () => boolean;
  hideExternalHudForCockpitCapture: (hidden: boolean) => boolean;
  setRenderProfile: (profile: 'performance' | 'high' | 'ultra') => unknown;
  frameCameraTarget: (target: string | Vec3, offset: Vec3, lookHeight?: number) => unknown;
  liftShipToAltitude: (metres?: number) => number;
  setShipVelocity: (x: number, y: number, z: number) => Vec3;
  getPerformanceSnapshot: () => {
    fps: number;
    drawCalls: number;
    triangles: number;
    activeParticles: number;
  };
  getNereidaProceduralState: () => {
    seed: number;
    detailProfile: 'performance' | 'high' | 'ultra';
    exclusionZones: number;
    rockClusters: number;
    visibleRockClusters: number;
    rockInstances: number;
    maximumRockInstances: number;
  };
};

type NereidaMetrics = {
  fps: number;
  sampledFps: number;
  drawCalls: number;
  triangles: number;
  activeParticles: number;
  meshes: number;
  instancedMeshes: number;
  decorativeInstances: number;
};

async function capture(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(650);
  await page.locator('#game-canvas').screenshot({ path: `${OUT}/${name}.png` });
}

async function measure(page: Page): Promise<NereidaMetrics> {
  const sampledFps = await page.evaluate(() => new Promise<number>((resolve) => {
    let frames = 0;
    const startedAt = performance.now();
    const sample = (now: number) => {
      frames += 1;
      if (now - startedAt >= 1_500) {
        resolve(Math.round((frames * 1_000) / (now - startedAt)));
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  return page.evaluate((sampledFps) => {
    const debug = window.__arcaDebug as unknown as NereidaDebug;
    const performance = debug.getPerformanceSnapshot();
    const world = window.__arcaScene?.getObjectByName('PlanetaryWorld (Cuenca Nereida)');
    let meshes = 0;
    let instancedMeshes = 0;
    let decorativeInstances = 0;
    world?.traverse((object) => {
      const candidate = object as typeof object & {
        isMesh?: boolean;
        isInstancedMesh?: boolean;
        count?: number;
      };
      if (!candidate.isMesh || !object.visible) return;
      meshes += 1;
      if (candidate.isInstancedMesh) {
        instancedMeshes += 1;
        decorativeInstances += candidate.count ?? 0;
      }
    });
    return {
      fps: performance.fps,
      sampledFps,
      drawCalls: performance.drawCalls,
      triangles: performance.triangles,
      activeParticles: performance.activeParticles,
      meshes,
      instancedMeshes,
      decorativeInstances
    };
  }, sampledFps);
}

test('captures comparable Nereida geology views and budgets', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as NereidaDebug;
    debug.clearSave();
    debug.clearDialogueQueue();
    debug.startSurfacePhase();
    debug.makeBaseOperational();
    debug.setRenderProfile('high');
    debug.hideExternalHudForCockpitCapture(true);
    debug.setShipVelocity(0, 0, 0);
  });

  const frame = (target: Vec3, offset: Vec3, lookHeight = 0) => page.evaluate(
    ({ target, offset, lookHeight }) =>
      (window.__arcaDebug as unknown as NereidaDebug).frameCameraTarget(target, offset, lookHeight),
    { target, offset, lookHeight }
  );

  await frame([0, 0, -72], [38, 8, 42], 1.5);
  await capture(page, '01-base-ground');
  const base = await measure(page);

  await frame([0, 0, 0], [28, 10, 30], 0.5);
  await capture(page, '02-landing-area');

  await frame([0, 12, -260], [0, 18, 92], 6);
  await capture(page, '03-horizon');

  await frame([-168, 8, -128], [28, 10, 34], 5);
  await capture(page, '04-near-formation');

  await frame([208, 5, 44], [42, 16, 48], 4);
  await capture(page, '05-medium-cluster');

  await frame([82, 1, -24], [46, 13, 52], 1);
  await capture(page, '06-open-plain');

  await page.evaluate(() => (window.__arcaDebug as unknown as NereidaDebug).liftShipToAltitude(30));
  await page.evaluate(() => (window.__arcaDebug as unknown as NereidaDebug).frameCameraTarget('Nave', [30, 12, 38], 0.5));
  await capture(page, '07-flight-30m');
  const lowFlight = await measure(page);

  await page.evaluate(() => (window.__arcaDebug as unknown as NereidaDebug).liftShipToAltitude(100));
  await page.evaluate(() => (window.__arcaDebug as unknown as NereidaDebug).frameCameraTarget('Nave', [70, 48, 84], 0));
  await capture(page, '08-flight-100m');

  await page.evaluate(() => (window.__arcaDebug as unknown as NereidaDebug).liftShipToAltitude(420));
  await page.evaluate(() => (window.__arcaDebug as unknown as NereidaDebug).frameCameraTarget('Nave', [180, 145, 220], 0));
  await capture(page, '09-flight-420m');

  await frame([0, 0, 0], [380, 420, 520], 0);
  await capture(page, '10-world-wide');
  const wide = await measure(page);
  const procedural = await page.evaluate(() =>
    (window.__arcaDebug as unknown as NereidaDebug).getNereidaProceduralState()
  );

  console.log('NEREIDA_METRICS', JSON.stringify({ base, lowFlight, wide, procedural }));
  expect(base.instancedMeshes).toBeGreaterThanOrEqual(2);
  expect(base.decorativeInstances).toBeGreaterThan(100);
  expect(procedural.seed).toBe(2189.071);
  expect(procedural.maximumRockInstances).toBeLessThan(158);
  expect(errors).toEqual([]);
});
