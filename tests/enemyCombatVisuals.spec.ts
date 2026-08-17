import { expect, test, type Page } from '@playwright/test';

test.setTimeout(300000);

const evidenceDir = 'artifacts/enemy-combat-visuals/after';

type Tuple = [number, number, number];
type EnemyCombatState = {
  built: boolean;
  activeProjectiles: number;
  activeTrails: number;
  activeMuzzleFlashes: number;
  activeDamageRigs: number;
  activeLeaks: number;
  activeEngineFailures: number;
  activeCombatLights: number;
  nearMisses: number;
  lastShotNearMissEligible: boolean;
  heavyDestructions: number;
  damageVisualState: string;
  engineVisualState: string;
  lastMuzzlePoint: Tuple;
  lastProjectilePoint: Tuple;
  lastTrailHead: Tuple;
  lastTrailTail: Tuple;
  lastImpactPoint: Tuple;
  lastReactionStrength: number;
  poolCapacity: number;
  poolsAvailable: number;
  resourcesReturned: boolean;
  threatWarningActive: boolean;
  threatWarningText: string;
  emitterCenter: Tuple;
  emitterRadius: number;
  activeEnemies: number;
  mothershipInstances: number;
  playerShipInstances: number;
  camera: {
    magnitude: number;
    nearMissImpulses: number;
    peakMagnitude: number;
    bounded: boolean;
  };
  weaponVisuals: {
    impactsActive: number;
    shieldImpactsActive: number;
    hullImpactsActive: number;
    decalsActive: number;
    fragmentsActive: number;
    destructionsActive: number;
    secondaryDestructionsActive: number;
    destructionStage: 'none' | 'ignition' | 'rupture' | 'dissipation';
    lastImpactPoint: Tuple;
  };
  resources: {
    objects: number;
    geometries: number;
    materials: number;
    visibleObjects: number;
    drawCalls: number;
    triangles: number;
  };
};

type EnemyCombatDebug = {
  getEnemyCombatVisualState: () => EnemyCombatState;
  fireEnemyCombatVisualProbe: (
    scenario?: 'muzzle' | 'direct' | 'near-miss' | 'far',
    weapon?: 'light' | 'medium' | 'heavy' | 'structure'
  ) => boolean;
  triggerEnemyDamageVisualProbe: (
    integrity: number,
    mass?: 'light' | 'medium' | 'heavy',
    surface?: 'shield' | 'hull' | 'structure'
  ) => unknown;
  showEnemyCombatVisualProbe: (mass?: 'light' | 'medium' | 'heavy') => unknown;
  clearEnemyCombatVisualProbe: () => unknown;
  clearDialogueQueue: () => number;
  saveGame: () => unknown;
  loadGame: () => unknown;
  getMission25State: () => { mission25Started: boolean; mission25State: string; mission25Completed: boolean };
  setCameraLookAt: (target: string | Tuple) => unknown;
  togglePause: () => boolean;
  startMission18: () => boolean;
  activateEmergencyProtocol: () => boolean;
  identifyHostileDrones: () => boolean;
  authorizeDefenseWeapons: () => boolean;
  getScoutDroneMuzzlePosition: () => Tuple | null;
  fireScoutDroneCombatProbe: () => boolean;
  spawnScoutDroneVisualProbe: () => number;
};

function distance(a: Tuple, b: Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function ready(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 180000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible()) && (await launch.isEnabled())) {
    await launch.click();
  } else {
    const newGame = page.locator('#new-game-button');
    if ((await newGame.count()) && (await newGame.isVisible())) {
      await newGame.click();
      const confirm = page.locator('#confirm-new-game-button');
      await expect(confirm).toBeVisible();
      await confirm.click();
    }
  }
  await expect(page.locator('#boot-screen')).toHaveClass(/is-hidden/, { timeout: 30000 });
  await page.waitForFunction(() => {
    const debug = window.__arcaDebug as unknown as Partial<EnemyCombatDebug> | undefined;
    return typeof debug?.getEnemyCombatVisualState === 'function';
  }, undefined, { timeout: 30000 });
  await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as EnemyCombatDebug;
    debug.clearDialogueQueue();
    if (debug.togglePause()) debug.togglePause();
  });
}

async function state(page: Page): Promise<EnemyCombatState> {
  return page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).getEnemyCombatVisualState());
}

async function clear(page: Page): Promise<void> {
  await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).clearEnemyCombatVisualProbe());
  await expect.poll(async () => {
    const current = await state(page);
    return current.activeProjectiles + current.activeDamageRigs + current.weaponVisuals.impactsActive;
  }, { timeout: 5000, intervals: [20, 40, 80] }).toBe(0);
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage: false, timeout: 60000 });
}

