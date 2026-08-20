import { chromium } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('artifacts/performance-premium/ground-p15');
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
const captures = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

async function capture(name) {
  const file = path.join(outputDirectory, name);
  await page.screenshot({ path: file });
  captures.push({ name, bytes: (await stat(file)).size });
}

async function frame(target, offset, lookHeight) {
  await page.evaluate(({ target, offset, lookHeight }) => {
    window.__arcaDebug?.frameCameraTarget?.(target, offset, lookHeight);
  }, { target, offset, lookHeight });
  await page.waitForTimeout(1000);
}

try {
  await page.goto('http://127.0.0.1:5173/?test=1&debugPerformance=1&auth=guest', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.evaluate(async () => {
    await window.__arcaDebug?.prepareGroundScene?.();
    window.__arcaDebug?.setGroundDiagnostic?.('normal');
  });

  await frame('Base Nereida', [18, 12, 22], 3);
  await capture('base-close-after.png');

  await page.evaluate(() => window.__arcaDebug?.prepareGroundCheckpoint?.('nereida-base'));
  await page.waitForTimeout(1100);
  await capture('base-distant-after.png');
  await capture('character-shadow-after.png');

  await frame('Nereida Workshop and Cargo Bay', [7, 4.5, 9], 2.2);
  await capture('base-signage-after.png');

  await page.evaluate(() => window.__arcaDebug?.prepareGroundCheckpoint?.('dense-ground'));
  await page.waitForTimeout(1100);
  await capture('rocks-after.png');

  await page.evaluate(() => window.__arcaDebug?.prepareGroundCheckpoint?.('walk-turn'));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(850);
  await capture('character-after.png');
  await page.keyboard.up('KeyW');

  await page.evaluate(() => window.__arcaDebug?.inspectShipAccess?.(1, 1, 60, 12, 9, 'anchor'));
  await page.waitForTimeout(1000);
  await capture('ship-access-near-after.png');

  await page.evaluate(() => window.__arcaDebug?.clearShipAccessInspection?.());
  await page.setViewportSize({ width: 800, height: 450 });
  await frame('Base Nereida', [18, 12, 22], 3);
  await capture('ground-800x450-after.png');
  await page.setViewportSize({ width: 1920, height: 889 });
  await frame('Base Nereida', [18, 12, 22], 3);
  await capture('ground-1920x889-after.png');

  const verification = await page.evaluate(() => ({
    ready: window.__arcaGameReady === true,
    render: window.__arcaDebug?.getRenderDiagnosticState?.(),
    ground: window.__arcaDebug?.getGroundPerformanceState?.(),
    access: window.__arcaDebug?.measureShipAccess?.(),
    canvas: {
      cssWidth: document.querySelector('canvas')?.clientWidth ?? 0,
      cssHeight: document.querySelector('canvas')?.clientHeight ?? 0,
      width: document.querySelector('canvas')?.width ?? 0,
      height: document.querySelector('canvas')?.height ?? 0
    }
  }));
  const result = { verification, captures, consoleErrors, pageErrors };
  await writeFile(
    path.join(outputDirectory, 'visual-verification.json'),
    JSON.stringify(result, null, 2),
    'utf8'
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
