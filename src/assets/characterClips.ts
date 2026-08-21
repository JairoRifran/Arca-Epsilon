import * as THREE from 'three';

/**
 * Shared handling for the character animation clips.
 *
 * Every humanoid GLB in this project is built on one skeleton -- the pilot, the
 * standing idle and the Aurora observers all carry the same 26 bones with the
 * same names -- so a clip authored against one of them plays on any of the
 * others. That is what lets an animation ship as a 15 KB clip file instead of
 * as another 1.1 MB copy of the same body.
 *
 * It also means more than one system binds these clips, and they have to agree
 * about root motion. This module is where that agreement lives.
 */

/**
 * Strip the horizontal component of the hips track.
 *
 * The clips are authored with root motion: the walk cycle physically carries
 * the skeleton forward. Both the on-foot character and the Aurora crew drive
 * their own position -- one from input, the other from a timed path -- so a
 * clip that also moves the body fights the code that owns the movement, and
 * the figure drifts off its own feet.
 *
 * Vertical motion is deliberately left alone: that is the step bounce, and it
 * belongs to the animation.
 */
export function withoutHorizontalRootMotion(source: THREE.AnimationClip): THREE.AnimationClip {
  const clip = source.clone();
  clip.name = source.name || 'character-animation';
  for (const track of clip.tracks) {
    if (!/hips.*position|hips.*translation/i.test(track.name) || track.getValueSize() !== 3) continue;
    const values = track.values;
    const baseX = values[0];
    const baseZ = values[2];
    for (let i = 0; i < values.length; i += 3) {
      values[i] = baseX;
      values[i + 2] = baseZ;
    }
  }
  return clip;
}

/**
 * The height every humanoid is normalised to, in metres.
 *
 * The source models are not all the same height -- the pilot and the observers
 * differ by a few centimetres in their bind pose -- and they stand next to each
 * other in Aurora, where a mismatch reads immediately as one of them being the
 * wrong size. Normalising both against one number is what keeps them a crowd.
 */
export const CHARACTER_HEIGHT_METRES = 1.78;
