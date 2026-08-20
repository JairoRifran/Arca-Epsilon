import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const label = process.argv[2] ?? 'probe';
const outputDirectory = path.resolve('artifacts/performance-premium/ground-p15');
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 889 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto('http://127.0.0.1:5173/?test=1&debugPerformance=1&auth=guest', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  const result = await page.evaluate(async () => {
    await window.__arcaDebug?.prepareGroundScene?.();
    window.__arcaDebug?.prepareGroundCheckpoint?.('nereida-base');
    await new Promise((resolve) => window.setTimeout(resolve, 2400));
    const views = [];
    for (const yaw of [Math.PI, Math.PI * 1.5, Math.PI * 2, Math.PI * 0.5]) {
      window.__arcaDebug?.setOnFootCameraYaw?.(yaw);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      views.push({ yaw, census: window.__arcaDebug?.getGroundP15Census?.() });
    }
    return { state: window.__arcaDebug?.getGroundPerformanceState?.(), views };
  });
  const payload = { label, capturedAt: new Date().toISOString(), result, consoleErrors, pageErrors };
  const output = path.join(outputDirectory, `census-${label}.json`);
  await writeFile(output, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify({
    output,
    views: result.views.map((view) => ({
      yaw: view.yaw,
      calls: view.census?.rendererCalls,
      categories: view.census?.categories,
      roots: view.census?.rootBreakdown,
      branches: view.census?.branchBreakdown
    })),
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
