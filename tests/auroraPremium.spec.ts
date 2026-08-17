import { expect, test, type Page } from '@playwright/test';

test.setTimeout(900_000);

const ARTIFACT_ROOT = 'artifacts/aurora-premium';

const TO_AURORA_OPERATIONAL = [
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
  'completeMission17'
] as const;

type FrameDefinition = {
  name: string;
  target: string | [number, number, number];
  offset: [number, number, number];
  lookHeight: number;
};

const frames: FrameDefinition[] = [
  { name: '01-distant-approach', target: 'Aurora Settlement Infrastructure', offset: [178, 78, 168], lookHeight: 8 },
  { name: '02-medium-aerial', target: 'Aurora Settlement Infrastructure', offset: [88, 62, 94], lookHeight: 5 },
  { name: '03-complete-ground-view', target: 'Aurora Settlement Infrastructure', offset: [42, 7, 48], lookHeight: 2.2 },
  { name: '04-solar-thermal-landmark', target: 'Aurora Solar-Thermal Wing', offset: [46, 22, 43], lookHeight: 5 },
  { name: '05-landing-access', target: [180, 57, -4236], offset: [34, 14, 35], lookHeight: 1.2 },
  { name: '06-environmental-core', target: 'Aurora Environmental Analysis Gallery', offset: [25, 8, 27], lookHeight: 2.4 },
  { name: '07-hydrology-sector', target: [78, 57, -4263], offset: [23, 8, 24], lookHeight: 1.4 },
  { name: '08-materials-and-instruments', target: 'Aurora Solar-Thermal Wing', offset: [18, 8, 18], lookHeight: 3.3 },
  { name: '09-terrain-integration', target: [100, 58, -4236], offset: [-25, 10, 30], lookHeight: 0.8 },
  { name: '10-player-ship-scale', target: [160, 58, -4242], offset: [42, 19, 52], lookHeight: 3 },
  { name: '11-operational-lighting', target: 'Aurora Environmental Analysis Gallery', offset: [-28, 6, 30], lookHeight: 2.2 },
  { name: '12-wide-valley-context', target: 'Aurora Settlement Infrastructure', offset: [230, 105, 225], lookHeight: 8 }
];

async function bootOperationalAurora(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate((steps) => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    const debug = window.__arcaDebug as unknown as Record<string, () => unknown> | undefined;
    for (const step of steps) {
      try { debug?.[step]?.(); } catch { /* Later debug steps normalize their own prerequisites. */ }
    }
    window.__arcaDebug?.teleportToAuroraSample('soil');
    window.__arcaDebug?.setPlayerMode('onFoot');
    for (let index = 0; index < 20; index += 1) window.__arcaDebug?.advanceDialogue();
    const canvas = document.querySelector('#game-canvas');
    document.querySelectorAll('body *').forEach((element) => {
      if (element === canvas || element.contains(canvas)) return;
      (element as HTMLElement).style.setProperty('display', 'none', 'important');
    });
  }, TO_AURORA_OPERATIONAL);
  await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true, undefined, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  return errors;
}

async function setPremiumLayers(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate((nextEnabled) => {
    const infrastructure = window.__arcaScene?.getObjectByName('Aurora Settlement Infrastructure');
    infrastructure?.traverse((object) => {
      if (nextEnabled) object.layers.enable(0);
      else object.layers.disable(0);
    });
  }, enabled);
}

async function placeShipForFrame(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((showShip) => {
    if (!showShip) {
      window.__arcaDebug?.setShipWorldPosition([112, 120, -3990]);
      return;
    }
    const x = 160;
    const z = -4242;
    const ground = window.__arcaDebug?.getSurfaceGroundHeight(x, z) ?? 57;
    window.__arcaDebug?.setShipWorldPosition([x, ground + 4, z]);
    window.__arcaDebug?.reconcileParkedShip();
  }, visible);
}

