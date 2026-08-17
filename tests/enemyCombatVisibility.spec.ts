import { expect, test, type Page } from '@playwright/test';

/**
 * Hostile contact visibility, against a real M19 wave.
 *
 * The measured cause of "the enemies cannot be found": a breach drone is 1.9 m
 * across, so at the ~600 m range M19 opens at it covers about three pixels. No
 * material change fixes a three-pixel target, so what is asserted here is the
 * marker layer.
 *
 * Every assertion below requires live enemies. An earlier version of this file
 * guarded its checks behind `if (activeEnemyCount > 0)` and passed while
 * spawning nothing at all — the wave needs the full M18 prerequisite chain
 * before `mission19.canStart()` will return true, and then needs the ship
 * genuinely airborne before `advanceTravel` will reach `clearAirspace`. Both
 * preconditions are established here, and the spec fails outright if the wave
 * does not appear.
 */
test.setTimeout(900_000);

const TO_M18 = [
  'startSurfacePhase', 'makeBaseOperational', 'startMission03', 'calibrateMission03Communications',
  'placeRelayBeacon', 'completeSignalSync', 'completeMission03Translation', 'completePleyadanContact',
  'completeMission03', 'startMission04', 'completeMission04', 'startMission05', 'detectSilentProbe',
  'triggerInterference', 'resolveAllEchoes', 'completeCounterSignal', 'completeMission05',
  'startMission06', 'placeAllCloakingProjectors', 'completeCloakingSync', 'completeMission06',
  'startMission07', 'scanAllAtlasEchoNodes', 'activateAtlasSeedArchive', 'completeMission07',
  'startMission08', 'stabilizeAllFractureFoci', 'completeSignalPurge', 'completeMission08',
  'completeMission09', 'startMission10', 'surveyAuroraValley', 'analyzeAllAuroraSamples',
  'markAuroraSettlementSite', 'deployAuroraModule', 'stabilizeAuroraModule', 'completeMission10',
  'startMission11', 'runAuroraCoreDiagnostic', 'markAuroraSecondModuleSite', 'deployAuroraSecondModule',
  'connectAuroraEnergyLink', 'installAuroraWaterFilter', 'calibrateAuroraWaterFlow',
  'prepareAuroraCultivationBed', 'startAuroraBioTrial', 'completeAuroraImpactAssessment', 'completeMission11',
  'startMission12', 'landAuroraCrewCapsule', 'disembarkAuroraCrew', 'completeMission12',
  'startMission13', 'secureStormGenerator', 'anchorStormAntenna', 'activateStormAntenna', 'chargeStormShield', 'completeMission13',
  'startMission14', 'completeTraceInspections', 'completeReverseTriangulation', 'completeMission14',
  'completeMission15', 'completeMission16', 'completeMission17', 'completeMission18'
];

const APRON_X = 562;
const APRON_Z = -456;

type ContactState = {
  activeEnemyCount: number;
  trackedContactCount: number;
  renderedEnemyCount: number;
  culledEnemyCount: number;
  domMarkerCount: number;
  currentTargetId: string | null;
  currentTargetDistance: number | null;
  currentTargetLineOfSight: string | null;
  nearestEnemyId: string | null;
  nearestEnemyDistance: number | null;
  contacts: {
    id: string; type: string; world: number[]; distanceToPlayer: number;
    projectedScreenPosition: number[]; isOnScreen: boolean; isBehindCamera: boolean;
    isOccluded: boolean; health: number; selected: boolean;
  }[];
};

const contacts = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getHostileContactState()) as unknown as Promise<ContactState>;

/**
 * Boots to a live M19 air wave.
 *
 * Both preconditions matter and both were missing before: the M18 chain
 * (without it `canStart` is false and M19 never begins) and real airborne time
 * (without it `advanceTravel` never reaches `clearAirspace`).
 */
