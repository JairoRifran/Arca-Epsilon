import { expect, test, type Page } from '@playwright/test';

/**
 * M20 ascent hand-off and space navigation.
 *
 * Deliberately short: the ship is placed just under the orbital threshold
 * rather than flown the whole 1500 m band. Under the software renderer that
 * climb takes minutes of wall-clock and proves nothing the placement does not.
 */
test.setTimeout(600_000);

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

type Nav = {
  position: number[];
  linearSpeed: number;
  forwardSpeed: number;
  inSurfacePhase: boolean;
};
type Asc = {
  missionStep: string;
  shipY: number;
  transitionHandedOver: boolean;
  orbitalEnvironmentActive: boolean;
  arkDistance: number;
  arkY: number;
  inSurfacePhase: boolean;
  landingGearState: string;
};

const nav = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getShipNavigationState()) as unknown as Promise<Nav>;
const asc = (page: Page) =>
  page.evaluate(() => window.__arcaDebug?.getOrbitalAscentState()) as unknown as Promise<Asc>;

const lift = (page: Page, m: number) =>
  page.evaluate((v) => {
    window.__arcaDebug?.liftShipToAltitude(v);
    window.__arcaDebug?.setPlayerMode('ship');
    window.__arcaDebug?.clearDialogueQueue();
  }, m);

/** Lets any residual burn bleed off so a vertical check measures Q/E alone. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => window.__arcaDebug?.setShipVelocity(0, 0, 0));
  await page.waitForTimeout(2_000);
}

test('M20 hand-off holds, and space navigation responds on all axes', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.evaluate(() => { window.__arcaDebug?.clearSave(); window.__arcaDebug?.clearDialogueQueue(); });
  await page.evaluate((seq) => {
    const d = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const n of seq) d?.[n]?.();
  }, TO_M18);
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__arcaDebug?.startMission20());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('ship'));
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await page.waitForTimeout(1_200);

  // C. Surface ascent still responds to SPACE. Short window: the point is that
  // the hull rises at all, not how far.
  // Boarding starts the takeoff hand-off, and translation is held until the
  // gear is stowed. Wait that out, then poll for a rise rather than using a
  // fixed window: at a couple of frames per second the retraction alone can
  // swallow it.
  await page.waitForFunction(
    () => (window.__arcaDebug?.getLandingGearState() as { takeoffPhase?: string })?.takeoffPhase === 'none',
    undefined,
    { timeout: 90_000 }
  ).catch(() => undefined);
  const beforeClimb = (await asc(page)).shipY;
  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await asc(page)).shipY, {
      message: 'SPACE still raises the hull on the surface',
      timeout: 90_000,
      intervals: [1000]
    })
    .toBeGreaterThan(beforeClimb);
  await page.keyboard.up('Space');
  console.log('SURFACE CLIMB', JSON.stringify({
    before: beforeClimb, after: (await asc(page)).shipY
  }));

  // Hand-off, reached by placing the ship just under the threshold.
  await lift(page, 2380);
  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await asc(page)).transitionHandedOver, {
      message: 'the orbital hand-off must complete',
      timeout: 120_000,
      intervals: [1000]
    })
    .toBe(true);
  await page.keyboard.up('Space');
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());

  const handed = await asc(page);
  console.log('HAND-OFF', JSON.stringify({
    step: handed.missionStep, orbital: handed.orbitalEnvironmentActive,
    inSurfacePhase: handed.inSurfacePhase, y: handed.shipY, gear: handed.landingGearState
  }));
  expect(handed.inSurfacePhase, 'surface world left behind').toBe(false);
  expect(handed.missionStep, 'M20 advanced').toBe('rendezvousWithArk');
  // The hull is re-seated into the orbital frame, so absolute Y is no longer
  // the measure — the transition altitude was only ever a threshold. What must
  // hold is the M01 relationship: a standoff from the Ark, on its plane.
  console.log('ORBITAL FRAME', JSON.stringify({
    shipY: handed.shipY, arkY: handed.arkY, arkDistance: handed.arkDistance
  }));
  expect(Math.abs(handed.shipY - handed.arkY), 'seated on the Ark plane')
    .toBeLessThan(400);
  expect(handed.arkDistance, 'a real approach distance, not on top of the Ark')
    .toBeGreaterThan(500);
  expect(handed.arkDistance, 'and not stranded far outside the play space')
    .toBeLessThan(6000);

  // D. Space navigation, one axis at a time from a settled state.
  await settle(page);
  const beforeQ = (await nav(page)).position[1];
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(3_000);
  await page.keyboard.up('KeyQ');
  const qTrace = await page.evaluate(() =>
    (window.__arcaDebug?.getShipNavigationState() as Record<string, unknown>).spaceTrace);
  console.log('SPACE TRACE (Q held)', JSON.stringify(qTrace));
  const afterQ = (await nav(page)).position[1];
  console.log('Q', JSON.stringify({ before: beforeQ, after: afterQ }));
  expect(afterQ, 'Q descends').toBeLessThan(beforeQ);

  await settle(page);
  const beforeE = (await nav(page)).position[1];
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(3_000);
  await page.keyboard.up('KeyE');
  const afterE = (await nav(page)).position[1];
  console.log('E', JSON.stringify({ before: beforeE, after: afterE }));
  expect(afterE, 'E ascends').toBeGreaterThan(beforeE);

  await settle(page);
  const beforeW = await nav(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(3_000);
  await page.keyboard.up('Space');
  const afterW = await nav(page);
  const travelled = Math.hypot(
    afterW.position[0] - beforeW.position[0],
    afterW.position[1] - beforeW.position[1],
    afterW.position[2] - beforeW.position[2]
  );
  console.log('SPACE THRUST', JSON.stringify({
    travelled: Number(travelled.toFixed(3)), speed: Number(afterW.linearSpeed.toFixed(3))
  }));
  // Direction and response are what matter here. Magnitude is not meaningful:
  // the throttle spools at 2.6/s and the software renderer advances only a
  // couple of frames per wall-clock second, so a 3 s hold covers very little
  // simulated time.
  expect(afterW.linearSpeed, 'SPACE builds speed along the prow').toBeGreaterThan(0);
  expect(travelled, 'and the hull actually moves').toBeGreaterThan(0);

  // S bleeds it back off.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(2_500);
  await page.keyboard.up('KeyS');
  const braked = await nav(page);
  console.log('BRAKE', JSON.stringify({
    forwardBefore: afterW.forwardSpeed, forwardAfter: braked.forwardSpeed
  }));
  // S is reverse thrust in this model — "empuje contrario al movimiento" — so
  // the magnitude of the velocity can grow as the ship starts moving backwards.
  // What braking means is the prow-forward component falling.
  expect(braked.forwardSpeed, 'S bleeds forward speed')
    .toBeLessThan(afterW.forwardSpeed);

  expect(errors).toEqual([]);
});
