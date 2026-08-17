import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(360000);

type ColliderState = {
  id: string;
  enabled: boolean;
  category: string;
  shape: string;
  center: [number, number, number];
  boundRadius: number;
};

type ShipCollision = {
  position: [number, number, number];
  impact: boolean;
  timeOfImpact: number;
  normal: [number, number, number];
  penetration: number;
  iterations: number;
  candidates: number;
  substeps: number;
  sweptDistance: number;
  collidedWith: string;
  lastSafePosition: [number, number, number];
  restoredToSafe: boolean;
};

type CollisionState = {
  world: {
    ready: boolean;
    staticColliders: number;
    dynamicColliders: number;
    triggers: number;
    duplicateRegistrations: number;
    collisionTimeMs: number;
  };
  ship: ShipCollision;
  shipColliderCount: number;
  playerShipInstances: number;
  mothershipInstances: number;
  mothershipUuid: string;
  missionId: string;
  missionStep: string;
};

async function readyInSpace(page: Page, errors: string[] = []): Promise<void> {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  await page.goto('/?test=1&prologue=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  await page.waitForFunction(() => window.__arcaDebug !== undefined, undefined, { timeout: 180000 });
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  const launch = page.locator('#launch-button');
  if (await launch.isVisible()) await launch.click();
  expect(await page.evaluate(() => window.__arcaDebug?.completeArkDeparture())).toBe(true);
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
}

async function collider(page: Page, id: string): Promise<ColliderState> {
  return page.evaluate((colliderId) => (
    window.__arcaDebug?.getCollisionColliderState(colliderId) as ColliderState
  ), id);
}

test('compound ship collider and CCD prevent low/high-speed tunneling through the real Ark', async ({ page }) => {
  const errors: string[] = [];
  await readyInSpace(page, errors);
  const identityBefore = await page.evaluate(() => window.__arcaDebug!.getMothershipIdentity());
  const engine = await collider(page, 'ark-engine-1');
  expect(engine.enabled).toBe(true);
  expect(engine.shape).toBe('sphere');

  const low = await page.evaluate((target) => {
    const start: [number, number, number] = [target.center[0], target.center[1], target.center[2] + 40];
    return window.__arcaDebug!.probeShipCollision(start, [0, 0, -28]) as ShipCollision;
  }, engine);
  expect(low.impact).toBe(true);
  expect(low.collidedWith).toMatch(/^ark-/);
  expect(low.timeOfImpact).toBeGreaterThanOrEqual(0);
  expect(low.timeOfImpact).toBeLessThan(1);
  expect(low.position[2]).toBeGreaterThan(engine.center[2]);

  const high = await page.evaluate((target) => {
    const start: [number, number, number] = [target.center[0], target.center[1], target.center[2] + 180];
    return window.__arcaDebug!.probeShipCollision(start, [0, 0, -360]) as ShipCollision;
  }, engine);
  expect(high.impact).toBe(true);
  expect(high.collidedWith).toMatch(/^ark-/);
  expect(high.timeOfImpact).toBeGreaterThan(0);
  expect(high.timeOfImpact).toBeLessThan(1);
  expect(high.substeps).toBe(1);
  expect(high.sweptDistance).toBeCloseTo(360, 3);
  expect(high.position[2]).toBeGreaterThan(engine.center[2]);

  const slide = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const start: [number, number, number] = [target.center[0] - 8, target.center[1], target.center[2] + 42];
    debug.setShipWorldPosition(start);
    return debug.moveShipBy([20, 0, -44]) as ShipCollision;
  }, engine);
  expect(slide.impact).toBe(true);
  expect(slide.position[0]).toBeGreaterThan(engine.center[0] - 8);
  const distanceAfterSlide = Math.hypot(
    slide.position[0] - engine.center[0],
    slide.position[1] - engine.center[1],
    slide.position[2] - engine.center[2]
  );

  const escaped = await page.evaluate((normal) => (
    window.__arcaDebug!.moveShipBy([normal[0] * 18, normal[1] * 18, normal[2] * 18]) as ShipCollision
  ), slide.normal);
  const distanceAfterEscape = Math.hypot(
    escaped.position[0] - engine.center[0],
    escaped.position[1] - engine.center[1],
    escaped.position[2] - engine.center[2]
  );
  expect(distanceAfterEscape).toBeGreaterThan(distanceAfterSlide + 5);

  const identityAfter = await page.evaluate(() => window.__arcaDebug!.getMothershipIdentity());
  const collisionState = await page.evaluate(() => window.__arcaDebug!.getCollisionState() as CollisionState);
  expect(identityAfter.uuid).toBe(identityBefore.uuid);
  expect(identityAfter.sceneInstances).toBe(1);
  expect(collisionState.playerShipInstances).toBe(1);
  expect(collisionState.mothershipInstances).toBe(1);
  expect(collisionState.shipColliderCount).toBeGreaterThanOrEqual(5);
  expect(collisionState.world.duplicateRegistrations).toBe(0);
  expect(errors).toEqual([]);
});