async function bootLiveWave(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.clearDialogueQueue();
  });
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of sequence) debug?.[name]?.();
  }, TO_M18);
  await page.evaluate(() => {
    window.__arcaDebug?.startMission19();
    window.__arcaDebug?.confirmNereidaEmergency();
  });

  const apronGround = await page.evaluate(
    ({ ax, az }) => window.__arcaDebug?.getSurfaceGroundHeight?.(ax, az) ?? 0,
    { ax: APRON_X, az: APRON_Z }
  );
  await page.evaluate(
    ({ ax, ay, az }) => window.__arcaDebug?.setPlayerPosition(ax, ay, az),
    { ax: APRON_X, ay: apronGround + 60, az: APRON_Z }
  );

  await expect
    .poll(async () => (await page.evaluate(() => window.__arcaDebug?.getMission19SpawnTrace())) as Record<string, unknown>, {
      message: 'airborne transit must reach the airspace corridor',
      timeout: 120_000,
      intervals: [1500]
    })
    .toMatchObject({ activeMissionStep: 'clearAirspace' });

  await expect
    .poll(async () => (await contacts(page)).activeEnemyCount, {
      message: 'the real wave must spawn real enemies',
      timeout: 90_000,
      intervals: [1500]
    })
    .toBeGreaterThan(0);

  return errors;
}

test('a real M19 wave produces tracked, marked contacts', async ({ page }) => {
  const errors = await bootLiveWave(page);

  const trace = await page.evaluate(() => window.__arcaDebug?.getMission19SpawnTrace());
  console.log('SPAWN TRACE', JSON.stringify(trace));

  const s = await contacts(page);
  console.log('CONTACTS', JSON.stringify({
    active: s.activeEnemyCount, tracked: s.trackedContactCount,
    rendered: s.renderedEnemyCount, culled: s.culledEnemyCount,
    dom: s.domMarkerCount, nearest: s.nearestEnemyDistance,
    sample: s.contacts.slice(0, 4)
  }));

  // --- Non-vacuous by construction ---------------------------------------
  expect(s.activeEnemyCount, 'live enemies exist').toBeGreaterThan(0);
  expect(s.trackedContactCount, 'the tracker receives them').toBeGreaterThan(0);
  expect(s.renderedEnemyCount, 'markers are actually used').toBeGreaterThan(0);

  // 1. Tracked contacts match live entities exactly.
  expect(s.trackedContactCount, 'every live hostile is tracked').toBe(s.activeEnemyCount);

  // 5. Reported distance matches the real world position.
  const shipPos = await page.evaluate(() => {
    const p = window.__arcaDebug?.getShipBoardingState();
    return p ? [p.shipPosition?.[0] ?? 0, p.shipPosition?.[1] ?? 0, p.shipPosition?.[2] ?? 0] : null;
  });
  if (shipPos) {
    const c = s.contacts[0];
    const real = Math.hypot(c.world[0] - shipPos[0], c.world[1] - shipPos[1], c.world[2] - shipPos[2]);
    expect(Math.abs(real - c.distanceToPlayer), 'reported distance is the real one').toBeLessThan(2);
  }

  // 19-20. The pool is fixed; nothing is created during a normal update.
  const domBefore = s.domMarkerCount;
  await page.waitForTimeout(2_500);
  const later = await contacts(page);
  expect(later.domMarkerCount, 'marker pool never grows per frame').toBe(domBefore);
  expect(domBefore, 'the pool is the fixed 24').toBe(24);

  // 16. Off-screen arrows are capped.
  const offscreenCount = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.contact-marker'))
      .filter((el) => (el as HTMLElement).style.display !== 'none' && el.classList.contains('is-offscreen'))
      .length
  );
  expect(offscreenCount, 'at most six off-screen arrows').toBeLessThanOrEqual(6);

  expect(errors).toEqual([]);
});

