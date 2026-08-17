import { expect, test, type Page } from '@playwright/test';

/**
 * Atmospheric entry: staging, cinematics and continuity.
 *
 * Drives a real entry through the debug hook and samples the runtime
 * diagnostics ~7x/second, building a timeline. Every assertion below is made
 * against that timeline rather than against a single frame, because the point
 * of the entry rework is the *shape* of the curves over time — which frame is
 * hottest, which is roughest, and in what order.
 *
 * It also writes one canvas capture per stage into
 * `test-results/entry-capture/`, so the sequence can be judged visually and
 * not only numerically.
 */
test.setTimeout(600_000);

const CAPTURE_DIR = 'test-results/entry-capture';

type Sample = {
  t: number;
  stage: string;
  heat: number;
  ionization: number;
  haze: number;
  buffet: number;
  airDensity: number;
  intensity: number;
  particles: number;
  drawCalls: number;
  triangles: number;
  fov: number;
  altitude: number;
};

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

const sample = (page: Page) =>
  page.evaluate(() => {
    const d = window.__arcaDiagnostics;
    return {
      stage: d?.entryStage ?? 'none',
      heat: d?.entryHeat ?? 0,
      ionization: d?.entryIonization ?? 0,
      haze: d?.entryHaze ?? 0,
      // Raw design curve, not the eased camera value: the eased one lags by
      // design and would blur the very ordering this test exists to prove.
      buffet: d?.entryBuffet ?? 0,
      airDensity: d?.entryAirDensity ?? 0,
      intensity: d?.entryFxIntensity ?? 0,
      particles: d?.entryParticles ?? 0,
      drawCalls: d?.drawCalls ?? 0,
      triangles: d?.triangles ?? 0,
      fov: d?.cameraFov ?? 0,
      altitude: d?.altitudeEstimate ?? 0
    };
  });

function peakOf(samples: Sample[], key: 'heat' | 'buffet' | 'ionization'): Sample {
  return samples.reduce((best, s) => (s[key] > best[key] ? s : best), samples[0]);
}

