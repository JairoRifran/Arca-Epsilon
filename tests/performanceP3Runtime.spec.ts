import { expect, test } from '@playwright/test';

test.setTimeout(360_000);

type P3PreparationState = {
  combat: {
    key: string;
    offscreenRenders: number;
    objects: number;
    materials: number;
    texturesInitialized: number;
    programsBefore: number;
    programsAfter: number;
  } | null;
};

test('selective combat prewarm is invisible, idempotent and keeps programs stable', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?debugPerformance=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await expect(page.locator('#main-menu')).toHaveAttribute('aria-hidden', 'false');

  const first = await page.evaluate(async () => {
    const debug = window.__arcaDebug as unknown as {
      prepareCombatScene?: () => Promise<void>;
      getP3PreparationState?: () => P3PreparationState;
    };
    await debug?.prepareCombatScene?.();
    return debug?.getP3PreparationState?.();
  });
  expect(first?.combat).toMatchObject({
    key: 'combat',
    offscreenRenders: 2
  });
  expect(first?.combat?.objects).toBeGreaterThan(0);
  expect(first?.combat?.materials).toBeGreaterThan(0);
  expect(first?.combat?.texturesInitialized).toBeGreaterThan(0);
  expect(first?.combat?.programsAfter).toBeGreaterThan(first?.combat?.programsBefore ?? 0);

  const second = await page.evaluate(async () => {
    const debug = window.__arcaDebug as unknown as {
      prepareCombatScene?: () => Promise<void>;
      getP3PreparationState?: () => P3PreparationState;
    };
    await debug?.prepareCombatScene?.();
    return debug?.getP3PreparationState?.();
  });
  expect(second).toEqual(first);

  const profile = await page.evaluate(() => window.__arcaDebug?.profileFrames('p3-post-prepare', 1));
  expect(profile?.timeline?.programCountAtEnd).toBe(profile?.timeline?.programCountAtStart);
  await expect(page.locator('#main-menu')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#combat-mode-layer')).toBeHidden();
  await expect(page.locator('#real-gpu-p3-runner')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
