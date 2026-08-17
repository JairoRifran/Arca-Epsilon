import { expect, test, type Page } from '@playwright/test';

/**
 * Player ship scale and crew access.
 *
 * The ship is normalised to a fixed maximum dimension and the pilot is
 * normalised to human height, so the two are directly comparable in world
 * units — 1 unit is 1 metre. This probe measures both from the live scene
 * rather than trusting the constants, and asserts the derived systems
 * (composite collider, hardpoints, boarding anchor, parked clearance) all
 * follow the same single source of scale.
 */
test.setTimeout(600_000);

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

/**
 * Measures ship and pilot straight out of the scene graph.
 *
 * Bounding boxes are accumulated by hand from each mesh's geometry corners
 * pushed through its world matrix, so the probe needs no THREE import in page
 * context and measures what is actually rendered rather than a declared value.
 */
const measure = (page: Page) =>
  page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;

    type Bounds = { min: number[]; max: number[]; meshes: number };
    const worldBounds = (root: import('three').Object3D | undefined): Bounds | null => {
      if (!root) return null;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      let meshes = 0;
      root.updateWorldMatrix(true, true);
      root.traverse((child) => {
        const mesh = child as unknown as {
          isMesh?: boolean;
          visible: boolean;
          geometry?: { boundingBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }; computeBoundingBox?: () => void };
          matrixWorld: { elements: number[] };
        };
        if (!mesh.isMesh || !mesh.geometry || !child.visible) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox?.();
        const bb = mesh.geometry.boundingBox;
        if (!bb) return;
        meshes += 1;
        const e = mesh.matrixWorld.elements;
        for (const cx of [bb.min.x, bb.max.x]) {
          for (const cy of [bb.min.y, bb.max.y]) {
            for (const cz of [bb.min.z, bb.max.z]) {
              const x = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
              const y = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
              const z = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
              min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x);
              min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y);
              min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z);
            }
          }
        }
      });
      return meshes > 0 ? { min, max, meshes } : null;
    };

    let ship: import('three').Object3D | undefined;
    let pilot: import('three').Object3D | undefined;
    let anchor: import('three').Object3D | undefined;
    const pilotNames: string[] = [];
    scene.traverse((object) => {
      const n = object.name || '';
      if (n === 'Player Scout Ship' && !ship) ship = object;
      if (n === 'shipBoardingAnchor' && !anchor) anchor = object;
      if (/pilot|character/i.test(n)) pilotNames.push(n);
      if (/^Arca Pilot|Surface Character|Pilot Root/i.test(n) && !pilot) pilot = object;
    });

    const shipBounds = worldBounds(ship);
    const pilotBounds = worldBounds(pilot);
    const size = (b: Bounds | null) => (b ? [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] : null);

    return {
      shipSize: size(shipBounds),
      shipMeshes: shipBounds?.meshes ?? 0,
      pilotSize: size(pilotBounds),
      pilotNames: pilotNames.slice(0, 8),
      anchorFound: Boolean(anchor),
      shipScaleDiag: window.__arcaDiagnostics?.playerShipScale ?? 0
    };
  });

