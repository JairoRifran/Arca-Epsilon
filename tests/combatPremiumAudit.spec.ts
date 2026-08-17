import { expect, test, type Page } from '@playwright/test';

test.setTimeout(1_800_000);

const OUT = 'artifacts/combat-premium/after';

const TO_M18 = [
  'startSurfacePhase', 'makeBaseOperational', 'startMission03', 'calibrateMission03Communications',
  'placeRelayBeacon', 'completeSignalSync', 'completeMission03Translation', 'completePleyadanContact',
  'completeMission03', 'startMission04', 'completeMission04', 'startMission05', 'detectSilentProbe',
  'triggerInterference', 'resolveAllEchoes', 'completeCounterSignal', 'completeMission05',
  'startMission06', 'placeAllCloakingProjectors', 'completeCloakingSync', 'completeMission06',
  'startMission07', 'scanAllAtlasEchoNodes', 'activateAtlasSeedArchive', 'completeMission07',
  'startMission08', 'stabilizeAllFractureFoci', 'completeSignalPurge', 'completeMission08',
  'completeMission09', 'startMission10', 'surveyAuroraValley', 'analyzeAllAuroraSamples',
  'markAuroraSettlementSite', 'deployAuroraModule', 'stabilizeAuroraModule', 'completeMission10',
  'startMission11', 'runAuroraCoreDiagnostic', 'markAuroraSecondModuleSite', 'deployAuroraSecondModule',
  'connectAuroraEnergyLink', 'installAuroraWaterFilter', 'calibrateAuroraWaterFlow',
  'prepareAuroraCultivationBed', 'startAuroraBioTrial', 'completeAuroraImpactAssessment', 'completeMission11',
  'startMission12', 'landAuroraCrewCapsule', 'disembarkAuroraCrew', 'completeMission12',
  'startMission13', 'secureStormGenerator', 'anchorStormAntenna', 'activateStormAntenna',
  'chargeStormShield', 'completeMission13', 'startMission14', 'completeTraceInspections',
  'completeReverseTriangulation', 'completeMission14', 'completeMission15', 'completeMission16',
  'completeMission17', 'completeMission18'
];

type Vec3 = [number, number, number];
type CombatDebug = {
  clearSave: () => boolean;
  clearDialogueQueue: () => number;
  setPremiumAutoQualityEnabled: (enabled: boolean) => unknown;
  setRenderProfile: (profile: 'performance' | 'high' | 'ultra') => unknown;
  hideExternalHudForCockpitCapture: (hidden: boolean) => boolean;
  frameCameraTarget: (target: string | Vec3, offset: Vec3, lookHeight?: number) => unknown;
  clearCameraLookAt: () => boolean;
  setShipWorldPosition: (position: Vec3) => Vec3;
  clearCombatProbes: () => boolean;
  setupCombatPacingProbe: (count?: number) => unknown;
  spawnScoutDroneVisualProbe: () => number;
  setScoutDroneIntegrity: (integrity: number) => unknown;
  getScoutDroneVisualProbePosition: () => Vec3 | null;
  fireAtScoutVisualProbe: () => boolean;
  fireScoutDroneCombatProbe: () => boolean;
  orientShipToCombatTarget: () => string;
  showJammerVisualProbe: (state?: 'active' | 'damaged' | 'neutralized') => unknown;
  getJammerVisualState: () => { active: boolean; visible: boolean; meshCount: number; healthRatio: number };
  triggerPlayerShieldImpact: (side?: -1 | 1) => unknown;
  triggerEnemyDamageVisualProbe: (integrity: number, mass?: 'light' | 'medium' | 'heavy', surface?: 'shield' | 'hull' | 'structure') => unknown;
  clearEnemyCombatVisualProbe: () => unknown;
  getEnemyCombatVisualState: () => {
    activeProjectiles: number;
    activeMuzzleFlashes: number;
    activeDamageRigs: number;
    activeEnemies: number;
    weaponVisuals: {
      activeProjectiles: number;
      flashesActive: number;
      impactsActive: number;
      destructionsActive: number;
      fragmentsActive: number;
      destructionStage: string;
    };
  };
  getWeaponVisualState: () => { muzzlePoint: Vec3; energyBurstPoint: Vec3 | null };
  getPerformanceSnapshot: () => { fps: number; drawCalls: number; triangles: number; activeParticles: number };
  togglePause: () => boolean;
  setPlayerMode: (mode: 'ship' | 'onFoot') => unknown;
  liftShipToAltitude: (metres?: number) => number;
  startMission20: () => boolean;
  rendezvousWithArk: () => boolean;
  restoreArkLink: (index: number) => number;
  getOrbitalAscentState: () => { orbitalEnvironmentActive: boolean };
  getHostileContactState: () => { activeEnemyCount: number };
};