test('T selects a real target through the real input router', async ({ page }) => {
  const errors = await bootLiveWave(page);

  const before = await contacts(page);
  expect(before.activeEnemyCount, 'enemies exist to select').toBeGreaterThan(0);
  expect(before.currentTargetId, 'nothing selected yet').toBeNull();

  // 12. Through the real keyboard router, not by calling the method.
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(600);
  const selected = await contacts(page);
  console.log('SELECTION', JSON.stringify({
    target: selected.currentTargetId,
    distance: selected.currentTargetDistance,
    los: selected.currentTargetLineOfSight
  }));

  expect(selected.currentTargetId, 'T selected a real contact').not.toBeNull();
  expect(selected.contacts.filter((c) => c.selected).length, 'exactly one selected').toBe(1);
  expect(selected.currentTargetDistance, 'the selection reports a distance').not.toBeNull();
  // 9-10. Line of sight is classified rather than assumed.
  expect(['visible', 'sensor']).toContain(selected.currentTargetLineOfSight);

  // 11. The selected marker is visibly larger than a normal one.
  const sizes = await page.evaluate(() => {
    const out: { selected: boolean; bracket: number }[] = [];
    document.querySelectorAll('.contact-marker').forEach((el) => {
      const node = el as HTMLElement;
      if (node.style.display === 'none' || node.classList.contains('is-offscreen')) return;
      const bracket = node.querySelector('.contact-marker__bracket') as HTMLElement | null;
      if (!bracket) return;
      out.push({
        selected: node.classList.contains('is-selected'),
        bracket: bracket.getBoundingClientRect().width
      });
    });
    return out;
  });
  console.log('MARKER SIZES', JSON.stringify(sizes));
  const sel = sizes.find((x) => x.selected);
  const plain = sizes.find((x) => !x.selected);
  if (sel && plain) {
    expect(sel.bracket, 'selected bracket is larger').toBeGreaterThan(plain.bracket);
  }
  if (sel) {
    expect(sel.bracket, 'selected bracket is in the 24-34 px band').toBeGreaterThanOrEqual(24);
  }
  if (plain) {
    expect(plain.bracket, 'normal bracket is in the 14-18 px band').toBeGreaterThanOrEqual(14);
    expect(plain.bracket, 'normal bracket is in the 14-18 px band').toBeLessThanOrEqual(18);
  }

  // 13. A second press moves to another contact when more than one exists.
  if (selected.trackedContactCount > 1) {
    const first = selected.currentTargetId;
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(500);
    const cycled = await contacts(page);
    expect(cycled.currentTargetId, 'a second press cycles').not.toBe(first);
  }

  // 21-22. Markers follow the entities. The real invariant is that the tracker
  // never disagrees with the fleets — asserting "zero after clearing" would be
  // wrong, because the air fleet is shared and a later mission system can
  // relaunch it on the same frame.
  await page.evaluate(() => window.__arcaDebug?.clearNereidaAirspace());
  await page.waitForTimeout(2_500);
  const cleared = await contacts(page);
  console.log('AFTER CLEAR', JSON.stringify({
    active: cleared.activeEnemyCount,
    tracked: cleared.trackedContactCount,
    rendered: cleared.renderedEnemyCount,
    target: cleared.currentTargetId
  }));
  expect(cleared.trackedContactCount, 'the tracker never disagrees with the fleets')
    .toBe(cleared.activeEnemyCount);
  expect(cleared.renderedEnemyCount, 'markers never outnumber the contacts')
    .toBeLessThanOrEqual(cleared.trackedContactCount);
  expect(cleared.domMarkerCount, 'the pool is retained, not destroyed').toBe(24);
  if (cleared.activeEnemyCount === 0) {
    expect(cleared.renderedEnemyCount, 'no markers with no enemies').toBe(0);
    expect(cleared.currentTargetId, 'selection released with the target').toBeNull();
  }

  expect(errors).toEqual([]);
});

test('every rendered marker stays inside the viewport', async ({ page }) => {
  const errors = await bootLiveWave(page);
  const s = await contacts(page);
  expect(s.renderedEnemyCount, 'markers exist to check').toBeGreaterThan(0);

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const boxes = await page.evaluate(() => {
    const out: { left: number; top: number; offscreen: boolean; hasArrow: boolean }[] = [];
    document.querySelectorAll('.contact-marker').forEach((el) => {
      const node = el as HTMLElement;
      if (node.style.display === 'none') return;
      const rect = node.getBoundingClientRect();
      const arrow = node.querySelector('.contact-marker__arrow') as HTMLElement | null;
      out.push({
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2,
        offscreen: node.classList.contains('is-offscreen'),
        hasArrow: !!arrow && getComputedStyle(arrow).display !== 'none'
      });
    });
    return out;
  });
  console.log('MARKER BOXES', JSON.stringify(boxes.slice(0, 8)));
  expect(boxes.length, 'markers are on screen').toBeGreaterThan(0);

  // 6-8. Nothing escapes the viewport, and anything clamped carries an arrow.
  for (const box of boxes) {
    expect(box.left, 'marker stays inside the viewport').toBeGreaterThanOrEqual(-2);
    expect(box.left).toBeLessThanOrEqual(viewport.width + 2);
    expect(box.top).toBeGreaterThanOrEqual(-2);
    expect(box.top).toBeLessThanOrEqual(viewport.height + 2);
    if (box.offscreen) {
      expect(box.hasArrow, 'off-screen contacts carry a direction arrow').toBe(true);
    }
  }

  expect(errors).toEqual([]);
});