async function captureFrame(page: Page, folder: string, frame: FrameDefinition): Promise<void> {
  await placeShipForFrame(page, frame.name === '10-player-ship-scale');
  const framed = await page.evaluate(({ target, offset, lookHeight }) =>
    window.__arcaDebug?.frameCameraTarget(target, offset, lookHeight), frame);
  expect(framed, `camera target exists: ${String(frame.target)}`).toBeTruthy();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/${folder}/${frame.name}.png`, animations: 'disabled' });
}

async function measureScene(page: Page, sceneName: string): Promise<Record<string, number | string>> {
  return page.evaluate((name) => {
    const renderer = window.__arcaRenderer;
    const infrastructure = window.__arcaScene?.getObjectByName('Aurora Settlement Infrastructure');
    let meshes = 0;
    let instancedMeshes = 0;
    let lights = 0;
    const materials = new Set<unknown>();
    infrastructure?.traverse((object) => {
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
        const source = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
        source.forEach((material) => { if (material) materials.add(material); });
      }
      if (candidate.isLight && (candidate.intensity ?? 0) > 0) lights += 1;
    });
    return {
      scene: name,
      fps: window.__arcaDiagnostics?.fps ?? 0,
      drawCalls: renderer?.info.render.calls ?? 0,
      triangles: renderer?.info.render.triangles ?? 0,
      meshes,
      instancedMeshes,
      materials: materials.size,
      lights
    };
  }, sceneName);
}

test('Aurora premium: distinct settlement, staged hierarchy, captures and bounded LOD', async ({ page }, testInfo) => {
  const errors = await bootOperationalAurora(page);

  const hierarchy = await page.evaluate(() => {
    const scene = window.__arcaScene;
    const count = (name: string) => {
      let total = 0;
      scene?.traverse((object) => { if (object.name === name) total += 1; });
      return total;
    };
    const infrastructure = scene?.getObjectByName('Aurora Settlement Infrastructure');
    const diagnostics = (infrastructure?.userData.getDiagnostics as (() => Record<string, unknown>) | undefined)?.();
    return {
      aurora01Count: infrastructure?.parent ? 1 : 0,
      aurora02Count: count('Aurora-02 Articulated Body'),
      infrastructureCount: count('Aurora Settlement Infrastructure'),
      environmentalGalleryCount: count('Aurora Environmental Analysis Gallery'),
      solarWingCount: count('Aurora Solar-Thermal Wing'),
      arrivalApronCount: count('Aurora Crew Arrival Apron'),
      hydrologyCount: count('Aurora Hydrology Spine'),
      playerShipInstances: window.__arcaDiagnostics?.playerShipInstances ?? 0,
      diagnostics
    };
  });
  expect(hierarchy.aurora01Count).toBe(1);
  expect(hierarchy.aurora02Count).toBe(1);
  expect(hierarchy.infrastructureCount).toBe(1);
  expect(hierarchy.environmentalGalleryCount).toBe(1);
  expect(hierarchy.solarWingCount).toBe(1);
  expect(hierarchy.arrivalApronCount).toBe(1);
  expect(hierarchy.hydrologyCount).toBe(1);
  expect(hierarchy.playerShipInstances).toBe(1);
  expect(hierarchy.diagnostics?.functionalSectors).toBe(5);
  expect(hierarchy.diagnostics?.lights).toBe(0);
  expect(hierarchy.diagnostics?.resupplyVisuals).toBe(false);

  const before: Record<string, number | string>[] = [];
  const after: Record<string, number | string>[] = [];
  await setPremiumLayers(page, false);
  for (let index = 0; index < frames.length; index += 1) {
    await captureFrame(page, 'before', frames[index]);
    if (index < 3) before.push(await measureScene(page, frames[index].name));
  }

  await setPremiumLayers(page, true);
  for (let index = 0; index < frames.length; index += 1) {
    await captureFrame(page, 'after', frames[index]);
    if (index < 3) after.push(await measureScene(page, frames[index].name));
  }

  await placeShipForFrame(page, false);
  expect(await page.evaluate(() => window.__arcaDebug?.frameCameraTarget([0, 0, -72], [42, 23, 48], 4))).toBeTruthy();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/comparison/01-nereida.png`, animations: 'disabled' });
  expect(await page.evaluate(() => window.__arcaDebug?.frameCameraTarget('Aurora Settlement Infrastructure', [75, 44, 80], 5))).toBeTruthy();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/comparison/02-aurora.png`, animations: 'disabled' });

  expect(await page.evaluate(() => window.__arcaDebug?.frameCameraTarget('Aurora Settlement Infrastructure', [420, 220, 420], 8))).toBeTruthy();
  await page.waitForTimeout(500);
  const farDiagnostics = await page.evaluate(() => {
    const infrastructure = window.__arcaScene?.getObjectByName('Aurora Settlement Infrastructure');
    return (infrastructure?.userData.getDiagnostics as (() => Record<string, unknown>) | undefined)?.();
  });
  expect(farDiagnostics?.midDetailVisible).toBe(false);
  expect(farDiagnostics?.closeDetailVisible).toBe(false);

  const forbiddenNames = await page.evaluate(() => {
    const infrastructure = window.__arcaScene?.getObjectByName('Aurora Settlement Infrastructure');
    const names: string[] = [];
    infrastructure?.traverse((object) => {
      if (/resupply|rearm|refill|reabaste|municion|ammo/i.test(object.name)) names.push(object.name);
    });
    return names;
  });
  expect(forbiddenNames).toEqual([]);

  const nonBlankRatio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 128) {
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 12) visible += 1;
    }
    return visible / Math.max(1, Math.ceil(pixels.length / 128));
  });
  expect(nonBlankRatio).toBeGreaterThan(0.03);
  expect(errors).toEqual([]);

  const report = { before, after, hierarchy, farDiagnostics, nonBlankRatio };
  await testInfo.attach('aurora-premium-metrics', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json'
  });
  console.log('AURORA_PREMIUM_METRICS', JSON.stringify(report));
});
