import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Structural render baseline.
 *
 * IMPORTANT: this runs on SwiftShader, so every *timing* figure it produces is
 * meaningless as a performance statement and is recorded only to catch
 * regressions run-to-run. What it does measure honestly is the structural load,
 * which is hardware-independent: `renderer.info` counts the same draw calls,
 * triangles, geometries, textures and compiled programs on any GPU, and the
 * drawing-buffer size is pure arithmetic over the pixel ratio.
 *
 * Those counts are what the optimisation work needs. The frame-time half of the
 * baseline has to come from a real GPU run.
 */
test.setTimeout(1_800_000);

const OUT_DIR = 'artifacts/performance-premium';

type Scene = { id: string; setup: (page: Page) => Promise<void> };

async function boot(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.waitForTimeout(2_500);
}

const SCENES: Scene[] = [
  { id: 'A-m01-departure', setup: async () => undefined },
  {
    id: 'B-nereida-base',
    setup: async (page) => {
      await page.evaluate(() => {
        window.__arcaDebug?.startSurfacePhase();
        window.__arcaDebug?.makeBaseOperational();
        window.__arcaDebug?.clearDialogueQueue();
      });
      await page.waitForTimeout(4_000);
    }
  },
  {
    id: 'C-aurora',
    setup: async (page) => {
      await page.evaluate(() => {
        window.__arcaDebug?.surveyAuroraValley?.();
        window.__arcaDebug?.teleportToAuroraStation?.('core');
        window.__arcaDebug?.clearDialogueQueue();
      });
      await page.waitForTimeout(4_000);
    }
  }
];

/** Everything a later run can be compared against, timings excluded. */
async function measure(page: Page, id: string): Promise<Record<string, unknown>> {
  const profile = await page.evaluate(async () =>
    window.__arcaDebug?.profileFrames('baseline', 6));
  const premium = await page.evaluate(() => window.__arcaDebug?.getPremiumVisualState?.() ?? null) ?? null;
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    hudNodes: document.querySelectorAll('.hud *').length
  }));
  return { scene: id, profile, premium, dom };
}

test('structural render baseline across scenes', async ({ page }) => {
  await boot(page);
  const runs: Record<string, unknown>[] = [];

  for (const scene of SCENES) {
    await scene.setup(page);
    const measured = await measure(page, scene.id);
    console.log(`SCENE ${scene.id}`, JSON.stringify(measured));
    runs.push(measured);
  }

  // Isolation passes. On SwiftShader the timings are noise, but the structural
  // deltas -- how many pixels each pixel ratio actually shades, and whether the
  // composer changes the draw count -- are real.
  const isolation: Record<string, unknown>[] = [];
  for (const [label, patch] of [
    ['half-pixel-ratio', { pixelRatio: 0.5 }],
    ['no-postprocessing', { bypassPost: true }],
    ['no-shadows', { shadows: false }]
  ] as const) {
    await page.evaluate((p) => window.__arcaDebug?.setRenderDiagnostic(p), patch);
    await page.waitForTimeout(2_000);
    const measured = await page.evaluate(async () =>
      window.__arcaDebug?.profileFrames('isolation', 5));
    console.log(`ISOLATION ${label}`, JSON.stringify(measured));
    isolation.push({ label, ...(measured as object) });
    await page.evaluate(() => window.__arcaDebug?.resetRenderDiagnostics());
    await page.waitForTimeout(1_500);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/metrics.json`, JSON.stringify({
    kind: 'HEADLESS REGRESSION (SwiftShader) -- timings are NOT a performance statement',
    capturedBy: 'tests/performanceBaseline.spec.ts',
    scenes: runs,
    isolation
  }, null, 2));
  console.log('WROTE', `${OUT_DIR}/metrics.json`);
});
