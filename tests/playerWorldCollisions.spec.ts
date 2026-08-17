import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

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

type CharacterCollision = {
  position: [number, number, number];
  grounded: boolean;
  slope: number;
  contact: boolean;
  normal: [number, number, number];
  penetration: number;
  iterations: number;
  candidates: number;
  collidedWith: string;
  lastSafePosition: [number, number, number];
  restoredToSafe: boolean;
};

type CollisionState = {
  world: { ready: boolean; duplicateRegistrations: number; queriesThisFrame: number; queryCandidates: number };
  character: CharacterCollision;
  playerMode: string;
  missionId: string;
  missionStep: string;
};

async function readyOnSurface(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  await page.waitForFunction(() => window.__arcaDebug !== undefined, undefined, { timeout: 180000 });
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  const launch = page.locator('#launch-button');
  if (await launch.isVisible()) await launch.click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.deployHabitat();
    window.__arcaDebug?.setPlayerMode('onFoot');
    window.__arcaDebug?.clearDialogueQueue();
  });
}

async function collider(page: Page, id: string): Promise<ColliderState> {
  return page.evaluate((colliderId) => (
    window.__arcaDebug?.getCollisionColliderState(colliderId) as ColliderState
  ), id);
}

test('character capsule blocks walls and corners while preserving slide and terrain contact', async ({ page }) => {
  await readyOnSurface(page);
  const crate = await collider(page, 'nereida-supply-crate-1');
  expect(crate.enabled).toBe(true);
  expect(crate.category).toBe('STATIC_WORLD');

  const blocked = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const ground = debug.getSurfaceGroundHeight(target.center[0] - 3, target.center[2]);
    debug.setCharacterWorldPosition([target.center[0] - 3, ground + 0.04, target.center[2]]);
    const result = debug.moveCharacterBy([6, 0, 0]) as CharacterCollision;
    return { result, actual: debug.getCharacterControlState().position };
  }, crate);
  expect(blocked.result.contact).toBe(true);
  expect(blocked.result.collidedWith).toBe(crate.id);
  expect(blocked.result.position[0]).toBeLessThan(crate.center[0] - 1.1);
  expect(blocked.actual[0]).toBeCloseTo(blocked.result.position[0], 4);
  expect(blocked.result.grounded).toBe(true);

  const slide = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const x = target.center[0] - 2;
    const z = target.center[2] - 1.8;
    debug.setCharacterWorldPosition([x, debug.getSurfaceGroundHeight(x, z) + 0.04, z]);
    return debug.moveCharacterBy([4, 0, 4]) as CharacterCollision;
  }, crate);
  expect(slide.contact).toBe(true);
  expect(slide.position[2]).toBeGreaterThan(crate.center[2] + 1);
  expect(slide.position[0]).toBeLessThan(crate.center[0]);
  expect(Math.abs(slide.normal[0]) + Math.abs(slide.normal[2])).toBeGreaterThan(0.9);

  const corner = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const x = target.center[0] - 2.2;
    const z = target.center[2] - 2.2;
    debug.setCharacterWorldPosition([x, debug.getSurfaceGroundHeight(x, z) + 0.04, z]);
    return debug.moveCharacterBy([4.4, 0, 4.4]) as CharacterCollision;
  }, crate);
  expect(corner.contact).toBe(true);
  expect(corner.position[0] > crate.center[0] + 1.1 && corner.position[2] > crate.center[2] + 1.1).toBe(false);
  const cornerGround = await page.evaluate(([x, z]) => window.__arcaDebug!.getSurfaceGroundHeight(x, z), [corner.position[0], corner.position[2]]);
  expect(corner.position[1]).toBeCloseTo(cornerGround + 0.04, 2);
  expect(corner.slope).toBeLessThanOrEqual(48.1);
});