test('Ark launch corridor stays open and surface terrain, solids and nonblocking markers remain coherent', async ({ page }) => {
  const errors: string[] = [];
  await readyInSpace(page, errors);
  const ark = await page.evaluate(() => window.__arcaDebug!.getMothershipIdentity());
  const departure = await page.evaluate(() => window.__arcaDebug!.getArkDepartureState());
  const launchCorridor = await page.evaluate(() => window.__arcaDebug!.getArkLaunchCorridorState() as {
    anchor: [number, number, number];
    anchorLocal: [number, number, number];
    outward: [number, number, number];
  });
  expect(departure.docked).toBe(false);
  expect(departure.shipParentIsArk).toBe(false);
  expect(departure.shipCount).toBe(1);

  const corridor = await page.evaluate(({ anchor, direction }) => {
    const start: [number, number, number] = [
      anchor[0] + direction[0] * 105,
      anchor[1] + direction[1] * 105,
      anchor[2] + direction[2] * 105
    ];
    const inward: [number, number, number] = [-direction[0] * 75, -direction[1] * 75, -direction[2] * 75];
    const inwardProbe = window.__arcaDebug!.probeShipCollision(start, inward) as ShipCollision;
    const outwardProbe = window.__arcaDebug!.probeShipCollision(anchor, [
      direction[0] * 80,
      direction[1] * 80,
      direction[2] * 80
    ]) as ShipCollision;
    return { inwardProbe, outwardProbe, expectedEnd: [
      anchor[0] + direction[0] * 30,
      anchor[1] + direction[1] * 30,
      anchor[2] + direction[2] * 30
    ] };
  }, { anchor: launchCorridor.anchor, direction: launchCorridor.outward });
  expect(corridor.inwardProbe.impact).toBe(false);
  expect(corridor.inwardProbe.position[0]).toBeCloseTo(corridor.expectedEnd[0], 2);
  expect(corridor.inwardProbe.position[1]).toBeCloseTo(corridor.expectedEnd[1], 2);
  expect(corridor.inwardProbe.position[2]).toBeCloseTo(corridor.expectedEnd[2], 2);
  expect(corridor.outwardProbe.impact).toBe(false);

  await page.evaluate(() => {
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.deployHabitat();
    window.__arcaDebug?.setPlayerMode('ship');
  });
  const landmark = await collider(page, 'nereida-landmark-2');
  const structureSweep = await page.evaluate((target) => {
    const start: [number, number, number] = [target.center[0] - 120, target.center[1], target.center[2]];
    return window.__arcaDebug!.probeShipCollision(start, [240, 0, 0]) as ShipCollision;
  }, landmark);
  expect(structureSweep.impact).toBe(true);
  expect(structureSweep.collidedWith).toBe(landmark.id);
  expect(structureSweep.timeOfImpact).toBeLessThan(1);

  const terrainSweep = await page.evaluate(() => {
    const debug = window.__arcaDebug!;
    const y = debug.getSurfaceGroundHeight(0, 0) + 4;
    return debug.probeShipCollision([0, y, 0], [300, 0, 0], true) as ShipCollision;
  });
  expect(terrainSweep.impact).toBe(true);
  expect(terrainSweep.collidedWith).toBe('terrain');
  expect(terrainSweep.substeps).toBeGreaterThan(1);

  const trigger = await collider(page, 'landing-zone-trigger');
  expect(trigger.category).toBe('TRIGGER');
  const triggerSweep = await page.evaluate((target) => {
    const start: [number, number, number] = [target.center[0] - target.boundRadius - 10, target.center[1] + 12, target.center[2]];
    return window.__arcaDebug!.probeShipCollision(start, [target.boundRadius * 2 + 20, 0, 0]) as ShipCollision;
  }, trigger);
  expect(triggerSweep.collidedWith).not.toBe('landing-zone-trigger');

  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));
  const parking = await page.evaluate(() => window.__arcaDebug!.getShipBoardingState());
  expect(parking.parked).toBe(true);
  // The hull hangs from the landing gear now rather than resting on the
  // terrain, so the parked belly sits in the gear's settled band instead of
  // at the old 0.12 m hull rest.
  expect(parking.terrainSeparation).toBeGreaterThanOrEqual(1.7);
  expect(parking.terrainSeparation).toBeLessThanOrEqual(2.1);
  expect(parking.visualOscillationActive).toBe(false);
  expect(parking.boardingAnchor).toHaveLength(3);

  const nereida = await collider(page, 'nereida-module-rear');
  const aurora = await collider(page, 'aurora-habitat');
  expect(nereida.id).toBe('nereida-module-rear');
  expect(aurora.enabled).toBe(false);
  const destroyedOrCleaned = await collider(page, 'coalition-jump-beacon-core');
  expect(destroyedOrCleaned.enabled).toBe(false);

  const canvasRatio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let lit = 0;
    let samples = 0;
    for (let index = 0; index < pixels.length; index += 128) {
      samples += 1;
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 8) lit += 1;
    }
    return lit / Math.max(1, samples);
  });
  expect(canvasRatio).toBeGreaterThan(0.01);
  expect(errors).toEqual([]);
});

