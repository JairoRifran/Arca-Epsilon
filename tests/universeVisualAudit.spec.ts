import { expect, test, type Page } from '@playwright/test';

test.setTimeout(1_800_000);

const outputDirectory = 'artifacts/universe-pass/after';

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

type SceneMetrics = {
  fps: number;
  drawCalls: number;
  triangles: number;
  visibleMeshes: number;
  visiblePoints: number;
  visibleSprites: number;
  materials: number;
  transparentMaterials: number;
  visiblePointLights: number;
  activeParticles: number;
  activeEnemies: number;
  enemyProjectiles: number;
  weaponProjectiles: number;
  activeCombatEffects: number;
  nonBlankRatio: number;
  dynamicRange: number;
};

async function measure(page: Page): Promise<SceneMetrics> {
  await page.waitForTimeout(2_600);
  return page.evaluate(() => {
    const scene = window.__arcaScene;
    const diagnostics = window.__arcaDiagnostics;
    const debug = window.__arcaDebug as unknown as {
      getEnemyCombatVisualState?: () => {
        activeEnemies?: number;
        activeProjectiles?: number;
        activeMuzzleFlashes?: number;
        activeDamageRigs?: number;
      };
      getWeaponVisualState?: () => {
        activeProjectiles?: number;
        flashesActive?: number;
        impactsActive?: number;
        decalsActive?: number;
        destructionsActive?: number;
        fragmentsActive?: number;
      };
    } | undefined;
    const enemyCombat = debug?.getEnemyCombatVisualState?.();
    const weaponCombat = debug?.getWeaponVisualState?.();
    const materials = new Map<string, { transparent: boolean }>();
    let visibleMeshes = 0;
    let visiblePoints = 0;
    let visibleSprites = 0;
    let visiblePointLights = 0;

    scene?.traverseVisible((object) => {
      const typedObject = object as typeof object & {
        isMesh?: boolean; isPoints?: boolean; isSprite?: boolean; isPointLight?: boolean;
        material?: { uuid: string; transparent: boolean } | Array<{ uuid: string; transparent: boolean }>;
      };
      if (typedObject.isMesh) visibleMeshes += 1;
      if (typedObject.isPoints) visiblePoints += 1;
      if (typedObject.isSprite) visibleSprites += 1;
      if (typedObject.isPointLight) visiblePointLights += 1;
      const renderable = typedObject;
      if (!('material' in renderable) || !renderable.material) return;
      const entries = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of entries) materials.set(material.uuid, { transparent: material.transparent });
    });

    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    let sampled = 0;
    let nonBlank = 0;
    let minLuma = 255;
    let maxLuma = 0;
    if (gl) {
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (let y = 0; y < height; y += 8) {
        for (let x = 0; x < width; x += 8) {
          const index = (y * width + x) * 4;
          const luma = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
          sampled += 1;
          if (luma > 5) nonBlank += 1;
          minLuma = Math.min(minLuma, luma);
          maxLuma = Math.max(maxLuma, luma);
        }
      }
    }

    return {
      fps: diagnostics?.fps ?? 0,
      drawCalls: diagnostics?.drawCalls ?? 0,
      triangles: diagnostics?.triangles ?? 0,
      visibleMeshes,
      visiblePoints,
      visibleSprites,
      materials: materials.size,
      transparentMaterials: [...materials.values()].filter((material) => material.transparent).length,
      visiblePointLights,
      activeParticles: diagnostics?.activeParticles ?? 0,
      activeEnemies: enemyCombat?.activeEnemies ?? 0,
      enemyProjectiles: enemyCombat?.activeProjectiles ?? 0,
      weaponProjectiles: weaponCombat?.activeProjectiles ?? 0,
      activeCombatEffects:
        (enemyCombat?.activeMuzzleFlashes ?? 0) +
        (enemyCombat?.activeDamageRigs ?? 0) +
        (weaponCombat?.flashesActive ?? 0) +
        (weaponCombat?.impactsActive ?? 0) +
        (weaponCombat?.decalsActive ?? 0) +
        (weaponCombat?.destructionsActive ?? 0) +
        (weaponCombat?.fragmentsActive ?? 0),
      nonBlankRatio: sampled > 0 ? nonBlank / sampled : 0,
      dynamicRange: maxLuma - minLuma
    };
  });
}

