import { expect, test, type Page } from '@playwright/test';
import type * as THREE from 'three';
import type { ArkPlatformVisualDebugState, Mission01OnboardingDebugState } from '../src/main';

const OUTPUT = 'artifacts/ark-platform-premium';

const departure = (page: Page) => page.evaluate(() => window.__arcaDebug?.getArkDepartureState());
const platformVisuals = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getArkPlatformVisualState()) as Promise<ArkPlatformVisualDebugState>;
const onboarding = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission01OnboardingState()) as Promise<Mission01OnboardingDebugState>;

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

async function dismissDialogue(page: Page): Promise<void> {
  if (await page.evaluate(() => window.__arcaDebug?.getDialogueState().awaitingInput)) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(180);
  }
}

async function interactTo(page: Page, expected: string): Promise<void> {
  await dismissDialogue(page);
  await page.keyboard.press('e');
  await expect.poll(async () => (await departure(page))?.arkDepartureStep, {
    timeout: 45_000,
    message: `el desacople no avanzo a ${expected}`
  }).toBe(expected);
}

async function frame(
  page: Page,
  target: [number, number, number] | string,
  offset: [number, number, number],
  lookHeight = 0
): Promise<void> {
  await page.evaluate(({ target, offset, lookHeight }) => {
    window.__arcaDebug?.frameCameraTarget(target, offset, lookHeight);
  }, { target, offset, lookHeight });
  await page.waitForTimeout(650);
}

async function aimAtExitBeacon(page: Page): Promise<void> {
  const canvas = page.locator('#game-canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas sin bounds durante el probe de plataforma');
  let x = bounds.x + bounds.width * 0.5;
  let y = bounds.y + bounds.height * 0.5;
  for (let index = 0; index < 10; index += 1) {
    const state = await onboarding(page);
    if (state.alignmentDegrees <= 12) break;
    x = Math.max(bounds.x + 8, Math.min(bounds.x + bounds.width - 8, x - state.alignmentYawError / 0.0023));
    y = Math.max(bounds.y + 8, Math.min(bounds.y + bounds.height - 8, y - state.alignmentPitchError / 0.0023));
    await page.mouse.move(x, y, { steps: 6 });
    await page.waitForTimeout(320);
  }
}

test.setTimeout(480_000);

