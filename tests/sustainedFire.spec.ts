import { expect, test } from '@playwright/test';

/**
 * Holding the trigger fires in bursts.
 *
 * The cannon used to fire once per click. Sustained fire adds no rate logic of
 * its own: `fireLaser` already refuses while the weapon cools or the magazine
 * is empty, so the burst is paced by the weapon and the balance is unchanged.
 * That is the property worth testing -- more shots while held, and a magazine
 * that drains by real shots rather than by frames.
 */
test.setTimeout(600_000);

type Weapons = {
  primaryMagazineCurrent: number;
  primaryShotsCreated: number;
  primaryFireEvents: number;
};

const weapons = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as unknown as Promise<Weapons>;

test('the cannon keeps firing while the trigger is held, and stops on release', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.waitForTimeout(2_500);

  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 32, primaryReserve: 160 }));
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  await page.waitForTimeout(600);

  // A single click, as a control: one press must still be one burst start.
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(1_200);
  const single = await weapons(page);
  console.log('SINGLE CLICK', JSON.stringify(single));

  // Now hold it. The renderer here is slow, so this is deliberately generous:
  // the claim is "more than one shot", not a particular rate.
  // Capture the magazine here, not at the top: the control click above already
  // spent a round, and resetWeaponAudit clears the counters but not the ammo.
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  const beforeHold = (await weapons(page)).primaryMagazineCurrent;
  await page.mouse.down();
  await page.waitForTimeout(6_000);
  const during = await weapons(page);
  await page.mouse.up();
  console.log('WHILE HELD', JSON.stringify(during));

  expect(during.primaryShotsCreated, 'holding produces a burst, not one shot')
    .toBeGreaterThan(1);

  // Released: the count must stop climbing, or the ship fires for ever.
  await page.waitForTimeout(2_500);
  const afterRelease = await weapons(page);
  console.log('AFTER RELEASE', JSON.stringify(afterRelease));
  expect(afterRelease.primaryShotsCreated, 'releasing stops the burst')
    .toBe(during.primaryShotsCreated);

  // Ammunition is spent by real shots, so the magazine must fall by the same
  // number the audit reports: sustained fire must not invent or skip rounds.
  const spent = beforeHold - afterRelease.primaryMagazineCurrent;
  console.log('AMMO', JSON.stringify({ spent, shots: afterRelease.primaryShotsCreated }));
  expect(spent, 'every shot cost exactly one charge').toBe(afterRelease.primaryShotsCreated);

  expect(errors).toEqual([]);
});
