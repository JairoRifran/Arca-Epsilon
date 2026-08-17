import { expect, test, type Page } from '@playwright/test';
import { CombatSession } from '../src/combat/CombatSession';
import { ARK_ORBIT_SURVIVAL } from '../src/combat/CombatScenarioCatalog';
import {
  LocalPlayerProfileRepository,
  PROFILE_STORAGE_KEY,
  type ProfileStorage
} from '../src/profile/PlayerProfileRepository';
import { STARTER_SHIP, STARTER_SHIP_ID, ShipCatalog, type ShipDefinition } from '../src/ships/ShipCatalog';

test.setTimeout(300_000);

class MemoryStorage implements ProfileStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function advance(session: CombatSession, seconds: number, activeEnemies: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) session.update(0.1, activeEnemies);
}

test('perfil, catálogo y CombatSession forman una autoridad local consistente', () => {
  const catalog = new ShipCatalog();
  const storage = new MemoryStorage();
  const profiles = new LocalPlayerProfileRepository(storage, catalog, () => 123_456);
  const initial = profiles.load();

  expect(catalog.list()).toHaveLength(1);
  expect(initial.selectedShipId).toBe(STARTER_SHIP_ID);
  expect(initial.entitlements.map((entry) => entry.catalogItemId)).toEqual([STARTER_SHIP_ID]);
  expect(storage.getItem(PROFILE_STORAGE_KEY)).not.toBeNull();
  expect(catalog.getStarter().stats.primaryDamage).toBeGreaterThan(0);
  expect(catalog.getStarter().stats.torpedoCapacity).toBe(4);

  const testShip: ShipDefinition = {
    ...STARTER_SHIP,
    id: 'test-only-support-ship',
    displayName: 'Test Support Ship',
    model: { ...STARTER_SHIP.model },
    stats: { ...STARTER_SHIP.stats, hullCapacity: 120 },
    acquisition: { type: 'unlock', entitlementId: 'test:ship:support' }
  };
  const multiCatalog = new ShipCatalog([STARTER_SHIP, testShip]);
  const multiStorage = new MemoryStorage();
  const multiProfiles = new LocalPlayerProfileRepository(multiStorage, multiCatalog, () => 123_456);
  const localOnly = multiProfiles.load();
  expect(multiCatalog.list()).toHaveLength(2);
  expect(multiProfiles.selectShip(testShip.id).selectedShipId).toBe(STARTER_SHIP_ID);
  localOnly.entitlements.push({
    id: 'test-entitlement',
    catalogItemId: testShip.id,
    source: 'unlock',
    grantedAt: 123_456
  });
  multiProfiles.save(localOnly);
  expect(multiProfiles.selectShip(testShip.id).selectedShipId).toBe(testShip.id);

  storage.setItem(PROFILE_STORAGE_KEY, '{broken');
  expect(profiles.load().selectedShipId).toBe(STARTER_SHIP_ID);
  expect(profiles.selectShip('premium-inexistente').selectedShipId).toBe(STARTER_SHIP_ID);

  const session = new CombatSession(
    ARK_ORBIT_SURVIVAL,
    'survival',
    'normal',
    initial.id,
    initial.selectedShipId
  );
  expect(session.start()).toBe(true);
  expect(session.snapshot.participants).toEqual([
    { id: initial.id, team: 'player', kind: 'human', shipId: STARTER_SHIP_ID }
  ]);
  advance(session, 3.2, 0);

  for (const waveSize of ARK_ORBIT_SURVIVAL.waveSizes) {
    expect(session.consumeWaveRequest()).toBe(waveSize);
    for (let index = 0; index < waveSize; index += 1) session.reportEnemyDestroyed();
    advance(session, 2, 0);
  }
  advance(session, 2, 0);
  expect(session.snapshot.result).toBe('victory');
  expect(session.snapshot.state).toBe('results');
  expect(session.snapshot.kills).toBe(12);
  expect(session.snapshot.timersActive).toBe(0);
});

