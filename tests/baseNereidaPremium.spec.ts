import { expect, test, type Page } from '@playwright/test';

test.setTimeout(600_000);

const ARTIFACT_ROOT = 'artifacts/nereida-base-premium';

type FrameDefinition = {
  name: string;
  target: string | [number, number, number];
  offset: [number, number, number];
  lookHeight: number;
};

const frames: FrameDefinition[] = [
  { name: '01-aerial-approach', target: 'Base Nereida', offset: [58, 46, 64], lookHeight: 3 },
  { name: '02-ground-complete', target: 'Base Nereida', offset: [26, 5.5, 34], lookHeight: 3.1 },
  { name: '03-landing-zone', target: 'Base Nereida Landing Operations', offset: [-30, 11, 31], lookHeight: 0.4 },
  { name: '04-access-boarding', target: 'Nereida Landing Access Spine', offset: [12, 4.5, 18], lookHeight: 1.1 },
  { name: '05-primary-core', target: 'Nereida Habitat Body', offset: [15, 7, 18], lookHeight: 4 },
  { name: '06-secondary-workshop', target: 'Nereida Workshop and Cargo Bay', offset: [-15, 6, 18], lookHeight: 2.4 },
  { name: '07-comms-landmark', target: 'Nereida Communications Spine', offset: [20, 15, 18], lookHeight: 7 },
  { name: '08-operational-access', target: 'Nereida Landing Access Spine', offset: [-13, 3.4, 16], lookHeight: 0.8 },
  { name: '09-parked-ship-base', target: [0, 0, -36], offset: [42, 18, 68], lookHeight: 2.2 },
  { name: '10-wide-nereida', target: 'Base Nereida', offset: [210, 90, 220], lookHeight: 4 }
];

async function bootOperationalBase(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    document.querySelectorAll('body *').forEach((element) => {
      if (element === canvas || element.contains(canvas)) return;
      (element as HTMLElement).style.setProperty('display', 'none', 'important');
    });
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.deployHabitat();
    const landingHeight = window.__arcaDebug?.getSurfaceGroundHeight(0, 0) ?? 0;
    window.__arcaDebug?.setPlayerPosition(0, landingHeight + 4, 0);
    window.__arcaDebug?.setPlayerMode('onFoot');
  });
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);
  await page.waitForFunction(
    () => window.__arcaDiagnostics?.habitatActivationStage === 'online',
    undefined,
    { timeout: 30_000 }
  );
  return errors;
}

async function setPremiumVisible(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((nextVisible) => {
    const scene = window.__arcaScene;
    const infrastructure = scene?.getObjectByName('Base Nereida Infrastructure');
    const landing = scene?.getObjectByName('Base Nereida Landing Operations');
    if (infrastructure) infrastructure.visible = nextVisible;
    if (landing) landing.visible = nextVisible;
  }, visible);
}

