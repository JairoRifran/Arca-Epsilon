import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
const presetSet = process.argv[3] ?? 'core';
const renderPath = process.argv[4] ?? 'post';
if (!['baseline', 'optimized'].includes(mode)) {
  throw new Error('Usage: node scripts/run-real-gpu-p4.mjs baseline|optimized [core|destruction|particles|dominant|final|visual] [post|direct]');
}
if (!['core', 'destruction', 'particles', 'dominant', 'final', 'visual'].includes(presetSet)) {
  throw new Error(`Unknown P4 set: ${presetSet}`);
}
if (!['post', 'direct'].includes(renderPath)) {
  throw new Error(`Unknown render path: ${renderPath}`);
}

const outputDirectory = path.resolve('artifacts/performance-premium/vfx-p4');
await mkdir(outputDirectory, { recursive: true });
const fileStem = `${mode}-${presetSet}-${renderPath}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
});
const context = await browser.newContext({ viewport: { width: 1920, height: 889 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const visualCaptures = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push({ text: message.text(), location: message.location() });
  }
});
page.on('pageerror', (error) => pageErrors.push(error.message));

if (presetSet === 'visual') {
  await page.exposeFunction('__arcaCaptureP4Stage', async (stage) => {
    const file = path.join(outputDirectory, `${mode}-${stage}.png`);
    await page.screenshot({ path: file });
    visualCaptures.push({ stage, file });
  });
}

try {
  const direct = renderPath === 'direct' ? '&p4Direct=1' : '';
  await page.goto(
    `http://127.0.0.1:5173/?debugPerformance=1&autoVfxP4=${mode}&p4Set=${presetSet}${direct}`,
    { waitUntil: 'domcontentloaded', timeout: 60_000 }
  );
  await page.bringToFront();
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.waitForSelector('#real-gpu-p4-metrics', { state: 'attached', timeout: 600_000 });
  const result = await page.locator('#real-gpu-p4-metrics').evaluate((element) =>
    JSON.parse(element.textContent ?? '{}'));
  const renderer = result.runs?.[0]?.profile?.device?.glRenderer ?? 'unknown';
  if (/swiftshader|software/i.test(renderer)) {
    throw new Error(`Rejected software renderer: ${renderer}`);
  }
  result.browserVerification = { consoleErrors, pageErrors, visualCaptures };
  const output = path.join(outputDirectory, `${fileStem}.json`);
  await writeFile(output, JSON.stringify(result, null, 2), 'utf8');
  await page.screenshot({ path: path.join(outputDirectory, `${fileStem}.png`) });
  console.log(JSON.stringify({
    output,
    renderer,
    runs: result.runs.map((run) => ({
      preset: run.preset,
      fps: run.profile.frames.fpsAverage,
      onePercentLow: run.profile.frames.fpsOnePercentLow,
      mean: run.profile.frames.frameMs.mean,
      p95: run.profile.frames.frameMs.p95,
      p99: run.profile.frames.frameMs.p99,
      max: run.profile.frames.frameMs.max,
      over33ms: run.profile.frames.over33ms,
      over50ms: run.profile.frames.over50ms,
      draws: run.profile.renderer.calls,
      triangles: run.profile.renderer.triangles
    })),
    consoleErrors,
    pageErrors,
    visualCaptures
  }));
} finally {
  await browser.close();
}
