import { expect, test, type Page } from '@playwright/test';
import { reloadAndAwaitRestore } from './missionProbeHelpers';

test.setTimeout(600000);

async function ready(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300000 });
  const launch = page.locator('#launch-button');
  if ((await launch.count()) && (await launch.isVisible())) await launch.click();
  await page.waitForFunction(() => window.__arcaDebug !== undefined, undefined, { timeout: 180000 });
}

test('M24 hands its real orbital sector and Ark instance to M25 after a stable transition', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

  await ready(page);
  await page.evaluate(() => {
    const debug = window.__arcaDebug;
    debug?.clearSave();
    debug?.startMission24();
    debug?.completeMission24();
    debug?.teleportToMission24Target();
    debug?.clearDialogueQueue();
  });

  const handoff = await page.evaluate(() => ({
    m24: window.__arcaDebug?.getMission24State(),
    m25: window.__arcaDebug?.getMission25State(),
    ship: window.__arcaDebug?.getShipTransform().position,
    ark: window.__arcaDebug?.getMothershipIdentity(),
    distance: window.__arcaDebug?.getMission25Diagnostics().distanceToArk,
    visual24: window.__arcaDebug?.getMission24VisualState(),
    visual25: window.__arcaDebug?.getMission25VisualState()
  }));
  expect(handoff.m24?.mission24Completed).toBe(true);
  expect(handoff.m24?.mission25Unlocked).toBe(true);
  expect(handoff.m25?.mission25Started).toBe(false);
  expect(handoff.ark?.sceneInstances).toBe(1);
  expect(handoff.visual25?.playerShipSceneInstances).toBe(1);

  await page.evaluate(() => window.__arcaDebug?.saveGame());
  const restoredCheckpoint = await reloadAndAwaitRestore(
    page,
    (activePage) => activePage.evaluate(() => ({
      state: window.__arcaDebug?.getMission25State(),
      ship: window.__arcaDebug?.getShipTransform().position,
      ark: window.__arcaDebug?.getMothershipIdentity(),
      distance: window.__arcaDebug?.getMission25Diagnostics().distanceToArk,
      visual: window.__arcaDebug?.getMission25VisualState()
    })),
    (checkpoint) => checkpoint?.state?.mission25State === 'awaitingTrigger' || checkpoint?.state?.mission25State === 'finalBriefing',
    'M24 to M25 handoff checkpoint'
  );
  if (!restoredCheckpoint) throw new Error('M24 to M25 checkpoint was not captured');
  const restored = restoredCheckpoint.state;
  expect(['awaitingTrigger', 'finalBriefing']).toContain(restored?.mission25State);
  const restoredHandoff = restoredCheckpoint;
  expect(Math.hypot(
    (restoredHandoff.ship?.[0] ?? 0) - (handoff.ship?.[0] ?? 0),
    (restoredHandoff.ship?.[1] ?? 0) - (handoff.ship?.[1] ?? 0),
    (restoredHandoff.ship?.[2] ?? 0) - (handoff.ship?.[2] ?? 0)
  )).toBeLessThan(0.02);
  expect(restoredHandoff.ark?.uuid).toBeTruthy();
  expect(restoredHandoff.ark?.sceneInstances).toBe(1);
  expect(restoredHandoff.visual?.playerShipSceneInstances).toBe(1);
  expect(Math.abs((restoredHandoff.distance ?? 0) - (handoff.distance ?? 0))).toBeLessThan(2);
  expect(restoredHandoff?.visual?.defenseNetworkBuilt).toBe(restored?.mission25State === 'finalBriefing');
  expect(restoredHandoff?.visual?.resourcesReleased).toBe(true);

  if (restored?.mission25State === 'awaitingTrigger') {
    await expect.poll(
      async () => (await page.evaluate(() => window.__arcaDebug?.getMission25State().mission25State)),
      { timeout: 15000, intervals: [100], message: 'M25 did not start after the stable handoff delay' }
    ).toBe('finalBriefing');
  }

  const active = await page.evaluate(() => ({
    ship: window.__arcaDebug?.getShipTransform().position,
    ark: window.__arcaDebug?.getMothershipIdentity(),
    distance: window.__arcaDebug?.getMission25Diagnostics().distanceToArk,
    visual24: window.__arcaDebug?.getMission24VisualState(),
    visual25: window.__arcaDebug?.getMission25VisualState(),
    audio: window.__arcaDebug?.getAudioState(),
    objective: window.__arcaDebug?.getCurrentObjectiveDisplay()
  }));
  expect(Math.hypot(
    (active.ship?.[0] ?? 0) - (restoredHandoff.ship?.[0] ?? 0),
    (active.ship?.[1] ?? 0) - (restoredHandoff.ship?.[1] ?? 0),
    (active.ship?.[2] ?? 0) - (restoredHandoff.ship?.[2] ?? 0)
  )).toBeLessThan(0.02);
  expect(active.ark?.uuid).toBe(restoredHandoff.ark?.uuid);
  expect(active.ark?.sceneInstances).toBe(1);
  expect(active.visual25?.playerShipSceneInstances).toBe(1);
  expect(active.visual24?.networkBuilt).toBe(false);
  expect(active.visual25?.defenseNetworkBuilt).toBe(true);
  expect(active.visual25?.hudVisible).toBe(true);
  expect(active.visual25?.resourcesReleased).toBe(true);
  expect(active.objective?.missionTitle).toContain('Mision 25');
  expect(active.objective?.target).toBe('ARCA EPSILON');
  expect(active.audio?.requestedMusicTrack).toBe('music-final-orbit-intro');
  expect(Math.abs((active.distance ?? 0) - (restoredHandoff.distance ?? 0))).toBeLessThan(2);
  expect(await page.locator('.mission24-ascent-hud.is-active').count()).toBe(0);
  expect(await page.locator('.mission25-hud.is-active').count()).toBe(1);

  const canvasVisible = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl) return false;
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return pixel[3] > 0;
  });
  expect(canvasVisible).toBe(true);
  expect(errors).toEqual([]);
});
