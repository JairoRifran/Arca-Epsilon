import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
const presetSet = process.argv[3] ?? '';
if (!['baseline', 'isolation', 'optimized'].includes(mode)) {
  throw new Error('Usage: node scripts/run-real-gpu-ground.mjs baseline|isolation|optimized');
}

const p0Directory = path.resolve('artifacts/performance-premium/ground-p0');
const finalDirectory = path.resolve('artifacts/performance-premium/ground');
await mkdir(p0Directory, { recursive: true });
await mkdir(finalDirectory, { recursive: true });
const outputDirectory = mode === 'optimized' ? finalDirectory : p0Directory;

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
  if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location() });
});
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.exposeFunction('__arcaCaptureGroundStage', async (stage) => {
  const shortStage = String(stage).replace(`${mode}-`, '');
  const suffix = mode === 'baseline' ? 'before' : mode === 'optimized' ? 'after' : mode;
  const file = path.join(finalDirectory, `${shortStage}-${suffix}.png`);
  await page.screenshot({ path: file });
  captures.push({ stage, file });
});

try {
  const groundPresetQuery = presetSet ? `&groundPresets=${encodeURIComponent(presetSet)}` : '';
  await page.goto(`http://127.0.0.1:5173/?debugPerformance=1&autoGround=${mode}${groundPresetQuery}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await page.bringToFront();
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.waitForSelector('#real-gpu-ground-metrics', { state: 'attached', timeout: 1_200_000 });
  const result = await page.locator('#real-gpu-ground-metrics').evaluate((element) =>
    JSON.parse(element.textContent ?? '{}'));
  const renderer = result.runs?.[0]?.profile?.device?.glRenderer ?? 'unknown';
  if (/swiftshader|software/i.test(renderer)) throw new Error(`Rejected software renderer: ${renderer}`);
  result.browserVerification = { consoleErrors, pageErrors, captures };

  const setSuffix = presetSet ? `-${presetSet.replace(/[^a-z0-9,-]+/gi, '-').replace(/,/g, '_')}` : '';
  const output = path.join(outputDirectory, mode === 'baseline' ? 'metrics.json' : `${mode}${setSuffix}.json`);
  await writeFile(output, JSON.stringify(result, null, 2), 'utf8');
  for (const run of result.runs) {
    if (mode === 'baseline' && run.preset === 'normal') {
      await writeFile(path.join(p0Directory, `${run.checkpoint}.json`), JSON.stringify(run, null, 2), 'utf8');
    }
  }
  if (mode === 'optimized') {
    await page.setViewportSize({ width: 800, height: 450 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(finalDirectory, 'ground-800x450.png') });
    await page.setViewportSize({ width: 1920, height: 889 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(finalDirectory, 'ground-1920x889.png') });
  }
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
      ground: run.ground
    })),
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
