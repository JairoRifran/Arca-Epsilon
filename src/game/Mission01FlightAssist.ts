import {
  mission01AssistProfiles,
  mission01TutorialTuning,
  type Mission01AssistLevel,
  type Mission01AssistProfile
} from '../assets/mission01OnboardingDefinitions';

export type Mission01AssistSnapshot = {
  mission01AssistLevel: Mission01AssistLevel;
  mission01AssistEngaged: boolean;
};

const LEVEL_ORDER: readonly Mission01AssistLevel[] = ['off', 'low', 'medium', 'high'];

function levelRank(level: Mission01AssistLevel): number {
  const index = LEVEL_ORDER.indexOf(level);
  return index < 0 ? 0 : index;
}

/**
 * Flight assist for Mission 01's first minutes.
 *
 * The complaint this answers is not that the ship flies badly — it flies like a
 * heavy vessel in vacuum, which is the point — but that a first-time pilot is
 * handed that model with no runway. So the assist meets them where they are and
 * then gets out of the way.
 *
 * Two properties matter:
 *
 *  - **It scales, never replaces.** Every field multiplies a value the orbital
 *    flight model already computes. There is no second physics path to drift out
 *    of sync with the real one, and `off` is the exact identity, so a pilot past
 *    the tutorial is provably flying stock.
 *  - **It decays on demonstrated skill, not on a timer.** The level is a pure
 *    function of how far the tutorial has got. You earn the full flight model by
 *    showing you can fly, and no clock hands it to you early or late.
 *
 * Like `ArkDepartureSequence`, this owns state only: no Three.js, no scene, no
 * input. `main.ts` reads `current` each frame and applies it. That is what keeps
 * the whole thing testable through the debug surface.
 */
export class Mission01FlightAssist {
  /** Where the assist is heading. Set by tutorial progress. */
  private target: Mission01AssistLevel = 'off';

  /** Where it is now. Blends toward `target` so changes are never a step. */
  private blended: Mission01AssistProfile = { ...mission01AssistProfiles.off };

  private blend = 1;

  private from: Mission01AssistProfile = { ...mission01AssistProfiles.off };

  private engaged = false;

  get level(): Mission01AssistLevel {
    return this.target;
  }

  /** True while the assist is doing anything at all. */
  get active(): boolean {
    return this.engaged && this.target !== 'off';
  }

  /** The live profile. Read every frame by the flight model. */
  get current(): Mission01AssistProfile {
    return this.blended;
  }

  /** Latched by `disengage`, so the assist can never come back mid-mission. */
  private hasDisengaged = false;

  /**
   * Engages the assist for M01. Called once the corridor is clear and the
   * tutorial begins — never before, so the docked prologue is untouched.
   *
   * This is the only entry point that may raise the level, and it refuses to
   * fire twice: everything after it can only reduce.
   */
  engage(level: Mission01AssistLevel): boolean {
    if (this.engaged || this.hasDisengaged) return false;
    this.engaged = true;
    this.blendTo(level);
    return true;
  }

  /**
   * Assist is monotonic downward: it can be reduced as the pilot improves but
   * never raised again. Being handed *more* help after demonstrating a manoeuvre
   * reads as the game taking the ship back.
   */
  setLevel(level: Mission01AssistLevel): boolean {
    if (!this.engaged || this.hasDisengaged) return false;
    if (levelRank(level) >= levelRank(this.target)) return false;
    this.blendTo(level);
    return true;
  }

  /**
   * Hands the full flight model back. Called when the tutorial completes, and
   * unconditionally for any save restored past M01's tutorial — the assist must
   * never leak into later missions.
   */
  disengage(): void {
    if (this.hasDisengaged) return;
    this.hasDisengaged = true;
    if (this.target === 'off') {
      this.engaged = false;
      return;
    }
    this.blendTo('off');
  }

  private blendTo(level: Mission01AssistLevel): void {
    this.from = { ...this.blended };
    this.target = level;
    this.blend = 0;
  }

  /** Blends toward the target profile. Cheap: six lerps, no allocation. */
  update(delta: number): void {
    if (this.blend >= 1) {
      if (this.target === 'off') this.engaged = false;
      return;
    }
    this.blend = Math.min(1, this.blend + Math.max(0, delta) / mission01TutorialTuning.assistBlendSeconds);
    const to = mission01AssistProfiles[this.target];
    const t = this.blend * this.blend * (3 - 2 * this.blend);
    this.blended.rotationDamping = lerp(this.from.rotationDamping, to.rotationDamping, t);
    this.blended.levelAssist = lerp(this.from.levelAssist, to.levelAssist, t);
    this.blended.rollClamp = lerp(this.from.rollClamp, to.rollClamp, t);
    this.blended.accelerationRamp = lerp(this.from.accelerationRamp, to.accelerationRamp, t);
    this.blended.brakeGain = lerp(this.from.brakeGain, to.brakeGain, t);
    this.blended.spoolDownGain = lerp(this.from.spoolDownGain, to.spoolDownGain, t);
    this.blended.releaseDamping = lerp(this.from.releaseDamping, to.releaseDamping, t);
    if (this.blend >= 1 && this.target === 'off') this.engaged = false;
  }

  snapshot(): Mission01AssistSnapshot {
    return { mission01AssistLevel: this.target, mission01AssistEngaged: this.engaged };
  }

  /**
   * Restores from a save.
   *
   * `tutorialActive` is the authority, not the stored level: a save written
   * mid-tutorial restores its assist, but a save from anywhere past it is forced
   * to the identity profile no matter what the file says. That is what stops a
   * stale or hand-edited save from carrying assist into Mission 05.
   */
  restore(snapshot: Partial<Mission01AssistSnapshot> | undefined, tutorialActive: boolean): void {
    if (!tutorialActive) {
      this.forceOff();
      return;
    }
    const level = snapshot?.mission01AssistLevel;
    this.target = level && LEVEL_ORDER.includes(level) ? level : 'off';
    this.engaged = snapshot?.mission01AssistEngaged ?? this.target !== 'off';
    this.hasDisengaged = !this.engaged;
    // Restore lands on the settled profile, never mid-blend.
    this.blended = { ...mission01AssistProfiles[this.target] };
    this.from = { ...this.blended };
    this.blend = 1;
  }

  /** Hard reset to the stock flight model. */
  forceOff(): void {
    this.target = 'off';
    this.engaged = false;
    this.hasDisengaged = true;
    this.blended = { ...mission01AssistProfiles.off };
    this.from = { ...this.blended };
    this.blend = 1;
  }

  /** New game. */
  reset(): void {
    this.target = 'off';
    this.engaged = false;
    this.hasDisengaged = false;
    this.blended = { ...mission01AssistProfiles.off };
    this.from = { ...this.blended };
    this.blend = 1;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
