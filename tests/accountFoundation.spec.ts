import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { profileStorageKeyForAccount } from '../src/profile/PlayerProfileRepository';
import { SaveSystem } from '../src/game/SaveSystem';

test.setTimeout(180_000);

test('las claves de perfil separan invitado y cuenta sin cambiar el formato histórico', () => {
  expect(profileStorageKeyForAccount()).toBe('arca-epsilon-player-profile-v1');
  expect(profileStorageKeyForAccount('pilot-id')).toBe('arca-epsilon-player-profile-v1:account:pilot-id');
  expect(profileStorageKeyForAccount('pilot/id')).toBe('arca-epsilon-player-profile-v1:account:pilot%2Fid');
});

test('los saves de invitado y cuenta quedan físicamente aislados', () => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); }
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  try {
    const saves = new SaveSystem();
    storage.setItem(SaveSystem.key, '{"guest":true}');
    expect(saves.hasSave()).toBe(true);
    saves.setAccountScope('pilot-id');
    expect(saves.activeKey).toBe('arca-epsilon-save-v2:account:pilot-id');
    expect(saves.hasSave()).toBe(false);
    storage.setItem(saves.activeKey, '{"account":true}');
    expect(saves.hasSave()).toBe(true);
    saves.clearSave();
    expect(storage.getItem(saves.activeKey)).toBeNull();
    saves.setAccountScope(undefined);
    expect(storage.getItem(SaveSystem.key)).toBe('{"guest":true}');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('el esquema remoto protege datos por usuario y usa revisión optimista', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/202608180001_accounts_and_cloud_saves.sql', import.meta.url),
    'utf8'
  );
  expect(migration).toContain('alter table public.player_profiles enable row level security');
  expect(migration).toContain('alter table public.save_slots enable row level security');
  expect(migration).toContain('auth.uid() = user_id');
  expect(migration).toContain('SAVE_REVISION_CONFLICT');
  expect(migration).toContain('revoke insert, update, delete on public.save_slots');
  expect(migration).toContain('security definer');
  expect(migration).toContain('to authenticated');
  expect(migration).not.toContain('service_role');
});

test('sin Supabase el menú conserva invitado y no bloquea el juego', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/?test=1&auth=guest');
  await page.waitForFunction(() => (window as Window & { __arcaGameReady?: boolean }).__arcaGameReady === true);
  await expect(page.locator('#account-menu-state')).toHaveText('Invitado');
  await page.locator('#account-button').click();
  await expect(page.locator('#menu-drawer')).toHaveClass(/is-open/);
  await expect(page.locator('#account-unavailable')).toBeVisible();
  await expect(page.locator('#account-signed-out')).toBeHidden();
  await expect(page.locator('#account-status')).toContainText('modo invitado', { ignoreCase: true });

  const accountState = await page.evaluate(() => {
    const debug = (window as Window & {
      __arcaDebug?: { getAccountState?: () => Record<string, unknown> };
    }).__arcaDebug;
    return debug?.getAccountState?.();
  });
  expect(accountState).toMatchObject({
    configured: false,
    provider: 'local',
    syncState: 'local',
    activeSaveKey: 'arca-epsilon-save-v2'
  });

  await page.screenshot({ path: testInfo.outputPath('account-guest-desktop.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('el panel de cuenta cabe en viewport móvil', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test=1&auth=guest');
  await page.waitForFunction(() => (window as Window & { __arcaGameReady?: boolean }).__arcaGameReady === true);
  await page.locator('#account-button').click();
  const drawer = page.locator('#menu-drawer');
  await expect(drawer).toBeVisible();
  const bounds = await drawer.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.width).toBeLessThanOrEqual(391);
  await page.screenshot({ path: testInfo.outputPath('account-guest-mobile.png'), fullPage: true });
});
