import { expect, test, type Page } from '@playwright/test';
import { auroraSettlementLayout } from '../src/assets/auroraSettlementLayout';
import type { SaveGameData } from '../src/game/SaveSystem';
import type { CameraMode } from '../src/game/CameraModeSystem';
import type { CockpitGlbStatus } from '../src/entities/CockpitInterior';
import type { ObjectiveDisplay } from '../src/game/ObjectiveResolver';
import type { CharacterControlState, PlayerMode } from '../src/game/PlayerModeSystem';
import type { SurfaceResourceType } from '../src/assets/surfaceResourceDefinitions';
import type { GameInputAction, InputActionState } from '../src/game/InputActionRouter';
import type { DescentSafetySnapshot } from '../src/game/DescentSafetyGate';
import type { ResourceSiteTerrainMetric } from '../src/game/PlanetaryWorld';
import type { ArcaDiagnostics } from '../src/core/Diagnostics';
import type { DialogueState } from '../src/game/DialogueManager';
import type {
  AudioDebugState,
  CameraLookAtInput,
  CameraProbeResult,
  DefenseNetworkVisualState,
  Mission03DebugState,
  Mission04DebugState,
  Mission05DebugState,
  RuntimeAssetAuditEntry
} from '../src/main';

test.setTimeout(600000);

async function expectNoPageErrors(page: Page, action: () => Promise<void>): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await action();
  expect(errors).toEqual([]);
}

async function expectNonBlankWebGLCanvas(page: Page): Promise<void> {
  const audit = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    if (!canvas) return { sampled: 0, nonBlankRatio: 0, dynamicRange: 0 };
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { sampled: 0, nonBlankRatio: 0, dynamicRange: 0 };

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let sampled = 0;
    let nonBlank = 0;
    let minLuma = 255;
    let maxLuma = 0;
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
    return { sampled, nonBlankRatio: nonBlank / Math.max(1, sampled), dynamicRange: maxLuma - minLuma };
  });

  expect(audit.sampled).toBeGreaterThan(1000);
  expect(audit.nonBlankRatio).toBeGreaterThan(0.05);
  expect(audit.dynamicRange).toBeGreaterThan(30);
}

test('loads the GLB mothership and renders cinematic gameplay', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await expect(page.locator('.boot-screen h1')).toHaveText('Arca Epsilon');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });

    const diagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(diagnostics?.mothershipStatus).toBe('loaded');
    expect(diagnostics?.mothershipPath).toBe('/models/optimized/arca-epsilon.medium.glb');
    expect(diagnostics?.mothershipMeshCount).toBeGreaterThan(0);
    expect(diagnostics?.mothershipTriangles).toBeLessThanOrEqual(220_000);
    expect(diagnostics?.mothershipVisible).toBe(true);
    expect(diagnostics?.playerShipStatus).toBe('loaded');
    expect(diagnostics?.playerShipPath).toBe('/models/optimized/scout-ship.medium.glb');
    expect(diagnostics?.playerShipMeshCount).toBeGreaterThan(0);
    expect(diagnostics?.playerShipTriangles).toBeLessThanOrEqual(130_000);
    expect(diagnostics?.playerShipVisible).toBe(true);
    expect(diagnostics?.orbitalMarkerStatus).toBe('loaded');
    expect(diagnostics?.orbitalMarkerPath).toBe('/models/optimized/atlas-marker.medium.glb');
    expect(diagnostics?.orbitalMarkerMeshCount).toBeGreaterThan(0);
    expect(diagnostics?.orbitalMarkerTriangles).toBeLessThanOrEqual(200_000);
    expect(diagnostics?.orbitalMarkerVisible).toBe(true);
    expect(diagnostics?.cockpitGlbStatus).toBe('loaded');
    expect(diagnostics?.cockpitGlbPath).toBe('/models/cockpit-interior.glb');
    expect(diagnostics?.cockpitGlbMeshCount).toBeGreaterThan(0);
    expect(diagnostics?.cockpitGlbMaterialCount).toBeGreaterThan(0);
    expect(diagnostics?.cockpitGlbTriangleCount).toBeGreaterThan(100000);
    expect(diagnostics?.cockpitScreenCount).toBe(4);
    expect(diagnostics?.cockpitScreenUpdateRate).toBeGreaterThan(0);
    expect(diagnostics?.cockpitScreenUpdateRate).toBeLessThanOrEqual(8);
    expect(diagnostics?.cockpitDustParticleCount).toBeGreaterThan(0);
    expect(diagnostics?.cockpitDustParticleCount).toBeLessThanOrEqual(32);
    expect(diagnostics?.cockpitActiveDustParticles).toBe(0);
    expect(diagnostics?.activePOIs).toBeGreaterThanOrEqual(6);
    expect(diagnostics?.lodActive).toBe(true);
    expect(diagnostics?.lodLevelCharacter).toBe('hidden');
    expect(diagnostics?.lodLevelCockpit).toBe('hidden');
    expect(diagnostics?.atlasLodLevel).toBe('low');
    expect(diagnostics?.arcaLodLevel).toBe('medium');
    expect(diagnostics?.shipLodLevel).toBe('medium');
    expect(diagnostics?.cockpitLodLevel).toBe('hidden');
    expect(diagnostics?.pilotLodLevel).toBe('hidden');
    expect(diagnostics?.activeTriangleEstimate).toBeGreaterThan(300_000);
    expect(diagnostics?.activeTriangleEstimate).toBeLessThan(500_000);
    expect(diagnostics?.assetPreloadQueue).toEqual([]);
    expect(diagnostics?.preloadCompleted).toBe(true);
    expect(diagnostics?.visibleCharacterMeshCount).toBe(0);
    expect(diagnostics?.activeCharacterSkinnedMeshCount).toBe(0);
    expect(diagnostics?.visibleCharacterTriangleCount).toBe(0);
    expect(diagnostics?.loadedAnimationSources).toBe(1);
    expect(diagnostics?.discardedDuplicateMeshes).toBe(0);
    expect(diagnostics?.characterClipCount).toBeGreaterThanOrEqual(2);
    expect(diagnostics?.mixerActive).toBe(false);
    expect(diagnostics?.activeAnimationMixerCount).toBe(0);
    expect(diagnostics?.cockpitTextureUpdateCount).toBe(0);
    expect(diagnostics?.duplicateMeshWarnings).toEqual([]);
    expect(await page.evaluate(() => window.__arcaDebug?.validateNoDuplicateCharacterMeshes())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.validateNoDuplicateCockpitMeshes())).toBe(true);
    const assetAudit = await page.evaluate(() => window.__arcaDebug?.getAssetAudit() ?? []);
    const fullRunSource = assetAudit.find((asset) => asset.id === 'pilot-run-source');
    const animationOnlyRunSource = assetAudit.find((asset) => asset.id === 'pilot-run-animation');
    const atlasMedium = assetAudit.find((asset) => asset.id === 'atlas-marker-medium');
    const atlasLow = assetAudit.find((asset) => asset.id === 'atlas-marker-low');
    const atlasOriginal = assetAudit.find((asset) => asset.id === 'atlas-marker-original');
    const arcaMedium = assetAudit.find((asset) => asset.id === 'mothership-medium');
    const scoutMedium = assetAudit.find((asset) => asset.id === 'player-ship-medium');
    expect(fullRunSource?.loadedAtStartup).toBe(false);
    expect(fullRunSource?.active).toBe(false);
    expect(animationOnlyRunSource?.status).toBe('loaded');
    expect(animationOnlyRunSource?.bytes).toBeLessThan(20_000);
    expect(animationOnlyRunSource?.meshCount).toBe(0);
    expect(atlasMedium?.status).toBe('loaded');
    expect(atlasLow?.status).toBe('loaded');
    expect(atlasOriginal?.active).toBe(false);
    expect(arcaMedium?.status).toBe('loaded');
    expect(scoutMedium?.status).toBe('loaded');
    const sceneAnalysis = await page.evaluate(() => {
      const names: string[] = [];
      let orbitalMarkerHasTorus = false;
      let landingZoneHasTorusOrCone = false;

      window.__arcaScene?.traverse((object) => {
        names.push(object.name);
      });

      // Verify OrbitalMarker group has no procedural torus rings
      const orbitalMarkerObj = window.__arcaScene?.getObjectByName('Marcador Atlas');
      orbitalMarkerObj?.traverse((child) => {
        if ((child as any).geometry?.type === 'TorusGeometry') orbitalMarkerHasTorus = true;
      });

      // Verify LandingZone group has no torus rings or giant cones
      const landingZoneObj = window.__arcaScene?.getObjectByName('Cuenca Nereida - Zona de Aterrizaje');
      landingZoneObj?.traverse((child) => {
        const type = (child as any).geometry?.type;
        if (type === 'TorusGeometry' || type === 'ConeGeometry') landingZoneHasTorusOrCone = true;
      });

      return { names, orbitalMarkerHasTorus, landingZoneHasTorusOrCone };
    });
    expect(sceneAnalysis.names.some((name) => name.includes('Alien Ruin (lighthouse)'))).toBe(false);
    expect(sceneAnalysis.names.some((name) => name.includes('Marcador Atlas GLB'))).toBe(true);
    expect(sceneAnalysis.names).toContain('E-01 Water Sun Glint');
    expect(sceneAnalysis.names).toContain('E-01 Twilight Terminator Shell');
    expect(sceneAnalysis.orbitalMarkerHasTorus).toBe(false);
    expect(sceneAnalysis.landingZoneHasTorusOrCone).toBe(false);

    await expect(page.locator('#launch-button')).toBeEnabled();
    await page.locator('#launch-button').dispatchEvent('click');
    await expect(page.locator('#hud')).toHaveClass(/is-active/);
    await expect(page.locator('#home-marker')).toBeVisible();
    await expect(page.locator('.objective-panel')).toBeVisible();
    await expect(page.locator('#mission-name')).toContainText('Perímetro de Arca Epsilon');
    await expect(page.locator('#objective-text')).toContainText(/zona segura|escáner/i);
    await expect(page.locator('#objective-marker')).toBeVisible();
    await expect(page.locator('#safezone-readout')).toContainText(/Zona segura|Retorno/);
    await expect(page.locator('#game-canvas')).toBeVisible();
    const initialObjective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(initialObjective?.step).toBe('scannerTutorial');
    expect(initialObjective?.key).toBe('E');
    expect(initialObjective?.target).toContain('E-01');
    expect(initialObjective?.missionTitle).toContain('Mision 01');
    expect(initialObjective?.stepTitle).toContain('Perímetro');
    expect(initialObjective?.objectiveText).toContain('zona segura');
    expect(initialObjective?.keyHint).toBe('E');

    // Cockpit mode is optional, reversible and uses real CanvasTexture instruments.
    await page.keyboard.press('KeyV');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.cameraMode === 'cockpit' && window.__arcaDiagnostics?.cockpitActive === true,
      undefined,
      { timeout: 30000 }
    );
    const cockpitAudit = await page.evaluate(() => {
      const cockpit = window.__arcaScene?.getObjectByName('Cockpit Interior');
      let screenCount = 0;
      let canvasTextureCount = 0;
      let screensWithDepthTest = 0;
      let embeddedScreenCount = 0;
      let importedCockpitMeshCount = 0;
      const screenDepths: number[] = [];
      const screenRoles = new Set<string>();
      cockpit?.traverse((object) => {
        if (object.parent?.name === 'Cockpit Interior GLB Source' && (object as any).isMesh) importedCockpitMeshCount += 1;
        const material = (object as any).material;
        if (material?.map?.isCanvasTexture) {
          canvasTextureCount += 1;
          screenCount += 1;
          if (material.depthTest === true) screensWithDepthTest += 1;
          if (object.parent?.name.startsWith('Cockpit Embedded Display Mount')) {
            embeddedScreenCount += 1;
            screenRoles.add(object.parent.name.replace('Cockpit Embedded Display Mount ', ''));
          }
          screenDepths.push(object.position.z);
        }
      });
      const fallback = window.__arcaScene?.getObjectByName('Cockpit Procedural Fallback');
      let fallbackRenderableCount = 0;
      fallback?.traverse((object) => {
        if ((object as any).isMesh || (object as any).isLineSegments || (object as any).isPoints) {
          fallbackRenderableCount += 1;
        }
      });
      const canopy = window.__arcaScene?.getObjectByName('Cockpit GLB Clear Canopy Layer') as any;
      const dust = window.__arcaScene?.getObjectByName('Cockpit GLB Canopy Dust Specks') as any;
      return {
        exists: Boolean(cockpit),
        visible: cockpit?.visible,
        screenCount,
        canvasTextureCount,
        screensWithDepthTest,
        embeddedScreenCount,
        screenDepths,
        screenRoles: [...screenRoles].sort(),
        importedCockpitMeshCount,
        fallbackRenderableCount,
        importedShellVisible: window.__arcaScene?.getObjectByName('Cockpit GLB Physical Shell')?.visible,
        fallbackVisible: window.__arcaScene?.getObjectByName('Cockpit Procedural Fallback')?.visible,
        canopyOpacity: canopy?.material?.opacity ?? 1,
        canopyDepthWrite: canopy?.material?.depthWrite ?? true,
        dustCount: dust?.geometry?.attributes?.position?.count ?? 0,
        diagnostics: window.__arcaDiagnostics
      };
    });
    expect(cockpitAudit.exists).toBe(true);
    expect(cockpitAudit.visible).toBe(true);
    expect(cockpitAudit.screenCount).toBe(4);
    expect(cockpitAudit.canvasTextureCount).toBe(4);
    expect(cockpitAudit.screensWithDepthTest).toBe(4);
    expect(cockpitAudit.embeddedScreenCount).toBe(4);
    expect(cockpitAudit.screenRoles).toEqual(['center', 'left', 'lower', 'right']);
    expect(cockpitAudit.screenDepths.every((depth) => depth > 0.035 && depth < 0.055)).toBe(true);
    expect(cockpitAudit.importedCockpitMeshCount).toBeGreaterThan(0);
    expect(cockpitAudit.fallbackRenderableCount).toBeGreaterThan(20);
    expect(cockpitAudit.importedShellVisible).toBe(true);
    expect(cockpitAudit.fallbackVisible).toBe(false);
    expect(cockpitAudit.canopyOpacity).toBeGreaterThan(0);
    expect(cockpitAudit.canopyOpacity).toBeLessThan(0.08);
    expect(cockpitAudit.canopyDepthWrite).toBe(false);
    expect(cockpitAudit.dustCount).toBeGreaterThan(0);
    expect(cockpitAudit.dustCount).toBeLessThanOrEqual(32);
    expect(cockpitAudit.diagnostics?.cockpitDrawCalls).toBeGreaterThan(8);
    expect(cockpitAudit.diagnostics?.cockpitActiveDustParticles).toBe(cockpitAudit.dustCount);
    expect(cockpitAudit.diagnostics?.cockpitTextureUpdateCount).toBeGreaterThan(0);
    expect(cockpitAudit.diagnostics?.mixerActive).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.validateNoDuplicateCockpitMeshes())).toBe(true);

    expect(await page.evaluate(() => window.__arcaDebug?.showCockpitScreenAnchors(true))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.cockpitScreenAnchorsVisible === true);
    expect(await page.evaluate(() => window.__arcaDebug?.showCockpitScreenAnchors(false))).toBe(false);
    await page.waitForFunction(() => window.__arcaDiagnostics?.cockpitScreenAnchorsVisible === false);

    const cockpitHudAudit = await page.evaluate(() => {
      const objective = document.querySelector<HTMLElement>('.objective-panel');
      const systems = document.querySelector<HTMLElement>('.systems-panel');
      const mission = document.querySelector<HTMLElement>('.mission-panel');
      const objectiveGrid = document.querySelector<HTMLElement>('.objective-grid');
      return {
        objectiveOpacity: objective ? Number.parseFloat(getComputedStyle(objective).opacity) : 0,
        systemsOpacity: systems ? Number.parseFloat(getComputedStyle(systems).opacity) : 1,
        missionOpacity: mission ? Number.parseFloat(getComputedStyle(mission).opacity) : 1,
        objectiveGridDisplay: objectiveGrid ? getComputedStyle(objectiveGrid).display : 'missing'
      };
    });
    expect(cockpitHudAudit.objectiveOpacity).toBeGreaterThan(0.7);
    expect(cockpitHudAudit.systemsOpacity).toBeLessThan(0.05);
    expect(cockpitHudAudit.missionOpacity).toBeLessThan(0.05);
    expect(cockpitHudAudit.objectiveGridDisplay).toBe('none');

    await page.keyboard.down('w');
    await page.waitForTimeout(1200);
    await expect(page.locator('#velocity-readout')).not.toHaveText('0 m/s');
    await page.keyboard.up('w');

    await page.screenshot({ path: 'test-results/arca-epsilon-cockpit-space.png', fullPage: false, timeout: 60000 });
    await expectNonBlankWebGLCanvas(page);
    expect(await page.evaluate(() => window.__arcaDebug?.toggleCockpitView())).toBe('external');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.cameraMode === 'external' && window.__arcaDiagnostics?.cockpitActive === false,
      undefined,
      { timeout: 30000 }
    );
    await page.waitForFunction(() => window.__arcaDiagnostics?.cockpitActiveDustParticles === 0);
    await page.waitForFunction(() => window.__arcaDiagnostics?.lodLevelCockpit === 'hidden');
    const inactiveCockpitTextureUpdates = await page.evaluate(
      () => window.__arcaDiagnostics?.cockpitTextureUpdateCount ?? 0
    );
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.cockpitTextureUpdateCount ?? 0)).toBe(
      inactiveCockpitTextureUpdates
    );
    expect(await page.evaluate(() => window.__arcaDiagnostics?.cockpitUpdateSkippedWhenInactive ?? 0)).toBeGreaterThan(0);

    // Beauty shot first: the scanner pulse lingers for many wall-seconds in
    // this software-GL environment, so capture the scene before scanning.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'test-results/arca-epsilon-gameplay.png', fullPage: false, timeout: 60000 });

    expect(await page.evaluate(() => window.__arcaDebug?.attemptEarlyDescent())).toBe(false);
    await page.waitForFunction(() => (window.__arcaDiagnostics?.missingDescentRequirements.length ?? 0) >= 4);
    // The missing-requirements list is populated even before the attempt, so
    // also wait for the throttled diagnostics tick that carries the blocked
    // reason written by requestDescent().
    await page.waitForFunction(() => (window.__arcaDiagnostics?.descentBlockedReason ?? '').length > 0);
    const blockedDescent = await page.evaluate(() => ({
      authorized: window.__arcaDiagnostics?.descentAuthorized,
      reason: window.__arcaDiagnostics?.descentBlockedReason,
      missing: window.__arcaDiagnostics?.missingDescentRequirements ?? [],
      phase: window.__arcaDiagnostics?.descentPhase
    }));
    expect(blockedDescent.authorized).toBe(false);
    expect(blockedDescent.reason).toContain('Descenso denegado');
    expect(blockedDescent.missing).toContain('análisis orbital completo');
    expect(blockedDescent.missing).toContain('corredor Atlas decodificado');
    expect(blockedDescent.phase).not.toBe('entry');
    await expect(page.locator('#mission-text')).toContainText('Descenso denegado');

    expect(await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(220, 0, 180))).toEqual([220, 0, 180]);
    await page.locator('#scan-button').dispatchEvent('click');
    await page.waitForFunction(() => (window.__arcaDiagnostics?.scannerPulses ?? 0) > 0);
    await page.waitForFunction(() => window.__arcaMissionState?.step === 'followSignal');
    await expect(page.locator('#objective-text')).toContainText('Fija rumbo');
    await expect(page.locator('#scanner-status')).toContainText('Activo');
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyR');
    await expect(page.locator('#laser-status')).toContainText(/Laser/);
    await expect(page.locator('#missile-status')).toContainText(/Misil|Misiles/);
    await page.waitForTimeout(700);

    expect(await page.evaluate(() => window.__arcaDebug?.advanceToMarker())).toBe('scanOrbitalMarker');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.atlasLodLevel === 'medium' && window.__arcaDiagnostics?.arcaLodLevel === 'low'
    );
    expect(await page.evaluate(() => window.__arcaDiagnostics?.orbitalMarkerTriangles)).toBe(200_000);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mothershipTriangles)).toBe(79_978);
    await page.screenshot({ path: 'test-results/arca-epsilon-atlas-medium.png', fullPage: false, timeout: 60000 });
    await expect(page.locator('#objective-text')).toContainText('estructura orbital no humana');
    const orbitalGate = await page.evaluate(() => window.__arcaDebug?.getDescentSafetyState());
    expect(orbitalGate?.orbitalScanComplete).toBe(true);
    expect(orbitalGate?.habitabilityScore).toBeGreaterThanOrEqual(70);
    expect(orbitalGate?.descentAuthorized).toBe(false);
    expect(orbitalGate?.missingDescentRequirements).toContain('corredor Atlas decodificado');
    expect(await page.evaluate(() => window.__arcaDebug?.decodeMarker())).toBe('approachPlanet');
    const authorizedGate = await page.evaluate(() => window.__arcaDebug?.getDescentSafetyState());
    expect(authorizedGate?.atlasMarkerScanned).toBe(true);
    expect(authorizedGate?.atlasCorridorDecoded).toBe(true);
    expect(authorizedGate?.descentAuthorized).toBe(true);
    expect(authorizedGate?.missingDescentRequirements).toEqual([]);
    await expect(page.locator('#objective-marker-label')).toContainText(/ENTRADA|BIOSFERA/);
    await page.waitForFunction(() => window.__arcaDiagnostics?.corridorPipsVisible === true);
    const corridorAudit = await page.evaluate(() => {
      const pips: import('three').Object3D[] = [];
      window.__arcaScene?.traverse((child) => {
        if (child.name.startsWith('Atlas Corridor Pip')) pips.push(child);
      });
      return {
        count: pips.length,
        minScale: Math.min(...pips.map((pip) => pip.scale.x)),
        maxScale: Math.max(...pips.map((pip) => pip.scale.x))
      };
    });
    expect(corridorAudit.count).toBe(7);
    expect(corridorAudit.minScale).toBeGreaterThanOrEqual(4.5);
    expect(corridorAudit.maxScale).toBeLessThanOrEqual(15.5);
    expect(await page.evaluate(() => window.__arcaDebug?.startEntry())).toBe('atmosphericEntry');
    await expect(page.locator('#descent-panel')).toHaveClass(/is-active/);
    await page.waitForFunction(() => (window.__arcaDiagnostics?.entryFxIntensity ?? 0) > 0.12);
    const entryDiagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(entryDiagnostics?.altitudeEstimate).toBeGreaterThan(0);
    expect(entryDiagnostics?.heatLevel).toBeGreaterThan(0);
    expect(entryDiagnostics?.entryParticles).toBeGreaterThan(0);
    expect(entryDiagnostics?.entryParticles).toBeLessThanOrEqual(70);
    expect(entryDiagnostics?.turbulenceLevel).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => window.__arcaDebug?.setCameraMode('cockpit'))).toBe('cockpit');
    await page.waitForFunction(() => window.__arcaDiagnostics?.cockpitActive === true, undefined, { timeout: 30000 });
    await expect(page.locator('#descent-title')).toContainText('Corredor Atlas');
    const physicalEntryAlert = await page.evaluate(() => {
      const warningLeds = window.__arcaScene?.getObjectByName('Cockpit Physical Warning LEDs') as any;
      const instrumentLight = window.__arcaScene?.getObjectByName('Cockpit Instrument Fill') as any;
      return {
        warningOpacity: warningLeds?.material?.opacity ?? 0,
        lightColor: instrumentLight?.color?.getHex?.() ?? 0,
        canopyOpacity: window.__arcaDiagnostics?.cockpitCanopyReflectionOpacity ?? 0
      };
    });
    expect(physicalEntryAlert.warningOpacity).toBeGreaterThan(0.2);
    expect(physicalEntryAlert.lightColor).not.toBe(0x8fcbd7);
    expect(physicalEntryAlert.canopyOpacity).toBeGreaterThan(cockpitAudit.diagnostics?.cockpitCanopyReflectionOpacity ?? 0);
    expect(physicalEntryAlert.canopyOpacity).toBeLessThanOrEqual(0.11);
    await page.screenshot({ path: 'test-results/arca-epsilon-cockpit-entry.png', fullPage: false, timeout: 60000 });
    expect(await page.evaluate(() => window.__arcaDebug?.setCameraMode('external'))).toBe('external');
    expect(await page.evaluate(() => window.__arcaDebug?.finishEntry())).toBe('landingApproach');
    await expect(page.locator('#objective-marker-label')).toContainText('CUENCA');
    await page.waitForFunction(() => (window.__arcaDiagnostics?.basinReveal ?? 0) > 0.45);
    const basinDiagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(basinDiagnostics?.corridorPipsVisible).toBe(false);
    expect(basinDiagnostics?.horizonTriangles).toBeGreaterThan(0);
    expect(basinDiagnostics?.horizonTriangles).toBeLessThan(2000);
    await page.screenshot({ path: 'test-results/arca-epsilon-basin.png', fullPage: false, timeout: 60000 });
    expect(await page.evaluate(() => window.__arcaDebug?.touchdown())).toBe('missionComplete');
    await page.waitForFunction(() => window.__arcaDiagnostics?.landingImpactVisible === true);
    await expect(page.locator('#mission-complete-overlay')).toHaveClass(/is-active/);
    await expect(page.locator('#mission-complete-title')).toContainText('Primer punto');

    const renderDiagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    console.log('=== RUNTIME DIAGNOSTICS ===', JSON.stringify(renderDiagnostics, null, 2));
    expect(renderDiagnostics?.drawCalls).toBeGreaterThan(20);
    expect(renderDiagnostics?.triangles).toBeGreaterThan(1000);
    await page.screenshot({ path: 'test-results/arca-epsilon-scan.png', fullPage: false, timeout: 60000 });
  });
});