type FoundationState = {
  mode: string;
  profile: {
    selectedShipId: string;
    ownedShipIds: string[];
    combatStats: { combatMatchesPlayed: number; combatWins: number; combatKills: number };
  };
  catalog: Array<{ id: string }>;
  garage: null | { loadState: string; rafActive: boolean; drawCalls: number; triangles: number };
  combat: null | {
    state: string;
    wave: number;
    totalWaves: number;
    result: string;
    kills: number;
    timersActive: number;
    countdownRemaining: number;
  };
  story: { missionId: string; missionStep: string; saveFingerprint: string };
  world: {
    mothershipCount: number;
    playerShipCount: number;
    playerShipModelPath: string;
    activeEnemies: number;
    activeEnemyMinimumArkDistance: number | null;
  };
  cleanup: { combatSessionActive: boolean; garageRafActive: boolean; storyHudHiddenForCombat: boolean };
  runtime: { launched: boolean; gamePaused: boolean; dialogueId: string; dialoguePausesGameplay: boolean };
};

async function foundation(page: Page): Promise<FoundationState> {
  return page.evaluate(() => {
    const debug = (window as Window & {
      __arcaDebug?: { getGameModesFoundationState?: () => FoundationState };
    }).__arcaDebug;
    if (!debug?.getGameModesFoundationState) throw new Error('Missing game mode diagnostics');
    return debug.getGameModesFoundationState();
  });
}

async function canvasRatio(page: Page, selector: string): Promise<number> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return 0;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    let sampled = 0;
    for (let y = 0; y < height; y += 12) {
      for (let x = 0; x < width; x += 12) {
        const offset = (y * width + x) * 4;
        const luma = pixels[offset] + pixels[offset + 1] + pixels[offset + 2];
        visible += Number(luma > 12);
        sampled += 1;
      }
    }
    return visible / Math.max(1, sampled);
  }, selector);
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `artifacts/game-modes-foundation/${name}.png`, fullPage: false });
}

