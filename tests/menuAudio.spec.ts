import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

test('el menú solicita el tema principal y lo inicia con el primer gesto', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/?test=1&auth=guest');
  await page.waitForFunction(() => window.__arcaGameReady === true);

  const beforeGesture = await page.evaluate(() => window.__arcaDebug?.getAudioState());
  expect(beforeGesture?.requestedMusicTrack).toBe('music-main-theme');

  await page.locator('#account-button').click();
  await expect.poll(
    async () => (await page.evaluate(() => window.__arcaDebug?.getAudioState()))?.currentMusicTrack,
    { timeout: 15_000 }
  ).toBe('music-main-theme');

  const playing = await page.evaluate(() => window.__arcaDebug?.getAudioState());
  expect(playing?.musicBedStartCount).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
