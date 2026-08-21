import { expect, test } from '@playwright/test';

/**
 * The character has a real idle.
 *
 * `SurfaceCharacter.mapAnimations` picks clips by matching their names, and
 * when nothing matched `/idle|breath|stand/i` it fell back to
 * `createStaticPoseClip(walk)` -- a single frozen frame of the walk cycle held
 * for ever. That fallback is silent by design, which is why the character stood
 * frozen for this long without anything reporting a problem.
 *
 * So the assertion is not "an idle action exists" -- one always did. It is that
 * the idle is the authored clip and not the derived pose, which is exactly the
 * distinction the old behaviour blurred.
 */
test.setTimeout(600_000);

type Snapshot = {
  characterAnimation: string;
  characterAnimationClips: string[];
  characterGlbStatus: string;
  loadedAnimationSources: number;
};

test('the idle is an authored clip, not a frozen frame of the walk', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__arcaGameReady === true, undefined, { timeout: 300_000 });
  await page.locator('#launch-button').click();
  await page.waitForTimeout(2_000);

  const snapshot = await page.evaluate(
    () => (window.__arcaDebug as unknown as {
      getPerformanceSnapshot?: () => Record<string, unknown>;
    })?.getPerformanceSnapshot?.()
  ) as unknown as Snapshot;

  console.log('CHARACTER', JSON.stringify({
    animation: snapshot.characterAnimation,
    clips: snapshot.characterAnimationClips,
    sources: snapshot.loadedAnimationSources
  }));

  expect(snapshot.characterGlbStatus, 'the rig loaded').toBe('loaded');

  // The extractor renames the clip on the way in, so this is the name the
  // runtime matcher is meant to see -- not whatever the authoring tool called
  // it (`rigify_clip`, alongside a 0.07 s stub named `Armature|clip0|baselayer`).
  expect(snapshot.characterAnimationClips, 'the idle clip was loaded')
    .toContain('idle_standing');

  // The state is `idle` after load, so this reads `idle:<clip actually bound>`.
  // `idle:idle-derived-pose` is the old frozen frame; anything else means the
  // regex matched something it should not have.
  expect(snapshot.characterAnimation, 'the idle state is bound to the authored clip')
    .toBe('idle:idle_standing');

  // The walk and run must still map to their own clips. A new clip name in the
  // pool is a chance to shadow an existing match, and a run that quietly became
  // the idle would look almost right while being wrong.
  expect(snapshot.characterAnimationClips, 'the walk clip survived')
    .toContain('Armature|walking_man|baselayer');
  expect(snapshot.characterAnimationClips, 'the run clip survived')
    .toContain('Armature|Run_02|baselayer');

  expect(errors).toEqual([]);
});
