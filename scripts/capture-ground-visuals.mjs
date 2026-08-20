import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('artifacts/performance-premium/ground');
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']
});
const context = await browser.newContext({ viewport: { width: 1920, height: 889 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

const prepare = async (checkpoint) => {
  await page.evaluate((name) => window.__arcaDebug?.prepareGroundCheckpoint?.(name), checkpoint);
  await page.waitForTimeout(1200);
};
const capture = async (name) => page.screenshot({ path: path.join(outputDirectory, name) });

try {
  await page.goto('http://127.0.0.1:5173/?debugPerformance=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.evaluate(async () => {
    await window.__arcaDebug?.prepareGroundScene?.();
    window.__arcaDebug?.setGroundDiagnostic?.('optimized-pr-075');
  });

  await prepare('terrain-open');
  await capture('terrain-open-after-clean.png');
  await capture('vista-lejana-after.png');

  await prepare('nereida-base');
  await capture('nereida-base-after-clean.png');
  await capture('character-shadow-after.png');

  await prepare('dense-ground');
  await capture('rocks-near-after.png');

  await prepare('walk-turn');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await capture('character-walking-after.png');
  await page.keyboard.up('KeyW');

  await prepare('sprint');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await capture('character-sprint-after.png');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  await page.setViewportSize({ width: 800, height: 450 });
  await page.waitForTimeout(700);
  await capture('ground-800x450.png');
  await page.setViewportSize({ width: 1920, height: 889 });
  await page.waitForTimeout(700);
  await capture('ground-1920x889.png');

  const verification = await page.evaluate(() => ({
    ready: window.__arcaGameReady === true,
    state: window.__arcaDebug?.getGroundPerformanceState?.(),
    canvas: {
      width: document.querySelector('canvas')?.width ?? 0,
      height: document.querySelector('canvas')?.height ?? 0
    }
  }));
  await writeFile(
    path.join(outputDirectory, 'visual-verification.json'),
    JSON.stringify({ verification, consoleErrors, pageErrors }, null, 2),
    'utf8'
  );
  console.log(JSON.stringify({ verification, consoleErrors, pageErrors }, null, 2));
} finally {
  await browser.close();
}
