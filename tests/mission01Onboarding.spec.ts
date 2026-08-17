import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

/**
 * Mission 01 onboarding probe: the redesigned opening.
 *
 * `mission01DockedLaunch.spec.ts` already covers the docked prologue in depth.
 * This one starts where that ends — the moment the exit corridor is clear — and
 * covers what the redesign adds: a chase camera close enough to read, an assist
 * that decays as the pilot earns it, four playable manoeuvres, the recon beacon
 * that replaced the empty wait, and a refusal that names its cause and updates
 * the objective in the same frame.
 *
 * Each test is tagged with the requirement numbers it covers so a failure points
 * straight back at what it was protecting.
 */
test.setTimeout(900_000);

const onboarding = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getMission01OnboardingState());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  return errors;
}

/** New game, prologue walked to its handover point. Never a teleport. */
async function startAtFreeFlight(page: Page): Promise<void> {
  await page.goto('/?test=1&prologue=1');
  await ready(page);
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.reload();
  await ready(page);
  await page.locator('#launch-button').click();
  await expect
    .poll(async () => page.evaluate(() => window.__arcaDebug?.completeArkDeparture()), {
      timeout: 120_000,
      message: 'the prologue never reached its handover point'
    })
    .toBe(true);
}

// --- 1 / 5 / 6 --------------------------------------------------------------
test('1/5/6. el prologo entrega al tutorial y cada paso tiene un objetivo unico', async ({ page }) => {
  const errors = watchErrors(page);
  await startAtFreeFlight(page);

  const initial = await onboarding(page);
  expect(initial?.tutorialStarted, 'el tutorial arranca al liberarse del Arca').toBe(true);
  expect(initial?.missionStep).toBe('flightOrientation');
  expect(initial?.assistLevel, 'la asistencia arranca alta').toBe('high');
  expect(initial?.objective).toContain('Orientá');

  // 6. Un objetivo por paso, nunca repetido, nunca una espera pasiva.
  const seen = new Set<string>();
  const order = ['flightOrientation', 'propulsionTrial', 'navigationTrial', 'stabilizationTrial'];
  for (const step of order) {
    const state = await onboarding(page);
    expect(state?.missionStep, `paso ${step}`).toBe(step);
    expect(state?.objective.length, `${step} tiene objetivo`).toBeGreaterThan(0);
    expect(seen.has(state!.objective), `${step}: objetivo no duplicado`).toBe(false);
    seen.add(state!.objective);
    // 16. Ninguna instruccion es una espera vacia.
    expect(state!.objective, `${step} no es solo "Espera"`).not.toMatch(/^(esper[aá]|analizando)\.?$/i);
    expect(await page.evaluate(() => window.__arcaDebug?.driveMission01TutorialStep())).toBe(true);
  }

  const done = await onboarding(page);
  expect(done?.missionStep, 'el tutorial entrega al escaner').toBe('scannerTutorial');
  // La asistencia no queda activa una vez terminado el tutorial.
  expect(done?.assistLevel).toBe('off');

  expect(errors).toEqual([]);
});

// --- 2 / 3 / 4 --------------------------------------------------------------
test('2/3/4. la camara arranca cerca, la nave se lee y el encuadre sigue a la velocidad', async ({ page }) => {
  const errors = watchErrors(page);
  await startAtFreeFlight(page);

  // La transicion desde el acople es amortiguada a proposito, asi que se mide
  // el comportamiento pedido —arranca ancho, cierra suave, se asienta cerca— y
  // no la distancia en un instante arbitrario, que seria una prueba fragil.
  const opening = await onboarding(page);
  expect(opening!.framingActive, 'el encuadre de M01 gobierna la camara').toBe(true);

  // The handoff starts around the real GLB hull, not the Ark-local origin.
  // This sample can land mid-damping between the dock and the 36 m profile.
  expect(opening!.cameraDistance, 'la apertura no entra en el casco').toBeGreaterThan(24);
  expect(opening!.cameraDistance, 'la apertura no pierde la nave').toBeLessThan(45);

  // 2. Se asienta a una distancia legible para el GLB actual, sin primer plano.
  await expect
    .poll(async () => (await onboarding(page))!.cameraDistance, {
      timeout: 45_000,
      intervals: [700],
      message: 'la camara nunca se acerco al encuadre de M01'
    })
    .toBeLessThan(45);

  const idle = await onboarding(page);
  expect(idle!.cameraDistance, 'ni dentro del casco').toBeGreaterThan(30);
  expect(idle!.cameraFraming, 'encuadre estable para el casco real').toBeGreaterThan(34);
  expect(idle!.cameraFraming, 'sin perder el casco en el fondo').toBeLessThan(43);
  expect(idle!.cameraFov, 'lente contenida para el tutorial').toBeLessThan(64);

  // 3. La nave ocupa una proporcion legible sin tapar el espacio de maniobra.
  expect(idle!.shipScreenFraction, 'la nave se lee en el encuadre').toBeGreaterThan(0.16);
  expect(idle!.shipScreenFraction, 'la nave deja espacio delante').toBeLessThan(0.52);

  // 4. Se abre con la velocidad, de forma progresiva y acotada.
  const samples: number[] = [idle!.cameraFraming];
  await page.keyboard.down('w');
  for (let index = 0; index < 6; index += 1) {
    await page.waitForTimeout(900);
    samples.push((await onboarding(page))!.cameraFraming);
  }
  await page.keyboard.up('w');

  const fast = samples[samples.length - 1];
  expect(fast, 'la camara se abre al acelerar').toBeGreaterThan(samples[0] + 1);
  expect(fast, 'pero nunca pasa el limite duro').toBeLessThanOrEqual(60.01);
  for (let index = 1; index < samples.length; index += 1) {
    expect(Math.abs(samples[index] - samples[index - 1]), `muestra ${index}: sin saltos`).toBeLessThan(10);
  }

  // Y se vuelve a cerrar al soltar.
  await expect
    .poll(async () => (await onboarding(page))!.cameraFraming, { timeout: 40_000 })
    .toBeLessThan(fast - 0.5);

  expect(errors).toEqual([]);
});

