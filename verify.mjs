import { chromium } from '@playwright/test';
import { preview } from 'vite';

async function run() {
  const server = await preview({
    root: process.cwd(),
    preview: { port: 4173 }
  });
  const url = server.resolvedUrls?.local?.[0] || 'http://localhost:4173/';
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(url + '?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, { timeout: 90000 });
  await page.locator('#launch-button').click();
  await page.waitForTimeout(2000);

  const isCanvasNonBlank = await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    return canvas && canvas.width > 0 && canvas.height > 0;
  });

  const sceneAnalysis = await page.evaluate(() => {
    const names = [];
    const geometries = [];
    let objectCount = 0;
    window.__arcaScene.traverse((obj) => {
      objectCount++;
      if (obj.name) names.push(obj.name);
      if (obj.geometry && obj.geometry.type) geometries.push(obj.geometry.type);
    });
    return {
      objectCount,
      hasOldProceduralTowers: names.some(n => n.includes('Alien Ruin (lighthouse)') || n.includes('Debug Placeholder')),
      hasTorusGeometryRings: geometries.includes('TorusGeometry'),
      hasConeGeometryBeacons: geometries.includes('ConeGeometry'),
      hasAtlasMarkerGLB: names.some(n => n.includes('Marcador Atlas GLB'))
    };
  });

  const diagBefore = await page.evaluate(() => window.__arcaDiagnostics);

  await page.locator('#scan-button').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__arcaDebug?.advanceToMarker());
  await page.waitForTimeout(500);
  const diagMarker = await page.evaluate(() => window.__arcaDiagnostics);

  await page.evaluate(() => window.__arcaDebug?.decodeMarker());
  await page.evaluate(() => window.__arcaDebug?.startEntry());
  await page.waitForTimeout(500);
  const diagEntry = await page.evaluate(() => window.__arcaDiagnostics);

  await page.evaluate(() => window.__arcaDebug?.finishEntry());
  await page.evaluate(() => window.__arcaDebug?.touchdown());
  await page.waitForTimeout(500);
  const diagTouchdown = await page.evaluate(() => window.__arcaDiagnostics);

  await browser.close();
  await server.close();

  console.log(JSON.stringify({
    consoleErrors,
    isCanvasNonBlank,
    sceneAnalysis,
    diagBefore,
    diagMarker,
    diagEntry,
    diagTouchdown
  }, null, 2));
}

run().catch(e => { console.error(e); process.exit(1); });