test('invalid ship position is depenetrated without duplicating entities or changing mission state', async ({ page }) => {
  await readyInSpace(page);
  const engine = await collider(page, 'ark-engine-2');
  const before = await page.evaluate(() => window.__arcaDebug!.getCollisionState() as CollisionState);
  const normalized = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    debug.setShipWorldPosition(target.center);
    return debug.normalizePlayerCollisions() as {
      missionId: string;
      missionStep: string;
      afterMissionId: string;
      afterMissionStep: string;
      ship: ShipCollision;
    };
  }, engine);
  const after = await page.evaluate(() => ({
    transform: window.__arcaDebug!.getShipTransform(),
    collision: window.__arcaDebug!.getCollisionState() as CollisionState,
    identity: window.__arcaDebug!.getMothershipIdentity()
  }));

  expect(normalized.afterMissionId).toBe(normalized.missionId);
  expect(normalized.afterMissionStep).toBe(normalized.missionStep);
  expect(normalized.missionId).toBe(before.missionId);
  expect(normalized.missionStep).toBe(before.missionStep);
  expect(normalized.ship.impact).toBe(true);
  expect(normalized.ship.penetration).toBeGreaterThan(0);
  expect(after.transform.position).not.toEqual(engine.center);
  expect(after.collision.playerShipInstances).toBe(1);
  expect(after.collision.mothershipInstances).toBe(1);
  expect(after.identity.uuid).toBe(before.mothershipUuid);
});