// --- 7 / 8 -----------------------------------------------------------------
test('7/8. la nave responde al input y el alabeo residual se estabiliza al soltar', async ({ page }) => {
  const errors = watchErrors(page);
  await startAtFreeFlight(page);

  // Todo por sondeo, no por esperas fijas: bajo SwiftShader y con la suite
  // entera por delante los fotogramas llegan cuando llegan, y un sleep afinado
  // en una maquina ociosa mide el planificador, no la nave.
  const before = await onboarding(page);

  // 7. Responde: acelera de verdad.
  await page.keyboard.down('w');
  await expect
    .poll(async () => (await onboarding(page))!.speed, {
      timeout: 60_000,
      intervals: [500],
      message: 'la nave nunca acelero con W'
    })
    .toBeGreaterThan(before!.speed + 1);
  const moving = await onboarding(page);
  expect(moving!.acceleration, 'el empuje sube').toBeGreaterThan(0.1);
  await page.keyboard.up('w');

  // Bajo asistencia el coast es corto: soltar W tiene que leerse como soltar.
  await expect
    .poll(async () => (await onboarding(page))!.speed, {
      timeout: 60_000,
      intervals: [500],
      message: 'la nave no desacelero al soltar W'
    })
    .toBeLessThan(moving!.speed);

  // 8. Autoestabilizacion: el alabeo vuelve a neutro sin input.
  await page.keyboard.down('d');
  await expect
    .poll(async () => Math.abs((await onboarding(page))!.roll), {
      timeout: 60_000,
      intervals: [400],
      message: 'la nave nunca alabeo al desplazarse de costado'
    })
    .toBeGreaterThan(0.01);
  const banked = await onboarding(page);
  await page.keyboard.up('d');

  await expect
    .poll(async () => Math.abs((await onboarding(page))!.roll), {
      timeout: 60_000,
      intervals: [500],
      message: 'el alabeo residual nunca volvio a neutro'
    })
    .toBeLessThan(Math.abs(banked!.roll));
  expect((await onboarding(page))!.stability, 'la nave queda estable').toBeGreaterThan(80);

  expect(errors).toEqual([]);
});

// --- 14 / 15 / 16 / 17 ------------------------------------------------------
test('14/15/16/17. la denegacion da causa, objetivo y baliza en el mismo momento', async ({ page }) => {
  const errors = watchErrors(page);
  await startAtFreeFlight(page);
  await page.evaluate(() => window.__arcaDebug?.advanceMission01To('followSignal'));

  const before = await onboarding(page);
  expect(before?.descentAuthorized, 'todavia no hay autorizacion').toBe(false);
  expect(before?.descentDenied).toBe(false);

  const denied = await page.evaluate(() => window.__arcaDebug?.attemptMission01Descent());
  expect(denied, 'el intento se rechaza').toBe(true);

  const state = await onboarding(page);
  // 14. Con causa, no un rotulo pelado.
  expect(state?.descentDenied).toBe(true);
  expect(state?.blockReason, 'la causa es explicita').toMatch(/atmosf/i);
  expect(state!.blockReason.length, 'no es solo "ACCESO DENEGADO"').toBeGreaterThan(12);
  // 15. El objetivo cambia en el acto. Este era el defecto original.
  expect(state?.objective, 'objetivo accionable inmediato').toMatch(/baliza/i);
  expect(state?.objective).not.toBe(before?.objective);
  // 17. La baliza queda localizable ya mismo: sin prerrequisito oculto.
  expect(state?.activeBeacon, 'la baliza se marca al denegar').toBe('baliza-reconocimiento');
  expect(state?.beaconPhase).toBe('located');
  // 22. No se castiga con teleport.
  expect(state?.entryStarted).toBe(false);

  expect(errors).toEqual([]);
});