test('routes mission communications without duplicates and restores played dialogue state', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').dispatchEvent('click');

    const panel = page.locator('#comms-dialogue');
    await expect(panel).toHaveClass(/is-visible/);
    await expect(panel).toHaveAttribute('data-dialogue-id', 'm01_start_commander');
    await expect(panel.locator('.comms-dialogue__speaker')).toContainText('Valeria Soren');
    await expect(page.locator('.objective-panel')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(panel).not.toHaveClass(/is-visible/);

    expect(await page.evaluate(() => window.__arcaDebug?.attemptEarlyDescent())).toBe(false);
    await expect(panel).toHaveAttribute('data-dialogue-id', 'm01_descent_blocked');
    const firstBlockedState = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
    expect(firstBlockedState?.awaitingInput).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.attemptEarlyDescent())).toBe(false);
    const repeatedBlockedState = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
    expect(repeatedBlockedState?.playedDialogueCount).toBe(firstBlockedState?.playedDialogueCount);
    expect(repeatedBlockedState?.queueLength).toBe(firstBlockedState?.queueLength);

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toHaveClass(/is-active/);
    expect((await page.evaluate(() => window.__arcaDebug?.getDialogueState()))?.currentDialogueId).toBe('m01_descent_blocked');
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
    expect((await page.evaluate(() => window.__arcaDebug?.getDialogueState()))?.currentDialogueId).toBe('m01_descent_blocked');
    await page.keyboard.press('KeyM');
    await page.keyboard.press('Space');
    await expect(panel).not.toHaveClass(/is-visible/);

    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue())).toBe(0);
    expect(await page.evaluate(() => window.__arcaDebug?.deployHabitat())).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue())).toBe(0);
    expect(await page.evaluate(() => window.__arcaDebug?.revealSurfaceSites())).toBe(true);
    await expect(panel).toHaveAttribute('data-dialogue-id', 'm02_sites_revealed', { timeout: 30000 });
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('toggleCamera'))).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('shipAccess'))).toBe(true);
    expect((await page.evaluate(() => window.__arcaDebug?.getDialogueState()))?.currentDialogueId).toBe('m02_sites_revealed');

    expect(await page.evaluate(() => window.__arcaDebug?.showDialogue('m03_pleyadan_transmission'))).toBe(true);
    await expect(panel.locator('.comms-dialogue__speaker')).toContainText('Pleyadana');
    await expect(panel).toHaveAttribute('data-signal', 'alien');
    expect((await page.evaluate(() => window.__arcaDebug?.getDialogueState()))?.lastDialogueTrigger).toBe('debug');
    const saved = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(saved?.playedDialogueIds).toContain('m03_pleyadan_transmission');
    expect(await page.evaluate(() => window.__arcaDebug?.resetPlayedDialogues())).toBe(0);
    const loaded = await page.evaluate(() => window.__arcaDebug?.loadGame());
    expect(loaded?.playedDialogueIds).toContain('m03_pleyadan_transmission');
    await page.waitForFunction(() =>
      window.__arcaDebug?.getDialogueState().playedDialogueIds.includes('m03_pleyadan_transmission') === true
    );
    await page.waitForFunction(() => (window.__arcaDiagnostics?.playedDialogueCount ?? 0) > 0, undefined, { timeout: 30000 });

    const diagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(diagnostics?.playedDialogueCount).toBeGreaterThan(0);
  });
});

test('keeps the HUD usable on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await expect(page.locator('#launch-button')).toBeEnabled();
    await page.locator('#launch-button').dispatchEvent('click');
    await expect(page.locator('#hud')).toHaveClass(/is-active/);
    await expect(page.locator('#comms-dialogue')).toHaveAttribute('data-dialogue-id', 'm01_start_commander');
    const mobileCommsLayout = await page.locator('#comms-dialogue').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        overflowX: element.scrollWidth > element.clientWidth,
        overflowY: element.scrollHeight > element.clientHeight
      };
    });
    expect(mobileCommsLayout.left).toBeGreaterThanOrEqual(0);
    expect(mobileCommsLayout.right).toBeLessThanOrEqual(390);
    expect(mobileCommsLayout.bottom).toBeLessThanOrEqual(844);
    expect(mobileCommsLayout.width).toBeGreaterThan(320);
    expect(mobileCommsLayout.overflowX).toBe(false);
    expect(mobileCommsLayout.overflowY).toBe(false);
    await expect(page.locator('.objective-panel')).toBeVisible();
    await expect(page.locator('.systems-panel')).toBeVisible();
    await expect(page.locator('.mission-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toHaveClass(/is-active/);
    await page.waitForFunction(() => window.__arcaDiagnostics?.gamePaused === true);
    await page.locator('#pause-menu [data-action="controls"]').click();
    await expect(page.locator('.pause-menu__controls')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).not.toHaveClass(/is-active/);
    await page.waitForFunction(() => window.__arcaDiagnostics?.gamePaused === false);
    const renderDiagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(renderDiagnostics?.drawCalls).toBeGreaterThan(20);
    expect(renderDiagnostics?.triangles).toBeGreaterThan(1000);
    await expectNonBlankWebGLCanvas(page);
    await page.screenshot({ path: 'test-results/arca-epsilon-mobile.png', fullPage: false, timeout: 60000 });
  });
});

