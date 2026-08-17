import { expect, test, type Page } from '@playwright/test';

test.setTimeout(240000);

const evidenceDir = 'test-results/weapon-visuals-evidence';

type WeaponVisualState = {
  activeWeapon: string;
  weaponType: string;
  muzzlePoint: [number, number, number];
  activeProjectiles: number;
  flashesActive: number;
  trailsActive: number;
  impactsActive: number;
  shieldImpactsActive: number;
  hullImpactsActive: number;
  decalsActive: number;
  fragmentsActive: number;
  combatLightsActive: number;
  damageVisualState: string;
  poolsAvailable: number;
  effectsReleased: number;
  poolCapacity: number;
  quality: 'performance' | 'high' | 'ultra';
  laserReady: boolean;
  missileReady: boolean;
  recoil: number;
  cameraImpulse: number;
  lastImpactPoint: [number, number, number];
  lastImpactKind: string;
  lastMissileTrailHead: [number, number, number] | null;
  activeMissilePosition: [number, number, number] | null;
  targetPosition: [number, number, number];
  targetHealth: number;
  targetSurface: string;
  shield: { activeImpacts: number; maximumImpacts: number; weakened: boolean };
  resources: { objects: number; geometries: number; materials: number; visibleObjects: number };
};

async function ready(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 180000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible())) await launch.click();
  await page.waitForFunction(() => {
    const debug = window.__arcaDebug as unknown as Record<string, unknown> | undefined;
    return typeof debug?.getWeaponVisualState === 'function';
  }, undefined, { timeout: 30000 });
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(40);
}

async function visualState(page: Page): Promise<WeaponVisualState> {
  return page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as { getWeaponVisualState: () => WeaponVisualState };
    return debug.getWeaponVisualState();
  });
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function fire(
  page: Page,
  weapon: 'laser' | 'missile',
  surface: 'shield' | 'hull' | 'structure',
  destructive = false
): Promise<boolean> {
  return page.evaluate(({ weapon, surface, destructive }) => {
    const debug = window.__arcaDebug as unknown as {
      fireWeaponVisualProbe: (w: 'laser' | 'missile', s: 'shield' | 'hull' | 'structure', d: boolean) => boolean;
    };
    return debug.fireWeaponVisualProbe(weapon, surface, destructive);
  }, { weapon, surface, destructive });
}

async function clear(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as { clearWeaponVisualProbe: () => unknown };
    debug.clearWeaponVisualProbe();
  });
}

async function waitForLaserReady(page: Page): Promise<void> {
  await expect.poll(async () => (await visualState(page)).laserReady, {
    timeout: 15000,
    intervals: [40]
  }).toBe(true);
}