// --- 18 / 19 / 20 / 21 ------------------------------------------------------
test('18/19/20/21. escaneo, transferencia con progreso visible y autorizacion', async ({ page }) => {
  const errors = watchErrors(page);
  await startAtFreeFlight(page);
  await page.evaluate(() => window.__arcaDebug?.advanceMission01To('followSignal'));
  await page.evaluate(() => window.__arcaDebug?.attemptMission01Descent());

  // 18. Los datos se escanean acercandose a la baliza.
  expect(await page.evaluate(() => window.__arcaDebug?.approachMission01Beacon())).toBe(true);
  await expect
    .poll(async () => (await onboarding(page))?.scannerActive, { timeout: 60_000 })
    .toBe(true);

  // 19. La transferencia progresa de forma monotona y observable.
  const readings: number[] = [];
  await expect
    .poll(
      async () => {
        const state = await onboarding(page);
        if (state) readings.push(state.transferProgress);
        return state?.dataComplete ?? false;
      },
      { timeout: 180_000, intervals: [600], message: 'la transferencia nunca se completo' }
    )
    .toBe(true);

  const partial = readings.filter((value) => value > 0 && value < 100);
  expect(partial.length, 'el piloto ve porcentajes intermedios, no un salto 0->100').toBeGreaterThan(1);
  for (let index = 1; index < readings.length; index += 1) {
    expect(readings[index], `la transferencia no retrocede (muestra ${index})`)
      .toBeGreaterThanOrEqual(readings[index - 1] - 0.01);
  }

  // 20/21. La autorizacion llega con los datos, y aparece el corredor.
  await page.evaluate(() => window.__arcaDebug?.advanceMission01To('descentAuthorized'));
  await expect
    .poll(async () => (await onboarding(page))?.descentAuthorized, { timeout: 90_000 })
    .toBe(true);
  const authorized = await onboarding(page);
  expect(authorized?.dataComplete).toBe(true);
  expect(authorized?.corridorActive, 'el corredor se activa').toBe(true);
  expect(authorized?.descentDenied, 'la denegacion se levanta').toBe(false);

  expect(errors).toEqual([]);
});

// --- 24: save/load en cada fase --------------------------------------------
for (const phase of ['flightOrientation', 'stabilizationTrial', 'beaconApproach', 'dataTransfer'] as const) {
  test(`24. save/load restaura correctamente en ${phase}`, async ({ page }) => {
    const errors = watchErrors(page);
    await startAtFreeFlight(page);
    await page.evaluate((target) => window.__arcaDebug?.advanceMission01To(target), phase);
    await page.evaluate(() => window.__arcaDebug?.saveGame());

    // Lo que tiene que caer en un checkpoint es el valor *guardado*. El valor
    // vivo sigue avanzando en cuanto la partida se reanuda, asi que medirlo
    // despues de restaurar probaria otra cosa.
    const savedTransfer = await page.evaluate(() => {
      const raw = window.localStorage.getItem('arca-epsilon-save-v2');
      return raw ? (JSON.parse(raw) as { mission01TransferProgress?: number }).mission01TransferProgress : undefined;
    });
    if (phase === 'dataTransfer') {
      expect(savedTransfer ?? -1, 'la transferencia se guarda en un checkpoint de 25').toBeGreaterThan(0);
      expect((savedTransfer ?? 1) % 25, 'y nunca a mitad de camino').toBeLessThan(0.01);
    }

    const restored = await reloadAndAwaitRestore(
      page,
      (target) => target.evaluate(() => window.__arcaDebug?.getMission01OnboardingState()),
      (state) => Boolean(state?.tutorialStarted),
      `M01 ${phase}`
    );

    expect(restored?.objective.length, 'objetivo visible tras restaurar').toBeGreaterThan(0);
    // Nave estable y a velocidad segura, no a mitad de una maniobra.
    expect(restored!.speed, 'restaura a velocidad segura').toBeLessThan(30);
    expect(restored!.activeTimers, 'sin temporizadores residuales').toEqual([]);
    // 26/27. Una sola nave, una sola Arca.
    expect(restored!.shipCount, 'exactamente una nave').toBe(1);
    expect(restored!.mothershipCount, 'exactamente una Arca').toBe(1);

    if (phase === 'dataTransfer') {
      // Reanuda desde el checkpoint guardado, nunca por debajo, y la baliza no
      // se rebobina a oculta.
      expect(restored!.transferProgress, 'no pierde progreso al restaurar')
        .toBeGreaterThanOrEqual(savedTransfer ?? 0);
      expect(restored!.beaconPhase, 'la baliza no se rebobina a oculta').not.toBe('hidden');
    }
    if (phase === 'flightOrientation' || phase === 'stabilizationTrial') {
      // La asistencia sigue activa dentro del tutorial, y en el nivel del paso.
      expect(restored!.assistActive, 'la asistencia se restaura dentro del tutorial').toBe(true);
    }

    expect(errors).toEqual([]);
  });
}