test('transitions to surface phase and deploys colony module', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await expect(page.locator('#launch-button')).toBeEnabled();
    await page.locator('#launch-button').dispatchEvent('click');
    await expect(page.locator('#hud')).toHaveClass(/is-active/);

    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    await expect(page.locator('#colony-panel')).toBeVisible();
    await expect(page.locator('#colony-hab-status')).toContainText('Inactivo');
    await expect(page.locator('#phase-banner-title')).toContainText('SUPERFICIE E-01 / CUENCA NEREIDA');
    await expect(page.locator('#mission-text')).toContainText('Modo exploración de superficie activo');
    const surfaceVisualAudit = await page.evaluate(() => {
      const ridges = window.__arcaScene?.getObjectByName('Cuenca Nereida - Irregular Ridge Bands');
      let ridgeMeshes = 0;
      let coneRidges = 0;
      ridges?.traverse((object) => {
        if (!(object as any).geometry) return;
        ridgeMeshes += 1;
        if ((object as any).geometry.type === 'ConeGeometry') coneRidges += 1;
      });
      return { ridgeMeshes, coneRidges, impactVisible: window.__arcaDiagnostics?.landingImpactVisible };
    });
    expect(surfaceVisualAudit.ridgeMeshes).toBe(2);
    expect(surfaceVisualAudit.coneRidges).toBe(0);
    expect(surfaceVisualAudit.impactVisible).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.guideVisible === true);
    const guideAudit = await page.evaluate(() => ({
      source: window.__arcaDiagnostics?.guideSource,
      target: window.__arcaDiagnostics?.currentGuideTarget,
      distance: window.__arcaDiagnostics?.guideDistance,
      cruise: window.__arcaDiagnostics?.surfaceCruiseSpeed,
      boost: window.__arcaDiagnostics?.surfaceBoostSpeed
    }));
    expect(guideAudit.source).toBe('ObjectiveResolver');
    expect(guideAudit.target).toBeTruthy();
    expect(guideAudit.distance).toBeGreaterThanOrEqual(0);
    expect(guideAudit.cruise).toBe(24);
    expect(guideAudit.boost).toBe(42);
    expect(await page.evaluate(() => window.__arcaDebug?.setCameraMode('cockpit'))).toBe('cockpit');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.cameraMode === 'cockpit' && window.__arcaDiagnostics?.cockpitActive === true,
      undefined,
      { timeout: 30000 }
    );
    await page.waitForFunction(
      () => {
        const hud = document.querySelector<HTMLElement>('#hud');
        const descent = document.querySelector<HTMLElement>('.descent-panel');
        const colony = document.querySelector<HTMLElement>('.colony-panel');
        return Boolean(
          hud?.classList.contains('cockpit-active') &&
          hud.classList.contains('surface-active') &&
          descent?.classList.contains('is-active') &&
          colony?.classList.contains('is-active') &&
          Number.parseFloat(getComputedStyle(descent).opacity) < 0.15 &&
          Number.parseFloat(getComputedStyle(colony).opacity) < 0.15 &&
          (window.__arcaDiagnostics?.cockpitActiveDustParticles ?? 0) > 0 &&
          (window.__arcaDiagnostics?.cockpitCanopyReflectionOpacity ?? 1) < 0.04
        );
      },
      undefined,
      { timeout: 60000 }
    );
    const surfaceHudOpacity = await page.evaluate(() => {
      const descent = document.querySelector<HTMLElement>('.descent-panel');
      const colony = document.querySelector<HTMLElement>('.colony-panel');
      return {
        descent: descent ? Number.parseFloat(getComputedStyle(descent).opacity) : 1,
        colony: colony ? Number.parseFloat(getComputedStyle(colony).opacity) : 1,
        activeDust: window.__arcaDiagnostics?.cockpitActiveDustParticles ?? 0,
        canopyOpacity: window.__arcaDiagnostics?.cockpitCanopyReflectionOpacity ?? 1
      };
    });
    expect(surfaceHudOpacity.descent).toBeLessThan(0.15);
    expect(surfaceHudOpacity.colony).toBeLessThan(0.15);
    expect(surfaceHudOpacity.activeDust).toBeGreaterThan(0);
    expect(surfaceHudOpacity.canopyOpacity).toBeLessThan(0.04);
    await page.keyboard.down('w');
    await page.waitForFunction(() => (window.__arcaDiagnostics?.surfaceShipSpeed ?? 0) > 8, undefined, { timeout: 30000 });
    await expect(page.locator('#velocity-readout')).not.toHaveText('0 m/s');
    const cruiseSample = await page.evaluate(() => window.__arcaDiagnostics?.surfaceShipSpeed ?? 0);
    await page.keyboard.down('Shift');
    await page.waitForFunction(
      (cruise) =>
        (window.__arcaDiagnostics?.surfaceShipSpeed ?? 0) > cruise &&
        window.__arcaDiagnostics?.surfaceBoostActive === true &&
        (window.__arcaDiagnostics?.surfaceBoostFxIntensity ?? 0) > 0.2,
      cruiseSample,
      { timeout: 30000 }
    );
    const boostSample = await page.evaluate(() => ({
      speed: window.__arcaDiagnostics?.surfaceShipSpeed ?? 0,
      active: window.__arcaDiagnostics?.surfaceBoostActive,
      fx: window.__arcaDiagnostics?.surfaceBoostFxIntensity ?? 0
    }));
    await page.keyboard.up('Shift');
    await page.keyboard.up('w');
    expect(cruiseSample).toBeGreaterThan(8);
    expect(boostSample.speed).toBeGreaterThan(cruiseSample);
    expect(boostSample.active).toBe(true);
    expect(boostSample.fx).toBeGreaterThan(0.2);

    // Deployment is only valid at the authored habitat site.
    expect(await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(120, 18, 120))).toEqual([120, 18, 120]);
    await page.keyboard.press('e');
    await expect(page.locator('#colony-hab-status')).toContainText('Inactivo');
    await expect(page.locator('#mission-text')).toContainText('Despliegue rechazado');

    // One valid E interaction deploys the habitat.
    expect(await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(0, 18, -60))).toEqual([0, 18, -60]);
    await page.waitForTimeout(1200);
    await page.keyboard.press('e');
    await expect(page.locator('#colony-hab-status')).toContainText('Online', { timeout: 15000 });
    await page.waitForFunction(() => window.__arcaDiagnostics?.habitatActivationStage === 'online', undefined, { timeout: 30000 });
    await expect(page.locator('#mission-text')).toContainText('Nereida-01 online');

    // The habitat first reveals approximate authored sites.
    await page.waitForTimeout(1200);
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__arcaDiagnostics?.surfaceSitesRevealed === true);
    const siteAudit = await page.evaluate(() => {
      const habitat = window.__arcaScene?.getObjectByName('Módulo Hábitat Nereida-01');
      const resources: { name: string; distance: number; x: number; z: number }[] = [];
      window.__arcaScene?.traverse((object) => {
        if (!object.name.startsWith('ResourceNode (')) return;
        const base = habitat?.position ?? { x: 0, y: 0, z: -72 };
        resources.push({
          name: object.name,
          distance: Math.hypot(object.position.x - base.x, object.position.z - base.z),
          x: object.position.x,
          z: object.position.z
        });
      });
      return resources;
    });
    const criticalSites = siteAudit.filter((site) => /water|minerals|energy/.test(site.name));
    expect(criticalSites).toHaveLength(3);
    expect(Math.min(...criticalSites.map((site) => site.distance))).toBeGreaterThan(300);
    expect(Math.max(...criticalSites.map((site) => site.distance))).toBeLessThan(470);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.waterStatus)).toBe('detected');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mineralStatus)).toBe('detected');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.energyStatus)).toBe('detected');

    const terrainAudit = await page.evaluate(() => window.__arcaDebug?.getResourceSiteDiagnostics());
    expect(Object.keys(terrainAudit ?? {}).sort()).toEqual(['energy', 'minerals', 'water']);
    for (const type of ['water', 'minerals', 'energy'] as SurfaceResourceType[]) {
      const metric = terrainAudit?.[type];
      expect(metric?.blendActive).toBe(true);
      expect(metric?.target).toHaveLength(3);
      expect(metric?.target.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(metric?.target[0] ?? 0, (metric?.target[2] ?? 0) + 72)).toBeGreaterThan(300);
      expect(metric?.slope).toBeLessThan(15);
      expect(metric?.visibilityScore).toBeGreaterThan(0.2);
    }
    expect(terrainAudit?.water.name).toBe('Laguna Nereida');
    expect(terrainAudit?.minerals.name).toBe('Veta Ferrita');
    expect(terrainAudit?.energy.name).toBe('Fisura Geotérmica');
    expect(terrainAudit?.water.groundOffset).toBeLessThan(-1.5);
    expect(Math.abs(terrainAudit?.minerals.groundOffset ?? 1)).toBeLessThan(0.5);
    expect(terrainAudit?.energy.groundOffset).toBeLessThan(-0.4);

    const interactionTargets = await page.evaluate(() => ({
      water: window.__arcaDebug?.getResourceInteractionPosition('water'),
      minerals: window.__arcaDebug?.getResourceInteractionPosition('minerals'),
      energy: window.__arcaDebug?.getResourceInteractionPosition('energy')
    }));
    expect(interactionTargets.water).toEqual(terrainAudit?.water.target);
    expect(interactionTargets.minerals).toEqual(terrainAudit?.minerals.target);
    expect(interactionTargets.energy).toEqual(terrainAudit?.energy.target);
    await page.waitForFunction(
      () =>
        window.__arcaDiagnostics?.siteTerrainBlendActive === true &&
        window.__arcaDiagnostics?.lagoonWaterAnimated === true &&
        window.__arcaDiagnostics?.fissureThermalMapHint === true
    );
    const siteFxDiagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(siteFxDiagnostics?.lagoonWaterFxCost).toBeLessThanOrEqual(1);
    expect(siteFxDiagnostics?.resourceSiteSlope.water).toBeLessThan(15);
    expect(siteFxDiagnostics?.resourceSiteSlope.minerals).toBeLessThan(15);
    expect(siteFxDiagnostics?.resourceSiteSlope.energy).toBeLessThan(15);

    expect(await page.evaluate(() => window.__arcaDebug?.setCameraMode('external'))).toBe('external');
    for (const [type, screenshot] of [
      ['water', 'test-results/arca-epsilon-site-laguna.png'],
      ['minerals', 'test-results/arca-epsilon-site-veta.png'],
      ['energy', 'test-results/arca-epsilon-site-fisura.png']
    ] as [SurfaceResourceType, string][]) {
      expect(await page.evaluate((siteType) => window.__arcaDebug?.locateSurfaceSite(siteType), type)).toBe('located');
      await page.waitForTimeout(650);
      await page.screenshot({ path: screenshot, fullPage: false, timeout: 60000 });
    }

    expect(await page.evaluate(() => window.__arcaDebug?.locateSurfaceSite('water'))).toBe('located');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.baseNereidaOperational)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.sampleSurfaceSite('water'))).toBe('sampled');
    await page.waitForFunction(() => window.__arcaDiagnostics?.waterStatus === 'sampled');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.baseOperationalReady)).toBe(false);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('#starmap-poi-list')).toContainText('LAGUNA NEREIDA');
    await expect(page.locator('#starmap-poi-list')).toContainText('VETA FERRITA');
    await expect(page.locator('#starmap-poi-list')).toContainText('FISURA GEOTÉRMICA');
    await expect(page.locator('#starmap-poi-list')).toContainText('THERM');
    await page.keyboard.press('KeyM');
    await page.screenshot({ path: 'test-results/arca-epsilon-surface.png', fullPage: false, timeout: 60000 });
  });
});