test('menú, Garage, combate, resultados y retorno preservan Story', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await expect(page.locator('#combat-mode-button')).toBeVisible();
  await expect(page.locator('#garage-mode-button')).toBeVisible();
  await page.evaluate(() => (window as Window & { __arcaDebug?: { saveGame?: () => unknown } }).__arcaDebug?.saveGame?.());
  const baseline = await foundation(page);
  expect(baseline.mode).toBe('menu');
  expect(baseline.catalog).toEqual([{ id: STARTER_SHIP_ID, acquisition: 'starter', model: '/models/optimized/scout-ship.medium.glb' }]);
  expect(baseline.profile.ownedShipIds).toEqual([STARTER_SHIP_ID]);
  expect(baseline.story.saveFingerprint).not.toBe('empty');
  await capture(page, '01-menu-principal');

  await page.locator('#garage-mode-button').click();
  await expect(page.locator('#garage-screen')).toBeVisible();
  await expect.poll(async () => (await foundation(page)).garage?.loadState, { timeout: 120_000 }).toBe('ready');
  expect(await canvasRatio(page, '#garage-canvas')).toBeGreaterThan(0.02);
  const garage = await foundation(page);
  expect(garage.mode).toBe('garage');
  expect(garage.garage?.rafActive).toBe(true);
  expect(garage.garage?.drawCalls).toBeLessThan(140);
  expect(garage.garage?.triangles).toBeGreaterThan(1_000);
  await capture(page, '02-garage-general');

  await page.evaluate(() => (window as Window & { __arcaDebug?: { setGarageView?: (yaw: number, pitch?: number) => unknown } }).__arcaDebug?.setGarageView?.(0, 0.04));
  await page.waitForTimeout(350);
  await capture(page, '03-garage-frontal');
  await page.evaluate(() => (window as Window & { __arcaDebug?: { setGarageView?: (yaw: number, pitch?: number) => unknown } }).__arcaDebug?.setGarageView?.(Math.PI, 0.12));
  await page.waitForTimeout(350);
  await capture(page, '04-garage-posterior');
  await page.setViewportSize({ width: 430, height: 820 });
  await capture(page, '05-garage-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#garage-back-button').click();
  await expect(page.locator('#garage-screen')).toBeHidden();
  await expect.poll(async () => (await foundation(page)).cleanup.garageRafActive).toBe(false);

  await page.locator('#combat-mode-button').click();
  await expect(page.locator('#combat-setup')).toBeVisible();
  expect((await foundation(page)).mode).toBe('combat');
  await capture(page, '06-combate-selector');
  await page.locator('#combat-start-button').click();
  await expect(page.locator('#combat-live-hud')).toBeVisible();
  await capture(page, '07-combate-cuenta-regresiva');
  await page.waitForTimeout(1_000);
  const combatGate = await foundation(page);
  expect(combatGate.runtime, JSON.stringify({ combatGate, errors })).toEqual({
    launched: true,
    gamePaused: false,
    dialogueId: '',
    dialoguePausesGameplay: false
  });
  expect(combatGate.combat?.countdownRemaining, JSON.stringify({ combatGate, errors })).toBeLessThan(2.8);
  await expect.poll(async () => (await foundation(page)).world.activeEnemies, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await canvasRatio(page, '#game-canvas')).toBeGreaterThan(0.005);
  const started = await foundation(page);
  expect(started.world.mothershipCount).toBe(1);
  expect(started.world.playerShipCount).toBe(1);
  expect(started.world.playerShipModelPath).toBe('/models/optimized/scout-ship.medium.glb');
  expect(started.world.activeEnemyMinimumArkDistance).toBeGreaterThan(155);
  expect(started.cleanup.storyHudHiddenForCombat).toBe(true);
  await capture(page, '08-combate-oleada-1');

  for (let wave = 1; wave <= 3; wave += 1) {
    await expect.poll(async () => (await foundation(page)).combat?.wave, { timeout: 30_000 }).toBe(wave);
    await page.evaluate(() => (window as Window & { __arcaDebug?: { destroyCurrentCombatWave?: () => unknown } }).__arcaDebug?.destroyCurrentCombatWave?.());
    if (wave < 3) {
      await expect.poll(async () => (await foundation(page)).combat?.wave, { timeout: 30_000 }).toBe(wave + 1);
      await expect.poll(async () => (await foundation(page)).world.activeEnemies, { timeout: 30_000 }).toBeGreaterThan(0);
      await capture(page, wave === 1 ? '09-combate-oleada-2' : '10-combate-oleada-3');
    }
  }

  await expect.poll(async () => (await foundation(page)).combat?.state, { timeout: 30_000 }).toBe('results');
  await expect(page.locator('#combat-results')).toBeVisible();
  const finished = await foundation(page);
  expect(finished.combat?.result).toBe('victory');
  expect(finished.combat?.kills).toBe(12);
  expect(finished.combat?.timersActive).toBe(0);
  expect(finished.story.saveFingerprint).toBe(baseline.story.saveFingerprint);
  expect(finished.profile.combatStats.combatMatchesPlayed).toBe(baseline.profile.combatStats.combatMatchesPlayed + 1);
  await capture(page, '11-combate-resultados');

  await page.locator('#combat-replay-button').click();
  await expect(page.locator('#combat-live-hud')).toBeVisible();
  await expect.poll(async () => (await foundation(page)).world.activeEnemies, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    const debug = (window as Window & {
      __arcaDebug?: { defeatOfflineCombat?: () => unknown; showOfflineCombatResults?: () => unknown };
    }).__arcaDebug;
    debug?.defeatOfflineCombat?.();
    debug?.showOfflineCombatResults?.();
  });
  await expect(page.locator('#combat-results')).toBeVisible();
  await expect(page.locator('#combat-result-title')).toHaveText('DERROTA');
  const defeated = await foundation(page);
  expect(defeated.combat?.result).toBe('defeat');
  expect(defeated.profile.combatStats.combatMatchesPlayed).toBe(baseline.profile.combatStats.combatMatchesPlayed + 2);
  expect(defeated.profile.combatStats.combatWins).toBe(baseline.profile.combatStats.combatWins + 1);
  await capture(page, '12-combate-derrota');

  await page.locator('#combat-return-button').click();
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await expect(page.locator('#combat-mode-button')).toBeVisible();
  const returned = await foundation(page);
  expect(returned.mode).toBe('menu');
  expect(returned.story.saveFingerprint).toBe(baseline.story.saveFingerprint);
  expect(returned.world.mothershipCount).toBe(1);
  expect(returned.world.playerShipCount).toBe(1);
  expect(returned.world.activeEnemies).toBe(0);
  expect(returned.cleanup.combatSessionActive).toBe(false);
  expect(returned.cleanup.garageRafActive).toBe(false);
  await capture(page, '13-menu-retorno-limpio');

  await page.locator('#launch-button').click();
  await expect.poll(async () => (await foundation(page)).mode, { timeout: 30_000 }).toBe('story');
  const story = await foundation(page);
  expect(story.story.missionId).toContain('mission-01');
  await capture(page, '14-story-intacto');
  expect(errors).toEqual([]);
});
