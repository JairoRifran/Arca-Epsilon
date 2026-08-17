import { expect, test, type Page } from '@playwright/test';

/**
 * M20's external hull links, the step that stalled at 67%.
 *
 * The stations must stay aligned with the rotated Ark and the M20 updater must
 * keep running after the surface-to-orbit hand-off. Otherwise the input router
 * can accept E while the mission never consumes the queued interaction.
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

/** Hull-local offsets, mirrored from mission20Definitions. */
const LINK_OFFSETS: [number, number, number][] = [[0, 26, -120], [96, 12, 10], [-88, -6, 118]];

type StationState = {
  step: string;
  linksRestored: boolean[];
  activeLinkIndex: number;
  arkPosition: number[];
  arkRotation: number[];
  stationPosition: number[];
  shipPosition: number[];
  distance: number;
  stationRange: number;
  interactionRange: number;
  inRange: boolean;
  phaseProgress: number;
};

const station = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getArkStationState()) as unknown as Promise<StationState>;

/** Drives the real ascent until the orbital environment takes over. */
async function reachOrbit(page: Page): Promise<void> {
  await page.evaluate(() => window.__arcaDebug?.startMission20());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);

  // The transition eases toward vacuum off the ship's own altitude. Holding the
  // hull above the band and letting frames run is the same path the player
  // flies, minus the minutes of climb this renderer cannot afford.
  await expect
    .poll(async () => {
      await page.evaluate(() => window.__arcaDebug?.liftShipToAltitude(2_500));
      const s = await page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as { orbitalEnvironmentActive?: boolean };
      return s?.orbitalEnvironmentActive === true;
    }, { message: 'the orbital hand-off must fire', timeout: 240_000, intervals: [1500] })
    .toBe(true);

  await page.evaluate(() => window.__arcaDebug?.rendezvousWithArk());
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);
}

test('the hull link stations resolve onto the Ark, not beside it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.evaluate((seq) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of seq) debug?.[name]?.();
  }, TO_M18);
  await page.waitForTimeout(1_500);
  await reachOrbit(page);

  const s = await station(page);
  expect(s.step, 'the run reached the link step').toBe('restoreArkLink');

  // The Ark really is rotated — if it ever stops being, this test stops proving
  // anything and should be told so rather than passing quietly.
  const tilt = Math.hypot(s.arkRotation[0], s.arkRotation[1], s.arkRotation[2]);
  expect(tilt, 'the Ark is rotated, so the transform matters').toBeGreaterThan(0.05);

  // The discriminating assertion. Both the old and the new code preserve the
  // offset's *length* from the hull origin, so distance alone proves nothing.
  // Mapping the resolved station back into the Ark's own frame does: it returns
  // the authored offset only when the rotation was applied.
  const expected = LINK_OFFSETS[Math.max(0, s.activeLinkIndex)];
  const truth = await page.evaluate(({ offset }) => {
    const scene = (window as unknown as { __arcaScene: import('three').Scene }).__arcaScene;
    const ark = scene.getObjectByName('Arca Epsilon Mothership');
    if (!ark) return null;
    ark.updateWorldMatrix(true, false);
    const m = ark.matrixWorld.elements;
    const [x, y, z] = offset;
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
  }, { offset: expected });

  expect(truth, 'the Ark node was found').not.toBeNull();
  const t = truth as number[];
  const off = Math.hypot(
    s.stationPosition[0] - t[0], s.stationPosition[1] - t[1], s.stationPosition[2] - t[2]
  );
  // Was 34-51 m out, depending on which link was active.
  expect(off, 'the station sits on its authored hull point').toBeLessThan(1);

  expect(errors).toEqual([]);
});

test('a link completes with E once the ship is at the hull point', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.evaluate((seq) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of seq) debug?.[name]?.();
  }, TO_M18);
  await page.waitForTimeout(1_500);
  await reachOrbit(page);

  // Fly all three, in the order the mission hands them out. Two of three was
  // the reported symptom, so stopping at one would not have caught it.
  for (let link = 0; link < 3; link += 1) {
    const before = await station(page);
    expect(before.step, `link ${link}: still on the link step`).toBe('restoreArkLink');

    if (link === 2) {
      expect(before.linksRestored, 'the reported 67% checkpoint is two completed links')
        .toEqual([true, true, false]);
      expect(before.phaseProgress, 'the displayed checkpoint is approximately 67%')
        .toBeGreaterThanOrEqual(66);
      expect(before.phaseProgress, 'the final link has not already progressed')
        .toBeLessThan(68);
    }

    // Park just off the hull point, on the side away from the Ark centre —
    // where a player approaching the feature would actually end up.
    await page.evaluate(({ st, ark }) => {
      const dx = st[0] - ark[0], dy = st[1] - ark[1], dz = st[2] - ark[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      window.__arcaDebug?.setShipWorldPosition?.([
        st[0] + (dx / len) * 25, st[1] + (dy / len) * 25, st[2] + (dz / len) * 25
      ]);
    }, { st: before.stationPosition, ark: before.arkPosition });
    await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

    await expect
      .poll(async () => (await station(page)).inRange, {
        message: `link ${link}: parking at the hull point must enter the interaction gate`,
        timeout: 60_000, intervals: [1000]
      })
      .toBe(true);


    // The real key, through the real input router — this is the press that did
    // nothing before.
    await expect
      .poll(async () => {
        await page.keyboard.press('KeyE');
        return (await station(page)).linksRestored[link];
      }, {
        message: `link ${link}: pressing E must sync it`,
        timeout: 90_000, intervals: [1200]
      })
      .toBe(true);
  }

  const done = await station(page);
  expect(done.linksRestored, 'all three links synced').toEqual([true, true, true]);
  // 67% was two of three. The step must actually move on.
  expect(done.step, 'the mission left the link step').not.toBe('restoreArkLink');

  expect(errors).toEqual([]);
});
