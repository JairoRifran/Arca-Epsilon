import {
  auroraCrewDefinitions,
  mission12Steps,
  mission12Tuning,
  type Mission12StepDefinition,
  type Mission12StepId
} from '../assets/mission12Definitions';
import type { Mission11Snapshot } from './Mission11AuroraExpansion';

export type Mission12Snapshot = {
  mission12Started: boolean;
  mission12Step: Mission12StepId;
  auroraFirstCrewAuthorized: boolean;
  auroraLifeSupportHumanReady: boolean;
  auroraHabitationConfigured: boolean;
  auroraLandingZoneMarked: boolean;
  auroraCrewCapsuleLanded: boolean;
  auroraFirstCrewDisembarked: boolean;
  auroraHumanLoadCycleStarted: boolean;
  auroraHumanLoadProgress: number;
  auroraHumanLoadRecalibrated: boolean;
  auroraRecalibrationProgress: number;
  auroraInhabitedCoreStable: boolean;
  auroraFirstNightRecorded: boolean;
  mission12Completed: boolean;
  mission13Unlocked: boolean;
};

/** Live consumption readouts. Derived, never persisted, never lethal. */
export type AuroraHabitationLoad = {
  humanOxygenLoad: number;
  humanWaterLoad: number;
  humanEnergyLoad: number;
  habitationStability: number;
  crewSafetyStatus: 'nominal' | 'watch' | 'recalibrating';
};

/**
 * Mission 12 "Primeros Habitantes": the Aurora core stops being a machine
 * that works in a vacuum and becomes somewhere people sleep.
 *
 * The Ark authorises exactly three crew. Life support is brought up to crewed
 * capacity, bunks are configured, a landing pad is marked clear of the
 * cultivation bed, the microfilter and every protoflora colony, a capsule
 * descends, the crew disembarks, and then the first crewed life-support cycle
 * runs — during which real human consumption overshoots the simulation and
 * has to be recalibrated at Aurora-02 before the night cycle.
 *
 * The alert is tension, not failure: stability dips to a floor and recovers.
 * Nobody dies, there is no game over, and there is no colony-management sim
 * here — the load meters exist to make the point that the valley is measured,
 * not consumed. Completing it unlocks Mission 13 without starting it.
 */
export class Mission12FirstInhabitants {
  readonly missionId = 'mission-12-first-inhabitants';
  readonly missionName = 'Misión 12: Primeros Habitantes';

  readonly state: Mission12Snapshot = {
    mission12Started: false,
    mission12Step: 'inactive',
    auroraFirstCrewAuthorized: false,
    auroraLifeSupportHumanReady: false,
    auroraHabitationConfigured: false,
    auroraLandingZoneMarked: false,
    auroraCrewCapsuleLanded: false,
    auroraFirstCrewDisembarked: false,
    auroraHumanLoadCycleStarted: false,
    auroraHumanLoadProgress: 0,
    auroraHumanLoadRecalibrated: false,
    auroraRecalibrationProgress: 0,
    auroraInhabitedCoreStable: false,
    auroraFirstNightRecorded: false,
    mission12Completed: false,
    mission13Unlocked: false
  };

  /** Life-support capacity brought up before the crew arrives (0..100). */
  private lifeSupportProgress = 0;
  /** Seconds elapsed in the current first-night transition, or -1. */
  private firstNightElapsed = -1;

  get started(): boolean {
    return this.state.mission12Started;
  }

  get completed(): boolean {
    return this.state.mission12Completed;
  }

  get step(): Mission12StepId {
    return this.state.mission12Step;
  }

  get stepDefinition(): Mission12StepDefinition {
    return mission12Steps[this.step];
  }

  get lifeSupportPercent(): number {
    return this.lifeSupportProgress;
  }

  get firstNightPercent(): number {
    if (this.firstNightElapsed < 0) return this.state.auroraFirstNightRecorded ? 100 : 0;
    return Math.min(100, (this.firstNightElapsed / mission12Tuning.firstNightSeconds) * 100);
  }

  /** People actually on the ground right now. */
  get crewCount(): number {
    return this.state.auroraFirstCrewDisembarked ? auroraCrewDefinitions.length : 0;
  }

