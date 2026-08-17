import { expect, test } from '@playwright/test';

test.setTimeout(300_000);

test('audio local seguro y controles del mezclador', async ({ page }) => {
  const errors: string[] = [];
  const requestedUrls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => requestedUrls.push(request.url()));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 120_000 });
  await expect(page.locator('#launch-button')).toBeEnabled();
  await page.locator('#launch-button').dispatchEvent('click');
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

  const controls = page.locator('.audio-controls');
  await expect(controls).toBeVisible();
  await controls.locator('.audio-controls__toggle').dispatchEvent('click');
  await expect(controls.locator('.audio-controls__panel')).toBeVisible();
  await expect(controls.locator('input[type="range"]')).toHaveCount(5);
  await expect(controls.locator('[data-audio-setting="muted"]')).toBeVisible();

  await controls.locator('[data-audio-setting="master"]').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '0.65';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const storedMaster = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('arca-epsilon-audio-v1') ?? '{}');
    return stored.master;
  });
  expect(storedMaster).toBe(0.65);

  const manifestText = await (await page.request.get('/audio/audio-manifest.json')).text();
  const manifest = JSON.parse(manifestText) as {
    assets: Array<{ id: string; path: string; available: boolean }>;
  };
  expect(manifest.assets.length).toBeGreaterThan(10);
  expect(manifest.assets.every((asset) => asset.path.startsWith('/audio/generated/') || asset.path.startsWith('/audio/music/'))).toBe(true);
  expect(manifest.assets.every((asset) => asset.available)).toBe(true);

  const propulsionIds = [
    'sfx-ship-idle',
    'sfx-ship-accelerate',
    'sfx-hover-wash',
    'sfx-vertical-thrust',
    'sfx-boost-intensity',
    'sfx-brake-release',
    'sfx-space-cruise',
    'sfx-atmospheric-flight'
  ];
  const propulsionAssets = manifest.assets.filter((asset) => propulsionIds.includes(asset.id));
  expect(propulsionAssets).toHaveLength(propulsionIds.length);
  const decoded = await page.evaluate(async (paths) => {
    const context = new AudioContext();
    const results = [];
    for (const path of paths) {
      const response = await fetch(path);
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      results.push({ path, bytes: bytes.byteLength, duration: buffer.duration });
    }
    await context.close();
    return results;
  }, propulsionAssets.map((asset) => asset.path));
  expect(decoded.every((asset) => asset.bytes > 10_000 && asset.duration > 2)).toBe(true);

  await controls.locator('.audio-controls__toggle').dispatchEvent('click');
  await page.keyboard.down('w');
  await page.waitForFunction(() => (window.__arcaDiagnostics?.propulsionIntensity ?? 0) > 0.45);
  await page.waitForFunction(() => window.__arcaDebug?.getAudioState().engine.activeLayers.includes('acceleration'));
  expect(await page.evaluate(() => window.__arcaDiagnostics?.propulsionIntensity ?? 0)).toBeGreaterThan(0.45);
  expect((await page.evaluate(() => window.__arcaDebug?.getAudioState()))?.engine.activeLayers).toContain('acceleration');
  await page.keyboard.up('w');

  await page.keyboard.down('q');
  await page.waitForFunction(() => (window.__arcaDiagnostics?.verticalThrustAudioIntensity ?? 0) > 0.45);
  await page.waitForFunction(() => window.__arcaDebug?.getAudioState().engine.activeLayers.includes('vertical'));
  expect(await page.evaluate(() => window.__arcaDiagnostics?.verticalThrustAudioIntensity ?? 0)).toBeGreaterThan(0.45);
  expect((await page.evaluate(() => window.__arcaDebug?.getAudioState()))?.engine.activeLayers).toContain('vertical');
  await page.keyboard.up('q');

  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  await page.waitForFunction(() => (window.__arcaDiagnostics?.boostAudioIntensity ?? 0) > 0.35);
  await page.waitForFunction(() => window.__arcaDebug?.getAudioState().engine.activeLayers.includes('boost'));
  expect(await page.evaluate(() => window.__arcaDiagnostics?.boostAudioIntensity ?? 0)).toBeGreaterThan(0.35);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');

  const audioState = await page.evaluate(() => window.__arcaDebug?.getAudioState());
  expect(Array.isArray(audioState?.missingMusicAssets)).toBe(true);
  expect(await page.evaluate(() => window.__arcaDebug?.testPropulsionAcceleration())).toBe(true);
  expect(manifestText).not.toContain('ELEVENLABS_API_KEY');
  expect(manifestText).not.toContain('xi-api-key');
  expect(requestedUrls.some((url) => url.includes('elevenlabs.com'))).toBe(false);
  expect(errors).toEqual([]);
});
