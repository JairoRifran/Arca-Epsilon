import {
  mission13Steps,
  mission13Tuning,
  type Mission13StepDefinition,
  type Mission13StepId
} from '../assets/mission13Definitions';
import type { Mission12Snapshot } from './Mission12FirstInhabitants';

export type Mission13Snapshot = {
  mission13Started: boolean;
  mission13Step: Mission13StepId;
  auroraStormAlertAcknowledged: boolean;
  auroraGeneratorSecured: boolean;
  auroraGeneratorProgress: number;
  auroraAntennaAnchorsSecured: boolean[];
  auroraAntennaOnline: boolean;
  auroraShieldCharge: number;
  auroraShieldOnline: boolean;
  auroraStormPeakReached: boolean;
  mission13Completed: boolean;
  mission14Unlocked: boolean;
};

/** Live storm readouts. Derived every frame, never persisted. */
export type AuroraStormReadout = {
  /** 0 = clear sky, 1 = the front directly overhead. */
  stormIntensity: number;
  /** Power stability, 0..100. Sags with the storm until the generator holds. */
  energyStability: number;
  /** Shield charge, 0..100. */
  shieldCharge: number;
  /** HUD interference, 0..1. Drives the subtle readout glitch only. */
  interference: number;
  shieldStatus: 'offline' | 'charging' | 'holding';
};

const ANCHOR_COUNT = 2;

/**
 * Mission 13 "La Primera Tormenta": the night the colony stops being an
 * installation and becomes a place with people in it who depend on the pilot.
 *
 * An electromagnetic front builds over the Aurora valley hours after the first
 * crew lands. The pilot acknowledges the alert, stabilises the generator, guys
 * and reactivates the comms mast, then runs back to the habitat and holds the
 * emergency shield panel while the storm peaks. Straying from the panel bleeds
 * the charge back down — the only real pressure in the mission.
 *
 * Nobody dies and there is no failure state: the storm is weather, not a boss.
 * Completing it unlocks Mission 14 without starting it.
 */
export class Mission13FirstStorm {
  readonly missionId = 'mission-13-first-storm';
  readonly missionName = 'Misión 13: La Primera Tormenta';

  readonly state: Mission13Snapshot = {
    mission13Started: false,
    mission13Step: 'inactive',
    auroraStormAlertAcknowledged: false,
    auroraGeneratorSecured: false,
    auroraGeneratorProgress: 0,
    auroraAntennaAnchorsSecured: [false, false],
    auroraAntennaOnline: false,
    auroraShieldCharge: 0,
    auroraShieldOnline: false,
    auroraStormPeakReached: false,
    mission13Completed: false,
    mission14Unlocked: false
  };

  /** Seconds since the front was first detected; drives the storm ramp. */
  private stormElapsed = 0;
  /** Seconds of anchor work banked on the anchor currently being secured. */
  private anchorProgress = 0;
  /** Seconds spent in the subsiding phase. */
  private subsideElapsed = 0;

  get started(): boolean {
    return this.state.mission13Started;
  }

  get completed(): boolean {
    return this.state.mission13Completed;
  }

  get step(): Mission13StepId {
    return this.state.mission13Step;
  }

  get stepDefinition(): Mission13StepDefinition {
    return mission13Steps[this.step];
  }

  get anchorsSecuredCount(): number {
    return this.state.auroraAntennaAnchorsSecured.filter(Boolean).length;
  }

  get anchorPercent(): number {
    return Math.min(100, (this.anchorProgress / mission13Tuning.anchorSeconds) * 100);
  }

  /** Which anchor the current step is waiting on, or -1. */
  get activeAnchorIndex(): number {
    if (this.step === 'anchorAntennaFirst') return 0;
    if (this.step === 'anchorAntennaSecond') return 1;
    return -1;
  }

