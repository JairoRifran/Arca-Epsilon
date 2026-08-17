import { expect, test, type Page } from '@playwright/test';

/**
 * Weapon resource accounting.
 *
 * Retained coverage from before the magazine split, restated against the new
 * architecture: the primary now draws on a pulse capacitor instead of debiting
 * `resources.energy` per shot, and torpedoes come out of loaded tubes. What
 * this file still guards is the accounting itself — blocked events cost
 * nothing, spend always equals what was actually created, and the two weapons
 * never share a pool. Magazine sizes, reload timing and the G binding are
 * covered by `playerWeaponReload.spec.ts` rather than duplicated here.
 */
test.setTimeout(900_000);

type WeaponState = {
  primaryResourceType: string;
  primaryMagazineCurrent: number;
  primaryMagazineMaximum: number;
  primaryReserveCurrent: number;
  primaryShotsCreated: number;
  primaryChargesSpent: number;
  primaryFireEvents: number;
  primaryReady: boolean;
  primaryLastBlockReason: string;
  torpedoLoadedCount: number;
  torpedoReserveCurrent: number;
  torpedoesCreated: number;
  torpedoTubesConsumed: number;
  torpedoTotal: number;
  torpedoLastBlockReason: string;
  shipEnergy: number;
  hudPrimary: string;
  hudTorpedo: string;
};

const w = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as unknown as Promise<WeaponState>;

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  return errors;
}

test('primary: spend always equals shots created, and blocked events are free', async ({ page }) => {
  const errors = await boot(page);

  const start = await w(page);
  console.log('PRIMARY', JSON.stringify({
    type: start.primaryResourceType,
    mag: `${start.primaryMagazineCurrent}/${start.primaryMagazineMaximum}`,
    reserve: start.primaryReserveCurrent, energy: start.shipEnergy
  }));
  expect(start.primaryResourceType).toBe('pulse-capacitor');

  // Firing must no longer move the shared ship energy pool. That pool still
  // belongs to flight, boost and shields, and is deliberately not a second
  // gate on the trigger.
  const energyBefore = start.shipEnergy;
  await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  const afterShot = await w(page);
  expect(afterShot.primaryShotsCreated, 'the shot happened').toBe(1);
  expect(Math.abs(afterShot.shipEnergy - energyBefore), 'the cannon does not debit ship energy')
    .toBeLessThan(1);

  // No double charging: spam through the cooldown and the books still balance.
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  const magBefore = (await w(page)).primaryMagazineCurrent;
  for (let i = 0; i < 30; i += 1) await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  const burst = await w(page);
  console.log('BURST', JSON.stringify({
    events: burst.primaryFireEvents, created: burst.primaryShotsCreated,
    spent: burst.primaryChargesSpent, mag: burst.primaryMagazineCurrent
  }));
  expect(burst.primaryFireEvents, 'the cooldown refused some events')
    .toBeGreaterThan(burst.primaryShotsCreated);
  expect(burst.primaryChargesSpent, 'charges spent equal shots created')
    .toBe(burst.primaryShotsCreated);
  expect(magBefore - burst.primaryMagazineCurrent, 'the magazine dropped by exactly that many')
    .toBe(burst.primaryShotsCreated);

  // A blocked trigger costs nothing at all.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 0, primaryReserve: 40 }));
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  for (let i = 0; i < 5; i += 1) await page.evaluate(() => window.__arcaDebug?.firePrimaryOnce());
  const blocked = await w(page);
  expect(blocked.primaryShotsCreated, 'no projectile from an empty capacitor').toBe(0);
  expect(blocked.primaryChargesSpent, 'no charge spent').toBe(0);
  expect(blocked.primaryReserveCurrent, 'reserve untouched without a reload').toBe(40);
  expect(blocked.primaryLastBlockReason).toBe('primary-magazine-empty');

  expect(errors).toEqual([]);
});

test('torpedoes: one tube per launch, never shared with the primary', async ({ page }) => {
  const errors = await boot(page);

  const start = await w(page);
  console.log('TORPEDO', JSON.stringify({
    loaded: start.torpedoLoadedCount, reserve: start.torpedoReserveCurrent,
    total: start.torpedoTotal, hud: start.hudTorpedo
  }));
  expect(start.torpedoTotal, 'only the four ready tubes are immediate ammunition').toBe(4);

  // One launch, exactly one tube, and the primary is unaffected.
  const magBefore = start.primaryMagazineCurrent;
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
  const after = await w(page);
  expect(after.torpedoesCreated).toBe(1);
  expect(after.torpedoTubesConsumed, 'exactly one tube').toBe(1);
  expect(start.torpedoLoadedCount - after.torpedoLoadedCount).toBe(1);
  expect(after.primaryMagazineCurrent, 'launching does not touch the cannon').toBe(magBefore);
  expect(after.torpedoReserveCurrent, 'the legacy reserve stays neutral')
    .toBe(0);

  // Holding the trigger cannot dump the bay: the cooldown still applies.
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  const preSpam = await w(page);
  for (let i = 0; i < 12; i += 1) await page.evaluate(() => window.__arcaDebug?.fireTorpedoOnce());
  const spammed = await w(page);
  expect(spammed.torpedoesCreated, 'the cooldown prevents dumping the bay').toBeLessThan(12);
  expect(preSpam.torpedoLoadedCount - spammed.torpedoLoadedCount, 'tubes spent equal torpedoes created')
    .toBe(spammed.torpedoesCreated);

  // The launcher is never labelled with the old missile wording.
  expect(spammed.hudTorpedo.toLowerCase()).not.toContain('misil');

  expect(errors).toEqual([]);
});