test('exits the ship, explores on foot, interacts, boards and restores safely', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').dispatchEvent('click');
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.deployHabitat())).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.__arcaDebug?.revealSurfaceSites())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue())).toBe(0);
    await page.waitForTimeout(1200);

    const characterAsset = await page.evaluate(() => ({
      status: window.__arcaDiagnostics?.characterGlbStatus,
      clips: window.__arcaDiagnostics?.characterAnimationClips ?? [],
      meshes: window.__arcaDiagnostics?.characterMeshCount ?? 0
    }));
    expect(characterAsset.status).toMatch(/loaded|fallback/);
    expect(characterAsset.meshes).toBeGreaterThan(0);
    if (characterAsset.status === 'loaded') expect(characterAsset.clips.length).toBeGreaterThan(0);

    expect(await page.evaluate(() => window.__arcaDebug?.setCameraMode('external'))).toBe('external');
    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => window.__arcaDiagnostics?.cockpitActive === true, undefined, { timeout: 30000 });
    expect(await page.evaluate(() => window.__arcaDiagnostics?.lastInputAction)).toBe('toggleCamera');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.actionConsumedBy)).toBe('ship');
    await page.keyboard.press('KeyV');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.cameraMode === 'external' && window.__arcaDiagnostics?.cockpitActive === false,
      undefined,
      { timeout: 30000 }
    );
    await expect(page.locator('#mission-text')).toContainText('online', { timeout: 30000 });

    const shipModeBeforeScan = await page.evaluate(() => window.__arcaDiagnostics?.playerMode);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.lastInputAction === 'scan');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.playerMode)).toBe(shipModeBeforeScan);
    await expect(page.locator('#mission-text')).toContainText('Usa F para descender');
    await expect(page.locator('#interact-prompt kbd')).toHaveText('F');

    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => window.__arcaDiagnostics?.playerMode === 'EXITING_SHIP');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.liftRideState === 'ridingLiftDown',
      undefined,
      { timeout: 20000 }
    );
    const exitLiftAudit = await page.evaluate(() => ({
      onLift: window.__arcaDiagnostics?.characterOnLift,
      footLock: window.__arcaDiagnostics?.characterFootLockActive,
      progress: window.__arcaDiagnostics?.liftProgress ?? 0,
      animation: window.__arcaDiagnostics?.characterAnimation ?? '',
      moveState: window.__arcaDiagnostics?.characterMoveState,
      velocity: window.__arcaDiagnostics?.characterVelocity ?? [0, 0, 0],
      state: window.__arcaDiagnostics?.boardingAnimationState,
      save: window.__arcaDebug?.saveGame()
    }));
    expect(exitLiftAudit.onLift).toBe(true);
    expect(exitLiftAudit.footLock).toBe(true);
    expect(exitLiftAudit.progress).toBeGreaterThan(0);
    expect(exitLiftAudit.progress).toBeLessThan(1);
    expect(exitLiftAudit.animation).toMatch(/ridingLiftDown|idle/i);
    expect(exitLiftAudit.animation).not.toMatch(/walk|run/i);
    expect(exitLiftAudit.moveState).toBe('ridingLiftDown');
    expect(Math.hypot(...exitLiftAudit.velocity)).toBeLessThan(0.01);
    expect(exitLiftAudit.state).toBe('ridingLiftDown');
    expect(exitLiftAudit.save?.playerMode).toBe('ship');
    expect(exitLiftAudit.save?.insideShip).toBe(true);
    expect(exitLiftAudit.save?.rampState).toBe('retracted');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.onFootActive === true && window.__arcaDiagnostics?.rampState === 'deployed',
      undefined,
      { timeout: 20000 }
    );
    expect(await page.evaluate(() => window.__arcaDiagnostics?.liftContactShadowActive)).toBe(true);
    const activeCharacterPerformance = await page.evaluate(() => window.__arcaDebug?.getPerformanceSnapshot());
    expect(activeCharacterPerformance?.visibleCharacterMeshCount).toBe(1);
    expect(activeCharacterPerformance?.activeCharacterSkinnedMeshCount).toBeLessThanOrEqual(1);
    expect(activeCharacterPerformance?.visibleCharacterTriangleCount).toBeGreaterThan(200_000);
    expect(activeCharacterPerformance?.mixerActive).toBe(true);
    expect(activeCharacterPerformance?.activeAnimationMixerCount).toBe(1);
    expect(await page.evaluate(() => window.__arcaDebug?.validateNoDuplicateCharacterMeshes())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.lastInputAction)).toBe('shipAccess');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.actionConsumedBy)).toBe('ship');

    const onFootCameraMode = await page.evaluate(() => window.__arcaDiagnostics?.cameraMode);
    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => window.__arcaDiagnostics?.lastInputAction === 'toggleCamera');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.playerMode)).toBe('ON_FOOT');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.cameraMode)).toBe(onFootCameraMode);
    await expect(page.locator('#mission-text')).toContainText('disponible dentro de la nave');

    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.lastInputAction === 'scan');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.playerMode)).toBe('ON_FOOT');
    await expect(page.locator('#mission-text')).toContainText('Usa F para volver');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__arcaDiagnostics?.pauseOpen === true);
    await page.keyboard.press('KeyF');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.playerMode)).toBe('ON_FOOT');
    expect(await page.evaluate(() => window.__arcaDebug?.getInputActionState().actionConsumedBy)).toBe('pause-menu');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__arcaDiagnostics?.pauseOpen === false);

    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
    await page.keyboard.press('KeyF');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.playerMode)).toBe('ON_FOOT');
    expect(await page.evaluate(() => window.__arcaDebug?.getInputActionState().actionConsumedBy)).toBe('map-overlay');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).toHaveClass(/is-hidden/);
    await page.waitForFunction(() => window.__arcaDiagnostics?.inputMode === 'on-foot');

    expect(await page.evaluate(() => window.__arcaDebug?.setOnFootCameraYaw(0))).toBe(0);
    expect(await page.evaluate(() => window.__arcaDebug?.setOnFootCameraPitch(0.24))).toBeCloseTo(0.24);
    const initialPosition = await page.evaluate(
      () => window.__arcaDebug?.teleportCharacterToResource('water') ?? [0, 0, 0]
    );
    await page.keyboard.down('w');
    await page.waitForTimeout(4200);
    const walkState = await page.evaluate(() => ({
      position: window.__arcaDiagnostics?.characterPosition ?? [0, 0, 0],
      speed: window.__arcaDiagnostics?.characterSpeed ?? 0,
      animation: window.__arcaDiagnostics?.characterAnimation ?? ''
    }));
    await page.keyboard.up('w');
    expect(Math.hypot(walkState.position[0] - initialPosition[0], walkState.position[2] - initialPosition[2])).toBeGreaterThan(0.18);
    expect(walkState.position[2]).toBeLessThan(initialPosition[2] - 0.12);
    expect(walkState.speed).toBeGreaterThan(0.6);
    expect(walkState.animation).toMatch(/walkForward|walk/i);

    const backwardStart = await page.evaluate(() => window.__arcaDebug?.teleportCharacterToResource('water'));
    expect(backwardStart).toHaveLength(3);
    await page.keyboard.down('s');
    await page.waitForFunction(
      (startZ) => (window.__arcaDiagnostics?.characterPosition[2] ?? startZ) > startZ + 0.12,
      backwardStart?.[2] ?? 0,
      { timeout: 12000 }
    );
    const backwardState = await page.evaluate(() => window.__arcaDebug?.getCharacterControlState());
    await page.keyboard.up('s');
    expect(backwardState?.position[2]).toBeGreaterThan((backwardStart?.[2] ?? 0) + 0.12);
    expect(backwardState?.moveState).toBe('walkBackward');
    expect(backwardState?.animation).toMatch(/walkBackward|backward/i);
    expect(Math.abs(backwardState?.inputVector[1] ?? 0)).toBe(1);
    expect(Math.hypot(backwardState?.velocity[0] ?? 0, backwardState?.velocity[2] ?? 0)).toBeLessThan(walkState.speed);

    const strafeStart = await page.evaluate(() => window.__arcaDebug?.teleportCharacterToResource('water'));
    expect(strafeStart).toHaveLength(3);
    await page.keyboard.down('a');
    await page.waitForFunction(
      (startX) => (window.__arcaDebug?.getCharacterControlState().position[0] ?? startX) < startX - 0.12,
      strafeStart?.[0] ?? 0,
      { timeout: 30000 }
    );
    const strafeState = await page.evaluate(() => window.__arcaDebug?.getCharacterControlState());
    await page.keyboard.up('a');
    expect(strafeState?.position[0]).toBeLessThan((strafeStart?.[0] ?? 0) - 0.12);
    expect(strafeState?.moveState).toBe('strafeLeft');

    const yawBeforeMouse = await page.evaluate(() => window.__arcaDiagnostics?.cameraYaw ?? 0);
    await page.mouse.move(420, 320);
    await page.mouse.move(600, 320, { steps: 3 });
    await page.waitForTimeout(2200);
    const yawAfterMouse = await page.evaluate(() => window.__arcaDiagnostics?.cameraYaw ?? 0);
    expect(Math.abs(yawAfterMouse - yawBeforeMouse)).toBeGreaterThan(0.02);

    expect(await page.evaluate(() => window.__arcaDebug?.setOnFootCameraYaw(-Math.PI / 2))).toBeCloseTo(-Math.PI / 2);
    const rotatedStart = await page.evaluate(() => window.__arcaDebug?.teleportCharacterToResource('water'));
    await page.keyboard.down('w');
    await page.waitForTimeout(4200);
    const rotatedWalk = await page.evaluate(() => window.__arcaDebug?.getCharacterControlState());
    await page.keyboard.up('w');
    expect(rotatedWalk?.position[0]).toBeGreaterThan((rotatedStart?.[0] ?? 0) + 0.12);
    expect(rotatedWalk?.cameraForward[0]).toBeGreaterThan(0.9);

    await page.evaluate(() => window.__arcaDebug?.teleportCharacterToResource('water'));
    await page.keyboard.down('w');
    await page.keyboard.down('Shift');
    await page.waitForFunction(
      () => {
        const state = window.__arcaDebug?.getCharacterControlState();
        return Boolean(
          state?.moveState === 'runForward' &&
          Math.hypot(state.velocity[0], state.velocity[2]) > 3.2
        );
      },
      undefined,
      { timeout: 30000 }
    );
    const runState = await page.evaluate(() => window.__arcaDebug?.getCharacterControlState());
    await page.keyboard.up('Shift');
    await page.keyboard.up('w');
    expect(Math.hypot(runState?.velocity[0] ?? 0, runState?.velocity[2] ?? 0)).toBeGreaterThan(walkState.speed);
    expect(runState?.moveState).toBe('runForward');
    expect(runState?.animation).toMatch(/runForward|run/i);

    expect(await page.evaluate(() => window.__arcaDebug?.teleportCharacterToResource('water'))).toHaveLength(3);
    const idleState = await page.evaluate(() => window.__arcaDebug?.getCharacterControlState());
    expect(idleState?.moveState).toBe('idle');
    expect(idleState?.animation).toMatch(/idle/i);
    expect(await page.evaluate(() => window.__arcaDebug?.toggleCharacterDebug())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.toggleCharacterDebug())).toBe(false);

    expect(await page.evaluate(() => window.__arcaDiagnostics?.waterFound)).toBe(false);
    await page.keyboard.press('KeyF');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.waterFound)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.playerMode)).toBe('ON_FOOT');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.waterFound === true);

    expect(await page.evaluate(() => window.__arcaDebug?.teleportCharacterToHabitat())).toHaveLength(3);
    await page.waitForTimeout(1100);
    const habitatStateBeforeF = await page.evaluate(() => ({
      mode: window.__arcaDiagnostics?.playerMode,
      waterFound: window.__arcaDiagnostics?.waterFound
    }));
    await page.keyboard.press('KeyF');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.playerMode)).toBe(habitatStateBeforeF.mode);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.waterFound)).toBe(habitatStateBeforeF.waterFound);
    expect(await page.evaluate(() => window.__arcaDebug?.getInputActionState().lastInputAction)).toBe('shipAccess');
    await page.keyboard.press('KeyE');
    await expect(page.locator('#mission-text')).toContainText(/Escáner portátil|Veta Ferrita|Fisura Geotérmica/);

    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('#starmap-poi-list')).toContainText('PILOTO ARCA');
    await expect(page.locator('#starmap-poi-list')).toContainText('NAVE DE RECONOCIMIENTO');
    await page.keyboard.press('KeyM');

    expect(await page.evaluate(() => window.__arcaDebug?.spawnCharacterAtShip())).toHaveLength(3);
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => window.__arcaDiagnostics?.playerMode === 'ENTERING_SHIP');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.liftRideState === 'ridingLiftUp',
      undefined,
      { timeout: 20000 }
    );
    const enterLiftAudit = await page.evaluate(() => ({
      onLift: window.__arcaDiagnostics?.characterOnLift,
      footLock: window.__arcaDiagnostics?.characterFootLockActive,
      animation: window.__arcaDiagnostics?.characterAnimation ?? '',
      save: window.__arcaDebug?.saveGame()
    }));
    expect(enterLiftAudit.onLift).toBe(true);
    expect(enterLiftAudit.footLock).toBe(true);
    expect(enterLiftAudit.animation).toMatch(/ridingLiftUp|idle/i);
    expect(enterLiftAudit.animation).not.toMatch(/walk|run/i);
    expect(enterLiftAudit.save?.playerMode).toBe('ship');
    expect(enterLiftAudit.save?.insideShip).toBe(true);
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.insideShip === true && window.__arcaDiagnostics?.onFootActive === false,
      undefined,
      { timeout: 20000 }
    );
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.mixerActive === false && window.__arcaDiagnostics?.visibleCharacterMeshCount === 0
    );
    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => window.__arcaDiagnostics?.cockpitActive === true, undefined, { timeout: 30000 });
    expect(await page.evaluate(() => window.__arcaDiagnostics?.actionConsumedBy)).toBe('ship');

    expect(await page.evaluate(() => window.__arcaDebug?.spawnCharacterAtShip())).toHaveLength(3);
    const savedOnFoot = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(savedOnFoot?.playerMode).toBe('onFoot');
    expect(savedOnFoot?.shipCameraMode).toBe('cockpit');
    expect(await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'))).toMatch(/SHIP_SURFACE|COCKPIT/);
    const loadedOnFoot = await page.evaluate(() => window.__arcaDebug?.loadGame());
    expect(loadedOnFoot?.playerMode).toBe('onFoot');
    await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);

    await page.keyboard.press('KeyF');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.insideShip === true && window.__arcaDiagnostics?.cockpitActive === true,
      undefined,
      { timeout: 30000 }
    );

    await page.keyboard.press('KeyV');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.cameraMode === 'external' && window.__arcaDiagnostics?.cockpitActive === false,
      undefined,
      { timeout: 30000 }
    );
    const savedInShip = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(savedInShip?.playerMode).toBe('ship');
    expect(savedInShip?.shipCameraMode).toBe('external');
    expect(await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'))).toBe('ON_FOOT');
    const loadedInShip = await page.evaluate(() => window.__arcaDebug?.loadGame());
    expect(loadedInShip?.playerMode).toBe('ship');
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.insideShip === true && window.__arcaDiagnostics?.cameraMode === 'external'
    );
    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => window.__arcaDiagnostics?.cockpitActive === true, undefined, { timeout: 30000 });

    expect(await page.evaluate(() => window.__arcaDebug?.forceCameraMode('onFoot'))).toBe('onFoot');
    await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true);
    await expectNonBlankWebGLCanvas(page);
    await page.screenshot({ path: 'test-results/arca-epsilon-on-foot.png', fullPage: false, timeout: 60000 });
  });
});

test('saves and restores colony progression backbone', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').dispatchEvent('click');

    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.deployHabitat())).toBeGreaterThanOrEqual(2);
    await page.waitForFunction(
      () => window.__arcaDiagnostics?.habitatOnline === true && (window.__arcaDiagnostics?.colonyStage ?? 0) >= 2,
      undefined,
      { timeout: 30000 }
    );

    let diagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(diagnostics?.currentPhase).toMatch(/surface|colonization/);
    expect(diagnostics?.currentMissionId).toBe('mission-02-first-foothold');
    expect(diagnostics?.habitatOnline).toBe(true);
    expect(diagnostics?.colonyStage).toBeGreaterThanOrEqual(2);

    expect(await page.evaluate(() => window.__arcaDebug?.revealSurfaceSites())).toBe(true);
    const sampledReadiness = await page.evaluate(() => window.__arcaDebug?.scanAllSurfaceResources() ?? 0);
    expect(sampledReadiness).toBeGreaterThan(65);
    expect(sampledReadiness).toBeLessThan(100);
    await page.waitForFunction(
      () =>
        window.__arcaDiagnostics?.waterStatus === 'sampled' &&
        window.__arcaDiagnostics?.mineralStatus === 'sampled' &&
        window.__arcaDiagnostics?.energyStatus === 'sampled'
    );
    diagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(diagnostics?.waterStatus).toBe('sampled');
    expect(diagnostics?.mineralStatus).toBe('sampled');
    expect(diagnostics?.energyStatus).toBe('sampled');
    expect(diagnostics?.resourceAnalysisReady).toBe(true);
    expect(diagnostics?.baseOperationalReady).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.analyzeSurfaceSamples())).toBe(true);
    await page.waitForFunction(
      () =>
        window.__arcaDiagnostics?.waterStatus === 'analyzed' &&
        window.__arcaDiagnostics?.mineralStatus === 'analyzed' &&
        window.__arcaDiagnostics?.energyStatus === 'analyzed'
    );
    diagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(diagnostics?.waterStatus).toBe('analyzed');
    expect(diagnostics?.mineralStatus).toBe('analyzed');
    expect(diagnostics?.energyStatus).toBe('analyzed');
    expect(diagnostics?.baseOperationalReady).toBe(true);
    expect(diagnostics?.baseNereidaOperational).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.makeBaseOperational())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.baseNereidaOperational === true);

    diagnostics = await page.evaluate(() => window.__arcaDiagnostics);
    expect(diagnostics?.waterFound).toBe(true);
    expect(diagnostics?.mineralsFound).toBe(true);
    expect(diagnostics?.energyFound).toBe(true);
    expect(diagnostics?.colonyReadiness).toBe(100);

    const saved = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(saved?.version).toBe(2);
    expect(saved?.habitatModuleDeployed).toBe(true);
    expect(saved?.baseNereidaOperational).toBe(true);
    expect(saved?.surfaceSitesRevealed).toBe(true);
    expect(saved?.resourceSiteStatuses).toEqual({
      water: 'analyzed',
      minerals: 'analyzed',
      energy: 'analyzed'
    });
    expect(saved?.inventory.waterData).toBeGreaterThan(0);

    const loaded = await page.evaluate(() => window.__arcaDebug?.loadGame());
    expect(loaded?.version).toBe(2);
    expect(loaded?.colony.baseNereidaOperational).toBe(true);
    expect(loaded?.resourceSiteStatuses?.water).toBe('analyzed');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.waterStatus)).toBe('analyzed');

    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);

    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);

    await page.evaluate(() => localStorage.setItem('arca-epsilon-save-v2', '{partida-invalida'));
    expect(await page.evaluate(() => window.__arcaDebug?.loadGame())).toBeUndefined();
    await page.waitForFunction(() => window.__arcaDiagnostics?.saveLoadStatus === 'corrupt');
    expect((await page.evaluate(() => window.__arcaDiagnostics?.saveWarning))?.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
  });
});

test('keeps the real ship world altitude after releasing Space', async ({ page }, testInfo) => {
  testInfo.setTimeout(180000);
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 60000 });
    await page.locator('#launch-button').click();
    expect(await page.locator('#launch-button').isDisabled()).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    await page.evaluate(() => {
      window.__arcaDebug?.clearDialogueQueue();
      window.__arcaDebug?.setPlayerMode('ship');
      window.__arcaDebug?.setPlayerPosition(0, 24, 42);
    });

    const readRealShipY = () => page.evaluate(() => {
      const shipObject = window.__arcaScene?.getObjectByName('Player Scout Ship');
      if (!shipObject) return Number.NaN;
      shipObject.updateWorldMatrix(true, false);
      return shipObject.matrixWorld.elements[13];
    });

    const initialY = await readRealShipY();
    expect(Number.isFinite(initialY)).toBe(true);
    await page.keyboard.down('Space');
    await page.waitForFunction(
      (startY) => (window.__arcaDiagnostics?.shipRealY ?? 0) > startY + 5,
      initialY,
      { timeout: 10000 }
    );
    const peakY = await readRealShipY();
    await page.keyboard.up('Space');
    const releasedY = await readRealShipY();
    await page.waitForTimeout(3000);
    await page.waitForFunction(
      () => Math.abs(window.__arcaDiagnostics?.shipVerticalVelocity ?? Number.POSITIVE_INFINITY) < 0.15,
      undefined,
      { timeout: 12000 }
    );
    const stabilizedY = await readRealShipY();
    const altitudeDiagnostics = await page.evaluate(() => ({
      target: window.__arcaDiagnostics?.shipAltitudeHoldTarget ?? 0,
      holdY: window.__arcaDiagnostics?.shipAltitudeHoldY ?? 0,
      verticalVelocity: window.__arcaDiagnostics?.shipVerticalVelocity ?? 0,
      realY: window.__arcaDiagnostics?.shipRealY ?? 0,
      clearance: window.__arcaDiagnostics?.shipTerrainClearance ?? 0,
      resetForce: window.__arcaDiagnostics?.shipAltitudeResetForce ?? 0,
      cameraFollowInitialized: window.__arcaDiagnostics?.cameraFollowInitialized ?? false,
      cameraJumpDistance: window.__arcaDiagnostics?.cameraJumpDistance ?? Number.POSITIVE_INFINITY
    }));

    expect(stabilizedY).toBeGreaterThan(initialY + 1.2);
    expect(stabilizedY).toBeGreaterThanOrEqual(peakY - 0.25);
    expect(Math.abs(stabilizedY - releasedY)).toBeLessThan(4);
    expect(Math.abs(altitudeDiagnostics.realY - stabilizedY)).toBeLessThan(0.2);
    expect(Math.abs(altitudeDiagnostics.target - stabilizedY)).toBeLessThan(0.2);
    expect(Math.abs(altitudeDiagnostics.holdY - stabilizedY)).toBeLessThan(0.2);
    expect(Math.abs(altitudeDiagnostics.verticalVelocity)).toBeLessThan(0.15);
    expect(altitudeDiagnostics.clearance).toBeGreaterThanOrEqual(5.1);
    expect(altitudeDiagnostics.resetForce).toBeGreaterThanOrEqual(0);
    expect(altitudeDiagnostics.cameraFollowInitialized).toBe(true);
    expect(altitudeDiagnostics.cameraJumpDistance).toBeLessThan(3);

    const altitudeSave = await page.evaluate(() => window.__arcaDebug?.saveGame());
    const savedY = altitudeSave?.shipSurfacePosition?.[1] ?? Number.NaN;
    expect(Math.abs(savedY - stabilizedY)).toBeLessThan(0.2);
    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(0, 24, 42));
    expect(await page.evaluate(() => window.__arcaDebug?.loadGame())).toBeDefined();
    await page.waitForFunction(
      (expectedY) => Math.abs((window.__arcaDiagnostics?.shipRealY ?? 0) - expectedY) < 0.5,
      savedY
    );
    expect(Math.abs((await readRealShipY()) - savedY)).toBeLessThan(0.5);

    const debugResult = await page.evaluate(() => window.__arcaDebug?.testShipAltitudeHold());
    expect(debugResult?.peakY).toBeGreaterThan((debugResult?.beforeY ?? 0) + 1);
    expect(debugResult?.afterY).toBeGreaterThan((debugResult?.beforeY ?? 0) + 1);
    expect(debugResult?.snappedBack).toBe(false);
  });
});

