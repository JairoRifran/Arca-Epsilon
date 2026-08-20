import { expect, test, type Page } from '@playwright/test';

test.setTimeout(300_000);

type P4Debug = {
  setCombatVfxDiagnostic: (preset: string) => Record<string, boolean>;
  getCombatVfxDiagnostic: () => {
    config: Record<string, boolean>;
    player: {
      impactsActive: number;
      fragmentsActive: number;
      impactParticlesActive: number;
      combatLightsActive: number;
    };
  };
  getCombatVfxMaterialAudit: () => {
    objectCount: number;
    transparentObjectCount: number;
    additiveObjectCount: number;
    shadowCasterCount: number;
  };
  getCombatVfxQualityState: () => {
    profile: string;
    budgets: {
      impactParticles: number;
      torpedoParticleBonus: number;
      fragments: number;
      lights: number;
      trailSamples: number;
      leakParticles: number;
      damageRigDuration: number;
    };
    distance: { close: number; far: number };
  };
  setRenderProfile: (profile: 'performance' | 'high' | 'ultra') => unknown;
  fireWeaponVisualProbe: (weapon: 'laser', surface: 'hull', destructive: boolean) => boolean;
  clearWeaponVisualProbe: () => unknown;
  getWeaponVisualState: () => { targetHealth: number; destructionsActive: number; fragmentsActive: number };
};

async function ready(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 180_000 });
  const launch = page.locator('#launch-button');
  if (await launch.isVisible()) await launch.click();
  await page.waitForFunction(() => {
    const debug = window.__arcaDebug as unknown as Partial<P4Debug> | undefined;
    return typeof debug?.setCombatVfxDiagnostic === 'function';
  });
}

test('P4 budgets stay bounded and presentation toggles do not change combat authority', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await ready(page);

  const budgets = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as P4Debug;
    debug.setRenderProfile('high');
    return debug.getCombatVfxQualityState();
  });
  expect(budgets).toMatchObject({
    profile: 'high',
    budgets: {
      impactParticles: 3,
      torpedoParticleBonus: 3,
      fragments: 5,
      lights: 0,
      trailSamples: 14,
      leakParticles: 3,
      damageRigDuration: 10
    },
    distance: { close: 280, far: 520 }
  });

  const audit = await page.evaluate(() =>
    (window.__arcaDebug as unknown as P4Debug).getCombatVfxMaterialAudit());
  expect(audit.objectCount).toBeGreaterThan(0);
  expect(audit.transparentObjectCount).toBeGreaterThan(0);
  expect(audit.additiveObjectCount).toBeGreaterThan(0);
  expect(audit.shadowCasterCount).toBe(0);

  const authority = await page.evaluate(() => {
    const debug = window.__arcaDebug as unknown as P4Debug;
    debug.clearWeaponVisualProbe();
    const config = debug.setCombatVfxDiagnostic('minimal');
    const fired = debug.fireWeaponVisualProbe('laser', 'hull', true);
    const state = debug.getWeaponVisualState();
    const runtime = debug.getCombatVfxDiagnostic();
    debug.setCombatVfxDiagnostic('full');
    return { config, fired, state, runtime, restored: debug.getCombatVfxDiagnostic().config };
  });
  expect(authority.fired).toBe(true);
  expect(authority.state.targetHealth).toBeLessThanOrEqual(0);
  expect(authority.state.destructionsActive).toBeGreaterThan(0);
  expect(authority.state.fragmentsActive).toBeGreaterThan(0);
  expect(authority.config.fragments).toBe(false);
  expect(authority.runtime.config.fragments).toBe(false);
  expect(authority.restored.fragments).toBe(true);
  expect(authority.runtime.player.combatLightsActive).toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