  get milestoneCount(): number {
    return [
      this.state.auroraStormAlertAcknowledged,
      this.state.auroraGeneratorSecured,
      this.state.auroraAntennaAnchorsSecured[0],
      this.state.auroraAntennaAnchorsSecured[1],
      this.state.auroraAntennaOnline,
      this.state.auroraShieldOnline
    ].filter(Boolean).length;
  }

  /**
   * The storm curve and everything read off it. Intensity ramps from the
   * alert to a sustained peak, then falls away once the shield is holding —
   * so the later objectives really are fought in worse weather.
   */
  get readout(): AuroraStormReadout {
    let intensity: number;
    if (this.state.mission13Completed) {
      intensity = 0;
    } else if (this.step === 'stormSubsiding') {
      const t = Math.min(1, this.subsideElapsed / mission13Tuning.subsideSeconds);
      intensity = 1 - t * t * (3 - 2 * t);
    } else if (!this.started) {
      intensity = 0;
    } else {
      const t = Math.min(1, this.stormElapsed / mission13Tuning.stormBuildSeconds);
      // Ease-in so the first minute feels like weather closing in, not a switch.
      intensity = t * t * (3 - 2 * t);
    }

    // Power sags with the storm until the generator is secured, then holds
    // most of its margin back.
    const generatorRelief = this.state.auroraGeneratorSecured ? 0.72 : 0;
    const energyStability = Math.max(
      12,
      100 - intensity * 62 * (1 - generatorRelief) - (this.state.auroraGeneratorSecured ? 0 : 8)
    );
    // Comms interference clears substantially once the mast is back up, and
    // the shield damps what is left.
    const antennaRelief = this.state.auroraAntennaOnline ? 0.55 : 0;
    const shieldRelief = this.state.auroraShieldOnline ? 0.6 : 0;
    const interference = Math.max(0, intensity * (1 - antennaRelief) * (1 - shieldRelief));

    return {
      stormIntensity: Number(intensity.toFixed(3)),
      energyStability: Number(energyStability.toFixed(1)),
      shieldCharge: Number(this.state.auroraShieldCharge.toFixed(1)),
      interference: Number(interference.toFixed(3)),
      shieldStatus: this.state.auroraShieldOnline
        ? 'holding'
        : this.state.auroraShieldCharge > 0
          ? 'charging'
          : 'offline'
    };
  }

  canStart(mission12: Partial<Mission12Snapshot>): boolean {
    return Boolean(
      !this.started &&
        !this.completed &&
        mission12.mission12Completed &&
        mission12.auroraFirstCrewDisembarked &&
        mission12.mission13Unlocked
    );
  }

  start(mission12: Partial<Mission12Snapshot>): boolean {
    if (!this.canStart(mission12)) return false;
    this.state.mission13Started = true;
    this.state.mission13Step = 'stormAlert';
    this.stormElapsed = 0;
    return true;
  }

  /** The storm front keeps building regardless of which phase is active. */
  advanceStorm(deltaSeconds: number): void {
    if (!this.started || this.completed) return;
    if (this.step === 'stormSubsiding') {
      this.subsideElapsed += deltaSeconds;
      return;
    }
    this.stormElapsed += deltaSeconds;
    if (!this.state.auroraStormPeakReached && this.stormElapsed >= mission13Tuning.stormBuildSeconds) {
      this.state.auroraStormPeakReached = true;
    }
  }

  acknowledgeAlert(): boolean {
    if (this.step !== 'stormAlert') return false;
    this.state.auroraStormAlertAcknowledged = true;
    this.state.mission13Step = 'secureGenerator';
    return true;
  }

  /** Generator repair; returns true on the frame it completes. */
  advanceGenerator(deltaSeconds: number): boolean {
    if (this.step !== 'secureGenerator') return false;
    this.state.auroraGeneratorProgress = Math.min(
      100,
      this.state.auroraGeneratorProgress + (deltaSeconds / mission13Tuning.generatorSeconds) * 100
    );
    if (this.state.auroraGeneratorProgress < 100) return false;
    this.state.auroraGeneratorSecured = true;
    this.state.mission13Step = 'anchorAntennaFirst';
    return true;
  }