test('guides and plays Mission 03 first contact and restores every strategic unlock', async ({ page }, testInfo) => {
  testInfo.setTimeout(480000);
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').dispatchEvent('click');
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.startMission03())).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.makeBaseOperational())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission03Started === true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.currentMissionId)).toBe('mission-03-first-contact');
    let objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.missionTitle).toContain('Mision 03');
    expect(objective?.step).toBe('deepSignal');
    expect(objective?.target).toContain('COMUNICACIONES');
    expect(objective?.nextAction).toMatch(/Base Nereida|comunicaciones/i);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list')).toContainText('BASE NEREIDA');
    await expect(page.locator('#starmap-poi-list')).toContainText('MÓDULO DE COMUNICACIONES');
    await expect(page.locator('#starmap-poi-list .is-target')).toContainText('MÓDULO DE COMUNICACIONES');
    await page.keyboard.press('KeyM');

    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.evaluate(() => window.__arcaDebug?.teleportCharacterToHabitat());
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.key).toBe('E');
    expect(objective?.distance).toBeLessThan(52);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission03Step === 'calibrateCommunications');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('calibrateCommunications');
    expect(objective?.key).toBe('E');
    expect(objective?.nextAction).toContain('E');
    expect(await page.evaluate(() => window.__arcaDebug?.calibrateMission03Communications())).toBe(true);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('resonancePoint');
    expect(objective?.target).toContain('NAVE');
    expect(objective?.nextAction).toMatch(/nave|elevador/i);

    expect(await page.evaluate(() => {
      const resonator = window.__arcaScene?.getObjectByName('Resonador Atlas');
      return Boolean(resonator?.visible);
    })).toBe(true);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-overlay')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('#starmap-poi-list')).toContainText('RESONADOR ATLAS');
    await expect(page.locator('#starmap-poi-list .is-target')).toContainText('NAVE DE RECONOCIMIENTO');
    await page.keyboard.press('KeyM');

    await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.target).toContain('RESONADOR ATLAS');
    expect(objective?.key).toBe('WASD');
    await page.evaluate(() => window.__arcaDebug?.teleportToResonadorAtlas());
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission03Step === 'relayBeacon');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.target).toContain('NAVE');
    expect(objective?.key).toBe('F');
    expect(objective?.nextAction).toBe('Desciende con F.');
    await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
    await page.evaluate(() => window.__arcaDebug?.teleportToResonadorAtlas());
    await page.waitForTimeout(1100);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.key).toBe('E');
    expect(objective?.nextAction).toMatch(/colocar|baliza/i);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.relayBeaconPlaced === true);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('synchronization');
    expect(objective?.key).toBe('');
    expect(objective?.nextAction).toBe('Permanece dentro del rango de la baliza.');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list')).toContainText('RESONADOR ATLAS');
    await expect(page.locator('#starmap-poi-list')).toContainText('BALIZA DE ENLACE PLEYADANA');
    await expect(page.locator('#starmap-poi-list')).toContainText('RANGO DE SEÑAL');
    await expect(page.locator('#starmap-poi-list .is-target')).toContainText('RANGO DE SEÑAL');
    await page.keyboard.press('KeyM');
    await page.screenshot({ path: 'test-results/arca-epsilon-m03-resonator.png', fullPage: false, timeout: 60000 });

    const initialStability = await page.evaluate(() => window.__arcaDiagnostics?.signalStability ?? 0);
    await expect.poll(
      () => page.evaluate(() => window.__arcaDiagnostics?.signalStability ?? 0),
      { timeout: 5000 }
    ).toBeGreaterThan(initialStability);
    await page.waitForFunction(() => (window.__arcaDiagnostics?.signalStability ?? 0) > 2, undefined, { timeout: 8000 });
    await page.waitForFunction(() => window.__arcaDiagnostics?.relaySignalFlowActive === true, undefined, { timeout: 8000 });
    expect(await page.evaluate(() => window.__arcaDiagnostics?.relaySignalFlowActive)).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(0, 0, 0));
    await page.waitForFunction(() => window.__arcaDiagnostics?.playerInRelayRange === false);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.key).toBe('WASD');
    expect(objective?.blockedReason).toContain('fuera del rango');
    const outOfRangeStability = await page.evaluate(() => window.__arcaDiagnostics?.signalStability ?? 0);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.signalStability ?? 0)).toBeLessThan(outOfRangeStability);

    expect(await page.evaluate(() => window.__arcaDebug?.completeSignalSync())).toBe(100);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('returnToBase');
    expect(objective?.target).toContain('NAVE');
    expect(objective?.key).toBe('WASD');
    const midMissionSave = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(midMissionSave?.mission03Step).toBe('returnToBase');
    const restoredMidMission = await page.evaluate(() => {
      const resetState = window.__arcaDebug?.resetMission03State();
      const loaded = window.__arcaDebug?.loadGame();
      return { resetState, loaded: Boolean(loaded), state: window.__arcaDebug?.getMission03State() };
    });
    expect(restoredMidMission.resetState).toBe(false);
    expect(restoredMidMission.loaded).toBe(true);
    expect(restoredMidMission.state?.mission03Step).toBe('returnToBase');
    await page.evaluate(() => window.__arcaDebug?.returnToBaseForTranslation());
    await page.waitForTimeout(1100);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.target).toContain('COMUNICACIONES');
    expect(objective?.key).toBe('E');
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.translationState === 'partialTranslation');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('atlasTranslation');
    expect(objective?.key).toBe('');
    await expect.poll(
      () => page.evaluate(() => window.__arcaDiagnostics?.translationProgress ?? 0),
      { timeout: 5000 }
    ).toBeGreaterThan(0);

    expect(await page.evaluate(() => window.__arcaDebug?.completeMission03Translation())).toBe('firstContact');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.target).toContain('PROYECCION PLEYADANA');
    expect(objective?.key).toBe('E');
    expect(objective?.nextAction).toMatch(/transmisi.n Pleyadana/i);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list .is-target')).toContainText('PROYECCIÓN PLEYADANA');
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    expect((await page.evaluate(() => window.__arcaDebug?.getMission03State()))?.mission03Step).toBe('warning');
    await page.waitForFunction(() => window.__arcaDiagnostics?.hologramWarningActive === true, undefined, { timeout: 15000 });
    expect(await page.evaluate(() => {
      const hologram = window.__arcaScene?.getObjectByName('Proyeccion Holografica Pleyadana');
      return Boolean(hologram?.visible);
    })).toBe(true);
    await page.screenshot({ path: 'test-results/arca-epsilon-m03-contact.png', fullPage: false, timeout: 60000 });
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.galacticThreatKnown === true);
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission03Completed === true, undefined, { timeout: 15000 });

    let state = await page.evaluate(() => window.__arcaDebug?.getMission03State());
    expect(state?.pleyadanContactEstablished).toBe(true);
    expect(state?.atlasTranslationMatrixUnlocked).toBe(true);
    expect(state?.galacticThreatKnown).toBe(true);
    expect(state?.orbitalDefenseRequired).toBe(true);
    expect(state?.mission04Unlocked).toBe(true);
    expect(state?.mission03Step).toBe('completed');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.activeThreats)).toBe(0);

    const saved = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(saved?.mission03Completed).toBe(true);
    expect(saved?.mission04Unlocked).toBe(true);
    const restored = await page.evaluate(() => {
      const resetState = window.__arcaDebug?.resetMission03State();
      const loaded = window.__arcaDebug?.loadGame();
      return { resetState, loaded: Boolean(loaded), state: window.__arcaDebug?.getMission03State() };
    });
    expect(restored.resetState).toBe(false);
    expect(restored.loaded).toBe(true);
    state = restored.state;
    expect(state?.mission03Completed).toBe(true);
    expect(state?.mission04Unlocked).toBe(true);
    expect(state?.translationState).toBe('warningDelivered');
    await expectNonBlankWebGLCanvas(page);
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
  });
});

test('builds the Mission 04 orbital defense network and preserves its strategic state', async ({ page }, testInfo) => {
  testInfo.setTimeout(480000);
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').click();
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.makeBaseOperational())).toBe(true);

    expect(await page.evaluate(() => window.__arcaDebug?.startMission04())).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission04Started)).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.startMission03())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.calibrateMission03Communications())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.placeRelayBeacon())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.completeSignalSync())).toBe(100);
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission03Translation())).toBe('firstContact');
    expect(await page.evaluate(() => window.__arcaDebug?.completePleyadanContact())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission03())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission04())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

    let objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.missionTitle).toContain('Mision 04');
    expect(objective?.step).toBe('returnToBase');
    expect(objective?.nextAction).toMatch(/Base Nereida/i);

    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list')).toContainText('BALIZA DEFENSIVA NORTE');
    await expect(page.locator('#starmap-poi-list')).toContainText('BALIZA DEFENSIVA ESTE');
    await expect(page.locator('#starmap-poi-list')).toContainText('BALIZA DEFENSIVA SUR');
    await expect(page.locator('#starmap-poi-list')).toContainText('RED DEFENSIVA ORBITAL');
    await page.keyboard.press('KeyM');

    await page.evaluate(() => {
      window.__arcaDebug?.setPlayerMode('ship');
      window.__arcaDebug?.returnToBaseForTranslation();
    });
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('calibrateDefenseLink');
    expect(objective?.key).toBe('E');
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.defenseNetworkState === 'calibrating');
    expect((await page.evaluate(() => window.__arcaDebug?.getMission04State()))?.defenseLinkCalibrationProgress).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__arcaDebug?.calibrateMission04DefenseLink())).toBe(true);
    expect((await page.evaluate(() => window.__arcaDebug?.getMission04State()))?.mission04Step).toBe('activateOrbitalSensor');
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.__arcaDebug?.simulateAction('scan'))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission04Step === 'travelToBeacon');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.target).toContain('BALIZA DEFENSIVA NORTE');
    expect(objective?.key).toBe('WASD');
    expect((await page.evaluate(() => window.__arcaDebug?.getDefenseNetworkVisualState()))?.defenseNetworkVisible).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.teleportToDefenseBeacon(0))).toBeDefined();
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('deployBeacon');
    expect(objective?.target).toContain('NAVE');
    expect(objective?.key).toBe('F');
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => window.__arcaDiagnostics?.onFootActive === true, undefined, { timeout: 20000 });
    expect(await page.evaluate(() => window.__arcaDebug?.teleportToDefenseBeacon(0))).toBeDefined();
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.defensiveBeaconsPlaced?.[0] === true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.defenseLinksActive === true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.activeDefenseLinkCount)).toBe(1);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.defenseNetworkVisible)).toBe(true);
    const cameraProbes = await page.evaluate(() => ({
      beacon: window.__arcaDebug?.lookAtDefenseBeacon(0),
      base: window.__arcaDebug?.setCameraLookAt('Base Nereida')
    }));
    expect(cameraProbes.beacon?.targetName).toBe('Baliza Defensiva Norte');
    expect(cameraProbes.base?.targetName).toBe('Base Nereida');
    expect(cameraProbes.beacon?.cameraPosition.every(Number.isFinite)).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.setCameraMode('external'));

    expect(await page.evaluate(() => window.__arcaDebug?.placeDefenseBeacon(1))).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.placeDefenseBeacon(2))).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission04Step === 'synchronizeNetwork');
    await page.waitForFunction(() => window.__arcaDiagnostics?.activeDefenseLinkCount === 3);
    expect(await page.evaluate(() => window.__arcaDebug?.teleportToDefenseBeacon(2))).toBeDefined();
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.nextAction).toContain('Permanece dentro del rango');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list')).toContainText('RANGO DE SINCRONIZACION DEFENSIVA');
    await expect(page.locator('#starmap-poi-list .is-target')).toContainText('RANGO DE SINCRONIZACION DEFENSIVA');
    await page.keyboard.press('KeyM');

    const initialSync = await page.evaluate(() => window.__arcaDiagnostics?.defenseSyncProgress ?? 0);
    await expect.poll(
      () => page.evaluate(() => window.__arcaDiagnostics?.defenseSyncProgress ?? 0),
      { timeout: 5000 }
    ).toBeGreaterThan(initialSync);
    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(0, 0, 0));
    const outOfRangeSync = await page.evaluate(() => window.__arcaDiagnostics?.defenseSyncProgress ?? 0);
    await page.waitForFunction(() => window.__arcaDiagnostics?.defenseLinksUnstable === true, undefined, { timeout: 10000 });
    expect(await page.evaluate(() => window.__arcaDiagnostics?.defenseLinksOnline)).toBe(false);
    await page.waitForTimeout(1300);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.defenseSyncProgress ?? 0)).toBeLessThan(outOfRangeSync);
    expect(await page.evaluate(() => window.__arcaDebug?.completeDefenseSync())).toBe(100);
    await page.waitForFunction(() => window.__arcaDiagnostics?.defenseLinksOnline === true, undefined, { timeout: 10000 });
    const onlineVisuals = await page.evaluate(() => window.__arcaDebug?.getDefenseNetworkVisualState());
    expect(onlineVisuals?.defenseLinksUnstable).toBe(false);
    expect(onlineVisuals?.activeDefenseLinkCount).toBe(3);
    await page.screenshot({ path: 'test-results/arca-epsilon-m04-network.png', fullPage: false, timeout: 60000 });

    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('returnToShip');
    expect(objective?.target).toContain('NAVE');
    expect(await page.evaluate(() => window.__arcaDebug?.spawnCharacterAtShip())).toBeDefined();
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => window.__arcaDiagnostics?.insideShip === true, undefined, { timeout: 20000 });
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission04Step === 'orbitalScan');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.threatSignatureWorldVisible)).toBe(false);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.key).toBe('Space');
    expect(objective?.blockedReason).toContain('altura insuficiente');

    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(0, 80, 0));
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.threatSignatureDetected === true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.threatSignatureWorldVisible === true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.activeThreats)).toBe(0);
    const threatProbe = await page.evaluate(() => window.__arcaDebug?.lookAtThreatSignature());
    expect(threatProbe?.targetName).toBe('Firma Anomala');
    expect(threatProbe?.targetPosition.every(Number.isFinite)).toBe(true);
    await page.screenshot({ path: 'test-results/arca-epsilon-m04-signature.png', fullPage: false, timeout: 60000 });
    await page.evaluate(() => window.__arcaDebug?.setCameraMode('external'));
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('threatSignature');
    expect(objective?.target).toContain('FIRMA ANOMALA');
    expect(objective?.key).toBe('E');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list .is-target')).toContainText('FIRMA ANOMALA DISTANTE');
    await page.keyboard.press('KeyM');

    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission04Completed === true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission05Unlocked)).toBe(true);

    const saved = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(saved?.mission04Completed).toBe(true);
    expect(saved?.mission05Unlocked).toBe(true);
    expect(saved?.defensiveBeaconsPlaced).toEqual([true, true, true]);
    const restored = await page.evaluate(() => {
      window.__arcaDebug?.resetMission04State();
      const loaded = window.__arcaDebug?.loadGame();
      return { loaded: Boolean(loaded), state: window.__arcaDebug?.getMission04State() };
    });
    expect(restored.loaded).toBe(true);
    expect(restored.state?.mission04Completed).toBe(true);
    expect(restored.state?.mission05Unlocked).toBe(true);
    expect(restored.state?.defensiveBeaconsPlaced).toEqual([true, true, true]);
    await expectNonBlankWebGLCanvas(page);
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
  });
});