async function frame(
  page: Page,
  name: string,
  target: string | [number, number, number],
  offset: [number, number, number],
  lookHeight = 0
): Promise<SceneMetrics> {
  await page.evaluate(({ target, offset, lookHeight }) => {
    window.__arcaDebug?.frameCameraTarget(target, offset, lookHeight);
    window.__arcaDebug?.clearDialogueQueue();
  }, { target, offset, lookHeight });
  const metrics = await measure(page);
  await page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: false });
  expect(metrics.nonBlankRatio, `${name} canvas`).toBeGreaterThan(0.01);
  expect(metrics.dynamicRange, `${name} dynamic range`).toBeGreaterThan(20);
  return metrics;
}

test('captures comparable universe scenes and performance budgets', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.setPremiumAutoQualityEnabled(false);
    window.__arcaDebug?.setRenderProfile('performance');
  });

  const metrics: Record<string, SceneMetrics> = {};

  await page.evaluate(() => {
    window.__arcaDebug?.clearCameraLookAt();
    window.__arcaDebug?.inspectShipFeature('engines', 0, 8, 16);
    window.__arcaDebug?.setShipVelocity(0, 0, -2);
  });
  metrics.engineLow = await measure(page);
  await page.screenshot({ path: `${outputDirectory}/09-engine-low-thrust.png`, fullPage: false });

  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(2_000);
  metrics.engineBoost = await measure(page);
  await page.screenshot({ path: `${outputDirectory}/10-engine-boost.png`, fullPage: false });
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.__arcaDebug?.clearShipFeatureInspection());

  metrics.deepSpace = await frame(page, '01-deep-space', [0, 720, -1500], [0, 0, 4]);
  metrics.ship = await frame(page, '02-ship-and-stars', 'Nave', [19, 8, 28], 0.5);
  metrics.planet = await frame(page, '03-planet', 'Gas Giant Tharsis-9 Premium', [470, 190, 680]);
  metrics.arkFar = await frame(page, '04-ark-far', 'Arca Epsilon Mothership', [410, 170, 560]);
  metrics.arkNear = await frame(page, '05-ark-near', 'Arca Epsilon Mothership', [105, 46, 145]);
  metrics.asteroids = await frame(page, '06-asteroid-field', 'Asteroid Field', [300, 125, 300]);
  metrics.debris = await frame(page, '07-orbital-debris', 'Veyra Fracture Debris Field', [270, 115, 330]);
  await frame(page, '07b-technological-debris', 'Derelict Wreck', [92, 44, 118]);

  await page.evaluate((sequence) => {
    window.__arcaDebug?.clearCameraLookAt();
    const debug = window.__arcaDebug as unknown as Record<string, (argument?: unknown) => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
    debug?.startMission20?.();
    debug?.setPlayerMode?.('ship');
    debug?.liftShipToAltitude?.(2_500);
    debug?.rendezvousWithArk?.();
    debug?.restoreArkLink?.(2);
    debug?.clearDialogueQueue?.();
  }, TO_M18);

  await expect.poll(async () => {
    await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
    return page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()?.orbitalEnvironmentActive === true);
  }, { timeout: 240_000, intervals: [1_500] }).toBe(true);
  await page.evaluate(() => {
    window.__arcaDebug?.rendezvousWithArk();
    window.__arcaDebug?.restoreArkLink(2);
    window.__arcaDebug?.clearDialogueQueue();
  });
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__arcaDebug?.getHostileContactState()) as { activeEnemyCount?: number };
    return state?.activeEnemyCount ?? 0;
  }, { timeout: 90_000, intervals: [1_000] }).toBeGreaterThan(0);
  metrics.m20Battle = await frame(page, '08-m20-battle', 'Arca Epsilon Mothership', [280, 125, 390]);

  console.log('UNIVERSE_METRICS', JSON.stringify(metrics));
  expect(errors).toEqual([]);
});

test('keeps the universe canvas framed on a mobile viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.setPremiumAutoQualityEnabled(false);
    window.__arcaDebug?.setRenderProfile('performance');
    window.__arcaDebug?.frameCameraTarget('Nave', [22, 9, 32], 0.5);
  });

  const metrics = await measure(page);
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight
  }));
  await page.screenshot({ path: `${outputDirectory}/11-mobile-ship-and-stars.png`, fullPage: false });

  expect(metrics.nonBlankRatio).toBeGreaterThan(0.01);
  expect(metrics.dynamicRange).toBeGreaterThan(20);
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.innerHeight);
  expect(errors).toEqual([]);
});