async function captureFrame(page: Page, folder: string, frame: FrameDefinition): Promise<void> {
  await page.evaluate((showShip) => {
    if (showShip) {
      window.__arcaDebug?.setShipWorldPosition([0, 4, 0]);
      window.__arcaDebug?.reconcileParkedShip();
    } else {
      window.__arcaDebug?.setShipWorldPosition([0, 40, 220]);
    }
  }, frame.name === '09-parked-ship-base');
  const result = await page.evaluate(({ target, offset, lookHeight }) =>
    window.__arcaDebug?.frameCameraTarget(target, offset, lookHeight), frame);
  expect(result, `camera target exists: ${frame.target}`).toBeTruthy();
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/${folder}/${frame.name}.png`, animations: 'disabled' });
}

async function measureScene(page: Page, name: string): Promise<Record<string, number | string>> {
  return page.evaluate((sceneName) => {
    const scene = window.__arcaScene;
    const renderer = window.__arcaRenderer;
    const habitat = scene?.getObjectByName('Nereida Habitat Body');
    let meshes = 0;
    let instancedMeshes = 0;
    let lights = 0;
    const materials = new Set<unknown>();
    const isWorldVisible = (object: import('three').Object3D) => {
      let current: import('three').Object3D | null = object;
      while (current) {
        if (!current.visible) return false;
        current = current.parent;
      }
      return true;
    };
    for (const root of [habitat]) {
      root?.traverse((object) => {
        if (!isWorldVisible(object)) return;
        const candidate = object as import('three').Object3D & {
          isMesh?: boolean;
          isInstancedMesh?: boolean;
          isLight?: boolean;
          intensity?: number;
          material?: unknown | unknown[];
        };
        if (candidate.isMesh) {
          meshes += 1;
          if (candidate.isInstancedMesh) instancedMeshes += 1;
          const objectMaterials = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
          objectMaterials.forEach((material) => { if (material) materials.add(material); });
        }
        if (candidate.isLight && (candidate.intensity ?? 0) > 0) lights += 1;
      });
    }
    return {
      scene: sceneName,
      fps: window.__arcaDiagnostics?.fps ?? 0,
      drawCalls: renderer?.info.render.calls ?? 0,
      triangles: renderer?.info.render.triangles ?? 0,
      meshes,
      instancedMeshes,
      lights,
      materials: materials.size
    };
  }, name);
}

test('Base Nereida premium: hierarchy, comparable captures and bounded LOD', async ({ page }, testInfo) => {
  const errors = await bootOperationalBase(page);

  const hierarchy = await page.evaluate(() => {
    const scene = window.__arcaScene;
    const count = (name: string) => {
      let total = 0;
      scene?.traverse((object) => { if (object.name === name) total += 1; });
      return total;
    };
    const base = scene?.getObjectByName('Módulo Hábitat Nereida-01')
      ?? scene?.getObjectByName('Nereida Habitat Body')?.parent;
    return {
      baseCount: base ? 1 : 0,
      infrastructureCount: count('Base Nereida Infrastructure'),
      landingOperationsCount: count('Base Nereida Landing Operations'),
      accessSpineCount: count('Nereida Landing Access Spine'),
      workshopCount: count('Nereida Workshop and Cargo Bay'),
      powerCount: count('Nereida Power and Life Support'),
      communicationsCount: count('Nereida Communications Spine'),
      basePosition: base?.position.toArray() ?? []
    };
  });
  expect(hierarchy.baseCount).toBe(1);
  expect(hierarchy.infrastructureCount).toBe(1);
  expect(hierarchy.landingOperationsCount).toBe(1);
  expect(hierarchy.accessSpineCount).toBe(1);
  expect(hierarchy.workshopCount).toBe(1);
  expect(hierarchy.powerCount).toBe(1);
  expect(hierarchy.communicationsCount).toBe(1);
  expect(hierarchy.basePosition[0]).toBeCloseTo(0, 2);
  expect(hierarchy.basePosition[2]).toBeCloseTo(-72, 2);

  const beforeMetrics: Record<string, number | string>[] = [];
  const afterMetrics: Record<string, number | string>[] = [];
  await setPremiumVisible(page, false);
  for (let i = 0; i < frames.length; i += 1) {
    await captureFrame(page, 'before', frames[i]);
    if (i < 3) beforeMetrics.push(await measureScene(page, frames[i].name));
  }

  await setPremiumVisible(page, true);
  for (let i = 0; i < frames.length; i += 1) {
    await captureFrame(page, 'after', frames[i]);
    if (i < 3) afterMetrics.push(await measureScene(page, frames[i].name));
  }

  const diagnostics = await page.evaluate(() => window.__arcaDebug?.getNereidaProceduralState());
  expect(diagnostics?.baseInfrastructure.architecturalSectors).toBe(5);
  expect(diagnostics?.baseInfrastructure.midDetailVisible).toBe(false);
  expect(diagnostics?.baseInfrastructure.closeDetailVisible).toBe(false);

  const nonBlankRatio = await page.evaluate(() => {
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
  expect(nonBlankRatio).toBeGreaterThan(0.03);
  expect(errors).toEqual([]);

  await testInfo.attach('nereida-base-premium-metrics', {
    body: JSON.stringify({ before: beforeMetrics, after: afterMetrics, hierarchy, diagnostics, nonBlankRatio }, null, 2),
    contentType: 'application/json'
  });
  console.log('NEREIDA_BASE_METRICS', JSON.stringify({ before: beforeMetrics, after: afterMetrics, hierarchy, diagnostics, nonBlankRatio }));
});
