import { expect, test, type Page } from '@playwright/test';

/**
 * Block A visual record: objective hierarchy, states and the contextual prompt.
 *
 * Captures the same M20 link step the stall was reported on, plus an early M01
 * space objective, so the panel can be judged in both a surface-adjacent and an
 * orbital context rather than only where it was tuned.
 */
test.setTimeout(1_200_000);
const OUT = 'test-results/block-a';

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

type PanelReadout = {
  mission: string; step: string; objective: string; action: string;
  target: string; distance: string; state: string; stateKey: string;
  promptVisible: boolean; promptText: string; panelScrolls: boolean;
  panelsOverlap: boolean; promptCount: number;
};

/** What the panel is actually telling the player, as the player reads it. */
async function panelReadout(page: Page): Promise<PanelReadout> {
  return page.evaluate(() => {
    const text = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.innerText?.trim() ?? '';
    const prompt = document.querySelector('#interact-prompt') as HTMLElement | null;
    const panel = document.querySelector('.objective-panel') as HTMLElement | null;
    const systems = document.querySelector('.systems-panel') as HTMLElement | null;
    return {
      mission: text('#mission-name'),
      step: text('#objective-step'),
      objective: text('#objective-text'),
      action: text('#next-action'),
      target: text('#objective-target-name'),
      distance: text('#objective-distance'),
      state: text('#objective-state'),
      stateKey: (document.querySelector('#objective-state') as HTMLElement | null)?.dataset.state ?? '',
      promptVisible: prompt?.classList.contains('is-active') ?? false,
      promptText: prompt?.innerText?.trim().replace(/\s+/g, ' ') ?? '',
      panelScrolls: panel ? panel.scrollHeight > panel.clientHeight + 2 : false,
      // Two overlapping panels is exactly what the first pass produced.
      panelsOverlap: (() => {
        if (!panel || !systems) return false;
        const a = panel.getBoundingClientRect(), b = systems.getBoundingClientRect();
        return a.bottom > b.top + 1 && a.top < b.bottom && a.left < b.right && a.right > b.left;
      })(),
      promptCount: document.querySelectorAll('#interact-prompt.is-active, #context-action.is-active').length
    };
  });
}

test('block A: objective hierarchy, states and contextual prompt', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.waitForTimeout(2_000);

  // 1. Opening space objective: the panel with nothing in range.
  const m01 = await panelReadout(page);
  console.log('M01 PANEL', JSON.stringify(m01));
  await page.screenshot({ path: `${OUT}/01-m01-space-objective.png` });

  // 2. The M20 link step -- the exact panel the 67% stall was reported against.
  await page.evaluate((seq) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of seq) debug?.[name]?.();
  }, TO_M18);
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__arcaDebug?.startMission20());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await expect
    .poll(async () => {
      await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
      const s = await page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as { orbitalEnvironmentActive?: boolean };
      return s?.orbitalEnvironmentActive === true;
    }, { message: 'orbital hand-off', timeout: 240_000, intervals: [1500] })
    .toBe(true);
  await page.evaluate(() => window.__arcaDebug?.rendezvousWithArk());
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_500);

  const far = await panelReadout(page);
  console.log('M20 FAR', JSON.stringify(far));
  await page.screenshot({ path: `${OUT}/02-m20-link-out-of-range.png` });

  // 3. Parked at the hull point: the state must flip and the prompt appear.
  const st = await page.evaluate(() => window.__arcaDebug?.getArkStationState()) as {
    stationPosition: number[]; arkPosition: number[];
  };
  await page.evaluate(({ s, a }) => {
    const dx = s[0] - a[0], dy = s[1] - a[1], dz = s[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    window.__arcaDebug?.setShipWorldPosition?.([
      s[0] + (dx / len) * 25, s[1] + (dy / len) * 25, s[2] + (dz / len) * 25
    ]);
  }, { s: st.stationPosition, a: st.arkPosition });
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(2_500);

  const near = await panelReadout(page);
  console.log('M20 IN RANGE', JSON.stringify(near));
  await page.screenshot({ path: `${OUT}/03-m20-link-in-range.png` });

  // 4. Right after syncing a link: the completion confirmation.
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(700);
  const done = await panelReadout(page);
  console.log('M20 AFTER E', JSON.stringify(done));
  await page.screenshot({ path: `${OUT}/04-m20-objective-complete.png` });

  // --- What the captures have to be able to show -------------------------
  // The panel used to concatenate mission and step into one heading, so the
  // step could not be read on its own.
  expect(far.mission, 'the mission line carries no step title').not.toContain('//');
  expect(far.step.length, 'the step title has its own line').toBeGreaterThan(0);
  // It also used to overflow into an in-HUD scrollbar.
  expect(far.panelScrolls, 'the panel fits without scrolling').toBe(false);
  // The distance left the secondary grid and became a first-class readout.
  expect(far.distance, 'the distance reads as a number').toMatch(/\d/);
  expect(far.target, 'the target is named separately').not.toContain('//');

  // The state must actually change with the situation, not sit on one value.
  console.log('STATE TRANSITION', JSON.stringify({ far: far.stateKey, near: near.stateKey }));
  expect(near.stateKey, 'parking at the hull point reads as in range').toBe('inrange');
  expect(far.stateKey, 'far away does not read as in range').not.toBe('inrange');

  // The prompt is gated on the same truth as the panel: no false promises.
  expect(near.promptVisible, 'the contextual prompt appears when the action is live').toBe(true);
  expect(far.promptVisible, 'and stays hidden when it is not').toBe(false);

  // Regressions the first pass introduced and this one must not bring back.
  for (const [name, r] of [['far', far], ['near', near]] as const) {
    expect(r.panelsOverlap, `${name}: the objective and systems panels must not overlap`).toBe(false);
    expect(r.panelScrolls, `${name}: the panel fits without scrolling`).toBe(false);
  }
  // One prompt, not two: the contextual action reuses #interact-prompt.
  expect(near.promptCount, 'exactly one bottom-centre prompt is lit').toBe(1);

  expect(errors).toEqual([]);
});
