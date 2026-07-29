import { expect, test, type Page } from '@playwright/test';
import { warMusicTrackIds } from '../src/audio/audioDefinitions';
import { WAR_CUE_FALLBACKS, WAR_CUE_MIX } from '../src/audio/warScoreMix';

/**
 * `musicWarScore.json` is deliberately NOT imported here. It is generation
 * metadata, and keeping it out of the module graph is what keeps it out of the
 * browser bundle. The catalogue-to-manifest mapping is the generator's job
 * (it writes one manifest entry per catalogued track, keyed by cue); what this
 * probe checks is the contract the game depends on — that every registered cue
 * reaches a real, distinct, served file.
 */

/**
 * War-score integration probe.
 *
 * Two independent tests: one static (every cue is registered, reaches a real
 * MP3 and has a safe fallback) and one live (the director actually changes bed
 * with the mission, holds a bed while the intensity does not change, crossfades
 * exactly once, ducks under dialogue and survives a save/load).
 */
test.setTimeout(900_000);

const TO_M17 = [
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
  'completeMission15', 'completeMission16', 'completeMission17'
];

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

async function run(page: Page, names: string[]): Promise<void> {
  await page.evaluate((sequence) => {
    const debug = window.__arcaDebug as unknown as Record<string, (a?: unknown) => unknown> | undefined;
    for (const name of sequence) {
      try { debug?.[name]?.(); } catch { /* a hook that no longer applies is not fatal here */ }
    }
  }, names);
}

function step(page: Page, name: string, arg?: unknown) {
  return page.evaluate(({ n, a }) => {
    const debug = window.__arcaDebug as unknown as Record<string, (x?: unknown) => unknown> | undefined;
    try { return debug?.[n]?.(a); } catch { return undefined; }
  }, { n: name, a: arg });
}

const audio = (page: Page) => page.evaluate(() => window.__arcaDebug?.getAudioState());

/**
 * Waits for a cue to become the bed that is actually playing.
 *
 * Polling `currentMusicTrack` rather than `requestedMusicTrack` on purpose:
 * the request is set synchronously by the director, while the bed only becomes
 * current once its own MP3 has been fetched and decoded. Landing on the cue
 * itself — not on one of its fallbacks — is therefore also proof that the file
 * resolved correctly.
 *
 * The timeout has to absorb the cue's `minHoldSeconds` plus the decode.
 */
async function expectBed(page: Page, cue: string, label: string): Promise<void> {
  await expect
    .poll(async () => (await audio(page))?.currentMusicTrack, {
      message: `${label}: expected ${cue} to become the playing bed`,
      timeout: 60_000,
      intervals: [500]
    })
    .toBe(cue);
}