test('door state, ramp, small steps, boarding anchor and triggers share coherent collision state', async ({ page }) => {
  await readyOnSurface(page);
  await expect.poll(async () => (await collider(page, 'nereida-airlock-door')).enabled, {
    timeout: 30000,
    intervals: [100, 250, 500]
  }).toBe(true);

  const closedDoor = await collider(page, 'nereida-airlock-door');
  const closed = await page.evaluate((door) => {
    const debug = window.__arcaDebug!;
    const start: [number, number, number] = [door.center[0], door.center[1] - 2.5, door.center[2] + 1.5];
    debug.setCharacterWorldPosition(start);
    return debug.moveCharacterBy([0, 0, -2.5]) as CharacterCollision;
  }, closedDoor);
  expect(closed.contact).toBe(true);
  expect(closed.collidedWith).toBe('nereida-airlock-door');

  expect(await page.evaluate(() => window.__arcaDebug?.makeBaseOperational())).toBe(true);
  await expect.poll(async () => (await collider(page, 'nereida-airlock-door')).enabled).toBe(false);
  const open = await page.evaluate((door) => {
    const debug = window.__arcaDebug!;
    const start: [number, number, number] = [door.center[0], door.center[1] - 2.5, door.center[2] + 1.5];
    debug.setCharacterWorldPosition(start);
    return debug.moveCharacterBy([0, 0, -2.5]) as CharacterCollision;
  }, closedDoor);
  expect(open.collidedWith).not.toBe('nereida-airlock-door');
  expect(open.position[2]).toBeLessThan(closedDoor.center[2]);

  await expect.poll(async () => (await collider(page, 'nereida-entry-ramp')).enabled, {
    timeout: 30000,
    intervals: [100, 250, 500]
  }).toBe(true);
  const ramp = await collider(page, 'nereida-entry-ramp');
  const rampWalk = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const startX = target.center[0];
    const startZ = target.center[2] - 1.65;
    const startY = debug.getSurfaceGroundHeight(startX, startZ) + 0.04;
    debug.setCharacterWorldPosition([startX, startY, startZ]);
    const step = debug.moveCharacterBy([0, 0, 0.8]) as CharacterCollision;
    const finish = debug.moveCharacterBy([0, 0, 2.45]) as CharacterCollision;
    return { startY, step, finish };
  }, ramp);
  expect(rampWalk.step.position[1]).toBeGreaterThan(rampWalk.startY);
  expect(rampWalk.step.position[1] - rampWalk.startY).toBeLessThan(0.55);
  expect(rampWalk.step.position[2]).toBeGreaterThan(ramp.center[2] - 1);
  expect(rampWalk.finish.position[1]).toBeGreaterThan(rampWalk.startY + 0.6);
  expect(rampWalk.finish.grounded).toBe(true);

  const boarding = await collider(page, 'ship-boarding-anchor');
  expect(boarding.category).toBe('INTERACTION');
  expect(boarding.enabled).toBe(true);
  const boardingProbe = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const start: [number, number, number] = [target.center[0] + 1.8, target.center[1], target.center[2]];
    debug.setCharacterWorldPosition(start);
    return debug.moveCharacterBy([-1.5, 0, 0]) as CharacterCollision;
  }, boarding);
  expect(boardingProbe.collidedWith).not.toBe('ship-boarding-anchor');

  const landingTrigger = await collider(page, 'landing-zone-trigger');
  expect(landingTrigger.category).toBe('TRIGGER');
  const triggerProbe = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const start: [number, number, number] = [target.center[0] - target.boundRadius - 2, target.center[1], target.center[2]];
    return debug.probeCharacterCollision(start, [target.boundRadius * 2 + 4, 0, 0]) as CharacterCollision;
  }, landingTrigger);
  expect(triggerProbe.collidedWith).not.toBe('landing-zone-trigger');
});

test('legacy save inside a solid is minimally depenetrated without rewinding mission state', async ({ page }) => {
  await readyOnSurface(page);
  const crate = await collider(page, 'nereida-supply-crate-2');
  const before = await page.evaluate((target) => {
    const debug = window.__arcaDebug!;
    const ground = debug.getSurfaceGroundHeight(target.center[0], target.center[2]);
    debug.setCharacterWorldPosition([target.center[0], ground + 0.04, target.center[2]]);
    const state = debug.getCollisionState() as CollisionState;
    debug.saveGame();
    return { missionId: state.missionId, missionStep: state.missionStep };
  }, crate);

  const restored = await reloadAndAwaitRestore(
    page,
    (activePage) => activePage.evaluate(() => window.__arcaDebug?.getCollisionState() as CollisionState),
    (state) => state?.playerMode === 'ON_FOOT' && state.world.ready,
    'character collision restore'
  );
  const actual = await page.evaluate(() => window.__arcaDebug!.getCharacterControlState().position);
  expect(restored?.missionId).toBe(before.missionId);
  expect(restored?.missionStep).toBe(before.missionStep);
  expect(Math.hypot(actual[0] - crate.center[0], actual[2] - crate.center[2])).toBeGreaterThan(1.1);
  expect(restored?.character.lastSafePosition).toEqual(actual);
  expect(restored?.world.duplicateRegistrations).toBe(0);
});
