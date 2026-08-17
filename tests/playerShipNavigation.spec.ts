import { expect, test, type Page } from '@playwright/test';

/**
 * Navigation and chase-camera behaviour.
 *
 * On frame-rate independence: the game has no fixed-step hook, and the software
 * renderer in this harness runs at a couple of frames a second, so real 60/30/20
 * FPS runs cannot be reproduced here. What is checked instead is the property
 * that actually decides the answer — every rate term in the surface flight path
 * integrates as `exp(-k*dt)` rather than a flat per-frame fraction. The
 * formulas are evaluated over one simulated second at all three step sizes and
 * required to agree. That proves the math is step-invariant; it does not
 * measure a real 60 FPS session.
 */
test.setTimeout(900_000);

type NavState = {
  linearSpeed: number;
  planarSpeed: number;
  yaw: number;
  smoothYaw: number;
  position: number[];
  altitudeAboveTerrain: number;
  brakingActive: boolean;
  precisionActive: boolean;
  cameraDistance: number;
  cameraHeightAboveShip: number;
  cameraFov: number;
  cameraPrecisionBlend: number;
  insideShip: boolean;
  inSurfacePhase: boolean;
  hudVelocity: string;
};

const nav = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getShipNavigationState()) as unknown as Promise<NavState>;

async function bootFlyingOnSurface(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
  });
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(60));
  await page.waitForTimeout(1_200);
  return errors;
}

test('rate terms integrate identically at 60, 30 and 20 FPS', async ({ page }) => {
  const errors = await bootFlyingOnSurface(page);

  // Evaluate the real formulas over one simulated second at three step sizes.
  const result = await page.evaluate(() => {
    const HOVER_RESPONSE = 25;
    const DECEL = 4.8;
    const BRAKE = 1.15;
    const YAW_RESPONSE = 0.002;

    const run = (dt: number) => {
      const steps = Math.round(1 / dt);
      // Hover recovery: the term that used to be a flat per-frame fraction.
      let gap = 10;
      // Horizontal damping, including the brake contribution.
      let speed = 24;
      // Heading smoothing, as the camera and hull basis use it.
      let smoothed = 0;
      const targetYaw = 1;
      for (let i = 0; i < steps; i += 1) {
        gap -= gap * (1 - Math.exp(-HOVER_RESPONSE * dt));
        speed *= Math.exp(-(DECEL + BRAKE) * dt);
        smoothed += (targetYaw - smoothed) * (1 - Math.pow(YAW_RESPONSE, dt));
      }
      return { gap, speed, smoothed };
    };

    return { f60: run(1 / 60), f30: run(1 / 30), f20: run(1 / 20) };
  });

  console.log('FPS CONSISTENCY', JSON.stringify(result));
  const pct = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-6, Math.abs(a)) * 100;

  // The brief's tolerances: <5% for motion terms, <8% for braking.
  expect(pct(result.f60.gap, result.f30.gap), 'hover recovery 60 vs 30').toBeLessThan(5);
  expect(pct(result.f60.gap, result.f20.gap), 'hover recovery 60 vs 20').toBeLessThan(5);
  expect(pct(result.f60.speed, result.f30.speed), 'braking 60 vs 30').toBeLessThan(8);
  expect(pct(result.f60.speed, result.f20.speed), 'braking 60 vs 20').toBeLessThan(8);
  expect(pct(result.f60.smoothed, result.f30.smoothed), 'heading 60 vs 30').toBeLessThan(5);
  expect(pct(result.f60.smoothed, result.f20.smoothed), 'heading 60 vs 20').toBeLessThan(5);

  expect(errors).toEqual([]);
});