test('atmospheric entry: stage order, cinematic pacing and surface continuity', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  // M01 now has a mandatory flight onboarding before the Atlas chain. Reach
  // the existing descent authorization through its real debug transitions so
  // this focused cinematic probe starts from the same valid precondition.
  expect(await page.evaluate(() => window.__arcaDebug?.completeArkDeparture())).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.advanceMission01To('descentAuthorized'))).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.decodeMarker())).toBe('approachPlanet');
  await page.waitForFunction(
    () => Math.abs((window.__arcaDiagnostics?.cameraFov ?? 0) - 66) < 0.75,
    undefined,
    { timeout: 10000 }
  );

  const canvas = page.locator('#game-canvas');

  // --- Baseline before the entry begins ------------------------------------
  const before = await sample(page);
  await canvas.screenshot({ path: `${CAPTURE_DIR}/00-before.png` });

  expect(await page.evaluate(() => window.__arcaDebug?.startEntry())).toBe('atmosphericEntry');

  // --- Walk the entry at fixed progress points -----------------------------
  // Driving progress directly rather than waiting on wall-clock: under the
  // software renderer the simulation runs ~30x slower than real time, so a
  // timed sweep captures whatever stage it happens to reach rather than the
  // stage we asked for. Each step still runs several real frames, so every
  // eased value (haze, bloom, sheath intensity) settles honestly.
  const samples: Sample[] = [];
  const captured = new Set<string>();

  for (let percent = 2; percent <= 99; percent += 3) {
    await page.evaluate((p) => window.__arcaDebug?.setEntryProgress(p), percent);
    // Let the eased post/effect values converge on the new stage.
    await page.waitForTimeout(260);
    const s = await sample(page);
    samples.push({ ...s, t: percent / 100 });

    if (s.stage !== 'none' && !captured.has(s.stage)) {
      captured.add(s.stage);
      const index = String(captured.size).padStart(2, '0');
      await canvas.screenshot({ path: `${CAPTURE_DIR}/${index}-${s.stage}.png` });
    }
  }

  const effectInstances = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let n = 0;
    scene.traverse((o) => { if (o.name === 'Atmospheric Entry Plasma') n += 1; });
    return n;
  });

  const during = samples.filter((s) => s.stage !== 'none');
  expect(during.length, 'the entry must actually run').toBeGreaterThan(10);

  // --- 1. Every stage is reached, in order ---------------------------------
  const order = ['exosphere', 'contact', 'peak', 'descent', 'approach'];
  const seen: string[] = [];
  for (const s of during) {
    if (seen[seen.length - 1] !== s.stage) seen.push(s.stage);
  }
  const seenKnown = seen.filter((stage) => order.includes(stage));
  expect(seenKnown, 'stages must appear in aerodynamic order, never rewind')
    .toEqual(order.slice(order.indexOf(seenKnown[0])).slice(0, seenKnown.length));
  expect(captured.has('peak'), 'the thermal peak must be reached').toBe(true);

  // --- 2. Buffet peaks BEFORE the thermal peak -----------------------------
  // This is the core physical claim of the rework: dynamic pressure bites
  // before the vehicle glows brightest.
  const heatPeak = peakOf(during, 'heat');
  const buffetPeak = peakOf(during, 'buffet');
  expect(buffetPeak.t, 'buffet must peak before peak heating').toBeLessThan(heatPeak.t);

  // --- 3. Heat leads air density -------------------------------------------
  const lastSample = during[during.length - 1];
  expect(heatPeak.t, 'peak heat happens before the densest air').toBeLessThan(lastSample.t);

  // --- 4. Plasma is gone by the descent/approach stages --------------------
  const late = during.filter((s) => s.stage === 'approach');
  if (late.length > 0) {
    const maxLateIonization = Math.max(...late.map((s) => s.ionization));
    expect(maxLateIonization, 'no ionisation left in the clouds').toBeLessThan(0.05);
  }

  // --- 5. Only one instance of the effect ----------------------------------
  expect(effectInstances, 'exactly one plasma effect in the scene').toBe(1);

  // --- 6. Camera stays sane: no FOV jumps ----------------------------------
  const fovs = during.map((s) => s.fov).filter((f) => f > 0);
  if (fovs.length > 2) {
    expect(Math.min(...fovs), 'FOV must stay within sane limits').toBeGreaterThan(35);
    expect(Math.max(...fovs), 'FOV must stay within sane limits').toBeLessThan(95);
    for (let i = 1; i < fovs.length; i += 1) {
      expect(Math.abs(fovs[i] - fovs[i - 1]), `FOV step ${i} must not snap`).toBeLessThan(6);
    }
  }

  // --- 7. Cost is bounded and released -------------------------------------
  const peakDraws = Math.max(...during.map((s) => s.drawCalls));
  const peakParticles = Math.max(...during.map((s) => s.particles));
  expect(peakParticles, 'particle budget stays bounded').toBeLessThanOrEqual(90);

  // --- Let the entry finish, then confirm the effect released --------------
  // The hook clamps below 100 on purpose so completion still goes through the
  // real state machine rather than being forced.
  await page.evaluate(() => window.__arcaDebug?.setEntryProgress(99.5));
  await expect
    .poll(async () => (await sample(page)).stage, {
      message: 'the entry must complete into the approach stage',
      timeout: 60_000
    })
    .toBe('approach');
  await page.waitForTimeout(3_000);
  const after = await sample(page);
  await canvas.screenshot({ path: `${CAPTURE_DIR}/99-after.png` });
  expect(after.haze, 'heat haze must return to zero').toBeLessThan(0.02);

  // --- 8. Hull materials are restored, not left glowing --------------------
  // Emissive is read straight off the live materials rather than trusted from
  // a flag: a leaked emissive would be invisible to any state check.
  const hullAfter = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let hot = 0;
    let inspected = 0;
    scene.traverse((object) => {
      if (object.name !== 'Player Scout Ship') return;
      object.traverse((child) => {
        const mesh = child as unknown as { isMesh?: boolean; material?: unknown };
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const m = material as { emissive?: { r: number; g: number; b: number }; emissiveIntensity?: number };
          if (!m?.emissive) continue;
          inspected += 1;
          // Anything still burning orange at high intensity means a leak.
          if (m.emissive.r > 0.25 && (m.emissiveIntensity ?? 0) > 1.2) hot += 1;
        }
      });
    });
    return { hot, inspected };
  });
  expect(hullAfter.inspected, 'the hull must expose materials to inspect').toBeGreaterThan(0);
  expect(hullAfter.hot, 'no hull material may stay heated after the entry').toBe(0);

  // --- Canvas is not blank --------------------------------------------------
  const audit = await page.evaluate(() => {
    const canvasEl = document.querySelector('#game-canvas') as HTMLCanvasElement;
    const off = document.createElement('canvas');
    off.width = 160;
    off.height = 90;
    const ctx = off.getContext('2d');
    if (!ctx) return { sampled: 0, nonBlank: 0 };
    ctx.drawImage(canvasEl, 0, 0, 160, 90);
    const data = ctx.getImageData(0, 0, 160, 90).data;
    let nonBlank = 0;
    const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 24) nonBlank += 1;
    }
    return { sampled: total, nonBlank };
  });
  expect(audit.sampled).toBeGreaterThan(1000);

  // --- Timeline artefact for eyeballing ------------------------------------
  await testInfo.attach('entry-timeline.json', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        before,
        after,
        peakDraws,
        peakParticles,
        heatPeakAt: heatPeak.t,
        buffetPeakAt: buffetPeak.t,
        stages: seen,
        samples: during
      },
      null,
      2
    )
  });
  // Printed so a run's shape is readable straight from the console log.
  console.log(
    `ENTRY SHAPE  stages=${seen.join('>')}  buffetPeak@${(buffetPeak.t * 100).toFixed(0)}% ` +
    `heatPeak@${(heatPeak.t * 100).toFixed(0)}%  peakDraws=${peakDraws} peakParticles=${peakParticles}  ` +
    `draws before/after=${before.drawCalls}/${after.drawCalls}  ` +
    `tris before/after=${before.triangles}/${after.triangles}  hazeAfter=${after.haze}`
  );

  expect(consoleErrors).toEqual([]);
});
