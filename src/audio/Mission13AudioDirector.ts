import type { SFXManager } from './SFXManager';
import type { SfxCue } from './audioDefinitions';
import type { Mission13StepId } from '../assets/mission13Definitions';

/** Everything the director needs to decide what the storm should sound like. */
export type Mission13AudioInput = {
  active: boolean;
  step: Mission13StepId;
  /** 0..1 front strength, straight off the mission readout. */
  stormIntensity: number;
  /** True while the pilot is in range and actually working a station. */
  working: boolean;
  /** True while the shield is charging and the pilot is holding station. */
  shieldHolding: boolean;
  /** True while shield charge is bleeding away out of range. */
  shieldLosing: boolean;
  shieldOnline: boolean;
  /** Comms on screen: everything ducks so the words read. */
  dialogueActive: boolean;
  elapsed: number;
};

/** A visible discharge, handed over by AuroraStormEffect.consumeStrike(). */
export type Mission13Strike = { near: boolean; strength: number };

/** Mix is re-evaluated at this rate; between ticks nothing is written. */
const MIX_HZ = 10;
/** Minimum gap between discharge samples so strikes never pile up. */
const DISCHARGE_MIN_GAP = 1.7;
/** Minimum gap between shield impact samples. */
const IMPACT_MIN_GAP = 2.4;
/** Minimum gap between generator spark one-shots. */
const SPARK_MIN_GAP = 0.9;
/** Minimum gap between shield "losing charge" warnings. */
const WARNING_MIN_GAP = 3.5;

/** Every loop this director owns, so it can guarantee a clean shutdown. */
const OWNED_LOOPS: SfxCue[] = [
  'stormWindDistant',
  'stormWindHeavy',
  'stormEmHum',
  'stormHabitatAlarm',
  'stormDebris',
  'stormGeneratorRepair',
  'stormAntennaServo',
  'stormShieldCharge'
];

/** Steps where the habitat alarm is justified. */
const CRITICAL_STEPS: ReadonlySet<Mission13StepId> = new Set<Mission13StepId>([
  'returnToHabitat',
  'chargeShield'
]);

/**
 * The Mission 13 soundscape.
 *
 * Owns only the storm's own layers — the score itself stays with MusicManager,
 * which already crossfades between beds and ducks for dialogue, so there is no
 * second mixer here. This class decides which ambience loops should be running,
 * at what level, and fires the one-shots that belong to player actions and to
 * discharges the player can actually see.
 *
 * Design rules it holds to:
 *  - loops are started once and retuned, never restarted per frame;
 *  - a loop that would be inaudible is stopped instead of left running silent;
 *  - the mix is recomputed at 10 Hz, and SFXManager skips sub-threshold writes;
 *  - every one-shot has a minimum gap, so nothing machine-guns;
 *  - discharges are driven by the visual effect, never by an independent timer;
 *  - `stop()` releases every loop it owns, so loading a save or leaving the
 *    mission can never leave the storm playing underneath.
 */
export class Mission13AudioDirector {
  private readonly sfx: SFXManager;
  private mixAccumulator = 0;
  private running = false;
  private lastDischargeAt = -Infinity;
  private lastImpactAt = -Infinity;
  private lastSparkAt = -Infinity;
  private lastWarningAt = -Infinity;
  private sparkToggle = false;
  private dischargeToggle = false;
  private impactToggle = false;
  /** Phases whose completion stinger has already been consumed. */
  private readonly announcedSteps = new Set<Mission13StepId>();

  constructor(sfx: SFXManager) {
    this.sfx = sfx;
  }

  /**
   * Re-seat the director after a save is loaded: the phases already completed
   * are marked as announced so their stingers never replay, and any loop left
   * over from the previous session is released.
   */
  restore(step: Mission13StepId, completed: boolean): void {
    this.stop();
    this.announcedSteps.clear();
    // Everything up to the restored step is history and must stay silent.
    const order: Mission13StepId[] = [
      'stormAlert',
      'secureGenerator',
      'anchorAntennaFirst',
      'anchorAntennaSecond',
      'activateAntenna',
      'returnToHabitat',
      'chargeShield',
      'stormSubsiding'
    ];
    const reached = completed ? order.length : order.indexOf(step);
    for (let i = 0; i < reached; i += 1) this.announcedSteps.add(order[i]);
    if (completed) this.announcedSteps.add('completed');
  }

  /** Fire the objective stinger for a phase exactly once. */
  announceObjective(step: Mission13StepId): void {
    if (this.announcedSteps.has(step)) return;
    this.announcedSteps.add(step);
    void this.sfx.play('stormObjectiveComplete', 0.5);
  }

  /** Mission close. Deliberately separate so the two never overlap. */
  announceMissionComplete(): void {
    if (this.announcedSteps.has('completed')) return;
    this.announcedSteps.add('completed');
    void this.sfx.play('stormMissionComplete', 0.7);
  }

  playGeneratorStabilized(): void {
    void this.sfx.play('stormGeneratorStabilized', 0.62);
  }

  playAnchorLock(index: number): void {
    void this.sfx.play(index === 0 ? 'stormAnchorLockA' : 'stormAnchorLockB', 0.6);
  }

  playAntennaOnline(): void {
    void this.sfx.play('stormAntennaOnline', 0.62);
  }

  playShieldActivated(): void {
    void this.sfx.play('stormShieldActivated', 0.7);
  }