test('contains the Mission 05 Silent Probe crisis without starting combat', async ({ page }, testInfo) => {
  testInfo.setTimeout(480000);
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').click();
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.makeBaseOperational())).toBe(true);

    expect(await page.evaluate(() => window.__arcaDebug?.startMission05())).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission05Started)).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.startMission03())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.calibrateMission03Communications())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.placeRelayBeacon())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.completeSignalSync())).toBe(100);
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission03Translation())).toBe('firstContact');
    expect(await page.evaluate(() => window.__arcaDebug?.completePleyadanContact())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission03())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission04())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission05())).toBe(false);

    await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission04())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission05())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

    let objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.missionTitle).toContain('Mision 05');
    expect(objective?.step).toBe('boardShip');
    expect(objective?.target).toContain('NAVE');
    expect(objective?.key).toMatch(/F|WASD/);

    await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission05Step === 'gainScanAltitude');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.nextAction).toContain('Space');
    expect(objective?.key).toBe('Space');

    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(0, 110, 0));
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission05Step === 'orbitalScan');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.nextAction).toMatch(/barrido orbital/i);
    expect(objective?.key).toBe('E');

    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.probeState === 'detected');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('approachProbe');
    expect(objective?.target).toContain('SONDA SILENCIOSA');
    expect(objective?.key).toBe('WASD');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.activeThreats)).toBe(0);

    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list')).toContainText('SONDA SILENCIOSA');
    await expect(page.locator('#starmap-poi-list')).not.toContainText('FIRMA ANOMALA DISTANTE');
    await expect(page.locator('#starmap-poi-list')).not.toContainText('ECO DE INTERFERENCIA 1');
    await page.keyboard.press('KeyM');
    const probeCamera = await page.evaluate(() => window.__arcaDebug?.setCameraLookAt('Sonda Silenciosa'));
    expect(probeCamera?.targetName).toBe('Sonda Silenciosa');
    expect(probeCamera?.targetPosition.every(Number.isFinite)).toBe(true);
    await page.screenshot({ path: 'test-results/arca-epsilon-m05-probe.png', fullPage: false, timeout: 60000 });
    await page.evaluate(() => window.__arcaDebug?.setCameraMode('external'));

    expect(await page.evaluate(() => window.__arcaDebug?.teleportToSilentProbe())).toHaveLength(3);
    await page.waitForFunction(() => window.__arcaDiagnostics?.interferenceActive === true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.probeState)).toBe('jammed');
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('atlasRecalibration');
    expect(objective?.key).toBe('E');
    expect(objective?.nextAction).toMatch(/frecuencia Atlas/i);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list .is-uncertain')).toContainText('SONDA SILENCIOSA');
    await page.keyboard.press('KeyM');

    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission05Step === 'trackEcho');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.activeEchoIndex)).toBe(0);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#starmap-poi-list')).toContainText('ECO DE INTERFERENCIA 1');
    await expect(page.locator('#starmap-poi-list')).toContainText('ECO DE INTERFERENCIA 2');
    await expect(page.locator('#starmap-poi-list')).toContainText('ECO DE INTERFERENCIA 3');
    await expect(page.locator('#starmap-poi-list .is-target')).toContainText('ECO DE INTERFERENCIA 1');
    await page.screenshot({ path: 'test-results/arca-epsilon-m05-echoes.png', fullPage: false, timeout: 60000 });
    await page.keyboard.press('KeyM');

    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(170, 82, -250));
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.echoesResolved === 1);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.activeEchoIndex)).toBe(1);

    const midMissionRestore = await page.evaluate(() => {
      const saved = window.__arcaDebug?.saveGame();
      window.__arcaDebug?.resetMission05State();
      const loaded = window.__arcaDebug?.loadGame();
      return { saved, loaded: Boolean(loaded), state: window.__arcaDebug?.getMission05State() };
    });
    expect(midMissionRestore.saved?.mission05Step).toBe('trackEcho');
    expect(midMissionRestore.saved?.echoesResolved).toBe(1);
    expect(midMissionRestore.loaded).toBe(true);
    expect(midMissionRestore.state?.mission05Step).toBe('trackEcho');
    expect(midMissionRestore.state?.echoesResolved).toBe(1);
    expect(midMissionRestore.state?.interferenceActive).toBe(true);

    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(315, 108, -365));
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.echoesResolved === 2);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.target).toContain('ECO DE INTERFERENCIA 3');

    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(440, 132, -455));
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission05Step === 'counterSignal');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.echoesResolved)).toBe(3);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.target).toContain('SONDA SILENCIOSA');

    expect(await page.evaluate(() => window.__arcaDebug?.teleportToSilentProbe())).toHaveLength(3);
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window.__arcaDiagnostics?.counterSignalProgress ?? 0) > 0);
    // WebGL software rendering can fall near 1 FPS while gameplay delta remains
    // intentionally capped; allow enough real time for the 4.5 s signal pulse.
    await page.waitForFunction(() => window.__arcaDiagnostics?.probeRetreated === true, undefined, { timeout: 180000 });
    expect(await page.evaluate(() => window.__arcaDiagnostics?.counterSignalProgress)).toBe(100);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.interferenceActive)).toBe(false);
    objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.step).toBe('returnToBase');
    expect(objective?.nextAction).toContain('Base Nereida');

    expect(await page.evaluate(() => window.__arcaDebug?.returnToBaseForTranslation())).toHaveLength(3);
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
    await page.waitForTimeout(1100);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__arcaDiagnostics?.firstHostileContactConfirmed === true);
    const finalState = await page.evaluate(() => window.__arcaDebug?.getMission05State());
    expect(finalState?.mission05Completed).toBe(true);
    expect(finalState?.mission06Unlocked).toBe(true);
    expect(finalState?.probeRetreated).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.activeThreats)).toBe(0);

    const finalSave = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(finalSave?.mission05Completed).toBe(true);
    expect(finalSave?.firstHostileContactConfirmed).toBe(true);
    expect(finalSave?.mission06Unlocked).toBe(true);
    await expectNonBlankWebGLCanvas(page);
    expect(await page.evaluate(() => window.__arcaDebug?.clearSave())).toBe(false);
  });
});


test('purges the Mission 14 Coalition trace in order and unlocks Mission 15', async ({ page }, testInfo) => {
  testInfo.setTimeout(600000);
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').click();
    await page.evaluate(() => window.__arcaDebug?.clearSave());
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.makeBaseOperational())).toBe(true);

    // --- M14 must be inert before its unlock, from a standing start.
    expect(await page.evaluate(() => window.__arcaDebug?.getMission14State().mission14Started)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.getMission14State().mission14Step)).toBe('inactive');

    // --- Walk the prerequisite chain up to M13.
    expect(await page.evaluate(() => window.__arcaDebug?.startMission03())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.calibrateMission03Communications());
    await page.evaluate(() => window.__arcaDebug?.placeRelayBeacon());
    await page.evaluate(() => window.__arcaDebug?.completeSignalSync());
    await page.evaluate(() => window.__arcaDebug?.completeMission03Translation());
    await page.evaluate(() => window.__arcaDebug?.completePleyadanContact());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission03())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission04())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission04())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission05())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.detectSilentProbe());
    await page.evaluate(() => window.__arcaDebug?.triggerInterference());
    await page.evaluate(() => window.__arcaDebug?.resolveAllEchoes());
    await page.evaluate(() => window.__arcaDebug?.completeCounterSignal());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission05())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission06())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.placeAllCloakingProjectors());
    await page.evaluate(() => window.__arcaDebug?.completeCloakingSync());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission06())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission07())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.scanAllAtlasEchoNodes());
    await page.evaluate(() => window.__arcaDebug?.activateAtlasSeedArchive());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission07())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission08())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.stabilizeAllFractureFoci());
    await page.evaluate(() => window.__arcaDebug?.completeSignalPurge());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission08())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission09())).toBe(true);

    // Still inert: nothing below M13 may arm M14.
    expect(await page.evaluate(() => window.__arcaDebug?.getMission14State().mission14Started)).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.completeMission13())).toBe(true);
    // The diagnostics mirror lags a frame, so wait rather than read straight back.
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Unlocked === true);
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

    // --- M14 arms itself from the update loop once M13 closes.
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Started === true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'inspectPower');
    const objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.missionTitle).toContain('Misión 14');

    // --- Out-of-sequence moves are refused: standing on the hidden node during
    // phase 1 must not locate it or skip the analysis.
    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(30, 0, -4232));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission14Step)).toBe('inspectPower');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionHiddenNodeLocated)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionSignatureAnalyzed)).toBe(false);

    // --- Phase 1: three inspections, in order.
    expect(await page.evaluate(() => window.__arcaDebug?.completeTraceInspections())).toBe(3);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'analyzeSignature');

    // --- Phase 2: the terminal identifies three contaminated nodes.
    expect(await page.evaluate(() => window.__arcaDebug?.analyzeCoalitionSignature())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'purgePowerNode');
    let readout = await page.evaluate(() => window.__arcaDebug?.getCoalitionTraceReadout());
    expect(readout?.purgedNodes).toBe(0);
    expect(readout?.contamination).toBeGreaterThan(90);
    expect(readout?.hostileTriangulation).toBeGreaterThan(0);

    // Visual evidence of the contamination layer standing at the marked node.
    await page.evaluate(() => window.__arcaDebug?.teleportToTraceStation('power'));
    await page.waitForTimeout(900);
    await expectNonBlankWebGLCanvas(page);
    await page.screenshot({ path: 'test-results/arca-epsilon-m14-contamination.png', fullPage: false, timeout: 60000 });

    // --- Save/load during the purge resumes the phase cleanly.
    await page.evaluate(() => window.__arcaDebug?.saveGame());
    // Read the restored progress in the same turn as the load: once a frame
    // runs, a pilot standing at a tuned node legitimately starts purging again,
    // so waiting first would test frame timing rather than the restore.
    const restoredProgress = await page.evaluate(() => {
      window.__arcaDebug?.loadGame();
      return window.__arcaDebug?.getCoalitionTraceReadout().phaseProgress;
    });
    expect(restoredProgress).toBe(0);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission14Step)).toBe('purgePowerNode');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionSignatureAnalyzed)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionPowerNodePurged)).toBe(false);

    // --- Phases 3 and 4: the two reused nodes come off the air one at a time.
    expect(await page.evaluate(() => window.__arcaDebug?.purgeCoalitionPowerNode())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'purgeCommsNode');
    expect(await page.evaluate(() => window.__arcaDebug?.getCoalitionTraceReadout().purgedNodes)).toBe(1);
    expect(await page.evaluate(() => window.__arcaDebug?.purgeCoalitionCommsNode())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'locateHiddenNode');
    expect(await page.evaluate(() => window.__arcaDebug?.getCoalitionTraceReadout().purgedNodes)).toBe(2);

    // --- Phase 5: the search must not hand over the target early.
    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(120, 0, -4160));
    await page.waitForTimeout(500);
    const farReadout = await page.evaluate(() => window.__arcaDebug?.getCoalitionTraceReadout());
    expect(farReadout?.signalIntensity).toBeGreaterThan(0);
    expect(farReadout?.signalIntensity).toBeLessThan(50);
    // The objective never names the target while it is still unfound.
    const farObjective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(farObjective?.target).toContain('FUENTE DESCONOCIDA');
    expect(farObjective?.target).not.toContain('SENSOR');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission14Step)).toBe('locateHiddenNode');

    // Close in: the marker only appears inside reveal range.
    await page.evaluate(() => window.__arcaDebug?.setPlayerPosition(36, 0, -4228));
    await page.waitForTimeout(500);
    const nearReadout = await page.evaluate(() => window.__arcaDebug?.getCoalitionTraceReadout());
    expect(nearReadout?.signalIntensity ?? 0).toBeGreaterThan(farReadout?.signalIntensity ?? 0);
    const nearObjective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(nearObjective?.target).toContain('SENSOR PERIMETRAL 04');

    // --- Phases 6 and 7.
    expect(await page.evaluate(() => window.__arcaDebug?.locateCoalitionHiddenNode())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'extractSample');
    expect(await page.evaluate(() => window.__arcaDebug?.extractCoalitionSample())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.coalitionTraceSampleRecovered === true);
    expect(await page.evaluate(() => window.__arcaDebug?.getCoalitionTraceReadout().purgedNodes)).toBe(3);

    // Save/load after the sample keeps the recovered flag and the next phase.
    await page.evaluate(() => window.__arcaDebug?.saveGame());
    await page.evaluate(() => window.__arcaDebug?.loadGame());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionTraceSampleRecovered)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission14Step)).toBe('reverseTriangulate');

    expect(await page.evaluate(() => window.__arcaDebug?.completeReverseTriangulation())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'traceClosure');

    // --- Phase 8: the mission closes and unlocks M15 without starting it.
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission14())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Completed === true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission15Unlocked)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionTraceSampleRecovered)).toBe(true);

    // Nothing may be left running once the trace is closed.
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionTraceVisualActive)).toBe(false);
    readout = await page.evaluate(() => window.__arcaDebug?.getCoalitionTraceReadout());
    expect(readout?.contamination).toBe(0);
    expect(readout?.hostileTriangulation).toBe(0);

    // --- Earlier missions survive intact.
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission13Completed)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission12Completed)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission09Completed)).toBe(true);

    // --- A save written before M14 existed must load with safe defaults.
    const saved = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(saved?.mission14Completed).toBe(true);
    expect(saved?.mission15Unlocked).toBe(true);
    expect(saved?.coalitionTraceSampleRecovered).toBe(true);
    const legacy = await page.evaluate(() => {
      const raw = window.localStorage.getItem('arca-epsilon-save-v2');
      const data = JSON.parse(raw ?? '{}') as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        if (key.startsWith('mission14') || key.startsWith('mission15') || key.startsWith('coalition')) {
          delete data[key];
        }
      }
      window.localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(data));
      return window.__arcaDebug?.loadGame();
    });
    expect(legacy).toBeTruthy();
    // Every M14 field defaults safely, so no progress is inherited...
    expect(legacy?.mission14Started).toBeUndefined();
    expect(legacy?.coalitionTraceSampleRecovered).toBeUndefined();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission14Completed)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission15Unlocked)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionTraceSampleRecovered)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.coalitionPowerNodePurged)).toBe(false);
    // ...and because M13 is still complete, the mission legitimately re-arms
    // from its first step rather than resuming a phase it never recorded.
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission14Step === 'inspectPower');

    await expectNonBlankWebGLCanvas(page);
    await page.screenshot({ path: 'test-results/arca-epsilon-m14-trace.png', fullPage: false, timeout: 60000 });
  });
});


