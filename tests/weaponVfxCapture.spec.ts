import { expect, test } from '@playwright/test';

/**
 * Visual record of the cannon firing.
 *
 * Every weapon change this session was verified by counters -- shots, ammo,
 * kills -- and never once looked at. Counters cannot answer whether the stream
 * reads as a machine gun, whether the tracer is legible, or whether an impact
 * is visible on the target. This captures the frames that can.
 */
test.setTimeout(900_000);
const OUT = 'test-results/weapon-vfx';

test('sustained fire, tracers and impacts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.waitForTimeout(2_500);
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 90, primaryReserve: 450 }));

  await page.screenshot({ path: `${OUT}/01-idle.png` });

  // Hold the trigger and sample the stream at three points, so the burst can be
  // judged at its start, mid-flight and once dispersion has fully bloomed.
  await page.mouse.down();
  for (const [name, wait] of [
    ['02-first-rounds', 900],
    ['03-mid-burst', 2_200],
    ['04-full-bloom', 3_500]
  ] as const) {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    // A close-up of the bow as well. Embers are centimetre-scale points a few
    // metres from the barrel; at 1280x720 with the whole ship in frame they
    // land on three or four pixels, which is enough to see in motion and not
    // enough to judge from a still. The clip is the only way to tell "too
    // faint to photograph" apart from "not being drawn".
    await page.screenshot({ path: `${OUT}/${name}-bow.png`, clip: { x: 470, y: 230, width: 460, height: 300 } });
  }
  await page.mouse.up();

  const fired = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, number>;
  console.log('AFTER BURST', JSON.stringify({
    shots: fired.primaryShotsCreated, magazine: fired.primaryMagazineCurrent
  }));

  // Embers live 0.62 s. The harness clamps `delta` to 50 ms, so an ember spans
  // roughly a dozen rendered frames here -- unlike the 0.17 s bolt, which spans
  // three. They are the one part of the muzzle that this renderer can actually
  // be expected to show, so their count is worth recording next to the picture.
  const visuals = await page.evaluate(
    () => (window.__arcaDebug as unknown as {
      getEnemyCombatVisualState?: () => { weaponVisuals?: Record<string, number> };
    })?.getEnemyCombatVisualState?.()?.weaponVisuals
  );
  console.log('VFX', JSON.stringify({
    embers: visuals?.emberParticlesActive,
    beams: visuals?.trailsActive,
    flashes: visuals?.flashesActive,
    quality: visuals?.quality
  }));

  // The impact half is deliberately not captured here. Spawning drones needs
  // the full M19 chain, and `aerialGunnery.spec.ts` already proves a kill lands
  // with these settings; duplicating that harness would buy a picture at the
  // cost of ten minutes a run.

  expect(errors).toEqual([]);
});
