import { expect, test, type Page } from '@playwright/test';

/**
 * Rebindable controls and the weapon alert.
 *
 * The reload state used to be a 0.72 rem line in a side panel, and
 * `weaponReloadMessage` was assigned but never written to the DOM at all, so
 * pressing the reload key produced no visible response. Both halves are checked
 * here: that the alert actually reaches the screen and changes state, and that a
 * remapped key both works and stops the original key from working.
 */
test.setTimeout(600_000);

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearDialogueQueue(); });
  await page.waitForTimeout(1_500);
  return errors;
}

const alertState = (page: Page) => page.evaluate(() => {
  const node = document.querySelector('#weapon-alert') as HTMLElement | null;
  const fill = document.querySelector('#weapon-alert-fill') as HTMLElement | null;
  return {
    visible: node?.classList.contains('is-active') ?? false,
    state: node?.dataset.state ?? '',
    text: (document.querySelector('#weapon-alert-text') as HTMLElement | null)?.textContent ?? '',
    key: (document.querySelector('#weapon-alert-key') as HTMLElement | null)?.textContent ?? '',
    fillWidth: fill?.style.width ?? ''
  };
});

test('the weapon alert reaches the screen and tracks the real reload', async ({ page }) => {
  const errors = await boot(page);

  // Full loadout: nothing to warn about.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    primaryMagazine: 32, primaryReserve: 160,
    torpedoTubes: [true, true, true, true], torpedoReserve: 8
  }));
  await page.waitForTimeout(800);
  const idle = await alertState(page);
  console.log('IDLE', JSON.stringify(idle));
  expect(idle.visible, 'a full loadout raises no alert').toBe(false);

  // Empty magazine with reserve left: the state the player must notice.
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({
    primaryMagazine: 0, primaryReserve: 160
  }));
  await page.waitForTimeout(900);
  const needs = await alertState(page);
  console.log('NEEDS RELOAD', JSON.stringify(needs));
  // The whole point: it is on screen, not buried in a side readout.
  expect(needs.visible, 'the alert is visible').toBe(true);
  expect(needs.state, 'it reads as needing a reload').toBe('needs-reload');
  expect(needs.text.length, 'it says something').toBeGreaterThan(0);
  expect(needs.key, 'it shows the bound reload key').toBe('G');

  // The side readout agrees, so the two cannot contradict each other.
  const readout = await page.evaluate(() =>
    (document.querySelector('#laser-status') as HTMLElement | null)?.dataset.needsReload);
  expect(readout, 'the side readout flags it too').toBe('true');

  // Now reload for real, through the real key.
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(500);
  const reloading = await alertState(page);
  console.log('RELOADING', JSON.stringify(reloading));
  expect(reloading.state, 'the alert switches to reloading').toBe('reloading');
  expect(reloading.text.toLowerCase(), 'it names the weapon and progress').toContain('recargando');
  expect(reloading.fillWidth, 'the progress bar has a width').toMatch(/\d/);

  expect(errors).toEqual([]);
});

test('controls can be remapped, and the old key stops working', async ({ page }) => {
  const errors = await boot(page);

  // The list is generated from the binding table, so it must cover every action.
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#bindings-list .binding-row__key')).map((node) => ({
      action: (node as HTMLElement).dataset.action ?? '',
      label: node.textContent ?? ''
    })));
  console.log('BINDINGS', JSON.stringify(rows));
  expect(rows.length, 'every bindable action is listed').toBe(15);
  expect(rows.find((row) => row.action === 'reload')?.label, 'reload defaults to G').toBe('G');
  expect(rows.find((row) => row.action === 'forward')?.label, 'forward defaults to W').toBe('W');

  // Rebind reload to H through the real capture flow.
  await page.evaluate(() => {
    const button = document.querySelector('#bindings-list .binding-row__key[data-action="reload"]') as HTMLElement;
    button.click();
  });
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => ({
    label: (document.querySelector('#bindings-list .binding-row__key[data-action="reload"]') as HTMLElement)?.textContent,
    custom: (document.querySelector('#bindings-list .binding-row__key[data-action="reload"]') as HTMLElement)?.dataset.custom,
    footer: (document.querySelector('[data-binding-hint="reload"]') as HTMLElement)?.textContent,
    stored: window.localStorage.getItem('arca-epsilon:key-bindings:v1')
  }));
  console.log('AFTER REBIND', JSON.stringify(after));
  expect(after.label, 'the row shows the new key').toBe('H');
  expect(after.custom, 'and is marked as customised').toBe('true');
  // A fixed footer label would lie the moment a key is reassigned.
  expect(after.footer, 'the HUD hint follows the binding').toBe('H');
  expect(after.stored, 'the choice persists').toContain('KeyH');

  // The new key reloads...
  await page.evaluate(() => window.__arcaDebug?.setWeaponAmmo({ primaryMagazine: 0, primaryReserve: 160 }));
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(400);
  const viaNewKey = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, number>;
  console.log('VIA NEW KEY', JSON.stringify({ requests: viaNewKey.reloadRequestCount }));
  expect(viaNewKey.reloadRequestCount, 'H now reloads').toBeGreaterThan(0);

  // ...and the old one does not. This is the case a naive remap gets wrong:
  // leaving the original key bound as well means both fire.
  await page.evaluate(() => window.__arcaDebug?.resetWeaponAudit());
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(400);
  const viaOldKey = await page.evaluate(() => window.__arcaDebug?.getWeaponResourceState()) as Record<string, number>;
  console.log('VIA OLD KEY', JSON.stringify({ requests: viaOldKey.reloadRequestCount }));
  expect(viaOldKey.reloadRequestCount, 'G no longer reloads').toBe(0);

  // Reset puts everything back, including the HUD hints.
  await page.evaluate(() => (document.querySelector('#bindings-reset') as HTMLElement).click());
  await page.waitForTimeout(400);
  const reset = await page.evaluate(() => ({
    label: (document.querySelector('#bindings-list .binding-row__key[data-action="reload"]') as HTMLElement)?.textContent,
    footer: (document.querySelector('[data-binding-hint="reload"]') as HTMLElement)?.textContent
  }));
  console.log('AFTER RESET', JSON.stringify(reset));
  expect(reset.label, 'reset restores the default').toBe('G');
  expect(reset.footer, 'and the hint with it').toBe('G');

  expect(errors).toEqual([]);
});