test('enemy combat presentation is directional, progressive, pooled and mission-neutral', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await ready(page);
  await clear(page);

  await test.step('healthy enemy, real muzzle and projectile/trail origin', async () => {
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).showEnemyCombatVisualProbe('light'));
    await screenshot(page, '01-enemy-healthy.png');
    expect(await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).fireEnemyCombatVisualProbe('muzzle', 'light'))).toBe(true);
    const fired = await state(page);
    expect(fired.built).toBe(true);
    expect(fired.activeProjectiles).toBe(1);
    expect(fired.activeTrails).toBe(1);
    expect(fired.activeMuzzleFlashes).toBeGreaterThan(0);
    expect(distance(fired.lastMuzzlePoint, fired.emitterCenter)).toBeGreaterThan(fired.emitterRadius);
    expect(distance(fired.lastTrailHead, fired.lastProjectilePoint)).toBeLessThan(0.001);
    expect(distance(fired.lastTrailHead, fired.lastTrailTail)).toBeGreaterThanOrEqual(0);
    await screenshot(page, '02-enemy-firing.png');
    await screenshot(page, '03-enemy-projectile-trail.png');
    await expect.poll(async () => (await state(page)).activeTrails, {
      timeout: 4000,
      intervals: [20, 40, 80]
    }).toBe(0);
  });

  await test.step('near miss is local, directional and camera-safe', async () => {
    await clear(page);
    const before = await state(page);
    expect(await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).fireEnemyCombatVisualProbe('far', 'heavy'))).toBe(true);
    expect((await state(page)).lastShotNearMissEligible).toBe(false);
    await clear(page);
    expect((await state(page)).nearMisses).toBe(before.nearMisses);

    expect(await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).fireEnemyCombatVisualProbe('near-miss', 'heavy'))).toBe(true);
    expect((await state(page)).lastShotNearMissEligible).toBe(true);
    await expect.poll(async () => (await state(page)).nearMisses, {
      timeout: 3000,
      intervals: [10, 20, 40]
    }).toBeGreaterThan(before.nearMisses);
    await expect.poll(async () => (await state(page)).camera.nearMissImpulses, {
      timeout: 3000,
      intervals: [10, 20, 40]
    }).toBeGreaterThan(0);
    expect((await state(page)).threatWarningText).toContain('DISPARO ENEMIGO CERCANO');
    await screenshot(page, '04-near-miss.png');
    await expect.poll(async () => (await state(page)).camera.magnitude, {
      timeout: 5000,
      intervals: [30, 60, 100]
    }).toBeLessThan(0.002);
    expect((await state(page)).camera.bounded).toBe(true);
  });

  await test.step('shield and hull impacts remain materially distinct', async () => {
    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0.9, 'medium', 'shield'));
    let current = await state(page);
    expect(current.weaponVisuals.shieldImpactsActive).toBeGreaterThan(0);
    expect(current.weaponVisuals.hullImpactsActive).toBe(0);
    expect(current.activeDamageRigs).toBe(0);
    await screenshot(page, '05-shield-impact.png');

    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0.42, 'medium', 'shield'));
    await screenshot(page, '06-shield-weakened.png');
    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0, 'heavy', 'shield'));
    await screenshot(page, '07-shield-break.png');

    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0.82, 'light', 'hull'));
    current = await state(page);
    expect(current.weaponVisuals.hullImpactsActive).toBeGreaterThan(0);
    expect(current.weaponVisuals.shieldImpactsActive).toBe(0);
    expect(current.activeDamageRigs).toBe(1);
    expect(distance(current.lastImpactPoint, current.emitterCenter)).toBeCloseTo(current.emitterRadius, 1);
    await screenshot(page, '08-hull-impact.png');
  });

  await test.step('damage, propulsion and mass reaction progress coherently', async () => {
    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0.84, 'light', 'hull'));
    expect((await state(page)).damageVisualState).toBe('stable');

    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0.52, 'light', 'hull'));
    let current = await state(page);
    expect(current.damageVisualState).toBe('damaged');
    expect(current.engineVisualState).toBe('unstable');
    expect(current.activeLeaks).toBeGreaterThan(0);
    const lightReaction = current.lastReactionStrength;
    await screenshot(page, '09-medium-damage.png');

    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0.2, 'light', 'hull'));
    current = await state(page);
    expect(current.damageVisualState).toBe('critical');
    expect(current.engineVisualState).toBe('partial');
    expect(current.activeEngineFailures).toBeGreaterThan(0);
    await screenshot(page, '10-critical-damage.png');
    await screenshot(page, '11-engine-failure.png');

    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0.52, 'heavy', 'structure'));
    const heavyReaction = (await state(page)).lastReactionStrength;
    expect(lightReaction).toBeGreaterThan(heavyReaction * 2);
  });

  await test.step('light and heavy destruction stage and release fragments', async () => {
    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0, 'light', 'hull'));
    let current = await state(page);
    expect(current.damageVisualState).toBe('destroyed');
    expect(current.weaponVisuals.destructionsActive).toBeGreaterThan(0);
    expect(current.weaponVisuals.fragmentsActive).toBeGreaterThan(0);
    expect(current.weaponVisuals.destructionStage).toBe('ignition');
    await screenshot(page, '12-light-destruction.png');
    await expect.poll(async () => (await state(page)).weaponVisuals.secondaryDestructionsActive, {
      timeout: 2000,
      intervals: [20, 40]
    }).toBeGreaterThan(0);

    await clear(page);
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).triggerEnemyDamageVisualProbe(0, 'heavy', 'structure'));
    current = await state(page);
    expect(current.heavyDestructions).toBeGreaterThan(0);
    expect(current.weaponVisuals.fragmentsActive).toBeGreaterThan(0);
    await screenshot(page, '13-heavy-destruction.png');
    await screenshot(page, '14-fragments.png');
    await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).clearEnemyCombatVisualProbe());
    expect((await state(page)).weaponVisuals.fragmentsActive).toBe(0);
  });

  await test.step('pools stay fixed and restore clears transient combat', async () => {
    await clear(page);
    const initial = await state(page);
    await page.evaluate(() => {
      const debug = window.__arcaDebug as unknown as EnemyCombatDebug;
      for (let index = 0; index < 48; index += 1) {
        debug.fireEnemyCombatVisualProbe(index % 2 === 0 ? 'muzzle' : 'far', index % 3 === 0 ? 'heavy' : 'light');
      }
    });
    let current = await state(page);
    expect(current.activeProjectiles).toBeLessThanOrEqual(12);
    expect(current.poolCapacity).toBe(30);
    expect(current.poolsAvailable).toBeGreaterThanOrEqual(0);
    expect(current.activeCombatLights).toBe(0);
    expect(current.resources.objects).toBe(initial.resources.objects);
    expect(current.resources.geometries).toBe(initial.resources.geometries);
    expect(current.resources.materials).toBe(initial.resources.materials);

    await page.evaluate(() => {
      const debug = window.__arcaDebug as unknown as EnemyCombatDebug;
      debug.saveGame();
      debug.fireEnemyCombatVisualProbe('near-miss', 'structure');
      debug.triggerEnemyDamageVisualProbe(0.2, 'heavy', 'structure');
      debug.loadGame();
    });
    current = await state(page);
    expect(current.activeProjectiles).toBe(0);
    expect(current.activeTrails).toBe(0);
    expect(current.activeDamageRigs).toBe(0);
    expect(current.resourcesReturned).toBe(true);
  });

  await test.step('M25 state, unique ships and Ark remain untouched', async () => {
    const before = await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).getMission25State());
    await page.evaluate(() => {
      const debug = window.__arcaDebug as unknown as EnemyCombatDebug;
      debug.setCameraLookAt('Arca Epsilon');
      debug.fireEnemyCombatVisualProbe('near-miss', 'structure');
    });
    const during = await state(page);
    await screenshot(page, '15-combat-scale-probe.png');
    await screenshot(page, '16-heavy-fire-profile.png');
    const after = await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).getMission25State());
    expect(after.mission25Started).toBe(before.mission25Started);
    expect(after.mission25State).toBe(before.mission25State);
    expect(after.mission25Completed).toBe(before.mission25Completed);
    expect(during.playerShipInstances).toBe(1);
    expect(during.mothershipInstances).toBe(1);
  });

  await test.step('the real scout barrel is the visual launch anchor', async () => {
    await page.evaluate(() => {
      const debug = window.__arcaDebug as unknown as EnemyCombatDebug;
      debug.clearDialogueQueue();
      debug.spawnScoutDroneVisualProbe();
    });
    await expect.poll(async () => (await state(page)).activeEnemies, {
      timeout: 20000,
      intervals: [50, 100, 200]
    }).toBeGreaterThan(0);
    const muzzle = await page.evaluate(() => (window.__arcaDebug as unknown as EnemyCombatDebug).getScoutDroneMuzzlePosition());
    expect(muzzle).not.toBeNull();
    await page.evaluate((target) => {
      const debug = window.__arcaDebug as unknown as EnemyCombatDebug;
      debug.setCameraLookAt(target as Tuple);
      debug.fireScoutDroneCombatProbe();
    }, muzzle);
    const current = await state(page);
    expect(distance(current.lastMuzzlePoint, muzzle!)).toBeLessThan(0.01);
    await screenshot(page, '17-real-scout-muzzle.png');
  });

  await test.step('browser remains error-free with a nonblank canvas', async () => {
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
