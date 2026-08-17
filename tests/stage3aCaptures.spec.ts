import { test, type Page } from '@playwright/test';

/** Stage 3A visual record. Run last; copied out to artifacts/ afterwards. */
test.setTimeout(1_200_000);
const OUT = 'test-results/stage-3a';

test('enemy visibility captures on Nereida', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.startSurfacePhase();
    window.__arcaDebug?.makeBaseOperational();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.waitForTimeout(1_500);

  // Walk M19 to the ground incursion: that is the state in the report.
  await page.evaluate(() => {
    window.__arcaDebug?.startMission19();
    window.__arcaDebug?.confirmNereidaEmergency();
  });
  await page.waitForTimeout(2_000);
  const afterAir = await page.evaluate(() => ({
    step: window.__arcaDebug?.getMission19State(),
    contacts: window.__arcaDebug?.getHostileContactState()
  }));
  console.log('AFTER EMERGENCY', JSON.stringify({
    step: (afterAir.step as Record<string, unknown>)?.step,
    active: (afterAir.contacts as Record<string, unknown>)?.activeEnemyCount
  }));

  await page.evaluate(() => {
    window.__arcaDebug?.clearNereidaAirspace();
    window.__arcaDebug?.landAtNereida();
  });
  await page.waitForTimeout(3_500);

  const ground = await page.evaluate(() => ({
    step: window.__arcaDebug?.getMission19State(),
    contacts: window.__arcaDebug?.getHostileContactState()
  }));
  const cs = ground.contacts as Record<string, unknown>;
  console.log('GROUND WAVE', JSON.stringify({
    step: (ground.step as Record<string, unknown>)?.step,
    active: cs?.activeEnemyCount,
    tracked: cs?.trackedContactCount,
    rendered: cs?.renderedEnemyCount,
    nearest: cs?.nearestEnemyDistance,
    sample: (cs?.contacts as unknown[])?.slice(0, 4)
  }));

  const shot = async (name: string) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };

  await shot('01-ground-intruders-marked');
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(600);
  const selected = await page.evaluate(() => window.__arcaDebug?.getHostileContactState()) as Record<string, unknown>;
  console.log('SELECTED', JSON.stringify({
    id: selected?.currentTargetId,
    distance: selected?.currentTargetDistance,
    los: selected?.currentTargetLineOfSight
  }));
  await shot('02-target-selected');
  await page.keyboard.press('KeyT');
  await shot('03-target-cycled');

  console.log('ERRORS', JSON.stringify(errors));
});