  /** Anchor work; returns true on the frame the current anchor is secured. */
  advanceAnchor(deltaSeconds: number): boolean {
    const index = this.activeAnchorIndex;
    if (index < 0) return false;
    this.anchorProgress += deltaSeconds;
    if (this.anchorProgress < mission13Tuning.anchorSeconds) return false;
    this.anchorProgress = 0;
    this.state.auroraAntennaAnchorsSecured[index] = true;
    this.state.mission13Step = index === 0 ? 'anchorAntennaSecond' : 'activateAntenna';
    return true;
  }

  /** Loses banked anchor work when the pilot walks away mid-anchor. */
  resetAnchorProgress(): void {
    this.anchorProgress = 0;
  }

  activateAntenna(): boolean {
    if (this.step !== 'activateAntenna') return false;
    if (!this.state.auroraAntennaAnchorsSecured.every(Boolean)) return false;
    this.state.auroraAntennaOnline = true;
    this.state.mission13Step = 'returnToHabitat';
    return true;
  }

  /** Driven by the pilot arriving back at the habitat panel. */
  confirmReturn(): boolean {
    if (this.step !== 'returnToHabitat') return false;
    this.state.mission13Step = 'chargeShield';
    return true;
  }

  /**
   * Shield charge. Rises while the pilot holds station at the panel and
   * bleeds back down when they stray — the mission's one real pressure.
   * Returns true on the frame it reaches full charge.
   */
  advanceShield(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'chargeShield') return false;
    if (inRange) {
      this.state.auroraShieldCharge = Math.min(
        100,
        this.state.auroraShieldCharge + (deltaSeconds / mission13Tuning.shieldChargeSeconds) * 100
      );
    } else {
      this.state.auroraShieldCharge = Math.max(
        0,
        this.state.auroraShieldCharge - deltaSeconds * mission13Tuning.shieldDecayPerSecond
      );
      return false;
    }
    if (this.state.auroraShieldCharge < 100) return false;
    this.state.auroraShieldOnline = true;
    this.state.mission13Step = 'stormSubsiding';
    this.subsideElapsed = 0;
    return true;
  }

  /** Storm disperses; returns true on the frame the mission completes. */
  advanceSubside(deltaSeconds: number): boolean {
    if (this.step !== 'stormSubsiding') return false;
    this.subsideElapsed += deltaSeconds;
    if (this.subsideElapsed < mission13Tuning.subsideSeconds) return false;
    this.completeStorm();
    return true;
  }

  private completeStorm(): void {
    this.state.auroraStormAlertAcknowledged = true;
    this.state.auroraGeneratorSecured = true;
    this.state.auroraGeneratorProgress = 100;
    this.state.auroraAntennaAnchorsSecured = [true, true];
    this.state.auroraAntennaOnline = true;
    this.state.auroraShieldCharge = 100;
    this.state.auroraShieldOnline = true;
    this.state.auroraStormPeakReached = true;
    this.state.mission13Completed = true;
    this.state.mission14Unlocked = true;
    this.state.mission13Step = 'completed';
  }

  forceAlertAcknowledged(): void {
    if (!this.started) return;
    this.state.auroraStormAlertAcknowledged = true;
    if (this.step === 'stormAlert') this.state.mission13Step = 'secureGenerator';
  }

  forceGeneratorSecured(): void {
    if (!this.started) return;
    this.forceAlertAcknowledged();
    this.state.auroraGeneratorProgress = 100;
    this.state.auroraGeneratorSecured = true;
    if (this.step === 'secureGenerator') this.state.mission13Step = 'anchorAntennaFirst';
  }

  forceAntennaAnchored(): void {
    if (!this.started) return;
    this.forceGeneratorSecured();
    this.state.auroraAntennaAnchorsSecured = [true, true];
    this.anchorProgress = 0;
    if (this.step === 'anchorAntennaFirst' || this.step === 'anchorAntennaSecond') {
      this.state.mission13Step = 'activateAntenna';
    }
  }

  forceAntennaOnline(): void {
    if (!this.started) return;
    this.forceAntennaAnchored();
    this.state.auroraAntennaOnline = true;
    if (this.step === 'activateAntenna') this.state.mission13Step = 'returnToHabitat';
  }

  forceShieldOnline(): void {
    if (!this.started) return;
    this.forceAntennaOnline();
    this.state.auroraShieldCharge = 100;
    this.state.auroraShieldOnline = true;
    if (this.step === 'returnToHabitat' || this.step === 'chargeShield') {
      this.state.mission13Step = 'stormSubsiding';
      this.subsideElapsed = 0;
    }
  }

  forceComplete(): void {
    if (!this.started) return;
    this.completeStorm();
  }

  restore(savedState: Partial<Mission13Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission13Started) return;
    Object.assign(this.state, savedState);
    if (!mission13Steps[this.state.mission13Step]) this.state.mission13Step = 'stormAlert';
    this.state.auroraGeneratorProgress = clampPercent(this.state.auroraGeneratorProgress);
    this.state.auroraShieldCharge = clampPercent(this.state.auroraShieldCharge);
    // Anchors must always be a two-slot array even if an old save is short.
    const anchors = this.state.auroraAntennaAnchorsSecured;
    this.state.auroraAntennaAnchorsSecured = Array.from(
      { length: ANCHOR_COUNT },
      (_, i) => Boolean(Array.isArray(anchors) ? anchors[i] : false)
    );
    this.state.mission14Unlocked = this.state.mission14Unlocked || this.state.mission13Completed;
    // Reloading mid-interaction drops back to the last stable state: banked
    // anchor seconds and any partial shield charge are not persisted, so the
    // pilot resumes the phase cleanly instead of loading into a stuck frame.
    this.anchorProgress = 0;
    if (this.state.mission13Step === 'chargeShield') this.state.auroraShieldCharge = 0;
    // Rebuild the storm clock from how far the mission got, so a reload does
    // not restart the front from clear skies.
    this.stormElapsed = this.state.auroraStormPeakReached
      ? mission13Tuning.stormBuildSeconds
      : mission13Tuning.stormBuildSeconds * this.progressFraction();
    this.subsideElapsed = this.state.mission13Step === 'stormSubsiding' ? 0 : 0;
  }

  /** Rough phase progress, used to reseat the storm clock after a reload. */
  private progressFraction(): number {
    switch (this.state.mission13Step) {
      case 'stormAlert':
        return 0.05;
      case 'secureGenerator':
        return 0.2;
      case 'anchorAntennaFirst':
        return 0.4;
      case 'anchorAntennaSecond':
        return 0.55;
      case 'activateAntenna':
        return 0.68;
      case 'returnToHabitat':
        return 0.8;
      case 'chargeShield':
        return 0.92;
      default:
        return 1;
    }
  }

  snapshot(): Mission13Snapshot {
    return { ...this.state, auroraAntennaAnchorsSecured: [...this.state.auroraAntennaAnchorsSecured] };
  }

  reset(): void {
    Object.assign(this.state, {
      mission13Started: false,
      mission13Step: 'inactive' as Mission13StepId,
      auroraStormAlertAcknowledged: false,
      auroraGeneratorSecured: false,
      auroraGeneratorProgress: 0,
      auroraAntennaAnchorsSecured: [false, false],
      auroraAntennaOnline: false,
      auroraShieldCharge: 0,
      auroraShieldOnline: false,
      auroraStormPeakReached: false,
      mission13Completed: false,
      mission14Unlocked: false
    });
    this.stormElapsed = 0;
    this.anchorProgress = 0;
    this.subsideElapsed = 0;
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number(value) || 0));
}
