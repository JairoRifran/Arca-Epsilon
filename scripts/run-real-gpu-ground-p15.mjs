import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
if (!['baseline', 'optimized'].includes(mode)) {
  throw new Error('Usage: node scripts/run-real-gpu-ground-p15.mjs baseline|optimized');
}

const outputDirectory = path.resolve('artifacts/performance-premium/ground-p15');
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
const captures = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    const entry = { text: message.text(), location: message.location() };
    consoleErrors.push(entry);
    console.error('[browser console]', entry);
  }
});
page.on('pageerror', (error) => {
  pageErrors.push(error.message);
  console.error('[browser pageerror]', error.message);
});
await page.exposeFunction('__arcaCaptureGroundP15Stage', async (stage) => {
  const shortStage = String(stage).replace(`${mode}-`, '');
  const suffix = mode === 'baseline' ? 'before' : 'after';
  const file = path.join(outputDirectory, `${shortStage}-${suffix}.png`);
  await page.screenshot({ path: file });
  captures.push({ stage, file });
});

try {
  await page.goto(`http://127.0.0.1:5173/?debugPerformance=1&autoGroundP15=${mode}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  console.log('[ground-p15] DOM loaded');
  await page.bringToFront();
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  console.log('[ground-p15] game ready');
  await page.waitForSelector('#real-gpu-ground-p15-metrics', { state: 'attached', timeout: 1_200_000 });
  console.log('[ground-p15] metrics ready');
  const result = await page.locator('#real-gpu-ground-p15-metrics').evaluate((element) =>
    JSON.parse(element.textContent ?? '{}'));
  const renderer = result.runs?.[0]?.profile?.device?.glRenderer ?? 'unknown';
  if (/swiftshader|software/i.test(renderer)) throw new Error(`Rejected software renderer: ${renderer}`);
  result.browserVerification = { consoleErrors, pageErrors, captures };
  const output = path.join(outputDirectory, `${mode}.json`);
  await writeFile(output, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({
    output,
    renderer,
    runs: result.runs.map((run) => ({
      id: run.id,
      fps: run.profile.frames.fpsAverage,
      onePercentLow: run.profile.frames.fpsOnePercentLow,
      mean: run.profile.frames.frameMs.mean,
      p95: run.profile.frames.frameMs.p95,
      p99: run.profile.frames.frameMs.p99,
      over33ms: run.profile.frames.over33ms,
      over50ms: run.profile.frames.over50ms,
      draws: run.profile.renderer.calls,
      triangles: run.profile.renderer.triangles,
      census: run.census,
      worstFrames: run.profile.timeline?.worstFrames?.slice(0, 10) ?? []
    })),
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
