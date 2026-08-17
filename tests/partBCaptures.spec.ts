import { expect, test, type Page } from '@playwright/test';

/**
 * Part B visual record: magazine, reserve and reload states.
 *
 * Run last; copied out of `test-results/` immediately afterwards. Each frame is
 * staged through the real ammunition API and the real G binding, so what is
 * photographed is the actual HUD the player sees, not a mock.
 */
test.setTimeout(1_200_000);
const OUT = 'test-results/part-b';

const w = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as unknown as
    Promise<Record<string, unknown>>;

async function boot(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);
}

test('part B HUD captures', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);

  const strip = page.locator('#hud');
  /** Waits for the HUD to catch up, then shoots it. */
  const shot = async (name: string, expectText?: string) => {
    if (expectText) {
      await expect
        .poll(async () => String((await w(page)).hudPrimary) + '|' + String((await w(page)).hudTorpedo),
          { timeout: 60_000, intervals: [400] })
        .toContain(expectText);
    } else {
      await page.waitForTimeout(900);
    }
    await strip.screenshot({ path: `${OUT}/${name}.png` });
    const s = await w(page);
    console.log(`CAP ${name}`, JSON.stringify({ primary: s.hudPrimary, torpedo: s.hudTorpedo }));
  };

  const setAmmo = (data: Record<string, unknown>) =>
    page.evaluate((d) => window.__arcaDebug?.setWeaponAmmo(d as never), data);

  // 1. Full loadout.
  await setAmmo({ primaryMagazine: 32, primaryReserve: 160, torpedoTubes: [true, true, true, true], torpedoReserve: 8 });
  await shot('01-cannon-full-32-160', 'CANON 32/32');

  // 2-4. Partially spent, empty, and the empty prompt.
  await setAmmo({ primaryMagazine: 18, primaryReserve: 160 });
  await shot('02-cannon-partial', 'CANON 18/32');
  await setAmmo({ primaryMagazine: 0, primaryReserve: 160 });
  await shot('03-cannon-empty', 'CANON 0/32');
  await shot('04-cannon-empty-prompt', 'G RECARGAR');

  // 5-6. Reload in progress, caught at two points.
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(350);
  await shot('05-cannon-reloading-early');
  await page.waitForTimeout(500);
  await shot('06-cannon-reloading-late');

  // 7. Reloaded, with the reserve visibly reduced.
  await page.waitForFunction(
    () => (window.__arcaDebug?.getWeaponResourceState() as { primaryReloading?: boolean })?.primaryReloading === false,
    undefined, { timeout: 120_000 }
  );
  await shot('07-cannon-reloaded-reserve-down', 'CANON 32/32');

  // 8-11. Tubes: full, one launched, empty, and the prompt.
  await setAmmo({ torpedoTubes: [true, true, true, true], torpedoReserve: 8 });
  await shot('08-tubes-full', 'TORPEDOS 4/4');
  await setAmmo({ torpedoTubes: [false, true, true, true], torpedoReserve: 8 });
  await shot('09-tubes-three-loaded', 'TORPEDOS 3/4');
  await setAmmo({ torpedoTubes: [false, false, false, false], torpedoReserve: 8 });
  await shot('10-tubes-empty', 'TORPEDOS 0/4');
  await shot('11-tubes-empty-prompt', 'G RECARGAR');

  // 12-13. Tube reload and the reduced reserve afterwards.
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(700);
  await shot('12-tubes-reloading');
  await page.waitForFunction(
    () => (window.__arcaDebug?.getWeaponResourceState() as { torpedoReloading?: boolean })?.torpedoReloading === false,
    undefined, { timeout: 120_000 }
  );
  await shot('13-tubes-reloaded-reserve-down', 'TORPEDOS 4/4');

  // 14. Both systems reloading from one key press.
  await setAmmo({
    primaryMagazine: 3, primaryReserve: 120,
    torpedoTubes: [false, false, false, false], torpedoReserve: 8
  });
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(500);
  await shot('14-both-reloading');
  const parallel = await w(page);
  console.log('PARALLEL STATE', JSON.stringify({
    primaryReloading: parallel.primaryReloading, torpedoReloading: parallel.torpedoReloading
  }));

  // 15. After a Base Nereida resupply.
  await page.evaluate(() => window.__arcaDebug?.refillWeaponStores());
  await shot('15-after-nereida-resupply', 'CANON 32/32');

  // 16. Aurora keeps an incomplete loadout: no resupply there.
  await setAmmo({ primaryMagazine: 9, primaryReserve: 40, torpedoTubes: [true, false, false, false], torpedoReserve: 2 });
  await shot('16-aurora-partial-kept', 'CANON 9/32');

  // 17-18. Full frame: the G hint in the control bar, and no "Misiles".
  await page.screenshot({ path: `${OUT}/17-full-hud-with-g-hint.png` });
  const hintText = await page.locator('body').innerText();
  const stray = /misil/i.test(hintText);
  console.log('STRAY MISSILE WORDING', stray);
  await page.screenshot({ path: `${OUT}/18-no-missile-wording.png` });

  console.log('ERRORS', JSON.stringify(errors));
  expect(errors).toEqual([]);
});