test('stops the Aurora sabotage in order and unlocks Mission 16', async ({ page }, testInfo) => {
  testInfo.setTimeout(600000);
  await expectNoPageErrors(page, async () => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
    await page.locator('#launch-button').click();
    await page.evaluate(() => window.__arcaDebug?.clearSave());
    expect(await page.evaluate(() => window.__arcaDebug?.startSurfacePhase())).toBe('surfacePhase');
    expect(await page.evaluate(() => window.__arcaDebug?.makeBaseOperational())).toBe(true);

    // --- M15 must be inert before its unlock, from a standing start.
    expect(await page.evaluate(() => window.__arcaDebug?.getMission15State().mission15Started)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.getMission15State().mission15Step)).toBe('inactive');

    // --- Walk the prerequisite chain up to M14.
    expect(await page.evaluate(() => window.__arcaDebug?.startMission03())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.calibrateMission03Communications());
    await page.evaluate(() => window.__arcaDebug?.placeRelayBeacon());
    await page.evaluate(() => window.__arcaDebug?.completeSignalSync());
    await page.evaluate(() => window.__arcaDebug?.completeMission03Translation());
    await page.evaluate(() => window.__arcaDebug?.completePleyadanContact());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission03())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission04())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission04())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission05())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.detectSilentProbe());
    await page.evaluate(() => window.__arcaDebug?.triggerInterference());
    await page.evaluate(() => window.__arcaDebug?.resolveAllEchoes());
    await page.evaluate(() => window.__arcaDebug?.completeCounterSignal());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission05())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission06())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.placeAllCloakingProjectors());
    await page.evaluate(() => window.__arcaDebug?.completeCloakingSync());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission06())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission07())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.scanAllAtlasEchoNodes());
    await page.evaluate(() => window.__arcaDebug?.activateAtlasSeedArchive());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission07())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.startMission08())).toBe(true);
    await page.evaluate(() => window.__arcaDebug?.stabilizeAllFractureFoci());
    await page.evaluate(() => window.__arcaDebug?.completeSignalPurge());
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission08())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission09())).toBe(true);
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission13())).toBe(true);

    // Still inert: nothing below M14 may arm M15.
    expect(await page.evaluate(() => window.__arcaDebug?.getMission15State().mission15Started)).toBe(false);

    expect(await page.evaluate(() => window.__arcaDebug?.completeMission14())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission16Unlocked === false);
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

    // --- M15 arms itself from the update loop once M14 closes.
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Started === true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'routineTask');
    const objective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(objective?.missionTitle).toContain('Misión 15');

    // --- Out of sequence: standing on a parasite during the routine must not
    // locate it or skip the emergency.
    await page.evaluate(([px, pz]) => window.__arcaDebug?.setPlayerPosition(px, 0, pz),
      auroraSettlementLayout.parasiteEnergy as unknown as [number, number]);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission15Step)).toBe('routineTask');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraParasitesFound)).toBe(0);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraCoordinatedFailureConfirmed)).toBe(false);

    // --- Phase 1 hands straight over to the sealed module.
    expect(await page.evaluate(() => window.__arcaDebug?.completeAuroraRoutine())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'habitatEmergency');
    await page.waitForFunction(() => window.__arcaDiagnostics?.auroraModuleSealed === true);
    // Pressure genuinely falls while the module stays shut.
    const firstPressure = await page.evaluate(() => window.__arcaDiagnostics?.auroraModulePressure ?? 0);
    await page.waitForTimeout(2500);
    const laterPressure = await page.evaluate(() => window.__arcaDiagnostics?.auroraModulePressure ?? 0);
    expect(laterPressure).toBeLessThan(firstPressure);
    // ...but never past its floor, so the phase cannot be lost.
    expect(laterPressure).toBeGreaterThanOrEqual(22);

    // --- Phase 2/3.
    expect(await page.evaluate(() => window.__arcaDebug?.releaseSealedModule())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'detectCoordinatedFailure');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraModuleSealed)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDebug?.confirmCoordinatedFailure())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'findEnergyParasite');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraCompromisedSystems)).toBe(4);

    // --- Save/load during the hunt resumes the phase cleanly.
    await page.evaluate(() => window.__arcaDebug?.saveGame());
    const restored = await page.evaluate(() => {
      window.__arcaDebug?.loadGame();
      return window.__arcaDebug?.getMission15State();
    });
    expect(restored?.mission15Step).toBe('findEnergyParasite');
    expect(restored?.auroraModuleReleased).toBe(true);
    expect(restored?.auroraModuleSealed).toBe(false);
    await page.waitForTimeout(400);
    // A module already opened must never re-seal on load.
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraModuleSealed)).toBe(false);

    // --- The search must not hand over the target early.
    await page.evaluate(([px, pz]) => window.__arcaDebug?.setPlayerPosition(px, 0, pz),
      auroraSettlementLayout.habitat as unknown as [number, number]);
    await page.waitForTimeout(500);
    const farReadout = await page.evaluate(() => window.__arcaDebug?.getSabotageReadout());
    expect(farReadout?.signalIntensity).toBeGreaterThan(0);
    expect(farReadout?.signalIntensity).toBeLessThan(80);
    const farObjective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(farObjective?.target).toContain('FUENTE DESCONOCIDA');

    await page.evaluate(([px, pz]) => window.__arcaDebug?.setPlayerPosition(px + 2, 0, pz + 2),
      auroraSettlementLayout.parasiteEnergy as unknown as [number, number]);
    await page.waitForTimeout(500);
    const nearReadout = await page.evaluate(() => window.__arcaDebug?.getSabotageReadout());
    expect(nearReadout?.signalIntensity ?? 0).toBeGreaterThan(farReadout?.signalIntensity ?? 0);
    const nearObjective = await page.evaluate(() => window.__arcaDebug?.getCurrentObjectiveDisplay());
    expect(nearObjective?.target).toContain('PARASITO');

    // --- All three nodes, each through its own disarm.
    expect(await page.evaluate(() => window.__arcaDebug?.disableParasite(0))).toBe(1);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'findLifeSupportParasite');
    expect(await page.evaluate(() => window.__arcaDebug?.disableParasite(1))).toBe(2);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'findCommsParasite');
    expect(await page.evaluate(() => window.__arcaDebug?.disableParasite(2))).toBe(3);
    // The last kill hands straight over to the core.
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'centralOverload');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraCentralOverload)).toBeGreaterThan(0);

    // --- The overload can be resolved.
    expect(await page.evaluate(() => window.__arcaDebug?.resolveCentralOverload())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'analyzeParasite');
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraCentralOverload)).toBe(0);

    // --- Close: M15 completes and unlocks M16 without starting it.
    expect(await page.evaluate(() => window.__arcaDebug?.completeMission15())).toBe(true);
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Completed === true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission16Unlocked)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraParasiteAnalyzed)).toBe(true);

    // Nothing may be left running once the colony is restored.
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraSabotageVisualActive)).toBe(false);
    const finalReadout = await page.evaluate(() => window.__arcaDebug?.getSabotageReadout());
    expect(finalReadout?.centralOverload).toBe(0);
    expect(finalReadout?.compromisedSystems).toBe(0);
    expect(finalReadout?.modulePressure).toBe(100);

    // --- Earlier missions survive intact.
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission14Completed)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission13Completed)).toBe(true);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission09Completed)).toBe(true);

    // --- A save written before M15 existed loads with safe defaults.
    const saved = await page.evaluate(() => window.__arcaDebug?.saveGame());
    expect(saved?.mission15Completed).toBe(true);
    expect(saved?.mission16Unlocked).toBe(true);
    const legacy = await page.evaluate(() => {
      const raw = window.localStorage.getItem('arca-epsilon-save-v2');
      const data = JSON.parse(raw ?? '{}') as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        if (key.startsWith('mission15') || key.startsWith('mission16') || key.startsWith('auroraParasite') ||
            key.startsWith('auroraRoutine') || key.startsWith('auroraModule') ||
            key.startsWith('auroraCoordinated') || key.startsWith('auroraCentral')) {
          delete data[key];
        }
      }
      window.localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(data));
      return window.__arcaDebug?.loadGame();
    });
    expect(legacy).toBeTruthy();
    expect(legacy?.mission15Started).toBeUndefined();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission15Completed)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.mission16Unlocked)).toBe(false);
    expect(await page.evaluate(() => window.__arcaDiagnostics?.auroraParasitesDisabled)).toBe(0);
    // ...and because M14 is still complete, the mission re-arms from step one.
    await page.waitForFunction(() => window.__arcaDiagnostics?.mission15Step === 'routineTask');

    await expectNonBlankWebGLCanvas(page);
    await page.screenshot({ path: 'test-results/arca-epsilon-m15-sabotage.png', fullPage: false, timeout: 60000 });
  });
});

