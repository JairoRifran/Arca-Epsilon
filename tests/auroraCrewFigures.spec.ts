import { expect, test } from '@playwright/test';

/**
 * The Aurora crew are three separate people.
 *
 * They were six shared primitives posed by a sine wave. They are now three
 * clones of one skinned model, and the thing that makes that work -- or fail
 * invisibly -- is how the clone was made. `Object3D.clone()` duplicates the
 * mesh but leaves every copy bound to the *original* skeleton, so three figures
 * share one set of bones: they render, they are lit, they cast shadows, and
 * they stand in exactly the same pose for ever. Nothing throws.
 *
 * `SkeletonUtils.clone()` rebinds each copy to its own skeleton. That is the
 * difference this test exists to hold, because it is not visible in a crash log
 * and barely visible in a screenshot.
 */
test.setTimeout(600_000);

type CrewState = {
  status: string;
  figures: number;
  distinctSkeletons: number;
  clips: string[];
  playing: string[];
  settled: boolean;
  walkProgress: number;
  visible: boolean;
};

const crew = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window.__arcaDebug as unknown as {
      getAuroraCrewState?: () => CrewState;
    })?.getAuroraCrewState?.()
  ) as unknown as Promise<CrewState>;

test('the crew load as three independently posed figures', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.waitForTimeout(2_000);

  const state = await crew(page);
  console.log('AURORA CREW', JSON.stringify(state));

  expect(state.status, 'the crew model loaded').toBe('loaded');
  expect(state.figures, 'one figure per crew member').toBe(3);

  // The whole point. Three figures must own three skeletons.
  expect(state.distinctSkeletons, 'each figure owns its own bones')
    .toBe(state.figures);

  // Both clips have to be bound: the observer clip from the crew model, and the
  // walk borrowed from the pilot rig. Without the walk, the disembark is three
  // people sliding across the ground in a standing pose.
  expect(state.clips.some((name) => /alert/i.test(name)), `an observing clip is bound (got ${state.clips.join(', ')})`)
    .toBe(true);
  expect(state.clips.some((name) => /walk/i.test(name)), `a walk clip is bound (got ${state.clips.join(', ')})`)
    .toBe(true);

  // Settled and standing is the state they spend almost all of their screen
  // time in, so it is the one that must be right on load.
  expect(state.playing, 'they start standing, not walking')
    .toEqual(['idle', 'idle', 'idle']);

  expect(errors).toEqual([]);
});

/**
 * The disembark walk.
 *
 * This runs the class directly rather than through the game. Mission 12 sits
 * behind the whole campaign ladder -- from a cleared save every hook in the
 * chain returns false, starting at `completeMission11`, because the player is
 * nowhere near Aurora -- so driving it in the harness would mean replaying most
 * of the story to assert five seconds of walking.
 *
 * It runs in the page rather than in Node because the contact shadow is built
 * from a canvas texture at construction. Vite serves the module, so the test
 * imports the real class and drives its real state machine; only the mission
 * that would normally call it is replaced.
 */
test('the disembark walk survives the resync that follows it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });

  const results = await page.evaluate(async () => {
    // Held in a variable so this stays a runtime import: the dev server
    // resolves the absolute path, `tsc` cannot, and the type comes from the
    // source path instead.
    const specifier = '/src/entities/AuroraFirstCrew.ts';
    const { AuroraFirstCrew } = (await import(specifier)) as typeof import('../src/entities/AuroraFirstCrew');
    // `setLayout` only reads x and z off the hatch, so a bare point stands in
    // for the capsule. Importing `three` here would need a bare specifier the
    // raw page cannot resolve, and the walk logic does not care.
    const hatch = { x: 0, y: 0, z: 0 } as unknown as import('three').Vector3;
    const build = () => {
      const crewUnderTest = new AuroraFirstCrew();
      crewUnderTest.setLayout(hatch, () => 0);
      return crewUnderTest;
    };

    // The real sequence. Mission 12 runs these two back to back.
    const resync = build();
    resync.beginDisembark();
    resync.restore(true, true);
    const afterResync = {
      settled: resync.settled,
      walkProgress: resync.diagnostics.walkProgress
    };

    // Six seconds against a five second crossing.
    const crossing = build();
    crossing.beginDisembark();
    crossing.restore(true, true);
    for (let step = 0; step < 120; step += 1) crossing.update(0.05, step * 0.05);
    const afterCrossing = { settled: crossing.settled, walkProgress: crossing.diagnostics.walkProgress };

    // A save being restored: the walk is history and must not replay.
    const restored = build();
    restored.restore(true, true);
    const afterRestore = { settled: restored.settled, visible: restored.group.visible };

    // Not landed yet.
    const waiting = build();
    waiting.restore(true, false);
    const afterWaiting = { visible: waiting.group.visible, walkProgress: waiting.diagnostics.walkProgress };

    return { afterResync, afterCrossing, afterRestore, afterWaiting };
  });

  console.log('DISEMBARK', JSON.stringify(results));

  // The bug. The resync used to snap `walkProgress` to 1 on the line after
  // `beginDisembark()`, so the crew reached their posts on the frame they left
  // the capsule and the walk never played once, in any playthrough.
  expect(results.afterResync.settled, 'the resync left the walk running').toBe(false);
  expect(results.afterResync.walkProgress, 'and did not teleport them').toBe(0);

  expect(results.afterCrossing.settled, 'the walk still completes').toBe(true);
  expect(results.afterCrossing.walkProgress).toBe(1);

  // A restored save must start settled, or every reload replays an arrival
  // that already happened.
  expect(results.afterRestore.settled, 'a restored save starts settled').toBe(true);
  expect(results.afterRestore.visible).toBe(true);

  expect(results.afterWaiting.visible, 'nobody is on the ground yet').toBe(false);
  expect(results.afterWaiting.walkProgress).toBe(0);

  expect(errors).toEqual([]);
});