  get milestoneCount(): number {
    return [
      this.state.auroraFirstCrewAuthorized,
      this.state.auroraLifeSupportHumanReady,
      this.state.auroraHabitationConfigured,
      this.state.auroraLandingZoneMarked,
      this.state.auroraCrewCapsuleLanded,
      this.state.auroraFirstCrewDisembarked,
      this.state.auroraHumanLoadRecalibrated,
      this.state.auroraInhabitedCoreStable
    ].filter(Boolean).length;
  }

  /**
   * The consumption readout. Load rises as the cycle runs and stability sags
   * with it, bottoming out at the tuned floor during the alert and climbing
   * back as the pilot recalibrates. Purely derived from mission progress.
   */
  get load(): AuroraHabitationLoad {
    const crewed = this.crewCount > 0;
    const cycle = this.state.auroraHumanLoadProgress / 100;
    const recal = this.state.auroraRecalibrationProgress / 100;
    const settled = this.state.auroraHumanLoadRecalibrated;

    const oxygen = crewed ? 24 + cycle * 58 - (settled ? 18 : 0) : 0;
    const water = crewed ? 16 + cycle * 34 - (settled ? 9 : 0) : 0;
    const energy = crewed ? 28 + cycle * 46 - (settled ? 14 : 0) : 0;

    let stability = 100;
    if (this.step === 'startLoadCycle' || (crewed && cycle > 0 && !settled)) {
      // Sags as the real load lands, never below the tuned floor.
      stability = 100 - (100 - mission12Tuning.alertStabilityFloor) * cycle;
    } else if (this.step === 'recalibrate') {
      stability = mission12Tuning.alertStabilityFloor + (100 - mission12Tuning.alertStabilityFloor) * recal;
    }

    return {
      humanOxygenLoad: Math.max(0, Number(oxygen.toFixed(1))),
      humanWaterLoad: Math.max(0, Number(water.toFixed(1))),
      humanEnergyLoad: Math.max(0, Number(energy.toFixed(1))),
      habitationStability: Number(Math.max(0, Math.min(100, stability)).toFixed(1)),
      crewSafetyStatus:
        this.step === 'recalibrate' ? 'recalibrating' : stability < 92 ? 'watch' : 'nominal'
    };
  }

  canStart(mission11: Partial<Mission11Snapshot>): boolean {
    return Boolean(
      !this.started &&
        !this.completed &&
        mission11.mission11Completed &&
        mission11.auroraCoreOperational &&
        mission11.mission12Unlocked
    );
  }

  start(mission11: Partial<Mission11Snapshot>): boolean {
    if (!this.canStart(mission11)) return false;
    this.state.mission12Started = true;
    this.state.mission12Step = 'requestAuthorization';
    return true;
  }

  requestAuthorization(): boolean {
    if (this.step !== 'requestAuthorization') return false;
    this.state.auroraFirstCrewAuthorized = true;
    this.state.mission12Step = 'prepareLifeSupport';
    return true;
  }

  /** Life-support ramp; returns true on the frame it completes. */
  advanceLifeSupport(deltaSeconds: number): boolean {
    if (this.step !== 'prepareLifeSupport') return false;
    this.lifeSupportProgress = Math.min(
      100,
      this.lifeSupportProgress + (deltaSeconds / mission12Tuning.lifeSupportSeconds) * 100
    );
    if (this.lifeSupportProgress < 100) return false;
    this.state.auroraLifeSupportHumanReady = true;
    this.state.mission12Step = 'configureHabitation';
    return true;
  }

  configureHabitation(): boolean {
    if (this.step !== 'configureHabitation') return false;
    this.state.auroraHabitationConfigured = true;
    this.state.mission12Step = 'markLandingZone';
    return true;
  }

  markLandingZone(): boolean {
    if (this.step !== 'markLandingZone') return false;
    this.state.auroraLandingZoneMarked = true;
    this.state.mission12Step = 'guideCapsuleDescent';
    return true;
  }