declare global {
  interface Window {
    __arcaGameReady?: boolean;
    __arcaScene?: import('three').Scene;
    __arcaDebug?: {
      setCameraMode: (mode: CameraMode) => CameraMode;
      setCameraLookAt: (target: CameraLookAtInput) => CameraProbeResult | undefined;
      lookAtDefenseBeacon: (index: number) => CameraProbeResult | undefined;
      lookAtThreatSignature: () => CameraProbeResult | undefined;
      getDefenseNetworkVisualState: () => DefenseNetworkVisualState;
      getAudioState: () => AudioDebugState;
      testShipEngineAudio: () => Promise<boolean>;
      testPropulsionAcceleration: () => Promise<boolean>;
      testVerticalThrustAudio: () => Promise<boolean>;
      testBoostAudio: () => Promise<boolean>;
      testWalkFootsteps: () => Promise<boolean>;
      testRunFootsteps: () => Promise<boolean>;
      getFootstepAudioState: () => import('../src/audio/FootstepAudio').FootstepAudioState;
      setMusicState: (state: string) => string;
      playSfx: (id: string) => Promise<boolean>;
      testShipAltitudeHold: () => Promise<{
        beforeY: number;
        peakY: number;
        afterY: number;
        snappedBack: boolean;
      }>;
      toggleCockpitView: () => CameraMode;
      getInputActionState: () => InputActionState;
      simulateAction: (action: GameInputAction) => boolean;
      forceCameraMode: (mode: CameraMode | 'onFoot') => CameraMode | 'onFoot';
      getCharacterControlState: () => CharacterControlState;
      setOnFootCameraYaw: (value: number) => number;
      setOnFootCameraPitch: (value: number) => number;
      toggleCharacterDebug: () => boolean;
      reloadCockpitGlb: () => Promise<CockpitGlbStatus>;
      showCockpitScreenAnchors: (visible: boolean) => boolean;
      hideExternalHudForCockpitCapture: (hidden: boolean) => boolean;
      startCockpitShowcase: () => string;
      advanceToMarker: () => string;
      decodeMarker: () => string;
      startEntry: () => string;
      setEntryProgress: (percent: number) => number;
      attemptEarlyDescent: () => boolean;
      getDescentSafetyState: () => DescentSafetySnapshot;
      finishEntry: () => string;
      touchdown: () => string;
      startSurfacePhase: () => string;
      exitShip: () => PlayerMode;
      enterShip: () => PlayerMode;
      setPlayerMode: (mode: 'ship' | 'onFoot') => PlayerMode;
      spawnCharacterAtShip: () => [number, number, number];
      teleportCharacterToHabitat: () => [number, number, number];
      teleportCharacterToResource: (type: SurfaceResourceType) => [number, number, number] | undefined;
      teleportToWaterSite: () => [number, number, number] | undefined;
      teleportToMineralSite: () => [number, number, number] | undefined;
      teleportToEnergySite: () => [number, number, number] | undefined;
      locateSurfaceSite: (type: SurfaceResourceType) => string;
      sampleSurfaceSite: (type: SurfaceResourceType) => string;
      getResourceInteractionPosition: (type: SurfaceResourceType) => [number, number, number] | undefined;
      getResourceSiteDiagnostics: () => Record<string, ResourceSiteTerrainMetric>;
      completeLanding: () => string;
      deployHabitat: () => number;
      revealSurfaceSites: () => boolean;
      scanAllSurfaceResources: () => number;
      makeBaseOperational: () => boolean;
      analyzeSurfaceSamples: () => boolean;
      startMission03: () => boolean;
      calibrateMission03Communications: () => boolean;
      teleportToResonadorAtlas: () => [number, number, number];
      placeRelayBeacon: () => boolean;
      completeSignalSync: () => number;
      returnToBaseForTranslation: () => [number, number, number];
      completeMission03Translation: () => import('../src/assets/mission03Definitions').Mission03StepId;
      completePleyadanContact: () => boolean;
      completeMission03: () => boolean;
      getMission03State: () => Mission03DebugState;
      resetMission03State: () => boolean;
      startMission04: () => boolean;
      calibrateMission04DefenseLink: () => boolean;
      teleportToDefenseBeacon: (index: number) => [number, number, number] | undefined;
      placeDefenseBeacon: (index: number) => boolean;
      placeAllDefenseBeacons: () => number;
      completeDefenseSync: () => number;
      detectThreatSignature: () => boolean;
      completeMission04: () => boolean;
      getMission04State: () => Mission04DebugState;
      resetMission04State: () => boolean;
      startMission05: () => boolean;
      teleportToSilentProbe: () => [number, number, number];
      detectSilentProbe: () => boolean;
      triggerInterference: () => boolean;
      resolveEcho: (index: number) => boolean;
      resolveAllEchoes: () => number;
      completeCounterSignal: () => number;
      completeMission05: () => boolean;
      getMission05State: () => Mission05DebugState;
      resetMission05State: () => boolean;
      startMission06: () => boolean;
      teleportToCloakingProjector: (index: number) => [number, number, number] | undefined;
      placeCloakingProjector: (index: number) => boolean;
      placeAllCloakingProjectors: () => boolean;
      completeCloakingSync: () => number;
      completeMission06: () => boolean;
      getMission06State: () => Partial<import('../src/game/Mission06NereidaShield').Mission06Snapshot>;
      startMission07: () => boolean;
      teleportToAtlasFracture: () => [number, number, number];
      scanAtlasEchoNode: (index: number) => boolean;
      scanAllAtlasEchoNodes: () => number;
      activateAtlasSeedArchive: () => boolean;
      completeMission07: () => boolean;
      getMission07State: () => import('../src/game/Mission07SubsurfaceEchoes').Mission07Snapshot;
      startMission08: () => boolean;
      teleportToSignalFracture: () => [number, number, number];
      stabilizeFractureFocus: (index: number) => boolean;
      stabilizeAllFractureFoci: () => number;
      completeSignalPurge: () => number;
      completeMission08: () => boolean;
      getMission08State: () => import('../src/game/Mission08SignalFracture').Mission08Snapshot;
      startMission09: () => boolean;
      analyzeResidualTrace: () => boolean;
      teleportToAuroraBeacon: (index: number) => [number, number, number] | undefined;
      scanAuroraBeacon: (index: number) => boolean;
      scanAllAuroraBeacons: () => number;
      teleportToAuroraThreshold: () => [number, number, number];
      teleportToAuroraSegment: (index: number) => [number, number, number];
      triggerAuroraStormMoment: () => string;
      triggerAuroraPreReveal: () => string;
      triggerAuroraReveal: () => boolean;
      getAuroraTravelState: () => import('../src/game/AuroraTravelDirector').AuroraTravelState;
      discoverAuroraSector: () => boolean;
      startMission10: () => boolean;
      surveyAuroraValley: () => boolean;
      teleportToAuroraSample: (kind: import('../src/assets/mission10Definitions').AuroraSampleKind) => [number, number, number];
      teleportToAuroraWater: () => [number, number, number];
      teleportToAuroraSoil: () => [number, number, number];
      teleportToAuroraAtmospherePoint: () => [number, number, number];
      teleportToAuroraBioSample: () => [number, number, number];
      analyzeAuroraSample: (kind: import('../src/assets/mission10Definitions').AuroraSampleKind) => number;
      analyzeAllAuroraSamples: () => number;
      markAuroraSettlementSite: () => boolean;
      deployAuroraModule: () => boolean;
      stabilizeAuroraModule: () => number;
      completeMission10: () => boolean;
      getMission10State: () => import('../src/main').Mission10DebugState;
      startMission11: () => boolean;
      teleportToAuroraStation: (station: 'core' | 'secondModule' | 'link' | 'water' | 'bed') => [number, number, number];
      teleportToAuroraSecondModuleSite: () => [number, number, number];
      teleportToAuroraWaterFilter: () => [number, number, number];
      teleportToAuroraCultivationBed: () => [number, number, number];
      runAuroraCoreDiagnostic: () => boolean;
      markAuroraSecondModuleSite: () => boolean;
      deployAuroraSecondModule: () => boolean;
      connectAuroraEnergyLink: () => boolean;
      installAuroraWaterFilter: () => boolean;
      calibrateAuroraWaterFlow: () => number;
      prepareAuroraCultivationBed: () => boolean;
      startAuroraBioTrial: () => boolean;
      completeAuroraImpactAssessment: () => boolean;
      completeMission11: () => boolean;
      getMission11State: () => import('../src/main').Mission11DebugState;
      startMission12: () => boolean;
      prepareAuroraLifeSupport: () => boolean;
      configureAuroraHabitation: () => boolean;
      teleportToAuroraLandingZone: () => [number, number, number];
      markAuroraLandingZone: () => boolean;
      landAuroraCrewCapsule: () => boolean;
      disembarkAuroraCrew: () => number;
      startAuroraHumanLoadCycle: () => number;
      recalibrateAuroraLifeSupport: () => boolean;
      completeAuroraFirstNight: () => boolean;
      completeMission12: () => boolean;
      getMission12State: () => import('../src/main').Mission12DebugState;
      startMission13: () => boolean;
      teleportToStormStation: (
        station: 'generator' | 'antenna' | 'anchor1' | 'anchor2' | 'shield'
      ) => [number, number, number];
      acknowledgeStormAlert: () => boolean;
      secureStormGenerator: () => boolean;
      anchorStormAntenna: () => number;
      activateStormAntenna: () => boolean;
      chargeStormShield: () => boolean;
      completeMission13: () => boolean;
      getMission13State: () => import('../src/main').Mission13DebugState;
      getStormReadout: () => import('../src/game/Mission13FirstStorm').AuroraStormReadout;
      startMission14: () => boolean;
      teleportToTraceStation: (
        station: 'power' | 'comms' | 'habitat' | 'terminal' | 'hidden'
      ) => [number, number, number];
      completeTraceInspections: () => number;
      analyzeCoalitionSignature: () => boolean;
      purgeCoalitionPowerNode: () => boolean;
      purgeCoalitionCommsNode: () => boolean;
      locateCoalitionHiddenNode: () => boolean;
      extractCoalitionSample: () => boolean;
      completeReverseTriangulation: () => boolean;
      completeMission14: () => boolean;
      getMission14State: () => import('../src/main').Mission14DebugState;
      startMission15: () => boolean;
      teleportToSabotageStation: (
        station: 'supply' | 'door' | 'terminal' | 'core' | 'energy' | 'life' | 'comms'
      ) => [number, number, number];
      completeAuroraRoutine: () => boolean;
      releaseSealedModule: () => boolean;
      confirmCoordinatedFailure: () => boolean;
      locateParasite: (index: number) => number;
      disableParasite: (index: number) => number;
      resolveCentralOverload: () => boolean;
      completeMission15: () => boolean;
      getMission15State: () => import('../src/main').Mission15DebugState;
      getMission15SequenceState: () => {
        sequence: number[];
        visualStep: number;
        logicalStep: number;
        expectedSymbol: number;
        highlightedSymbol: number;
        interactedSymbol: number;
        inputConsumed: boolean;
        inputLockRemaining: number;
        errorActive: boolean;
        feedback: string;
        completed: boolean;
      };
      answerMission15Symbol: (symbolId: number) => 'matched' | 'missed' | 'ignored';
      getSabotageReadout: () => import('../src/game/Mission15AuroraSabotage').AuroraSabotageReadout;
      getCoalitionTraceReadout: () => import('../src/game/Mission14CoalitionTrace').CoalitionTraceReadout;
      startMission16: () => boolean;
      establishTripleLink: () => boolean;
      recoverAtlasKey: () => boolean;
      revealSeedWorld: () => boolean;
      unlockDefenseProtocol: (index: number) => number;
      synchronizePleyadianNode: (index: number) => number;
      runDefenseSimulation: () => boolean;
      completeMission16: () => boolean;
      getMission16State: () => import('../src/main').Mission16DebugState;
      getPleyadianProtocolReadout: () => import('../src/game/Mission16PleyadianProtocol').PleyadianProtocolReadout;
      startMission17: () => boolean;
      reviewDefenseCouncil: () => boolean;
      activateEnergyReserve: () => boolean;
      deployDefenseSensor: (index: number) => number;
      calibrateDefenseDetection: () => boolean;
      installShieldEmitter: (index: number) => number;
      establishAlertNetwork: () => boolean;
      markEvacuationRoutes: () => boolean;
      runDefenseDrill: () => boolean;
      stabilizeDefenseOverload: () => boolean;
      completeMission17: () => boolean;
      getMission17State: () => import('../src/main').Mission17DebugState;
      getDefensePreparationsReadout: () => import('../src/game/Mission17DefensePreparations').DefensePreparationsReadout;
      startMission18: () => boolean;
      activateEmergencyProtocol: () => boolean;
      identifyHostileDrones: () => boolean;
      authorizeDefenseWeapons: () => boolean;
      clearFirstWave: () => boolean;
      stabilizeCriticalSystem: () => boolean;
      completeDroneIntercept: () => boolean;
      defendAuroraShield: () => boolean;
      completeEnemyTransmission: () => boolean;
      recoverDroneWreckage: () => boolean;
      completeMission18: () => boolean;
      getMission18State: () => import('../src/main').Mission18DebugState;
      getFirstFireReadout: () => import('../src/game/Mission18FirstFire').FirstFireReadout;
      startMission19: () => boolean;
      confirmNereidaEmergency: () => boolean;
      clearNereidaAirspace: () => boolean;
      landAtNereida: () => boolean;
      restoreNereidaDefense: (index: number) => number;
      repelNereidaIncursion: () => boolean;
      protectAtlasCore: () => boolean;
      setOperationalPriority: (priority: 'atlasCore' | 'pleyadianRecords' | 'defensePower') => string;
      activateNereidaCounterattack: () => boolean;
      confirmNereidaDataLeak: () => boolean;
      recoverNereidaWreckage: () => boolean;
      completeMission19: () => boolean;
      getMission19State: () => import('../src/main').Mission19DebugState;
      getNereidaDefenseReadout: () => import('../src/game/Mission19NereidaUnderAttack').NereidaDefenseReadout;
      startMission20: () => boolean;
      completeArkAscent: () => boolean;
      rendezvousWithArk: () => boolean;
      restoreArkLink: (index: number) => number;
      clearArkFirstWave: () => boolean;
      locateArkJammer: () => boolean;
      disableArkJammer: () => boolean;
      defendArkEngines: () => boolean;
      protectCivilianModules: () => boolean;
      stopArkDataBreach: () => boolean;
      activateArkCounterattack: () => boolean;
      clearArkFinalWave: () => boolean;
      stabilizeArk: () => boolean;
      completeMission20: () => boolean;
      getMission20State: () => import('../src/main').Mission20DebugState;
      getArkBattleReadout: () => import('../src/game/Mission20ArkBattle').ArkBattleReadout;
      startMission21: () => boolean;
      alignMission21Channel: (index: number) => number;
      decryptCoalitionTransmission: () => boolean;
      detectCoalitionCapitalShip: () => boolean;
      analyzeCoalitionCapitalSignature: () => boolean;
      receiveCoalitionUltimatum: () => boolean;
      chooseCoalitionResponse: (
        tone: Exclude<import('../src/assets/mission21Definitions').CoalitionResponseTone, 'none'>
      ) => import('../src/assets/mission21Definitions').CoalitionResponseTone;
      restoreMission21Channel: (index: number) => number;
      restoreAllMission21Channels: () => number;
      witnessCoalitionDemonstration: () => boolean;
      classifyMission21Route: (index: number) => number;
      classifyAllMission21Routes: () => number;
      activateMission21PleyadianNetwork: () => boolean;
      completeMission21: () => boolean;
      getMission21State: () => import('../src/main').Mission21DebugState;
      getMission21Readout: () => import('../src/game/Mission21SilenceRupture').Mission21Readout;
      startMission22: () => boolean;
      acknowledgeMission22Alarm: () => string;
      accessMission22CommandTerminal: () => string;
      assignMission22InitialResource: (
        resource: import('../src/assets/mission22Definitions').Mission22ResourceId,
        front: import('../src/assets/mission22Definitions').Mission22FrontId
      ) => boolean;
      assignAllMission22InitialResources: () => import('../src/main').Mission22DebugState;
      applyMission22Pressure: (seconds: number) => import('../src/main').Mission22DebugState;
      completeMission22AuroraFront: () => import('../src/main').Mission22DebugState;
      completeMission22NereidaFront: () => import('../src/main').Mission22DebugState;
      protectMission22Relay: (index: number) => number;
      protectAllMission22Relays: () => import('../src/main').Mission22DebugState;
      manageMission22CrossFrontCrisis: () => import('../src/main').Mission22DebugState;
      chooseMission22Support: (
        front: import('../src/assets/mission22Definitions').Mission22FrontId
      ) => import('../src/main').Mission22DebugState;
      restoreMission22JointNetwork: () => import('../src/main').Mission22DebugState;
      detectMission22CoordinationNode: (index: number) => number;
      detectAllMission22CoordinationNodes: () => import('../src/main').Mission22DebugState;
      completeMission22: () => import('../src/main').Mission22DebugState;
      getMission22State: () => import('../src/main').Mission22DebugState;
      getMission22Readout: () => import('../src/game/Mission22BrokenFronts').Mission22Readout;
      startMission23: () => boolean;
      completeMission23Council: () => import('../src/main').Mission23DebugState;
      synchronizeMission23Forces: () => import('../src/main').Mission23DebugState;
      chooseMission23TargetOrder: (
        first: import('../src/assets/mission23Definitions').Mission23PrimaryTarget
      ) => import('../src/main').Mission23DebugState;
      recordMission23JammerReading: (index: number) => number;
      recordAllMission23JammerReadings: () => number;
      destroyMission23Jammer: () => import('../src/main').Mission23DebugState;
      reachMission23Platform: () => import('../src/main').Mission23DebugState;
      disableMission23PlatformDefense: () => import('../src/main').Mission23DebugState;
      disableMission23PlatformEnergy: () => import('../src/main').Mission23DebugState;
      chooseMission23PlatformMethod: (
        method: Exclude<import('../src/assets/mission23Definitions').Mission23PlatformMethod, 'none'>
      ) => import('../src/main').Mission23DebugState;
      destroyMission23Platform: (
        method?: Exclude<import('../src/assets/mission23Definitions').Mission23PlatformMethod, 'none'>
      ) => import('../src/main').Mission23DebugState;
      reachMission23JumpBeacon: () => import('../src/main').Mission23DebugState;
      disableMission23BeaconAnchor: (index: number) => number;
      disableAllMission23BeaconAnchors: () => number;
      collapseMission23JumpBeacon: () => import('../src/main').Mission23DebugState;
      completeMission23Escape: () => import('../src/main').Mission23DebugState;
      recoverMission23EnemyRoute: () => import('../src/main').Mission23DebugState;
      completeMission23: () => import('../src/main').Mission23DebugState;
      teleportToMission23Target: () => [number, number, number];
      getMission23State: () => import('../src/main').Mission23DebugState;
      getMission23Readout: () => import('../src/game/Mission23Counteroffensive').Mission23Readout;
      getMission23VisualState: () => {
        platformBuilt: boolean;
        platformVisible: boolean;
        platformMeshes: number;
        platformSceneInstances: number;
        platformActiveModules: number;
        beaconBuilt: boolean;
        beaconVisible: boolean;
        beaconMeshes: number;
        beaconSceneInstances: number;
        anchorTargetCount: number;
        visibleAnchorCount: number;
        jammerActive: boolean;
        activeHostiles: number;
        lockDegraded: boolean;
      };
      startMission24: () => boolean;
      decodeMission24ReturnRoute: () => import('../src/main').Mission24DebugState;
      prepareMission24Launch: () => import('../src/main').Mission24DebugState;
      boardMission24Ship: () => import('../src/main').Mission24DebugState;
      startMission24Ignition: () => boolean;
      completeMission24Ignition: () => import('../src/main').Mission24DebugState;
      restoreMission24Checkpoint: (
        step: import('../src/assets/mission24Definitions').Mission24StepId
      ) => import('../src/main').Mission24DebugState;
      completeMission24Ascent: () => import('../src/main').Mission24DebugState;
      completeMission24OrbitalInsertion: () => import('../src/main').Mission24DebugState;
      stabilizeMission24Orbit: () => import('../src/main').Mission24DebugState;
      orientMission24ShipToTarget: () => number;
      teleportToMission24Target: () => [number, number, number];
      advanceMission24Interaction: () => import('../src/main').Mission24DebugState;
      assessAllMission24ArkSystems: () => import('../src/main').Mission24DebugState;
      restoreAllMission24EnclaveLinks: () => import('../src/main').Mission24DebugState;
      prepareAllMission24ArkSystems: () => import('../src/main').Mission24DebugState;
      integrateAllMission24PleyadianNodes: () => import('../src/main').Mission24DebugState;
      prepareMission24CivilianShelters: () => import('../src/main').Mission24DebugState;
      assembleMission24AlliedForces: () => import('../src/main').Mission24DebugState;
      revisitAllMission24StartingSectorPoints: () => import('../src/main').Mission24DebugState;
      completeMission24DefenseRehearsal: () => import('../src/main').Mission24DebugState;
      detectMission24FinalFleet: () => import('../src/main').Mission24DebugState;
      completeMission24: () => import('../src/main').Mission24DebugState;
      getMission24State: () => import('../src/main').Mission24DebugState;
      getArkDepartureState: () => import('../src/main').ArkDepartureDebugState;
      advanceArkDeparture: () => boolean;
      forceArkPreflight: () => import('../src/assets/arkDepartureDefinitions').ArkDepartureStepId;
      getMission24AscentState: () => import('../src/game/AtmosphericAscentController').AtmosphericAscentMetrics;
      getMission24Target: () => { name: string; position: [number, number, number]; distance: number };
      getMission24VisualState: () => {
        atmosphereBuilt: boolean;
        cloudLayerVisible: boolean;
        planetLimbVisible: boolean;
        starOpacity: number;
        networkBuilt: boolean;
        networkVisible: boolean;
        pleyadianNodeCount: number;
        rehearsalTargetCount: number;
        rehearsalTargetsVisible: boolean;
        finalFleetVisible: boolean;
        finalFleetAttackable: boolean;
        mothershipSceneInstances: number;
      };
      getMission24PerformanceState: () => {
        activeTimers: number;
        maxFrameDisplacement: number;
        atmosphereBuilt: boolean;
        networkBuilt: boolean;
      };
      getMothershipIdentity: () => {
        uuid: string;
        position: [number, number, number];
        scale: [number, number, number];
        sceneInstances: number;
      };
      getThreeFrontVisualState: () => {
        built: boolean;
        visible: boolean;
        meshCount: number;
        sceneInstances: number;
        visibleRelayCount: number;
        visibleNodeCount: number;
        jointNetworkVisible: boolean;
        activeAirHostiles: number;
        activeBreachHostiles: number;
      };
      getCoalitionCapitalVisualState: () => {
        built: boolean;
        visible: boolean;
        attackable: boolean;
        meshCount: number;
        activeRouteCount: number;
        networkVisible: boolean;
        remoteBeaconDestroyed: boolean;
        capitalPosition: [number, number, number];
      };
      togglePremiumVisuals: () => boolean;
      getPremiumVisualState: () => import('../src/effects/PremiumVisualLayer').PremiumVisualState;
      setRenderProfile: (profile: import('../src/main').RenderProfile) => import('../src/main').RenderProfile;
      getRenderProfile: () => import("../src/main").RenderProfile;
      setLightBudgetEnabled: (enabled: boolean) => boolean;
      setPremiumVisualQuality: (
        quality: import('../src/effects/PremiumVisualLayer').PremiumVisualQuality
      ) => import('../src/effects/PremiumVisualLayer').PremiumVisualState;
      setPremiumAutoQualityEnabled: (
        enabled: boolean
      ) => import('../src/effects/PremiumVisualLayer').PremiumVisualState;
      benchmarkPremiumVisuals: () => Promise<{ quality: string; fps: number; particles: number; draws: number }[]>;
      completeMission09: () => boolean;
      getMission09State: () => import('../src/game/Mission09AuroraExpedition').Mission09Snapshot;
      getCurrentObjectiveDisplay: () => ObjectiveDisplay;
      showDialogue: (id: string) => boolean;
      advanceDialogue: () => boolean;
      playCommanderVoice: (dialogueId: string) => boolean;
      stopCommanderVoice: () => boolean;
      getVoiceAudioState: () => import('../src/audio/VoiceManager').VoiceAudioState;
      clearDialogueQueue: () => number;
      resetPlayedDialogues: () => number;
      getDialogueState: () => DialogueState;
      getShipBoardingState: () => {
        shipPosition: [number, number, number];
        terrainHeight: number;
        hullBottom: number;
        terrainSeparation: number;
        boardingAnchor: [number, number, number];
        horizontalDistance: number;
        verticalDifference: number;
        boardingAvailable: boolean;
        parked: boolean;
        playerShipInstances: number;
      };
      reconcileParkedShip: () => boolean;
      setPlayerPosition: (x: number, y: number, z: number) => [number, number, number];
      togglePause: () => boolean;
      listLoadedAssets: () => RuntimeAssetAuditEntry[];
      getAssetAudit: () => RuntimeAssetAuditEntry[];
      getPerformanceSnapshot: () => ArcaDiagnostics;
      validateNoDuplicateCharacterMeshes: () => boolean;
      validateNoDuplicateCockpitMeshes: () => boolean;
      listActiveHighPolyAssets: () => string[];
      saveGame: () => SaveGameData;
      loadGame: () => SaveGameData | undefined;
      clearSave: () => boolean;
    };
  }
}
