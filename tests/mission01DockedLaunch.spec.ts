import { expect, test, type Page } from '@playwright/test';

/**
 * Mission 01 prologue probe: the departure from Arca Epsilon.
 *
 * Checks the things that make this a real docked launch rather than a cutscene:
 * the ship starts parented to the Ark's own launch cradle, cannot translate
 * while clamped, walks the commander's beats in order, runs the pre-flight
 * check, releases the clamps only when asked, separates continuously without a
 * teleport, and hands over to M01's real first step. Save/load is exercised
 * both while docked and after undocking, and a pre-feature save is proven not
 * to rewind.
 */
test.setTimeout(600_000);

const departure = (page: Page) => page.evaluate(() => window.__arcaDebug?.getArkDepartureState());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
}

/** Presses the interaction key through the debug router, as the player would. */
const interact = (page: Page) => page.evaluate(() => window.__arcaDebug?.advanceArkDeparture());

async function startNewGame(page: Page): Promise<void> {
  await page.goto('/?test=1&prologue=1');
  await ready(page);
  await page.evaluate(() => window.__arcaDebug?.clearSave());
  await page.reload();
  await ready(page);
  await page.locator('#launch-button').click();
}

test('mission 01 prologue: docked start, preflight, clamp release and clean separation', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => { consoleErrors.push(`PAGEERROR: ${error.message}`); });

  await startNewGame(page);

  // --- 1-6. A new game starts clamped to the Ark's own cradle --------------
  let state = await departure(page);
  expect(state?.arkDepartureStarted, 'a new game opens in the prologue').toBe(true);
  expect(state?.arkDepartureStep).toBe('dockedAtArk');
  expect(state?.docked).toBe(true);
  expect(state?.shipParentIsArk, 'the hull hangs off the Ark, not the scene root').toBe(true);
  expect(state?.statusLabel).toBe('ACOPLADO');

  // Exactly one ship and one Ark: nothing was duplicated to fake the dock.
  expect(state?.shipCount, 'exactly one player ship').toBe(1);
  expect(state?.mothershipCount, 'exactly one Mothership').toBe(1);

  const arkUuid = state!.mothershipUuid;
  const arkPosition = state!.mothershipPosition;
  const arkScale = state!.mothershipScale;
  expect(arkScale, 'the Ark keeps its scale').toEqual([1, 1, 1]);

  // Sitting on the cradle, not floating off it or sunk into the hull.
  expect(state?.anchorDistance ?? 999, 'the hull rests on the cradle').toBeLessThan(6);

  // --- 12. Clamped means no translation ------------------------------------
  expect(state?.translationLocked).toBe(true);
  expect(state?.thrustLimit, 'no main thrust while clamped').toBe(0);
  await page.keyboard.down('w');
  await page.waitForTimeout(2_500);
  await page.keyboard.up('w');
  // The Ark drifts and the docked ship rides it, so the meaningful measure is
  // the offset from the cradle, not a world position that is expected to move.
  const stillDocked = await departure(page);
  expect(stillDocked?.anchorDistance ?? 999, 'holding W must not pull the ship off the pad')
    .toBeLessThan(6);
  expect(stillDocked?.arkDepartureStep, 'thrust does not advance the sequence').toBe('dockedAtArk');

  // --- 13. Weapons are cold on the pad -------------------------------------
  expect(stillDocked?.weaponsLocked).toBe(true);

  // --- 7-9. The commander introduces herself before giving orders ----------
  expect(await interact(page), 'the interaction key advances the introduction').toBe(true);
  state = await departure(page);
  expect(state?.commanderIntroPlayed, 'she introduces herself first').toBe(true);
  expect(state?.arkDepartureStep).toBe('missionContext');

  expect(await interact(page)).toBe(true);
  state = await departure(page);
  expect(state?.missionContextPlayed, 'context and first task delivered').toBe(true);
  expect(state?.arkDepartureStep).toBe('preflightCheck');

  // --- 10/11. The checklist must run, and the clamps cannot open early -----
  expect(state?.preflightComplete).toBe(false);
  expect(state?.clampsReleased, 'clamps stay shut before the checklist').toBe(false);

  expect(await interact(page), 'the interaction key opens the checklist').toBe(true);
  await expect
    .poll(async () => (await departure(page))?.preflightComplete, {
      message: 'the pre-flight check must complete on its own once started',
      timeout: 30_000
    })
    .toBe(true);
  state = await departure(page);
  expect(state?.systemsConfirmed, 'all five systems confirmed').toBe(5);
  expect(state?.arkDepartureStep).toBe('readyForRelease');
  expect(state?.clampsReleased, 'still clamped until the pilot releases').toBe(false);
  expect(state?.docked).toBe(true);

  // --- Save/load while docked ----------------------------------------------
  await page.evaluate(() => {
    window.__arcaDebug?.saveGame();
    window.__arcaDebug?.loadGame();
  });
  await page.waitForTimeout(1_500);
  state = await departure(page);
  expect(state?.arkDepartureStep, 'a docked save restores docked').toBe('readyForRelease');
  expect(state?.docked).toBe(true);
  expect(state?.shipParentIsArk).toBe(true);
  expect(state?.preflightComplete, 'the checklist stays done').toBe(true);
  expect(state?.anchorDistance ?? 999, 'restored onto the cradle').toBeLessThan(6);

  // --- 14/15. Release: continuous separation, no teleport ------------------
  expect(await interact(page), 'the pilot releases the clamps').toBe(true);
  expect((await departure(page))?.arkDepartureStep).toBe('releaseDockingClamps');

  await expect
    .poll(async () => (await departure(page))?.clampsReleased, {
      message: 'the clamps must finish opening',
      timeout: 30_000
    })
    .toBe(true);
  state = await departure(page);
  expect(state?.arkDepartureStep).toBe('undocking');
  expect(state?.shipParentIsArk, 'the hull returns to world space on release').toBe(false);
  // The handover preserves the pose: the ship is still at the cradle, not
  // flung somewhere by the reparent.
  expect(state?.anchorDistance ?? 999, 'no teleport on undock').toBeLessThan(12);
  expect(state?.thrustLimit, 'manoeuvring thrust only inside the corridor').toBeGreaterThan(0);
  expect(state?.thrustLimit, 'main engines still throttled').toBeLessThan(1);

  // --- 16/17. Distance grows continuously under player control -------------
  const samples: number[] = [];
  await page.keyboard.down('w');
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(1_200);
    samples.push((await departure(page))?.anchorDistance ?? 0);
  }
  await page.keyboard.up('w');
  // Separation must be real, continuous and never a teleport. The last
  // samples can already be in free flight after the safe-distance handoff, so
  // the ceiling includes one 1.2 s sample at normal M01 speed.
  expect(samples[samples.length - 1], 'the ship actually moves away').toBeGreaterThan(samples[0] + 15);
  for (let i = 1; i < samples.length; i += 1) {
    expect(samples[i] - samples[i - 1], `sample ${i} must not go backwards`).toBeGreaterThanOrEqual(0);
    expect(samples[i] - samples[i - 1], `sample ${i} must not jump`).toBeLessThan(90);
  }

  // --- 18/19. Safe distance hands control back and M01 continues -----------
  await page.keyboard.down('w');
  await expect
    .poll(async () => (await departure(page))?.arkDepartureCompleted, {
      message: 'clearing the corridor must hand back normal flight',
      timeout: 180_000
    })
    .toBe(true);
  await page.keyboard.up('w');

  state = await departure(page);
  expect(state?.arkDepartureStep).toBe('completed');
  expect(state?.thrustLimit, 'normal flight restored').toBe(1);
  expect(state?.weaponsLocked, 'weapons released at safe distance').toBe(false);
  expect(state?.statusLabel).toBe('DISTANCIA SEGURA');
  expect(state?.dockingAssemblyBuilt, 'the docking dressing is disposed once clear').toBe(false);

  // The prologue hands off to the first real onboarding manoeuvre. It does not
  // skip the tutorial or jump straight to the scanner beat.
  const savedStep = await page.evaluate(() => {
    window.__arcaDebug?.saveGame();
    const raw = window.localStorage.getItem('arca-epsilon-save-v2');
    return raw ? (JSON.parse(raw) as { currentMissionStep?: string }).currentMissionStep : undefined;
  });
  expect(savedStep, 'M01 resumes at its own first step').toBe('flightOrientation');

  // --- 5. The Ark was reused, never rebuilt or moved -----------------------
  expect(state?.mothershipUuid, 'same Ark instance throughout').toBe(arkUuid);
  expect(state?.mothershipScale).toEqual(arkScale);
  // The hull drifts on purpose (station-keeping), so position is compared
  // loosely: what must not happen is a respawn somewhere else.
  expect(Math.abs(state!.mothershipPosition[0] - arkPosition[0])).toBeLessThan(1);
  expect(Math.abs(state!.mothershipPosition[2] - arkPosition[2])).toBeLessThan(1);

  // --- 22/24/25. No repeated dialogue, no errors ---------------------------
  const dialogue = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
  const played = dialogue?.playedDialogueIds ?? [];
  const prologueLines = played.filter((id) => id.startsWith('m01_prologue_'));
  expect(new Set(prologueLines).size, 'no prologue line plays twice').toBe(prologueLines.length);

  expect(consoleErrors).toEqual([]);
});

