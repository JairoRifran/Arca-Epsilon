import { expect, type Page } from '@playwright/test';

/**
 * Shared save/load helper for the mission probes.
 *
 * Reloading the page and reading mission state back is inherently racy: the
 * game boots, the launch button is clicked, and only then does `applySaveGame`
 * run asynchronously. Polling immediately — or waiting a fixed delay tuned on
 * an idle machine — loses that race during a full-suite run, where 17 heavy
 * WebGL pages have already been loaded on software rasterization.
 *
 * This helper waits for each stage explicitly instead of guessing:
 *   1. the page reports `__arcaGameReady`
 *   2. the launch button is dismissed (when present)
 *   3. the debug surface exists again
 *   4. the restored state actually satisfies the caller's predicate
 *
 * Every timeout is deliberately generous: a slow restore is not a failure, a
 * restore that never happens is.
 */
export async function reloadAndAwaitRestore<T>(
  page: Page,
  readState: (page: Page) => Promise<T | undefined>,
  isRestored: (state: T | undefined) => boolean,
  label = 'mission state'
): Promise<T | undefined> {
  // Mission probes can leave a lazy GLB or audio request in flight. Starting a
  // second navigation while Chromium is still servicing it intermittently
  // destroys the evaluation context (and can surface ERR_NETWORK_IO_SUSPENDED
  // under SwiftShader load), so establish a quiet navigation boundary first.
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });

  // Launch and debug readiness are observed inside one browser-side poll.
  // Splitting this into count/isVisible/click/waitForFunction calls makes each
  // restore pay several main-thread round trips while SwiftShader is busy.
  await page.waitForFunction(() => {
    const launch = document.getElementById('launch-button') as HTMLButtonElement | null;
    const boot = document.querySelector('.boot-screen');
    const bootHidden = boot?.classList.contains('is-hidden') ?? true;
    if (!bootHidden) {
      if (launch && !launch.disabled && launch.dataset.restoreClicked !== 'true') {
        launch.dataset.restoreClicked = 'true';
        launch.click();
      }
      return false;
    }
    return window.__arcaDebug !== undefined;
  }, undefined, { timeout: 180000 });

  await expect
    .poll(async () => isRestored(await readState(page)), {
      timeout: 180000,
      intervals: [1000],
      message: `${label} was never restored after reload`
    })
    .toBe(true);

  await expect.poll(async () => page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    return Boolean(canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  }), {
    timeout: 30000,
    message: `${label} restored without an operational WebGL canvas`
  }).toBe(true);
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  return readState(page);
}
