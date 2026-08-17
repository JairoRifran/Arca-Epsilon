import { expect, test, type Page } from '@playwright/test';

const OUTPUT = 'artifacts/m01-flight-fix';

type FlightSample = NonNullable<Awaited<ReturnType<typeof onboarding>>> & {
  sampledAtSeconds?: number;
};

const onboarding = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission01OnboardingState());

const departure = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getArkDepartureState());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

async function dismissConfirmedDialogue(page: Page): Promise<void> {
  const awaiting = await page.evaluate(() => window.__arcaDebug?.getDialogueState().awaitingInput);
  if (awaiting) await page.keyboard.press('Enter');
}

async function interactAndWaitForDepartureStep(page: Page, expected: string): Promise<void> {
  await dismissConfirmedDialogue(page);
  await page.waitForTimeout(450);
  await page.keyboard.press('e');
  await expect.poll(async () => (await departure(page))?.arkDepartureStep, {
    timeout: 30_000,
    message: `E no avanzo el prologo a ${expected}`
  }).toBe(expected);
}

async function startRealControlTutorial(page: Page): Promise<void> {
  await page.goto('/?test=1&prologue=1');
  await ready(page);
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.reload();
  await ready(page);
  await page.locator('#launch-button').click();

  // The real prologue owns the HUD and the hull until the player releases it.
  expect((await onboarding(page))?.missionStep).toBe('briefing');
  expect((await departure(page))?.translationLocked).toBe(true);
  await interactAndWaitForDepartureStep(page, 'missionContext');
  await interactAndWaitForDepartureStep(page, 'preflightCheck');

  await dismissConfirmedDialogue(page);
  await page.waitForTimeout(450);
  await page.keyboard.press('e');
  await expect.poll(async () => (await departure(page))?.arkDepartureStep, {
    timeout: 45_000,
    message: 'la revision previa no llego a sistemas operativos'
  }).toBe('readyForRelease');

  await interactAndWaitForDepartureStep(page, 'releaseDockingClamps');
  await expect.poll(async () => (await departure(page))?.clampsReleased, {
    timeout: 45_000,
    message: 'los anclajes no terminaron de abrir'
  }).toBe(true);

  // Physical separation with the real W binding. No mission/debug setter.
  await page.keyboard.down('w');
  await expect.poll(async () => (await departure(page))?.arkDepartureCompleted, {
    timeout: 180_000,
    intervals: [500],
    message: 'el vuelo real no libero el corredor del Arca'
  }).toBe(true);
  await page.keyboard.up('w');

  await expect.poll(async () => (await onboarding(page))?.missionStep, {
    timeout: 30_000,
    message: 'el handoff real no inicio CONTROL DE ACTITUD'
  }).toBe('flightOrientation');

  // Finish any confirmed prologue line. The tutorial line itself is non-blocking.
  for (let index = 0; index < 4; index += 1) {
    await dismissConfirmedDialogue(page);
    await page.waitForTimeout(100);
  }
  await page.locator('#game-canvas').click({ force: true, position: { x: 800, y: 450 } });
}

async function aimAtVisibleObjective(page: Page): Promise<{ beforeYaw: number; afterYaw: number }> {
  const beforeYaw = (await onboarding(page))!.yaw;
  const canvas = page.locator('#game-canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Canvas sin bounds durante CONTROL DE ACTITUD');
  expect(await page.locator('#objective-marker').isVisible(), 'la baliza tiene marcador HUD').toBe(true);
  let mouseX = canvasBox.x + canvasBox.width * 0.5;
  let mouseY = canvasBox.y + canvasBox.height * 0.5;

  for (let index = 0; index < 6; index += 1) {
    const state = await onboarding(page);
    if (state && state.alignmentDegrees <= 11) break;
    if (!state) throw new Error('Sin diagnostico de M01 durante la orientacion');
    const dx = -state.alignmentYawError / 0.0023;
    const dy = -state.alignmentPitchError / 0.0023;
    mouseX = Math.max(canvasBox.x + 8, Math.min(canvasBox.x + canvasBox.width - 8, mouseX + dx));
    mouseY = Math.max(canvasBox.y + 8, Math.min(canvasBox.y + canvasBox.height - 8, mouseY + dy));
    await page.mouse.move(mouseX, mouseY, { steps: 6 });
    await page.waitForTimeout(350);
  }

  return { beforeYaw, afterYaw: (await onboarding(page))!.yaw };
}

test.setTimeout(420_000);