test('war score: every cue is registered, reaches a real file and has a safe fallback', async ({ page }) => {
  // --- 1. The registry itself is sane ---------------------------------------
  expect(warMusicTrackIds).toHaveLength(18);
  expect(new Set<string>(warMusicTrackIds).size, 'no duplicate cue ids').toBe(18);

  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(`PAGEERROR: ${error.message}`));
  // Everything the PAGE itself asks for. `page.request` calls further down go
  // through the API context instead, so they never land here.
  const pageRequests: string[] = [];
  page.on('request', (request) => pageRequests.push(request.url()));

  await page.goto('/?test=1');
  await ready(page);

  // --- 2. The runtime manifest exposes all 18 under their cue name -----------
  const manifest = JSON.parse(await (await page.request.get('/audio/audio-manifest.json')).text()) as {
    assets: Array<{ id: string; path: string; available: boolean; category: string }>;
  };
  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const warPaths = new Set<string>();

  for (const cue of warMusicTrackIds) {
    const entry = byId.get(cue);
    expect(entry, `${cue} must be in the audio manifest`).toBeTruthy();
    expect(entry!.available).toBe(true);
    expect(entry!.category).toBe('music');
    expect(entry!.path, `${cue} must point at a generated war file`)
      .toMatch(/^\/audio\/music\/music_[a-z0-9_]+\.mp3$/);
    // Two cues sharing a file would mean a mis-registration, not a fallback.
    expect(warPaths.has(entry!.path), `${cue} shares its file with another cue`).toBe(false);
    warPaths.add(entry!.path);
  }

  // --- 3. Every file really is served: no 404, real audio bytes -------------
  for (const cue of warMusicTrackIds) {
    const path = byId.get(cue)!.path;
    const response = await page.request.get(path);
    expect(response.status(), `${path} must not 404`).toBe(200);
    expect((await response.body()).byteLength, `${path} must have real audio`)
      .toBeGreaterThan(100_000);
  }

  // --- 4. Fallbacks are safe: every link exists and never points at itself ---
  for (const cue of warMusicTrackIds) {
    const chain = WAR_CUE_FALLBACKS[cue];
    expect(chain.length, `${cue} must declare a fallback`).toBeGreaterThan(0);
    expect(chain).not.toContain(cue);
    for (const fallback of chain) {
      const entry = byId.get(fallback);
      expect(entry?.available, `${cue} falls back to ${fallback}, which has no file`).toBe(true);
    }
    // Mix values must leave headroom for SFX and dialogue over the bed.
    const mix = WAR_CUE_MIX[cue];
    expect(mix.volume).toBeGreaterThan(0);
    expect(mix.volume, `${cue} must sit under the generic bed volume`).toBeLessThanOrEqual(0.78);
    expect(mix.minHoldSeconds).toBeGreaterThan(0);
  }

  // --- 5. The game itself does not consider any of them missing -------------
  await page.locator('#launch-button').click();
  const state = await audio(page);
  for (const cue of warMusicTrackIds) {
    expect(state?.missingMusicAssets, `${cue} must not be reported missing`).not.toContain(cue);
  }

  // --- 6. Lazy loading: booting into M01 must not download the war score -----
  // 18 tracks are ~50 MB. Registering a cue only makes it reachable; the MP3
  // is fetched the first time that cue actually becomes the bed, so M01-M17
  // pay nothing for the war beds.
  await page.waitForTimeout(4_000);
  const warFetchedAtBoot = pageRequests.filter((url) => warPaths.has(new URL(url).pathname));
  expect(warFetchedAtBoot, 'no war track may be downloaded before its cue is used').toEqual([]);
  // The bed M01 does use is fetched, so this is proof of lazy loading rather
  // than of music never loading at all.
  expect(
    pageRequests.some((url) => new URL(url).pathname.startsWith('/audio/music/')),
    'the mission-01 bed itself must load'
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('war score: M18-M22 drive the bed, hold it, crossfade, duck and survive save/load', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(`PAGEERROR: ${error.message}`));
  // A mid-run reload (a dev-server restart, for instance) resets the score and
  // would make every music assertion below meaningless: fail loudly instead.
  let navigations = 0;
  page.on('load', () => { navigations += 1; });

  await page.goto('/?test=1');
  await ready(page);
  await page.locator('#launch-button').click();
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.evaluate(() => window.__arcaDebug?.setPlayerMode('onFoot'));

  await run(page, TO_M17);

  // --- M18: alert -> ground combat -> crisis -> ship interception -----------
  await step(page, 'startMission18');
  await expectBed(page, 'music-war-alert', 'M18 real alert');

  // Hysteresis: three objectives at the same intensity must not restart the
  // bed even once.
  const heldBefore = await audio(page);
  await step(page, 'activateEmergencyProtocol');
  await step(page, 'identifyHostileDrones');
  const heldAfter = await audio(page);
  expect(heldAfter?.currentMusicTrack, 'the alert bed holds across objectives').toBe('music-war-alert');
  expect(heldAfter?.musicBedStartCount, 'no restart while the intensity is unchanged')
    .toBe(heldBefore?.musicBedStartCount);

  await step(page, 'authorizeDefenseWeapons');
  await expectBed(page, 'music-first-fire', 'M18 first wave');

  // One escalation = exactly one new bed. That is the crossfade: the incoming
  // bed starts while the outgoing one fades, and only one of each ever exists.
  const beforeCombat = (await audio(page))?.musicBedStartCount ?? 0;
  await step(page, 'clearFirstWave');
  await expectBed(page, 'music-atlas-breach', 'M18 critical system');
  const afterCombat = (await audio(page))?.musicBedStartCount ?? 0;
  expect(afterCombat - beforeCombat, 'one escalation starts exactly one bed').toBe(1);

  await step(page, 'stabilizeCriticalSystem');
  await expectBed(page, 'music-space-interception', 'M18 ship interception');

  // --- Dialogue ducking over a war bed --------------------------------------
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await step(page, 'completeDroneIntercept');
  await step(page, 'defendAuroraShield');
  await step(page, 'completeEnemyTransmission');
  await step(page, 'recoverDroneWreckage');
  await step(page, 'completeMission18');

  // --- M19: defence of Nereida -> Atlas breach ------------------------------
  await step(page, 'startMission19');
  await expectBed(page, 'music-war-alert', 'M19 emergency transmission');
  await step(page, 'confirmNereidaEmergency');
  await step(page, 'clearNereidaAirspace');
  await step(page, 'landAtNereida');
  await expectBed(page, 'music-nereida-under-attack', 'M19 settlement defence');

  await step(page, 'restoreNereidaDefense', 0);
  await step(page, 'restoreNereidaDefense', 1);
  await step(page, 'restoreNereidaDefense', 2);
  // Repelling the incursion is what puts the mission on `protectAtlas`; the
  // breach must be scored while the step is live, not after resolving it.
  await step(page, 'repelNereidaIncursion');
  await expectBed(page, 'music-atlas-breach', 'M19 Atlas resonator breach');

  await step(page, 'protectAtlasCore');
  await step(page, 'setOperationalPriority', 'pleyadianRecords');
  await step(page, 'activateNereidaCounterattack');
  await step(page, 'confirmNereidaDataLeak');
  await step(page, 'recoverNereidaWreckage');
  await step(page, 'completeMission19');

  // --- M20: the battle for the Ark ------------------------------------------
  await step(page, 'startMission20');
  await expectBed(page, 'music-space-interception', 'M20 emergency ascent');
  await step(page, 'completeArkAscent');
  await step(page, 'rendezvousWithArk');
  await expectBed(page, 'music-war-alert', 'M20 rendezvous');
  await step(page, 'restoreArkLink', 0);
  await step(page, 'restoreArkLink', 1);
  await step(page, 'restoreArkLink', 2);
  await expectBed(page, 'music-ark-battle', 'M20 orbital waves');

  // Save/load must not leave two beds running: the round trip may re-request
  // the same cue, but it must never start a second one.
  const beforeLoad = (await audio(page))?.musicBedStartCount ?? 0;
  await page.evaluate(() => {
    window.__arcaDebug?.saveGame();
    window.__arcaDebug?.loadGame();
  });
  await page.waitForTimeout(3_000);
  const afterLoad = await audio(page);
  expect(afterLoad?.musicBedStartCount, 'a save/load round trip must not stack beds')
    .toBeLessThanOrEqual(beforeLoad + 1);
  expect(afterLoad?.currentMusicTrack, 'exactly one bed is active after loading')
    .toBe('music-ark-battle');

  await run(page, ['completeMission20']);

  // --- M21: the rupture of the Silence --------------------------------------
  await step(page, 'startMission21');
  await expectBed(page, 'music-war-ambient', 'M21 encrypted transmission');
  await step(page, 'detectCoalitionCapitalShip');
  await expectBed(page, 'music-silence-rupture', 'M21 capital ship');

  // The ultimatum keeps the same theme: it must not restart it.
  const beforeUltimatum = (await audio(page))?.musicBedStartCount ?? 0;
  await step(page, 'analyzeCoalitionCapitalSignature');
  await step(page, 'receiveCoalitionUltimatum');
  const atUltimatum = await audio(page);
  expect(atUltimatum?.currentMusicTrack, 'the ultimatum holds the same theme')
    .toBe('music-silence-rupture');
  expect(atUltimatum?.musicBedStartCount, 'the ultimatum must not restart the theme')
    .toBe(beforeUltimatum);

  await run(page, ['completeMission21']);

  // --- M22: broken fronts ----------------------------------------------------
  await step(page, 'startMission22');
  await expectBed(page, 'music-war-alert', 'M22 simultaneous alarm');
  await step(page, 'acknowledgeMission22Alarm');
  await expectBed(page, 'music-broken-fronts', 'M22 strategic management');

  // --- Ducking: the score steps back under comms, then recovers -------------
  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await expect
    .poll(async () => (await audio(page))?.musicDucked, { timeout: 15_000 })
    .toBe(false);

  const beforeDuck = (await audio(page))?.musicBedStartCount ?? 0;
  const shown = await page.evaluate(() => window.__arcaDebug?.showDialogue('m22_start'));
  expect(shown, 'the probe needs a real dialogue to duck under').toBe(true);
  await expect
    .poll(async () => (await audio(page))?.musicDucked, {
      message: 'dialogue must duck the war bed',
      timeout: 15_000
    })
    .toBe(true);
  // Ducking lowers the bed; it must never swap or restart it.
  const ducked = await audio(page);
  expect(ducked?.currentMusicTrack).toBe('music-broken-fronts');
  expect(ducked?.musicBedStartCount, 'ducking must not restart the bed').toBe(beforeDuck);

  await page.evaluate(() => window.__arcaDebug?.clearDialogueQueue());
  await expect
    .poll(async () => (await audio(page))?.musicDucked, {
      message: 'the score must recover after comms',
      timeout: 15_000
    })
    .toBe(false);

  expect(navigations, 'the page must not have reloaded during the run').toBe(1);
  expect(consoleErrors).toEqual([]);
});