test('M01 premium: plataforma, corredor, escala de nave y desacople real', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await page.goto('/?test=1&prologue=1');
  await ready(page);
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.locator('#launch-button').click();
  await dismissDialogue(page);

  const initial = await platformVisuals(page);
  expect(initial.platformBuilt).toBe(true);
  expect(initial.platformVisible).toBe(true);
  expect(initial.platformInstancedMeshes, 'detalle repetido instanciado').toBeGreaterThanOrEqual(7);
  expect(initial.platformMaterials, 'paleta contenida').toBeLessThanOrEqual(10);
  expect(initial.dockingAssemblyBuilt).toBe(true);
  expect(initial.dockingGateCount).toBe(4);
  expect(initial.dockingGuideModuleCount).toBe(24);
  expect(initial.dockingInstancedMeshes, 'corredor instanciado').toBeGreaterThanOrEqual(7);
  expect(initial.platformTriangles + initial.dockingTriangles, 'detalle local acotado').toBeLessThan(22_000);
  expect(initial.drawCalls, 'la escena inicial conserva presupuesto').toBeLessThan(205);

  const rawHelperCount = await page.evaluate(() => {
    const scene = window.__arcaScene;
    const roots = [scene?.getObjectByName('Launch Platform Epsilon-3'), scene?.getObjectByName('Ark Docking Assembly')];
    let lines = 0;
    const lineNames: string[] = [];
    let gateToruses = 0;
    scene?.getObjectByName('Epsilon-3 Physical Departure Corridor')?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry?.type === 'TorusGeometry') gateToruses += 1;
    });
    for (const root of roots) root?.traverse((object) => {
      let ancestor: THREE.Object3D | null = object;
      while (ancestor && ancestor !== root) {
        if (
          ancestor.name === 'Player Scout Ship' ||
          (root?.name === 'Launch Platform Epsilon-3' && ancestor.name === 'Launch Cradle Epsilon-3')
        ) return;
        ancestor = ancestor.parent;
      }
      if ((object as THREE.Line).isLine) {
        lines += 1;
        lineNames.push(`${object.name || object.type} <- ${object.parent?.name || 'root'}`);
      }
    });
    return { lines, gateToruses, lineNames };
  });
  expect(rawHelperCount.gateToruses).toBe(0);
  expect(rawHelperCount.lines, rawHelperCount.lineNames.join(', ')).toBe(0);

  await page.screenshot({ path: `${OUTPUT}/02-platform-overview.png` });
  await frame(page, initial.launchAnchorWorld, [21, 12, -25], 1.2);
  await page.screenshot({ path: `${OUTPUT}/03-platform-close.png` });
  await frame(page, initial.corridorFocusWorld, [18, 11, -30], 0);
  await page.screenshot({ path: `${OUTPUT}/04-departure-gates.png` });
  await frame(page, initial.corridorFocusWorld, [8, 3.5, -19], -4.5);
  await page.screenshot({ path: `${OUTPUT}/05-vector-rails.png` });
  await page.evaluate(() => window.__arcaDebug?.clearCameraLookAt());

  await interactTo(page, 'missionContext');
  await interactTo(page, 'preflightCheck');
  await dismissDialogue(page);
  await page.keyboard.press('e');
  await expect.poll(async () => (await departure(page))?.arkDepartureStep, { timeout: 45_000 }).toBe('readyForRelease');
  await interactTo(page, 'releaseDockingClamps');
  await expect.poll(async () => (await departure(page))?.clampsReleased, { timeout: 45_000 }).toBe(true);

  await page.keyboard.down('w');
  await expect.poll(async () => (await departure(page))?.anchorDistance, { timeout: 90_000 }).toBeGreaterThan(12);
  await page.keyboard.up('w');
  await page.keyboard.down('s');
  await page.waitForTimeout(450);
  await page.keyboard.up('s');
  await page.screenshot({ path: `${OUTPUT}/06-undocking.png` });

  await page.keyboard.down('w');
  await expect.poll(async () => (await departure(page))?.arkDepartureCompleted, {
    timeout: 180_000,
    intervals: [500]
  }).toBe(true);
  await page.keyboard.up('w');
  for (let index = 0; index < 4; index += 1) await dismissDialogue(page);

  await page.keyboard.down('s');
  await expect.poll(async () => (await onboarding(page)).speed, { timeout: 60_000 }).toBeLessThan(1);
  await page.keyboard.up('s');

  await expect.poll(async () => (await onboarding(page)).missionStep, { timeout: 30_000 }).toBe('flightOrientation');
  await page.locator('#game-canvas').click({ force: true, position: { x: 800, y: 450 } });
  const idle = await onboarding(page);
  expect(idle.cameraMode).toBe('external');
  expect(idle.shipScreenFraction, 'la nave gana presencia sin tapar la ruta').toBeGreaterThan(0.35);
  expect(idle.shipScreenFraction, 'la nave conserva espacio frontal').toBeLessThan(0.5);
  expect(idle.objectiveViewport[0]).toBeGreaterThan(0.08);
  expect(idle.objectiveViewport[0]).toBeLessThan(0.92);
  await page.screenshot({ path: `${OUTPUT}/07-flight-idle.png` });

  await aimAtExitBeacon(page);
  expect((await onboarding(page)).alignmentDegrees, 'mouse y baliza convergen al mismo punto').toBeLessThanOrEqual(12);
  await page.screenshot({ path: `${OUTPUT}/09-e01-alignment.png` });
  await expect.poll(async () => (await onboarding(page)).missionStep, { timeout: 30_000 }).toBe('propulsionTrial');
  await page.keyboard.down('w');
  await page.waitForTimeout(1_400);
  await page.keyboard.up('w');
  await page.screenshot({ path: `${OUTPUT}/08-flight-moving.png` });

  const finalVisuals = await platformVisuals(page);
  await frame(page, finalVisuals.launchAnchorWorld, [-27, 18, -31], 1.5);
  await page.screenshot({ path: `${OUTPUT}/10-ark-platform-composition.png` });
  await page.evaluate(() => window.__arcaDebug?.clearCameraLookAt());

  test.info().annotations.push({
    type: 'ark-platform-performance',
    description: JSON.stringify({ initial, idleCamera: {
      distance: idle.cameraDistance,
      framing: idle.cameraFraming,
      fov: idle.cameraFov,
      shipScreenFraction: idle.shipScreenFraction
    } })
  });
  expect(errors).toEqual([]);
});
