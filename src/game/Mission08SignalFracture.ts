import {
  mission08Steps,
  mission08Tuning,
  signalFractureFocusDefinitions,
  type Mission08StepDefinition,
  type Mission08StepId
} from '../assets/mission08Definitions';
import type { Mission07Snapshot } from './Mission07SubsurfaceEchoes';

export type Mission08Snapshot = {
  mission08Started: boolean;
  mission08Step: Mission08StepId;
  fractureTraceAnalyzed: boolean;
  signalFractureRevealed: boolean;
  fractureNodesStabilized: boolean[];
  signalPurgeProgress: number;
  signalFractureContained: boolean;
  coalitionTraceResidual: boolean;
  mission08Completed: boolean;
  mission09Unlocked: boolean;
};

/**
 * Mission 08 "La Primera Grieta": the Coalition's retreat left a scan trace
 * over E-01 that has torn open a signal fracture. The pilot travels to the
 * fracture, stabilizes its three foci, returns to Base Nereida and runs a
 * Signal Purge from the core. The purge partially closes the crack — Nereida
 * stays hidden, but a residual trace remains, unlocking Mission 09 without
 * starting it.
 */
export class Mission08SignalFracture {
  readonly missionId = 'mission-08-signal-fracture';
  readonly missionName = 'Misión 08: La Primera Grieta';

  readonly state: Mission08Snapshot = {
    mission08Started: false,
    mission08Step: 'inactive',
    fractureTraceAnalyzed: false,
    signalFractureRevealed: false,
    fractureNodesStabilized: [false, false, false],
    signalPurgeProgress: 0,
    signalFractureContained: false,
    coalitionTraceResidual: false,
    mission08Completed: false,
    mission09Unlocked: false
  };

  get started(): boolean {
    return this.state.mission08Started;
  }

  get completed(): boolean {
    return this.state.mission08Completed;
  }

  get step(): Mission08StepId {
    return this.state.mission08Step;
  }

  get stepDefinition(): Mission08StepDefinition {
    return mission08Steps[this.step];
  }

  /** 0/1/2 while a focus step is active, -1 otherwise. */
  get activeFocusIndex(): number {
    if (this.step === 'stabilizeNorth') return 0;
    if (this.step === 'stabilizeCentral') return 1;
    if (this.step === 'stabilizeSouth') return 2;
    return -1;
  }

  canStart(mission07: Partial<Mission07Snapshot>): boolean {
    return Boolean(
      !this.started &&
        !this.completed &&
        mission07.mission07Completed &&
        mission07.mission08Unlocked
    );
  }

  start(mission07: Partial<Mission07Snapshot>): boolean {
    if (!this.canStart(mission07)) return false;
    this.state.mission08Started = true;
    this.state.mission08Step = 'analyzeTrace';
    return true;
  }

  analyzeTrace(): boolean {
    if (this.step !== 'analyzeTrace') return false;
    this.state.fractureTraceAnalyzed = true;
    this.state.signalFractureRevealed = true;
    this.state.mission08Step = 'travelToFracture';
    return true;
  }

  reachFracture(): boolean {
    if (this.step !== 'travelToFracture') return false;
    this.state.mission08Step = 'stabilizeNorth';
    return true;
  }

  stabilizeFocus(index: number): boolean {
    if (index !== this.activeFocusIndex || this.state.fractureNodesStabilized[index]) return false;
    this.state.fractureNodesStabilized[index] = true;
    if (this.state.fractureNodesStabilized.every(Boolean)) {
      this.state.mission08Step = 'returnToBase';
    } else {
      this.state.mission08Step = index === 0 ? 'stabilizeCentral' : 'stabilizeSouth';
    }
    return true;
  }

  /** Begin the purge once, when the pilot is back at the base. */
  beginPurge(): boolean {
    if (this.step !== 'returnToBase' || !this.state.fractureNodesStabilized.every(Boolean)) return false;
    this.state.mission08Step = 'signalPurge';
    return true;
  }

  /** Accumulate purge progress while in range; degrade slowly when out. */
  updatePurge(delta: number, inRange: boolean): boolean {
    if (this.step !== 'signalPurge' || this.state.mission08Completed) return false;
    if (inRange) {
      this.state.signalPurgeProgress = Math.min(
        mission08Tuning.purgeSeconds,
        this.state.signalPurgeProgress + Math.max(0, delta)
      );
      if (this.state.signalPurgeProgress >= mission08Tuning.purgeSeconds) {
        this.containFracture();
        return true;
      }
    } else if (this.state.signalPurgeProgress > 0) {
      this.state.signalPurgeProgress = Math.max(0, this.state.signalPurgeProgress - Math.max(0, delta) * 0.6);
    }
    return false;
  }

  get purgeFraction(): number {
    return Math.min(1, this.state.signalPurgeProgress / mission08Tuning.purgeSeconds);
  }

  private containFracture(): void {
    this.state.signalPurgeProgress = mission08Tuning.purgeSeconds;
    this.state.signalFractureContained = true;
    this.state.coalitionTraceResidual = true;
    this.state.mission08Completed = true;
    this.state.mission09Unlocked = true;
    this.state.mission08Step = 'completed';
  }

  forceAllFociStabilized(): void {
    if (!this.started) return;
    this.state.fractureTraceAnalyzed = true;
    this.state.signalFractureRevealed = true;
    this.state.fractureNodesStabilized = signalFractureFocusDefinitions.map(() => true);
    this.state.mission08Step = 'returnToBase';
  }

  forcePurgeComplete(): void {
    if (!this.started) return;
    if (!this.state.fractureNodesStabilized.every(Boolean)) this.forceAllFociStabilized();
    this.containFracture();
  }

  restore(savedState: Partial<Mission08Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission08Started) return;
    Object.assign(this.state, savedState);
    if (!mission08Steps[this.state.mission08Step]) this.state.mission08Step = 'analyzeTrace';
    if (!this.state.fractureNodesStabilized || this.state.fractureNodesStabilized.length < signalFractureFocusDefinitions.length) {
      this.state.fractureNodesStabilized = signalFractureFocusDefinitions.map(
        (_, index) => Boolean(this.state.fractureNodesStabilized?.[index])
      );
    }
    this.state.mission09Unlocked = this.state.mission09Unlocked || this.state.mission08Completed;
  }

  snapshot(): Mission08Snapshot {
    return { ...this.state, fractureNodesStabilized: [...this.state.fractureNodesStabilized] };
  }

  reset(): void {
    Object.assign(this.state, {
      mission08Started: false,
      mission08Step: 'inactive' as Mission08StepId,
      fractureTraceAnalyzed: false,
      signalFractureRevealed: false,
      fractureNodesStabilized: [false, false, false],
      signalPurgeProgress: 0,
      signalFractureContained: false,
      coalitionTraceResidual: false,
      mission08Completed: false,
      mission09Unlocked: false
    });
  }
}