test('weapon presentation is pooled, material-aware and stable', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await ready(page);
  await clear(page);
  const initial = await visualState(page);

  await test.step('1-2: muzzle anchor and one logical projectile', async () => {
    const anchors = await page.evaluate(() => {
      const debug = window.__arcaDebug as unknown as {
        getWeaponAnchorPositions: () => { cannons: [number, number, number][]; missilePod: [number, number, number] };
      };
      return debug.getWeaponAnchorPositions();
    });
    expect(await fire(page, 'laser', 'hull')).toBe(true);
    await page.waitForTimeout(20);
    const fired = await visualState(page);
    expect(Math.min(...anchors.cannons.map((anchor) => distance(anchor, fired.muzzlePoint)))).toBeLessThan(0.12);
    expect(fired.activeProjectiles).toBe(1);
    expect(fired.weaponType).toBe('energy');
    expect(fired.flashesActive).toBeLessThanOrEqual(6);
    await page.screenshot({ path: `${evidenceDir}/01-energy-muzzle-projectile.png` });
  });

  await test.step('5-7: shield, hull, collision point and progressive damage', async () => {
    await waitForLaserReady(page);
    expect(await fire(page, 'laser', 'hull')).toBe(true);
    await page.waitForTimeout(20);
    let state = await visualState(page);
    expect(state.lastImpactKind).toBe('hull');
    expect(state.hullImpactsActive).toBeGreaterThan(0);
    expect(distance(state.lastImpactPoint, state.targetPosition)).toBeGreaterThan(1);
    expect(distance(state.lastImpactPoint, state.targetPosition)).toBeLessThanOrEqual(28.1);
    expect(state.decalsActive).toBeGreaterThan(0);
    await page.screenshot({ path: `${evidenceDir}/02-hull-impact-thermal-mark.png` });

    await waitForLaserReady(page);
    await clear(page);
    expect(await fire(page, 'laser', 'shield')).toBe(true);
    await page.waitForTimeout(20);
    state = await visualState(page);
    expect(state.lastImpactKind).toBe('shield');
    expect(state.shieldImpactsActive).toBeGreaterThan(0);
    expect(state.decalsActive).toBe(0);
    await page.screenshot({ path: `${evidenceDir}/03-shield-impact.png` });

    await waitForLaserReady(page);
    await clear(page);
    expect(await fire(page, 'laser', 'hull')).toBe(true);
    for (let shot = 0; shot < 5; shot += 1) {
      await waitForLaserReady(page);
      expect(await fire(page, 'laser', 'hull')).toBe(true);
    }
    state = await visualState(page);
    expect(state.damageVisualState).toBe('critical');
    expect(state.targetHealth).toBeLessThan(180 * 0.28);
    await page.screenshot({ path: `${evidenceDir}/04-progressive-critical-damage.png` });
  });

  await test.step('8-10: recoil recovers and resources/materials stay stable', async () => {
    await page.waitForTimeout(35);
    const impulse = await visualState(page);
    expect(impulse.recoil + impulse.cameraImpulse).toBeGreaterThan(0);
    await expect.poll(async () => {
      const current = await visualState(page);
      return current.recoil + current.cameraImpulse;
    }, { timeout: 5000, intervals: [60] }).toBeLessThan(0.002);
    const recovered = await visualState(page);
    expect(recovered.recoil).toBeLessThan(0.002);
    expect(recovered.cameraImpulse).toBeLessThan(0.002);
    expect(recovered.resources.objects).toBe(initial.resources.objects);
    expect(recovered.resources.geometries).toBe(initial.resources.geometries);
    expect(recovered.resources.materials).toBe(initial.resources.materials);
  });

  await test.step('3-4: missile trail follows one missile and is released on impact', async () => {
    await clear(page);
    expect(await fire(page, 'missile', 'structure')).toBe(true);
    await page.waitForTimeout(180);
    let state = await visualState(page);
    expect(state.activeProjectiles).toBe(1);
    expect(state.trailsActive).toBe(1);
    expect(state.lastMissileTrailHead).not.toBeNull();
    expect(state.activeMissilePosition).not.toBeNull();
    expect(distance(state.lastMissileTrailHead!, state.activeMissilePosition!)).toBeLessThan(0.001);
    await page.screenshot({ path: `${evidenceDir}/05-guided-missile-trail.png` });
    await expect.poll(async () => (await visualState(page)).trailsActive, { timeout: 3000, intervals: [50] }).toBe(0);
    state = await visualState(page);
    expect(state.activeMissilePosition).toBeNull();
    await page.screenshot({ path: `${evidenceDir}/06-missile-structure-impact.png` });
  });

  await test.step('11-12: bounded pools and staged destruction cleanly release', async () => {
    await waitForLaserReady(page);
    await clear(page);
    expect(await fire(page, 'laser', 'hull', true)).toBe(true);
    await page.waitForTimeout(25);
    let state = await visualState(page);
    expect(state.lastImpactKind).toBe('hull');
    expect(state.fragmentsActive).toBeGreaterThan(0);
    expect(state.fragmentsActive).toBeLessThanOrEqual(96);
    expect(state.poolCapacity).toBeLessThanOrEqual(52);
    expect(state.poolsAvailable).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: `${evidenceDir}/07-light-enemy-staged-destruction.png` });
    await clear(page);
    state = await visualState(page);
    expect(state.activeProjectiles).toBe(0);
    expect(state.trailsActive).toBe(0);
    expect(state.impactsActive).toBe(0);
    expect(state.fragmentsActive).toBe(0);
    expect(state.combatLightsActive).toBe(0);
  });

  await test.step('received shield damage is localized and bounded', async () => {
    const shield = await page.evaluate(() => {
      const debug = window.__arcaDebug as unknown as {
        triggerPlayerShieldImpact: (side: -1 | 1) => { activeImpacts: number; maximumImpacts: number };
      };
      return debug.triggerPlayerShieldImpact(-1);
    });
    expect(shield.activeImpacts).toBe(1);
    expect(shield.maximumImpacts).toBe(4);
    await page.waitForTimeout(30);
    await page.screenshot({ path: `${evidenceDir}/08-player-localized-shield-impact.png` });
  });

  await test.step('13-14: restore is transient-clean and M25 budgets remain bounded', async () => {
    await clear(page);
    for (const quality of ['performance', 'high', 'ultra'] as const) {
      await page.evaluate((profile) => window.__arcaDebug?.setRenderProfile(profile), quality);
      expect((await visualState(page)).quality).toBe(quality);
    }
    await page.evaluate(() => window.__arcaDebug?.saveGame());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await ready(page);
    const restored = await visualState(page);
    expect(restored.activeProjectiles).toBe(0);
    expect(restored.impactsActive).toBe(0);
    expect(restored.decalsActive).toBe(0);
    expect(restored.fragmentsActive).toBe(0);
    expect(restored.poolCapacity).toBeLessThanOrEqual(52);
    expect(restored.trailsActive).toBeLessThanOrEqual(4);
    const m25 = await page.evaluate(() => window.__arcaDebug?.getMission25Diagnostics());
    expect(m25?.activeProjectiles ?? 0).toBeLessThanOrEqual(12);
  });

  await test.step('15-17: no console/page errors and canvas is nonblank', async () => {
    const nonBlankRatio = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      if (!canvas || !gl) return 0;
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0;
      let samples = 0;
      for (let index = 0; index < pixels.length; index += 64) {
        samples += 1;
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 8) visible += 1;
      }
      return visible / Math.max(1, samples);
    });
    expect(nonBlankRatio).toBeGreaterThan(0.01);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
