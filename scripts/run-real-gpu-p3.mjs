import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
if (!['baseline', 'optimized', 'direct'].includes(mode)) {
  throw new Error('Usage: node scripts/run-real-gpu-p3.mjs baseline|optimized|direct');
}

const outputDirectory = path.resolve('artifacts/performance-premium/stutter-p3');
await mkdir(outputDirectory, { recursive: true });

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
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push({
      text: message.text(),
      location: message.location()
    });
  }
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`http://127.0.0.1:5173/?debugPerformance=1&autoStutterP3=${mode}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await page.bringToFront();
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.waitForSelector('#real-gpu-p3-metrics', { state: 'attached', timeout: 300_000 });
  const result = await page.locator('#real-gpu-p3-metrics').evaluate((element) =>
    JSON.parse(element.textContent ?? '{}'));
  const renderer = result.runs?.[0]?.profile?.device?.glRenderer ?? 'unknown';
  if (/swiftshader|software/i.test(renderer)) {
    throw new Error(`Rejected software renderer: ${renderer}`);
  }
  result.browserVerification = { consoleErrors, pageErrors };
  const output = path.join(outputDirectory, `${mode}-run.json`);
  await writeFile(output, JSON.stringify(result, null, 2), 'utf8');
  await page.screenshot({ path: path.join(outputDirectory, `${mode}-run.png`) });
  console.log(JSON.stringify({
    output,
    renderer,
    runs: result.runs.map((run) => ({
      phase: run.phase,
      fps: run.profile.frames.fpsAverage,
      onePercentLow: run.profile.frames.fpsOnePercentLow,
      p95: run.profile.frames.frameMs.p95,
      p99: run.profile.frames.frameMs.p99,
      max: run.profile.frames.frameMs.max,
      over33ms: run.profile.frames.over33ms,
      over50ms: run.profile.frames.over50ms,
      programs: `${run.programsBefore}->${run.programsAfter}`
    })),
    consoleErrors,
    pageErrors
  }));
} finally {
  await browser.close();
}