  /** Driven by the capsule finishing its descent. */
  confirmCapsuleLanded(): boolean {
    if (this.step !== 'guideCapsuleDescent') return false;
    this.state.auroraCrewCapsuleLanded = true;
    this.state.mission12Step = 'confirmDisembark';
    return true;
  }

  disembarkCrew(): boolean {
    if (this.step !== 'confirmDisembark' || !this.state.auroraCrewCapsuleLanded) return false;
    this.state.auroraFirstCrewDisembarked = true;
    this.state.mission12Step = 'startLoadCycle';
    return true;
  }

  /** Kicks off the first crewed cycle; the progress runs in update. */
  beginLoadCycle(): boolean {
    if (this.step !== 'startLoadCycle' || this.state.auroraHumanLoadCycleStarted) return false;
    this.state.auroraHumanLoadCycleStarted = true;
    return true;
  }

  /** First crewed cycle; returns true on the frame the alert fires. */
  advanceLoadCycle(deltaSeconds: number): boolean {
    if (this.step !== 'startLoadCycle' || !this.state.auroraHumanLoadCycleStarted) return false;
    this.state.auroraHumanLoadProgress = Math.min(
      100,
      this.state.auroraHumanLoadProgress + (deltaSeconds / mission12Tuning.loadCycleSeconds) * 100
    );
    if (this.state.auroraHumanLoadProgress < 100) return false;
    // Consumption overshoots the simulation: tension, not catastrophe.
    this.state.mission12Step = 'recalibrate';
    return true;
  }

  /** Recalibration; returns true on the frame it completes. */
  advanceRecalibration(deltaSeconds: number): boolean {
    if (this.step !== 'recalibrate') return false;
    this.state.auroraRecalibrationProgress = Math.min(
      100,
      this.state.auroraRecalibrationProgress + (deltaSeconds / mission12Tuning.recalibrationSeconds) * 100
    );
    if (this.state.auroraRecalibrationProgress < 100) return false;
    this.state.auroraHumanLoadRecalibrated = true;
    this.state.mission12Step = 'verifyStability';
    return true;
  }

  verifyStability(): boolean {
    if (this.step !== 'verifyStability' || !this.state.auroraHumanLoadRecalibrated) return false;
    this.state.auroraInhabitedCoreStable = true;
    this.state.mission12Step = 'recordFirstNight';
    return true;
  }

  /** Starts the brief first-night transition; never seizes control. */
  beginFirstNight(): boolean {
    if (this.step !== 'recordFirstNight' || this.firstNightElapsed >= 0) return false;
    this.firstNightElapsed = 0;
    return true;
  }

  get firstNightRunning(): boolean {
    return this.firstNightElapsed >= 0 && !this.state.auroraFirstNightRecorded;
  }

  /** First-night transition; returns true on the frame it completes. */
  advanceFirstNight(deltaSeconds: number): boolean {
    if (this.step !== 'recordFirstNight' || this.firstNightElapsed < 0) return false;
    this.firstNightElapsed += deltaSeconds;
    if (this.firstNightElapsed < mission12Tuning.firstNightSeconds) return false;
    this.completeHabitation();
    return true;
  }

  private completeHabitation(): void {
    this.state.auroraFirstCrewAuthorized = true;
    this.state.auroraLifeSupportHumanReady = true;
    this.state.auroraHabitationConfigured = true;
    this.state.auroraLandingZoneMarked = true;
    this.state.auroraCrewCapsuleLanded = true;
    this.state.auroraFirstCrewDisembarked = true;
    this.state.auroraHumanLoadCycleStarted = true;
    this.state.auroraHumanLoadProgress = 100;
    this.state.auroraHumanLoadRecalibrated = true;
    this.state.auroraRecalibrationProgress = 100;
    this.state.auroraInhabitedCoreStable = true;
    this.state.auroraFirstNightRecorded = true;
    this.state.mission12Completed = true;
    this.state.mission13Unlocked = true;
    this.state.mission12Step = 'completed';
    this.lifeSupportProgress = 100;
  }

  forceAuthorized(): void {
    if (!this.started) return;
    this.state.auroraFirstCrewAuthorized = true;
    if (this.step === 'requestAuthorization') this.state.mission12Step = 'prepareLifeSupport';
  }

