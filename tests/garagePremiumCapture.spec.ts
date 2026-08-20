import { expect, test, type Page } from '@playwright/test';

/**
 * Garage visual record.
 *
 * The same fixed views are shot before and after the premium pass, so the two
 * sets are directly comparable. `setGarageView` drives the presentation angle
 * rather than a mouse drag, which keeps every frame reproducible.
 *
 * Pass GARAGE_TAG=before|after to choose the output folder.
 */
test.setTimeout(900_000);

const TAG = process.env.GARAGE_TAG ?? 'after';
const OUT = `test-results/garage-${TAG}`;

/** Fixed presentation angles, in radians of ship yaw. */
const VIEWS: { id: string; yaw: number; pitch: number }[] = [
  { id: '01-hero-three-quarter', yaw: -0.55, pitch: 0.08 },
  { id: '02-side', yaw: -Math.PI / 2, pitch: 0.02 },
  { id: '03-rear-engines', yaw: -Math.PI, pitch: 0.06 },
  { id: '04-front-three-quarter', yaw: 0.6, pitch: 0.1 },
  { id: '05-low-angle', yaw: -0.55, pitch: -0.17 },
  { id: '06-top-down-ish', yaw: -0.55, pitch: 0.31 }
];

type GarageState = { loadState?: string; drawCalls?: number; triangles?: number };

async function openGarage(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#garage-mode-button').click();
  // The model streams in; shooting before it lands would compare empty rooms.
  await expect
    .poll(async () => page.evaluate(() =>
      (window.__arcaDebug as unknown as { getGarageState(): GarageState | null })?.getGarageState()?.loadState), {
      message: 'the garage model finishes loading', timeout: 300_000, intervals: [1000]
    })
    .toBe('ready');
  await page.waitForTimeout(2_500);
  return errors;
}

test('garage presentation captures', async ({ page }) => {
  const errors = await openGarage(page);

  const state = await page.evaluate(() => (window.__arcaDebug as unknown as { getGarageState(): GarageState | null })?.getGarageState());
  console.log(`GARAGE STATE (${TAG})`, JSON.stringify(state));

  for (const view of VIEWS) {
    await page.evaluate((v) => (window.__arcaDebug as unknown as { setGarageView(y: number, p?: number): unknown })?.setGarageView(v.yaw, v.pitch), view);
    // Yaw and pitch are eased, so the frame has to settle before it is shot.
    await page.waitForTimeout(2_600);
    await page.locator('#garage-canvas').screenshot({ path: `${OUT}/${view.id}.png` });
  }

  // Full screen, which is the only way to see whether the information column
  // still covers the hull. The canvas-only shots cannot show that by design.
  await page.screenshot({ path: `${OUT}/00-full-screen.png` });

  // Structural cost, hardware independent and therefore comparable.
  const after = await page.evaluate(() => (window.__arcaDebug as unknown as { getGarageState(): GarageState | null })?.getGarageState());
  console.log(`GARAGE COST (${TAG})`, JSON.stringify(after));

  // Responsive checks at the sizes the brief names.
  for (const [label, size] of [
    ['1440x900', { width: 1440, height: 900 }],
    ['800x450', { width: 800, height: 450 }]
  ] as const) {
    await page.setViewportSize(size);
    await page.waitForTimeout(2_000);
    await page.locator('#garage-canvas').screenshot({ path: `${OUT}/07-responsive-${label}.png` });
  }

  console.log(`ERRORS (${TAG})`, JSON.stringify(errors));
  expect(errors).toEqual([]);
});