test('mission 01 prologue: a save from before the feature never rewinds to the hangar', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => { consoleErrors.push(`PAGEERROR: ${error.message}`); });

  await page.goto('/?test=1&prologue=1');
  await ready(page);

  // A legacy save: valid v2 data with none of the prologue fields, exactly
  // what a pilot who launched before this feature existed would have.
  await page.evaluate(() => {
    window.__arcaDebug?.clearSave();
    window.__arcaDebug?.saveGame();
    const raw = window.localStorage.getItem('arca-epsilon-save-v2');
    if (!raw) return;
    const save = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(save)) {
      if (key.startsWith('arkDeparture') || key === 'commanderIntroPlayed' || key === 'missionContextPlayed' ||
          key === 'preflightComplete' || key === 'clampsReleased' || key === 'undockingStarted' || key === 'arkCleared') {
        delete save[key];
      }
    }
    // Mid-M01, already flying: this pilot is past the departure.
    save.currentMissionId = 'mission-01-search-home';
    save.currentMissionStep = 'followSignal';
    window.localStorage.setItem('arca-epsilon-save-v2', JSON.stringify(save));
  });

  await page.reload();
  await ready(page);
  await page.locator('#launch-button').click();
  await page.waitForTimeout(3_000);

  const state = await departure(page);
  expect(state?.arkDepartureCompleted, 'a legacy save counts the departure as done').toBe(true);
  expect(state?.docked, 'the pilot is not sent back to the hangar').toBe(false);
  expect(state?.shipParentIsArk, 'the ship stays in world space').toBe(false);
  expect(state?.translationLocked, 'movement is not taken away').toBe(false);
  expect(state?.weaponsLocked, 'weapons are not taken away').toBe(false);
  expect(state?.thrustLimit).toBe(1);

  // The introduction must not replay for someone who already left.
  const dialogue = await page.evaluate(() => window.__arcaDebug?.getDialogueState());
  const played = dialogue?.playedDialogueIds ?? [];
  expect(played.filter((id) => id.startsWith('m01_prologue_')), 'no prologue line replays').toEqual([]);

  expect(consoleErrors).toEqual([]);
});