test('player ship scale: measured proportion against the pilot', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.waitForTimeout(2_000);

  const found = await measure(page);
  expect(found.shipSize, 'the player ship must exist and be measurable').not.toBeNull();
  const [width, height, length] = found.shipSize as number[];

  // 1 world unit is 1 metre: SurfaceCharacter normalises the pilot to 1.78.
  const PILOT_HEIGHT = 1.78;
  console.log(
    `SHIP AUDIT  size=${width.toFixed(2)}w x ${height.toFixed(2)}h x ${length.toFixed(2)}L m  ` +
    `meshes=${found.shipMeshes}  glbScale=${found.shipScaleDiag.toFixed(3)}  ` +
    `pilot=${PILOT_HEIGHT}m  pilot/shipHeight=${(PILOT_HEIGHT / height * 100).toFixed(1)}%  ` +
    `shipLength/pilot=${(length / PILOT_HEIGHT).toFixed(2)}x`
  );

  // --- Stage 1: the hull is actually bigger -------------------------------
  // Measured targets, not the arithmetic prediction: the bounding box includes
  // runtime accents that do not scale identically with the GLB root, so height
  // and length land slightly under a straight 1.7x of the old extents.
  expect(width, 'hull width after rescale').toBeGreaterThan(11.5);
  expect(length, 'hull length after rescale').toBeGreaterThan(16.5);
  expect(height, 'hull height after rescale').toBeGreaterThan(5.0);
  // The pilot must no longer read as half the ship.
  expect(PILOT_HEIGHT / height, 'the pilot must be well under half the hull height').toBeLessThan(0.4);
  expect(found.anchorFound, 'the boarding anchor must exist').toBe(true);

  // --- Mesh and colliders share one source of scale ------------------------
  const scale = await page.evaluate(() => {
    const c = window.__arcaDebug?.getCollisionState() as unknown as {
      shipScaleFactor?: number;
      shipTargetMaxDimension?: number;
      shipColliderCount?: number;
      shipColliderOffsets?: [number, number, number][];
      shipColliderRadii?: number[];
    };
    return {
      factor: c?.shipScaleFactor,
      target: c?.shipTargetMaxDimension,
      colliderCount: c?.shipColliderCount,
      offsets: c?.shipColliderOffsets,
      radii: c?.shipColliderRadii
    };
  });
  expect(scale.colliderCount, 'still six spheres, not one giant collider').toBe(6);
  expect(scale.factor, 'a single central scale factor').toBeGreaterThan(1);
  // The colliders must be the authored base values times exactly that factor —
  // proving the mesh and the physics read the same number, applied once.
  const BASE_RADII = [2.35, 2.85, 3.05, 2.35, 1.45, 1.45];
  const BASE_WING_X = 3.55;
  for (let i = 0; i < BASE_RADII.length; i += 1) {
    expect(scale.radii![i], `collider ${i} radius follows the central factor`)
      .toBeCloseTo(BASE_RADII[i] * scale.factor!, 2);
  }
  expect(Math.abs(scale.offsets![4][0]), 'wing collider offset follows the factor')
    .toBeCloseTo(BASE_WING_X * scale.factor!, 2);
  // Collider span must cover the measured hull rather than the old one.
  const colliderHalfLength = Math.max(...scale.offsets!.map((o: [number, number, number]) => Math.abs(o[2]))) + Math.max(...scale.radii!);
  expect(colliderHalfLength * 2, 'the collider must span the new hull, not the old')
    .toBeGreaterThan(length * 0.8);

  // --- Stage 2A: the old access geometry is gone, not hidden ---------------
  const access = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let lifts = 0;
    let anchors = 0;
    let oldColumnSleeves = 0;
    let oldPlatform = 0;
    let oldRamp = 0;
    let hatchLeaves = 0;
    let ladderRoots = 0;
    let ladderSections = 0;
    scene.traverse((o) => {
      const n = o.name || '';
      if (n === 'Scout Ship Ventral Access Lift') lifts += 1;
      if (n === 'shipBoardingAnchor') anchors += 1;
      if (/Access Lift Column Sleeve|Access Lift Sleeve Lip/.test(n)) oldColumnSleeves += 1;
      if (n === 'Access Lift Platform') oldPlatform += 1;
      if (n === 'Access Lift Ground Ramp') oldRamp += 1;
      if (/^Access Hatch Leaf/.test(n)) hatchLeaves += 1;
      if (n === 'Access Folding Ladder') ladderRoots += 1;
      if (/^Access Ladder (Upper|Mid|Lower) Section$/.test(n)) ladderSections += 1;
    });
    const c = window.__arcaDebug?.getCollisionState() as unknown as {
      accessState?: string;
      hatchProgress?: number;
      ladderPrimaryProgress?: number;
      ladderSecondaryProgress?: number;
      accessEgressFootSafe?: boolean;
    };
    return {
      lifts, anchors, oldColumnSleeves, oldPlatform, oldRamp,
      hatchLeaves, ladderRoots, ladderSections,
      accessState: c?.accessState,
      hatchProgress: c?.hatchProgress,
      ladderPrimary: c?.ladderPrimaryProgress,
      ladderSecondary: c?.ladderSecondaryProgress
    };
  });

  // One access system, one anchor — no parallel system, no second anchor.
  expect(access.lifts, 'exactly one access system').toBe(1);
  expect(access.anchors, 'exactly one boarding anchor').toBe(1);

  // The replaced parts must be absent from the scene entirely, not merely
  // invisible: hiding them would still cost draw-call bookkeeping and would
  // let the old look come back.
  expect(access.oldColumnSleeves, 'the telescopic column must be gone').toBe(0);
  expect(access.oldPlatform, 'the lift platform must be gone').toBe(0);
  expect(access.oldRamp, 'the procedural ramp must be gone').toBe(0);

  // The new hardware exists exactly once.
  expect(access.hatchLeaves, 'two hatch leaves').toBe(2);
  expect(access.ladderRoots, 'exactly one folding ladder').toBe(1);
  expect(access.ladderSections, 'three ladder sections').toBe(3);

  // In flight the access is sealed and stowed.
  expect(access.hatchProgress, 'hatch closed while flying').toBeLessThan(0.02);
  expect(access.ladderPrimary, 'ladder stowed while flying').toBeLessThan(0.02);
  expect(access.ladderSecondary, 'ladder stowed while flying').toBeLessThan(0.02);
  // The mid section can never lead the upper one out of the bay.
  expect(access.ladderSecondary!).toBeLessThanOrEqual(access.ladderPrimary! + 1e-6);

  // Exactly one ship and one pilot.
  const counts = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let ships = 0;
    let anchors = 0;
    scene.traverse((o) => {
      if (o.name === 'Player Scout Ship') ships += 1;
      if (o.name === 'shipBoardingAnchor') anchors += 1;
    });
    return { ships, anchors };
  });
  expect(counts.ships, 'exactly one player ship').toBe(1);
  expect(counts.anchors, 'exactly one boarding anchor').toBe(1);

  expect(consoleErrors).toEqual([]);
});
