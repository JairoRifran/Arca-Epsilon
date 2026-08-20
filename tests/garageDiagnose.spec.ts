import { expect, test } from '@playwright/test';

/**
 * Garage diagnosis, ahead of any fix.
 *
 * Two defects survived the first pass: the camera framed the ship far smaller
 * than intended, and the shadow never appeared despite the pipeline being
 * switched on. Both looked correct in code, so this prints the state that
 * would explain them rather than guessing at a cause.
 */
test.setTimeout(600_000);

type GarageDebug = {
  inspectGarage(): Record<string, unknown> | null;
  getGarageState(): { loadState?: string } | null;
};

test('garage bounds and shadow pipeline', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#garage-mode-button').click();
  await expect
    .poll(async () => page.evaluate(() =>
      (window.__arcaDebug as unknown as GarageDebug)?.getGarageState()?.loadState), {
      message: 'model ready', timeout: 300_000, intervals: [1000]
    })
    .toBe('ready');
  await page.waitForTimeout(3_000);

  const report = await page.evaluate(() =>
    (window.__arcaDebug as unknown as GarageDebug)?.inspectGarage());
  console.log('GARAGE INSPECT', JSON.stringify(report, null, 1));

  // How much of the canvas the ship actually covers, which is the complaint.
  const canvasBox = await page.locator('#garage-canvas').boundingBox();
  console.log('CANVAS', JSON.stringify(canvasBox));

  // Where the stats panel sits relative to that canvas.
  const panel = await page.evaluate(() => {
    const node = document.querySelector('.garage-detail, .garage-panel, aside.garage-roster');
    const all = Array.from(document.querySelectorAll('#garage-screen aside, #garage-screen .garage-detail'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: element.className,
          left: Math.round(rect.left), top: Math.round(rect.top),
          width: Math.round(rect.width), height: Math.round(rect.height)
        };
      });
    return { found: Boolean(node), panels: all };
  });
  console.log('UI PANELS', JSON.stringify(panel));

  expect(errors).toEqual([]);
});
