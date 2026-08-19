import { expect, test, type Page } from '@playwright/test';

/**
 * HUD panels must not draw on top of one another.
 *
 * `.descent-panel`, `.colony-panel` and `.habitability-panel` were all authored
 * at the same top-right coordinates, on the assumption that only one is ever
 * visible. On the surface that does not hold, and the three rendered as one
 * pile of overlapping text.
 */
test.setTimeout(600_000);

const PANELS = [
  '.objective-panel', '.systems-panel', '.mission-panel',
  '.descent-panel', '.colony-panel', '.habitability-panel', '#controls-strip'
];

type Box = { selector: string; left: number; top: number; right: number; bottom: number };

async function visibleBoxes(page: Page, selectors: string[]): Promise<Box[]> {
  return page.evaluate((list) => list.flatMap((selector) => {
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) return [];
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return [];
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return [];
    return [{ selector, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }];
  }), selectors);
}

/** Pairs that share screen area, ignoring a pixel of rounding. */
function overlaps(boxes: Box[]): string[] {
  const hits: string[] = [];
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const one = boxes[a];
      const two = boxes[b];
      if (one.right > two.left + 1 && one.left < two.right - 1 &&
          one.bottom > two.top + 1 && one.top < two.bottom - 1) {
        hits.push(`${one.selector} ∩ ${two.selector}`);
      }
    }
  }
  return hits;
}

test('no HUD panel overlaps another, on the surface or in space', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.waitForTimeout(2_000);

  const space = await visibleBoxes(page, PANELS);
  console.log('SPACE PANELS', JSON.stringify(space.map((box) =>
    `${box.selector}@${Math.round(box.top)}-${Math.round(box.bottom)}`)));
  console.log('SPACE OVERLAPS', JSON.stringify(overlaps(space)));
  expect(overlaps(space), 'space HUD has no overlapping panels').toEqual([]);

  // The surface is where the pile appeared: descent and colony are both live.
  await page.evaluate(() => {
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForTimeout(3_000);

  const surface = await visibleBoxes(page, PANELS);
  console.log('SURFACE PANELS', JSON.stringify(surface.map((box) =>
    `${box.selector}@${Math.round(box.top)}-${Math.round(box.bottom)}`)));
  const surfaceHits = overlaps(surface);
  console.log('SURFACE OVERLAPS', JSON.stringify(surfaceHits));
  expect(surfaceHits, 'surface HUD has no overlapping panels').toEqual([]);

  // Everything must also stay inside the viewport.
  const viewport = page.viewportSize();
  for (const box of surface) {
    expect(box.right, `${box.selector} stays within the viewport`).toBeLessThanOrEqual((viewport?.width ?? 1280) + 1);
    expect(box.bottom, `${box.selector} stays on screen`).toBeLessThanOrEqual((viewport?.height ?? 720) + 1);
  }

  // The scene needs real estate: the docked side panels must not eat the middle.
  // The controls strip is excluded on purpose -- it spans the full width as a
  // footer, so counting it as a side panel made this metric return a negative
  // clearance the first time it ran.
  const width = viewport?.width ?? 1280;
  const sides = surface.filter((box) => box.selector !== '#controls-strip');
  const leftEdge = Math.max(...sides.filter((box) => box.left < width / 2).map((box) => box.right), 0);
  const rightEdge = Math.min(...sides.filter((box) => box.left >= width / 2).map((box) => box.left), width);
  const clear = rightEdge - leftEdge;
  console.log('CLEAR CENTRE', JSON.stringify({ leftEdge, rightEdge, clear, ratio: +(clear / width).toFixed(2) }));
  expect(clear / width, 'at least half the width is left for the scene').toBeGreaterThan(0.5);

  expect(errors).toEqual([]);
});