// --- 25: saves anteriores ---------------------------------------------------
test('25. un save previo al onboarding continua sin rebobinar ni repetir', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?test=1&prologue=1');
  await ready(page);

  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.saveGame();
    const raw = window.localStorage.getItem('arca-epsilon-save-v2');
    if (!raw) return;
    const save = JSON.parse(raw) as Record<string, unknown>;
    // Un save previo al rediseno: sin ninguno de los campos nuevos.
    for (const key of Object.keys(save)) {
      if (key.startsWith('mission01Tutorial') || key.startsWith('mission01Assist') ||
          key.startsWith('mission01Beacon') || key === 'mission01TransferProgress') {
        delete save[key];
      }
    }
    // Mid-M01, ya volando y pasado el tutorial.
    save.currentMissionId = 'mission-01-search-home';
    save.currentMissionStep = 'scanOrbitalMarker';
    save.arkDepartureCompleted = true;
    window.localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(save));
  });

  await page.reload();
  await ready(page);
  await page.locator('#launch-button').click();
  await page.waitForTimeout(4_000);

  const state = await onboarding(page);
  // No se le repite el tutorial a quien ya volaba.
  expect(state?.missionStep, 'no rebobina al tutorial').toBe('scanOrbitalMarker');
  expect(state?.tutorialStep, 'el tutorial cuenta como hecho').toBe('completed');
  // Y sobre todo: la asistencia no se filtra a una partida avanzada.
  expect(state?.assistActive, 'la asistencia no queda activa fuera del tutorial').toBe(false);
  expect(state?.assistLevel).toBe('off');

  const dialogue = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
  const played = dialogue?.playedDialogueIds ?? [];
  expect(played.filter((id) => id.startsWith('m01_tutorial_')), 'no se repite el tutorial').toEqual([]);

  expect(errors).toEqual([]);
});

// --- 26..30: integridad de escena ------------------------------------------
test('26..30. una nave, una Arca, sin errores de consola y con canvas activo', async ({ page }) => {
  const errors = watchErrors(page);
  await startAtFreeFlight(page);
  await page.evaluate(() => window.__arcaDebug?.completeMission01Tutorial());
  await page.waitForTimeout(1_500);

  const state = await onboarding(page);
  expect(state?.shipCount, 'exactamente una nave').toBe(1);
  expect(state?.mothershipCount, 'exactamente una Arca').toBe(1);

  // 30. Canvas no vacio.
  const canvasAlive = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    return Boolean(canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  });
  expect(canvasAlive).toBe(true);

  // 28/29. Cero errores de consola y cero pageerror.
  expect(errors).toEqual([]);
});

/**
 * Capturas deterministas de las siete fases.
 *
 * Se adjuntan al informe de Playwright para revisarlas a ojo: el objetivo del
 * rediseno es que la apertura se vea bien, y eso no lo mide un numero.
 */
test('capturas: desacople, camara inicial, tutorial, escaneo, denegacion, autorizacion, corredor', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await startAtFreeFlight(page);

  const shot = async (name: string) => {
    await page.waitForTimeout(900);
    await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
  };

  await shot('01-desacople');
  await page.waitForTimeout(2_000);
  await shot('02-camara-inicial');
  await shot('03-tutorial-orientacion');

  await page.evaluate(() => window.__arcaDebug?.advanceMission01To('followSignal'));
  await page.evaluate(() => window.__arcaDebug?.attemptMission01Descent());
  await shot('05-acceso-denegado');

  await page.evaluate(() => window.__arcaDebug?.approachMission01Beacon());
  await shot('04-escaneo-orbital');

  await page.evaluate(() => window.__arcaDebug?.advanceMission01To('descentAuthorized'));
  await shot('06-autorizacion');
  await shot('07-corredor-de-entrada');

  expect(errors).toEqual([]);
});