test('M01 real flight QA: handoff, actitud, aceleracion, camara y frenado', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await startRealControlTutorial(page);
  await page.screenshot({ path: `${OUTPUT}/02-tutorial-after-dialogue.png` });

  const idle = (await onboarding(page))!;
  await page.screenshot({ path: `${OUTPUT}/03-idle.png` });
  expect(idle.controlsEnabled, 'el handoff habilita controles reales').toBe(true);
  expect(idle.dialoguePausesGameplay, 'ningun dialogo contradice el tutorial').toBe(false);
  expect(idle.arkTranslationLocked, 'los anclajes ya no retienen la nave').toBe(false);
  expect(idle.arkThrustLimit, 'el vuelo normal recupera autoridad completa').toBe(1);
  expect(idle.flightMode).toBe('space');
  expect(idle.cameraMode).toBe('external');
  expect(idle.framingActive).toBe(true);
  expect(idle.cameraFollowError, 'la camara sigue la posicion mundial del casco').toBeLessThan(2.5);
  expect(idle.shipViewport[0], 'casco dentro del ancho util').toBeGreaterThan(0.2);
  expect(idle.shipViewport[0], 'casco dentro del ancho util').toBeLessThan(0.8);
  expect(idle.shipViewport[1], 'casco en la mitad inferior legible').toBeGreaterThan(0.38);
  expect(idle.shipViewport[1], 'casco sin caer fuera de pantalla').toBeLessThan(0.86);
  await expect(page.locator('#objective-target-name')).toContainText('BALIZA DE SALIDA E-01');

  await page.screenshot({ path: `${OUTPUT}/06-aiming-e01.png` });
  const attitude = await aimAtVisibleObjective(page);
  expect(Math.abs(attitude.afterYaw - attitude.beforeYaw), 'el mouse cambia la actitud del casco').toBeGreaterThan(0.01);
  const aligned = (await onboarding(page))!;
  expect(aligned.alignmentDegrees, 'la baliza visible y el calculo usan el mismo punto').toBeLessThanOrEqual(12);
  await page.screenshot({ path: `${OUTPUT}/07-aligned.png` });
  await expect.poll(async () => (await onboarding(page))?.missionStep, {
    timeout: 30_000,
    message: 'la alineacion real no completo CONTROL DE ACTITUD'
  }).toBe('propulsionTrial');

  // Use a smaller instrumentation viewport so SwiftShader can service the
  // wall-clock checkpoints; captures return to the requested 1600x900 frame.
  await page.setViewportSize({ width: 900, height: 506 });
  await page.waitForTimeout(500);
  const origin = (await onboarding(page))!;
  const originPosition = origin.shipPosition;
  await page.keyboard.down('w');
  // Collect first, then capture. Software screenshots can take multiple
  // seconds and must not move the requested 0.5/1/2/3 s checkpoints.
  const samples = await page.evaluate(async () => {
    const checkpoints = [0, 500, 1_000, 2_000, 3_000];
    const startedAt = performance.now();
    const readings: FlightSample[] = [];
    for (const checkpoint of checkpoints) {
      const remaining = checkpoint - (performance.now() - startedAt);
      if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      const state = window.__arcaDebug?.getMission01OnboardingState();
      if (!state) throw new Error('Sin diagnostico de M01 durante la medicion');
      readings.push({ ...state, sampledAtSeconds: (performance.now() - startedAt) / 1_000 });
    }
    return readings;
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.screenshot({ path: `${OUTPUT}/04-accelerating.png` });
  await page.keyboard.up('w');
  await page.screenshot({ path: `${OUTPUT}/05-cruise-camera.png` });

  [0, 0.5, 1, 2, 3].forEach((checkpoint, index) => {
    expect(
      Math.abs((samples[index].sampledAtSeconds ?? 0) - checkpoint),
      `muestra ${checkpoint} s tomada a tiempo`
    ).toBeLessThan(0.35);
  });

  const cruise = samples[samples.length - 1];
  const displacement = Math.hypot(
    cruise.shipPosition[0] - originPosition[0],
    cruise.shipPosition[1] - originPosition[1],
    cruise.shipPosition[2] - originPosition[2]
  );
  expect(samples[1].thrustInput).toBe(1);
  expect(samples[1].spool, 'el motor responde dentro de 0.5 s').toBeGreaterThan(0.05);
  expect(samples[2].speed, 'la velocidad crece al primer segundo').toBeGreaterThan(origin.speed + 1);
  expect(cruise.speed, 'el vuelo es perceptible a los tres segundos').toBeGreaterThan(4);
  expect(displacement, 'el transform mundial cambia de forma apreciable').toBeGreaterThan(3);
  expect(cruise.cameraFollowError, 'la camara acompana el desplazamiento real').toBeLessThan(2.5);

  const hudSample = await page.evaluate(() => ({
    state: window.__arcaDebug?.getMission01OnboardingState(),
    text: document.querySelector('#velocity-readout')?.textContent ?? ''
  }));
  const hudSpeed = Number(hudSample.text.match(/VEL\s+(\d+)/)?.[1] ?? Number.NaN);
  expect(
    Math.abs(hudSpeed - (hudSample.state?.speed ?? Number.NaN)),
    'el HUD informa la velocidad fisica del mismo frame'
  ).toBeLessThanOrEqual(1);

  await page.keyboard.down('s');
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${OUTPUT}/08-braking.png` });
  await page.waitForTimeout(1_500);
  await page.keyboard.up('s');
  const braked = (await onboarding(page))!;
  expect(braked.speed, 'S reduce la velocidad real').toBeLessThan(cruise.speed);

  // Kept in the trace/report by Playwright without permanent runtime logging.
  test.info().annotations.push({
    type: 'm01-flight-samples',
    description: JSON.stringify({ samples, displacement, brakedSpeed: braked.speed })
  });
  expect(errors).toEqual([]);
});