  /**
   * A discharge the player can see. Near strikes get the close samples and a
   * louder level; distant ones stay in the background. The minimum gap keeps
   * a dense cluster of flashes from stacking into noise.
   */
  reportStrike(strike: Mission13Strike, elapsed: number, intensity: number): void {
    if (!this.running) return;
    if (elapsed - this.lastDischargeAt < DISCHARGE_MIN_GAP) return;
    this.lastDischargeAt = elapsed;
    this.dischargeToggle = !this.dischargeToggle;
    const cue: SfxCue = strike.near
      ? this.dischargeToggle
        ? 'stormDischargeNearA'
        : 'stormDischargeNearB'
      : this.dischargeToggle
        ? 'stormDischargeFarA'
        : 'stormDischargeFarB';
    const volume = (strike.near ? 0.5 : 0.3) * (0.55 + intensity * 0.45);
    void this.sfx.play(cue, volume);
  }

  /**
   * A discharge that lands on a raised shield: the dome takes the hit. Only
   * fired when the shield is actually up and a strike was actually visible.
   */
  reportShieldImpact(elapsed: number, intensity: number): void {
    if (!this.running) return;
    if (elapsed - this.lastImpactAt < IMPACT_MIN_GAP) return;
    this.lastImpactAt = elapsed;
    this.impactToggle = !this.impactToggle;
    void this.sfx.play(this.impactToggle ? 'stormShieldImpactA' : 'stormShieldImpactB', 0.4 + intensity * 0.2);
  }

  update(input: Mission13AudioInput, delta: number): void {
    if (!input.active) {
      if (this.running) this.stop();
      return;
    }
    this.running = true;

    // --- One-shots that need their own cadence, checked every frame so they
    // stay responsive, but each rate-limited by its own gap.
    if (input.working && input.step === 'secureGenerator') {
      if (input.elapsed - this.lastSparkAt >= SPARK_MIN_GAP) {
        this.lastSparkAt = input.elapsed;
        // Alternating variants rather than Math.random, so the pattern is
        // deterministic and never repeats the same sample back to back.
        this.sparkToggle = !this.sparkToggle;
        void this.sfx.play(this.sparkToggle ? 'stormGeneratorSparksA' : 'stormGeneratorSparksB', 0.45);
      }
    }
    if (input.shieldLosing && input.elapsed - this.lastWarningAt >= WARNING_MIN_GAP) {
      this.lastWarningAt = input.elapsed;
      void this.sfx.play('stormShieldWarning', 0.55);
    }

    // --- The layered mix, recomputed at MIX_HZ.
    this.mixAccumulator += delta;
    if (this.mixAccumulator < 1 / MIX_HZ) return;
    this.mixAccumulator = 0;
    this.applyMix(input);
  }

  /**
   * The ambience bed. Levels are deliberately low and overlapping: five loud
   * loops at once would be mud, so each one only occupies the band where it
   * belongs and fades out entirely when it stops earning its place.
   */
  private applyMix(input: Mission13AudioInput): void {
    const storm = input.stormIntensity;
    // Comms take priority: everything ambient steps back while a line plays.
    const duck = input.dialogueActive ? 0.45 : 1;
    // The shield damps the weather from inside the dome.
    const sheltered = input.shieldOnline ? 0.55 : 1;

    // Distant wind: the bed that is always there, loudest before the front
    // properly arrives and thinning out as the heavy wind takes over.
    this.mixLoop('stormWindDistant', (0.3 - storm * 0.12) * duck, storm >= 0);
    // Heavy wind: rises with the front, the main body of the storm.
    this.mixLoop('stormWindHeavy', storm * 0.42 * duck * sheltered, storm > 0.18);
    // Electromagnetic hum: peaks with the front and drops on dispersal.
    this.mixLoop('stormEmHum', Math.max(0, storm - 0.15) * 0.34 * duck, storm > 0.22);
    // Debris: only in the worst of it, and kept moderate.
    this.mixLoop('stormDebris', Math.max(0, storm - 0.45) * 0.3 * duck * sheltered, storm > 0.5);
    // Habitat alarm: only during the critical phases, and never once the
    // shield is up — the emergency is over at that point.
    const alarmActive = CRITICAL_STEPS.has(input.step) && !input.shieldOnline && storm > 0.35;
    this.mixLoop('stormHabitatAlarm', 0.22 * duck, alarmActive);

    // --- Interaction loops, tied strictly to what the pilot is doing.
    this.mixLoop('stormGeneratorRepair', 0.4 * duck, input.working && input.step === 'secureGenerator');
    const anchoring =
      input.working && (input.step === 'anchorAntennaFirst' || input.step === 'anchorAntennaSecond');
    this.mixLoop('stormAntennaServo', 0.38 * duck, anchoring || input.step === 'activateAntenna');
    this.mixLoop('stormShieldCharge', 0.42 * duck, input.shieldHolding);
  }

  /**
   * Start, retune or stop one loop. A loop whose target level has fallen
   * below audibility is stopped rather than left running at zero.
   */
  private mixLoop(cue: SfxCue, volume: number, wanted: boolean): void {
    const level = Math.max(0, Math.min(1, volume));
    const shouldRun = wanted && level > 0.02;
    const active = this.sfx.isLoopActive(cue);
    if (shouldRun && !active) {
      void this.sfx.startLoop(cue, level, 0.6);
    } else if (shouldRun) {
      this.sfx.setLoopVolume(cue, level);
    } else if (active) {
      this.sfx.stopLoop(cue, 0.7);
    }
  }

  /** Release every loop this director owns. Safe to call repeatedly. */
  stop(): void {
    for (const cue of OWNED_LOOPS) this.sfx.stopLoop(cue, 0.5);
    this.running = false;
    this.mixAccumulator = 0;
    this.lastDischargeAt = -Infinity;
    this.lastImpactAt = -Infinity;
    this.lastSparkAt = -Infinity;
    this.lastWarningAt = -Infinity;
  }
}
