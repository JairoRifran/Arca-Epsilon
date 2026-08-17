import { expect, test, type Page } from '@playwright/test';

test.setTimeout(360_000);

const output = 'artifacts/game-feel-premium';

type NavigationState = {
  linearSpeed: number;
  forwardSpeed: number;
  cameraFov: number;
  spaceThrustLevel: number;
  spaceBoostLevel: number;
  spaceCameraLag: number;
  spaceBrakeActive: boolean;
  lastSpaceBrakeStartSpeed: number;
  lastSpaceBrakeFirstSampleSpeed: number;
  spaceBrakeActivations: number;
  boostActive: boolean;
  inSurfacePhase: boolean;
};

type GameFeelHudState = {
  targetId: string;
  damageDirectionActive: boolean;
  jammed: boolean;
  signalRestored: boolean;
};

type GameFeelDebug = {
  setupCombatHudProbe: () => unknown;
  getFlightCombatHudState: () => GameFeelHudState;
  triggerPlayerShieldImpact: (side?: -1 | 1) => unknown;
  setCombatJammingProbe: (active: boolean) => boolean;
};

const navigation = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getShipNavigationState()) as unknown as Promise<NavigationState>;

const drainDialogue = (page: Page) => page.evaluate(() => {
  for (let index = 0; index < 16; index += 1) window.__arcaDebug?.advanceDialogue();
  window.__arcaDebug?.clearDialogueQueue();
});

test('space flight and combat feedback respond on their first valid simulation sample', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.locator('#new-game-button').click();
  await page.locator('#confirm-new-game-button').click();
  await expect(page.locator('#boot-screen')).toHaveClass(/is-hidden/, { timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => window.__arcaDebug?.getInputGateState().launched), {
    message: 'the new expedition must be live before flight probes begin',
    timeout: 10_000
  }).toBe(true);
  await page.evaluate(() => {
    window.__arcaDebug?.setShipYaw(0);
    window.__arcaDebug?.setShipVelocity(0, 0, 0);
  });
  await drainDialogue(page);
  expect((await navigation(page)).inSurfacePhase, 'game-feel probe must begin in space').toBe(false);

  const lowFov = (await navigation(page)).cameraFov;
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await navigation(page)).forwardSpeed, {
    message: 'W must build real forward speed',
    timeout: 30_000,
    intervals: [250]
  }).toBeGreaterThan(1);
  await page.keyboard.up('KeyW');
  await drainDialogue(page);
  await page.screenshot({ path: `${output}/01-cruise.png` });
  await page.evaluate(() => window.__arcaDebug?.completeMission01Tutorial());
  await expect(page.locator('.objective-panel')).toHaveClass(/is-objective-complete/);
  await page.screenshot({ path: `${output}/09-objective-complete.png` });
  await drainDialogue(page);

  await page.keyboard.down('KeyW');
  await page.keyboard.down('Shift');
  await expect.poll(async () => (await navigation(page)).boostActive, {
    message: 'the existing Shift binding must reach the flight input set',
    timeout: 10_000,
    intervals: [100]
  }).toBe(true);
  await expect.poll(async () => (await navigation(page)).spaceBoostLevel, {
    message: 'boost must ramp with simulation time',
    timeout: 30_000,
    intervals: [250]
  }).toBeGreaterThan(0.2);
  await expect.poll(async () => (await navigation(page)).cameraFov, {
    message: 'boost opens FOV smoothly',
    timeout: 30_000,
    intervals: [250]
  }).toBeGreaterThan(lowFov + 0.5);
  expect((await navigation(page)).spaceCameraLag, 'acceleration creates bounded chase lag').toBeGreaterThan(0);
  await page.screenshot({ path: `${output}/02-boost.png` });
  await page.keyboard.up('Shift');
  await page.keyboard.up('KeyW');
  await drainDialogue(page);

  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, -18));
  const beforeBrake = await navigation(page);
  await page.keyboard.down('KeyS');
  await expect.poll(async () => (await navigation(page)).spaceBrakeActivations, {
    message: 'S must engage the real orbital brake',
    timeout: 30_000,
    intervals: [100]
  }).toBeGreaterThan(beforeBrake.spaceBrakeActivations);
  const firstBrake = await navigation(page);
  expect(firstBrake.spaceBrakeActive).toBe(true);
  expect(firstBrake.lastSpaceBrakeFirstSampleSpeed, 'first S sample must reduce prow speed')
    .toBeLessThan(firstBrake.lastSpaceBrakeStartSpeed);
  expect(firstBrake.forwardSpeed, 'ship must already be slowing after the first valid sample')
    .toBeLessThan(beforeBrake.forwardSpeed);
  await page.screenshot({ path: `${output}/03-braking.png` });
  await page.keyboard.up('KeyS');

  await page.evaluate(() => (window.__arcaDebug as unknown as GameFeelDebug).setupCombatHudProbe());
  await expect.poll(async () => (await page.evaluate(() =>
    (window.__arcaDebug as unknown as GameFeelDebug).getFlightCombatHudState())).targetId, {
    message: 'combat HUD acquires the existing target',
    timeout: 30_000,
    intervals: [250]
  }).not.toBe('');
  await page.screenshot({ path: `${output}/04-target-lock.png` });

  await page.evaluate(() => (window.__arcaDebug as unknown as GameFeelDebug).triggerPlayerShieldImpact(1));
  await expect.poll(async () => (await page.evaluate(() =>
    (window.__arcaDebug as unknown as GameFeelDebug).getFlightCombatHudState())).damageDirectionActive, {
    timeout: 10_000,
    intervals: [100]
  }).toBe(true);
  await page.screenshot({ path: `${output}/05-received-impact.png` });

  await page.evaluate(() => window.__arcaDebug?.setWeaponEnergy(15));
  await expect(page.locator('#flight-combat-hud')).toHaveClass(/is-critical/);
  await page.screenshot({ path: `${output}/06-critical-shield.png` });

  await page.evaluate(() => (window.__arcaDebug as unknown as GameFeelDebug).setCombatJammingProbe(true));
  await expect.poll(async () => (await page.evaluate(() =>
    (window.__arcaDebug as unknown as GameFeelDebug).getFlightCombatHudState())).jammed).toBe(true);
  await page.screenshot({ path: `${output}/07-jammer.png` });

  await page.evaluate(() => (window.__arcaDebug as unknown as GameFeelDebug).setCombatJammingProbe(false));
  await expect.poll(async () => (await page.evaluate(() =>
    (window.__arcaDebug as unknown as GameFeelDebug).getFlightCombatHudState())).signalRestored).toBe(true);
  await page.screenshot({ path: `${output}/08-signal-restored.png` });

  const final = await navigation(page);
  console.log('GAME_FEEL', JSON.stringify({ lowFov, firstBrake, final }));
  expect(errors).toEqual([]);
});
