import { expect, test, type Page } from '@playwright/test';

test.setTimeout(240000);

type PacingDiagnostics = {
  active: number;
  simultaneousAttackers: number;
  maximumSimultaneousAttackersObserved: number;
  averageDistance: number;
  averageSpeed: number;
  closeRangeTimePercent: number;
  firstShotSeconds: number;
  averageAttackRunSeconds: number;
  shotsFired: number;
  completedPasses: number;
  states: Record<string, number>;
};

type CombatDebug = {
  setupCombatPacingProbe: (count?: number) => PacingDiagnostics;
  stepCombatPacingProbe: (seconds?: number) => PacingDiagnostics;
  getCombatPacingState: () => PacingDiagnostics;
  clearCombatProbes: () => boolean;
  clearDialogueQueue: () => void;
};

async function ready(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 180000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible())) await launch.click();
  await page.waitForFunction(() => Boolean(window.__arcaDebug), undefined, { timeout: 30000 });
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).clearDialogueQueue());
}

test('scout combat uses bounded tactical passes instead of synchronized close orbit', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  await ready(page);

  const initial = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    return debug.setupCombatPacingProbe(6);
  });
  expect(initial.active).toBe(6);
  expect(initial.shotsFired).toBe(0);

  const paced = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as CombatDebug;
    return debug.stepCombatPacingProbe(24);
  });
  expect(paced.active).toBe(6);
  expect(paced.maximumSimultaneousAttackersObserved).toBeLessThanOrEqual(2);
  expect(paced.averageDistance).toBeGreaterThan(250);
  expect(paced.averageSpeed).toBeGreaterThan(8);
  expect(paced.averageSpeed).toBeLessThanOrEqual(72.1);
  expect(paced.closeRangeTimePercent).toBeLessThan(8);
  expect(paced.firstShotSeconds).toBeGreaterThan(5);
  expect(paced.shotsFired).toBeGreaterThan(0);
  expect(paced.completedPasses).toBeGreaterThan(0);
  expect(paced.averageAttackRunSeconds).toBeGreaterThan(3);
  expect(paced.states.support + paced.states.extend + paced.states.reposition + paced.states.break).toBeGreaterThan(0);

  const sceneCounts = await page.evaluate(() => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    let pool = 0;
    let visible = 0;
    scene.traverse((object) => {
      if (!/^Dron Explorador Coalici/.test(object.name || '')) return;
      pool += 1;
      if (object.visible) visible += 1;
    });
    return { pool, visible };
  });
  expect(sceneCounts.pool).toBe(6);
  expect(sceneCounts.visible).toBe(6);
  expect(errors).toEqual([]);
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).clearCombatProbes());
});