  forceLifeSupportReady(): void {
    if (!this.started) return;
    this.forceAuthorized();
    this.lifeSupportProgress = 100;
    this.state.auroraLifeSupportHumanReady = true;
    if (this.step === 'prepareLifeSupport') this.state.mission12Step = 'configureHabitation';
  }

  forceHabitationConfigured(): void {
    if (!this.started) return;
    this.forceLifeSupportReady();
    this.state.auroraHabitationConfigured = true;
    if (this.step === 'configureHabitation') this.state.mission12Step = 'markLandingZone';
  }

  forceLandingZoneMarked(): void {
    if (!this.started) return;
    this.forceHabitationConfigured();
    this.state.auroraLandingZoneMarked = true;
    if (this.step === 'markLandingZone') this.state.mission12Step = 'guideCapsuleDescent';
  }

  forceCapsuleLanded(): void {
    if (!this.started) return;
    this.forceLandingZoneMarked();
    this.state.auroraCrewCapsuleLanded = true;
    if (this.step === 'guideCapsuleDescent') this.state.mission12Step = 'confirmDisembark';
  }

  forceCrewDisembarked(): void {
    if (!this.started) return;
    this.forceCapsuleLanded();
    this.state.auroraFirstCrewDisembarked = true;
    if (this.step === 'confirmDisembark') this.state.mission12Step = 'startLoadCycle';
  }

  forceLoadCycleComplete(): void {
    if (!this.started) return;
    this.forceCrewDisembarked();
    this.state.auroraHumanLoadCycleStarted = true;
    this.state.auroraHumanLoadProgress = 100;
    if (this.step === 'startLoadCycle') this.state.mission12Step = 'recalibrate';
  }

  forceRecalibrated(): void {
    if (!this.started) return;
    this.forceLoadCycleComplete();
    this.state.auroraRecalibrationProgress = 100;
    this.state.auroraHumanLoadRecalibrated = true;
    if (this.step === 'recalibrate') this.state.mission12Step = 'verifyStability';
  }

  forceStabilityVerified(): void {
    if (!this.started) return;
    this.forceRecalibrated();
    this.state.auroraInhabitedCoreStable = true;
    if (this.step === 'verifyStability') this.state.mission12Step = 'recordFirstNight';
  }

  forceComplete(): void {
    if (!this.started) return;
    this.completeHabitation();
  }

  restore(savedState: Partial<Mission12Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission12Started) return;
    Object.assign(this.state, savedState);
    if (!mission12Steps[this.state.mission12Step]) this.state.mission12Step = 'requestAuthorization';
    this.state.auroraHumanLoadProgress = clampPercent(this.state.auroraHumanLoadProgress);
    this.state.auroraRecalibrationProgress = clampPercent(this.state.auroraRecalibrationProgress);
    this.state.mission13Unlocked = this.state.mission13Unlocked || this.state.mission12Completed;
    // Derived values are rebuilt from the restored flags, not persisted.
    this.lifeSupportProgress = this.state.auroraLifeSupportHumanReady ? 100 : 0;
    this.firstNightElapsed = this.state.auroraFirstNightRecorded ? mission12Tuning.firstNightSeconds : -1;
  }

  snapshot(): Mission12Snapshot {
    return { ...this.state };
  }

  reset(): void {
    Object.assign(this.state, {
      mission12Started: false,
      mission12Step: 'inactive' as Mission12StepId,
      auroraFirstCrewAuthorized: false,
      auroraLifeSupportHumanReady: false,
      auroraHabitationConfigured: false,
      auroraLandingZoneMarked: false,
      auroraCrewCapsuleLanded: false,
      auroraFirstCrewDisembarked: false,
      auroraHumanLoadCycleStarted: false,
      auroraHumanLoadProgress: 0,
      auroraHumanLoadRecalibrated: false,
      auroraRecalibrationProgress: 0,
      auroraInhabitedCoreStable: false,
      auroraFirstNightRecorded: false,
      mission12Completed: false,
      mission13Unlocked: false
    });
    this.lifeSupportProgress = 0;
    this.firstNightElapsed = -1;
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number(value) || 0));
}