async function shot(page: Page, path: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${path}.png`, fullPage: false, timeout: 60_000 });
}

async function freeze(page: Page): Promise<void> {
  const paused = await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    return d.togglePause();
  });
  expect(paused, 'the game must be running so transient VFX can be frozen').toBe(true);
}

async function resume(page: Page): Promise<void> {
  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    if (d.togglePause()) d.togglePause();
  });
}

async function measure(page: Page): Promise<Record<string, number>> {
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    const performance = d.getPerformanceSnapshot();
    const combat = d.getEnemyCombatVisualState();
    let visibleMeshes = 0;
    window.__arcaScene?.traverseVisible((object) => {
      if ((object as typeof object & { isMesh?: boolean }).isMesh) visibleMeshes += 1;
    });
    return {
      fps: performance.fps,
      drawCalls: performance.drawCalls,
      triangles: performance.triangles,
      activeParticles: performance.activeParticles,
      visibleMeshes,
      activeEnemies: combat.activeEnemies,
      enemyProjectiles: combat.activeProjectiles,
      weaponProjectiles: combat.weaponVisuals.activeProjectiles,
      activeEffects:
        combat.activeMuzzleFlashes + combat.activeDamageRigs + combat.weaponVisuals.flashesActive +
        combat.weaponVisuals.impactsActive + combat.weaponVisuals.destructionsActive + combat.weaponVisuals.fragmentsActive
    };
  });
}

test('captures the premium combat chain on real Coalition units and M20', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible()) && (await launch.isEnabled())) {
    await launch.click();
  } else {
    await page.locator('#new-game-button').click();
    await page.locator('#confirm-new-game-button').click();
  }
  await expect(page.locator('#boot-screen')).toHaveClass(/is-hidden/, { timeout: 30_000 });
  // Pause freezes sub-100 ms layers deterministically; hide only its test UI
  // so the captured frame remains the actual WebGL composition.
  await page.addStyleTag({ content: '#pause-menu { display: none !important; }' });
  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.clearSave();
    d.clearDialogueQueue();
    d.setPremiumAutoQualityEnabled(false);
    d.setRenderProfile('performance');
    d.hideExternalHudForCockpitCapture(true);
  });

  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).spawnScoutDroneVisualProbe());
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).frameCameraTarget('Dron Explorador Coalición 1', [13, 5, 21], 0));
  await page.waitForTimeout(500);
  await shot(page, 'drones/01-scout-close');
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).frameCameraTarget('Dron Explorador Coalición 1', [48, 17, 74], 0));
  await shot(page, 'drones/02-scout-medium');

  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.setupCombatPacingProbe(5);
    d.hideExternalHudForCockpitCapture(false);
    d.frameCameraTarget('Nave', [0, 180, 690], 0);
  });
  await page.waitForTimeout(900);
  await shot(page, 'drones/03-coalition-formation');

  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.hideExternalHudForCockpitCapture(true);
    d.showJammerVisualProbe('active');
    d.frameCameraTarget('Interferidor de la Coalición', [62, 22, 78], 0);
  });
  await page.waitForTimeout(500);
  const jammer = await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).getJammerVisualState());
  expect(jammer.active).toBe(true);
  expect(jammer.visible).toBe(true);
  expect(jammer.meshCount).toBeGreaterThan(8);
  await shot(page, 'jammer/01-electronic-warfare-profile');

  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.clearCombatProbes();
    d.setShipWorldPosition([0, 640, -1_200]);
    d.frameCameraTarget('Nave', [16, 5, 22], 0.4);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.spawnScoutDroneVisualProbe();
    d.orientShipToCombatTarget();
    d.frameCameraTarget('Nave', [16, 5, 22], 0.4);
  });
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).fireAtScoutVisualProbe())).toBe(true);
  await freeze(page);
  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.frameCameraTarget(d.getWeaponVisualState().muzzlePoint, [14, 6, 18], 0);
  });
  await page.waitForTimeout(100);
  await shot(page, 'weapons/01-player-muzzle-hardpoint');
  await resume(page);
  await page.waitForTimeout(45);
  await freeze(page);
  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    const pulse = d.getWeaponVisualState().energyBurstPoint;
    if (pulse) d.frameCameraTarget(pulse, [10, 4, 14], 0);
  });
  await page.waitForTimeout(100);
  await shot(page, 'weapons/02-player-projectile-streak');
  await resume(page);
  await expect.poll(async () => {
    const state = await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).getEnemyCombatVisualState());
    return state.weaponVisuals.impactsActive;
  }, { timeout: 4_000, intervals: [15, 25, 40] }).toBeGreaterThan(0);
  await freeze(page);
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).frameCameraTarget('Dron Explorador Coalición 1', [32, 12, 48], 0));
  await shot(page, 'impacts/01-drone-hull-contact');
  await resume(page);

  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.triggerPlayerShieldImpact(1);
    d.triggerPlayerShieldImpact(1);
    d.frameCameraTarget('Nave', [20, 7, 28], 0.5);
  });
  await freeze(page);
  await shot(page, 'impacts/02-player-shield-localized');
  await resume(page);

  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.setScoutDroneIntegrity(0.22);
    d.frameCameraTarget('Dron Explorador Coalición 1', [28, 12, 46], 0);
  });
  await page.waitForTimeout(300);
  await shot(page, 'impacts/03-scout-critical-state');

  await page.waitForTimeout(450);
  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.setScoutDroneIntegrity(0.15);
    d.orientShipToCombatTarget();
  });
  expect(await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).fireAtScoutVisualProbe())).toBe(true);
  await expect.poll(async () => {
    const state = await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).getEnemyCombatVisualState());
    return state.weaponVisuals.destructionsActive;
  }, { timeout: 4_000, intervals: [10, 20, 30] }).toBeGreaterThan(0);
  await freeze(page);
  await shot(page, 'destruction/01-t0-core-release');
  await resume(page);
  await page.waitForTimeout(100);
  await freeze(page);
  await shot(page, 'destruction/02-t100-plasma-rupture');
  await resume(page);
  await page.waitForTimeout(200);
  await freeze(page);
  await shot(page, 'destruction/03-t300-debris-separation');
  await resume(page);
  await page.waitForTimeout(400);
  await freeze(page);
  await shot(page, 'destruction/04-t700-residual-energy');
  await resume(page);
  await page.waitForTimeout(800);
  await shot(page, 'destruction/05-t1500-clean-return');

  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.showJammerVisualProbe('neutralized');
    d.frameCameraTarget('Interferidor de la Coalición', [62, 22, 78], 0);
  });
  await page.waitForTimeout(260);
  await shot(page, 'jammer/02-neutralized-signal-collapse');

  await page.evaluate((sequence) => {
    const d = window.__arcaDebug as unknown as CombatDebug & Record<string, (argument?: unknown) => unknown>;
    d.clearCombatProbes();
    d.hideExternalHudForCockpitCapture(false);
    d.clearCameraLookAt();
    for (const name of sequence) d[name]?.();
    d.startMission20();
    d.setPlayerMode('ship');
    d.liftShipToAltitude(2_500);
    d.clearDialogueQueue();
  }, TO_M18);
  await expect.poll(async () => {
    await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).liftShipToAltitude(2_500));
    return page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).getOrbitalAscentState().orbitalEnvironmentActive);
  }, { timeout: 240_000, intervals: [1_500] }).toBe(true);
  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    d.rendezvousWithArk();
    d.restoreArkLink(2);
    d.clearDialogueQueue();
  });
  await expect.poll(async () => {
    return page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).getHostileContactState().activeEnemyCount);
  }, { timeout: 90_000, intervals: [1_000] }).toBe(5);
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).frameCameraTarget('Arca Epsilon Mothership', [280, 125, 390], 0));
  const before = await measure(page);
  await shot(page, 'm20/01-ark-battle-coalition-attack');

  await page.evaluate(() => {
    const d = window.__arcaDebug as unknown as CombatDebug;
    for (let index = 0; index < 4; index += 1) {
      d.triggerEnemyDamageVisualProbe(0, index % 2 === 0 ? 'light' : 'heavy', 'hull');
      d.fireScoutDroneCombatProbe();
    }
  });
  const during = await measure(page);
  await page.waitForTimeout(2_400);
  await page.evaluate(() => (window.__arcaDebug as unknown as CombatDebug).clearEnemyCombatVisualProbe());
  await page.waitForTimeout(900);
  const after = await measure(page);
  console.log('COMBAT_PREMIUM_METRICS', JSON.stringify({ before, during, after }));

  expect(after.activeEffects).toBeLessThanOrEqual(before.activeEffects);
  expect(after.drawCalls).toBeLessThan(240);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