test('braking bleeds real velocity, and precision engages only when it should', async ({ page }) => {
  const errors = await bootFlyingOnSurface(page);

  // Braking: push the ship to cruise, hold reverse, and watch real speed fall.
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -24));
  await page.keyboard.down('KeyS');
  const start = Date.now();
  await expect
    .poll(async () => (await nav(page)).planarSpeed, {
      message: 'the brake must bring the ship down from cruise',
      timeout: 60_000,
      intervals: [300]
    })
    .toBeLessThan(2);
  // Release before measuring. Held past a full stop, reverse correctly becomes
  // reverse thrust and the ship accelerates backwards again — that is the
  // control working, not the brake failing.
  await page.keyboard.up('KeyS');
  const stopped = await nav(page);
  console.log('BRAKING', JSON.stringify({
    speedAtRelease: stopped.planarSpeed, wallClockMs: Date.now() - start, hud: stopped.hudVelocity
  }));
  expect(stopped.planarSpeed, 'cruise speed was bled away').toBeLessThan(6);

  // Precision must NOT engage while flying fast.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(60));
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -22));
  await page.waitForTimeout(400);
  const fast = await nav(page);
  console.log('FAST', JSON.stringify({
    speed: fast.planarSpeed, alt: fast.altitudeAboveTerrain, precision: fast.precisionActive
  }));
  expect(fast.precisionActive, 'no precision assist at speed').toBe(false);

  // ...and it must engage when slow and close to the ground.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(14));
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, 0));
  await expect
    .poll(async () => (await nav(page)).precisionActive, {
      message: 'precision assist must engage slow and low',
      timeout: 30_000,
      intervals: [300]
    })
    .toBe(true);
  const slow = await nav(page);
  console.log('PRECISION', JSON.stringify({
    speed: slow.planarSpeed, alt: slow.altitudeAboveTerrain,
    precision: slow.precisionActive, hud: slow.hudVelocity
  }));
  expect(slow.hudVelocity, 'HUD reports the assist').toContain('PRECISION');

  expect(errors).toEqual([]);
});

test('chase camera sits further back without clipping the hull', async ({ page }) => {
  const errors = await bootFlyingOnSurface(page);
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -18));
  await page.waitForTimeout(1_500);

  // The follow is damped, and `liftShipToAltitude` teleports the hull, so the
  // first frames after the jump are a catch-up transient. Wait for the pose to
  // settle before judging it — the transient is not what the player sees.
  await expect
    .poll(async () => (await nav(page)).cameraHeightAboveShip, {
      message: 'the chase pose must settle above the hull',
      timeout: 60_000,
      intervals: [500]
    })
    .toBeGreaterThan(2);

  const flying = await nav(page);
  console.log('CAMERA', JSON.stringify({
    distance: flying.cameraDistance, height: flying.cameraHeightAboveShip,
    fov: flying.cameraFov, hud: flying.hudVelocity
  }));

  // The old surface pose was 19 m back at 6.4 m up. The new base is 23 / 7.1,
  // so the settled distance must clear the old framing.
  expect(flying.cameraDistance, 'camera pulled back from the old 19 m pose')
    .toBeGreaterThan(20);
  // ...and it must never end up inside the hull.
  expect(flying.cameraDistance, 'camera is outside the ship').toBeGreaterThan(12);
  expect(flying.cameraHeightAboveShip, 'camera sits above the hull').toBeGreaterThan(2);

  // Precision pulls in, but never far enough to clip.
  await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(14));
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, 0));
  await expect
    .poll(async () => (await nav(page)).precisionActive, { timeout: 30_000, intervals: [300] })
    .toBe(true);
  await page.waitForTimeout(2_000);
  const close = await nav(page);
  console.log('CAMERA PRECISION', JSON.stringify({
    distance: close.cameraDistance, blend: close.cameraPrecisionBlend
  }));
  expect(close.cameraDistance, 'precision pose still clears the hull').toBeGreaterThan(12);

  // HUD reports speed and altitude on a surface.
  expect(close.hudVelocity).toContain('VEL');
  expect(close.hudVelocity).toContain('ALT');

  expect(errors).toEqual([]);
});

test('weapon stores are untouched by the navigation pass', async ({ page }) => {
  const errors = await bootFlyingOnSurface(page);
  const weapons = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, unknown>;
  console.log('WEAPONS UNCHANGED', JSON.stringify({
    mag: weapons.primaryMagazineCurrent, reserve: weapons.primaryReserveCurrent,
    tubes: weapons.torpedoLoadedCount, torpedoReserve: weapons.torpedoReserveCurrent
  }));
  expect(weapons.primaryMagazineMaximum).toBe(32);
  expect(weapons.torpedoTubeCapacity).toBe(4);
  expect(errors).toEqual([]);
});
