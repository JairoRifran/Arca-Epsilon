import {
  cloakingProjectorPositions,
  mission06Steps,
  mission06Tuning,
  type Mission06StepDefinition,
  type Mission06StepId
} from '../assets/mission06Definitions';
import type { Mission05Snapshot } from './Mission05ShadowInOrbit';

export type Mission06Snapshot = {
  mission06Started: boolean;
  mission06Step: Mission06StepId;
  interferenceResidueAnalyzed: boolean;
  cloakingMatrixCalibrated: boolean;
  cloakingProjectorsPlaced: boolean[];
  cloakingProjectorsCalibrated: boolean[];
  cloakingSyncProgress: number;
  cloakingFieldOnline: boolean;
  nereidaSignatureReduced: boolean;
  mission06Completed: boolean;
  mission07Unlocked: boolean;
};

export class Mission06NereidaShield {
  readonly missionId = 'mission-06-nereida-shield';
  readonly missionName = 'Misión 06: Blindaje de Nereida';

  readonly state: Mission06Snapshot = {
    mission06Started: false,
    mission06Step: 'inactive',
    interferenceResidueAnalyzed: false,
    cloakingMatrixCalibrated: false,
    cloakingProjectorsPlaced: [false, false, false],
    cloakingProjectorsCalibrated: [false, false, false],
    cloakingSyncProgress: 0,
    cloakingFieldOnline: false,
    nereidaSignatureReduced: false,
    mission06Completed: false,
    mission07Unlocked: false
  };

  get started(): boolean {
    return this.state.mission06Started;
  }

  get completed(): boolean {
    return this.state.mission06Completed;
  }

  get step(): Mission06StepId {
    return this.state.mission06Step;
  }

  get stepDefinition(): Mission06StepDefinition {
    return mission06Steps[this.state.mission06Step];
  }

  checkStartCondition(mission05: Mission05Snapshot): boolean {
    if (this.state.mission06Started || this.state.mission06Completed) return false;
    if (mission05.mission06Unlocked && mission05.probeRetreated && mission05.firstHostileContactConfirmed) {
      this.state.mission06Started = true;
      this.setStep('returnToBase');
      return true;
    }
    return false;
  }

  /** Arrival at Base Nereida moves the mission to the console analysis. */
  reachBase(): boolean {
    if (this.step !== 'returnToBase') return false;
    this.setStep('analyzeResidue');
    return true;
  }

  /** Debug: jump straight to the synchronization step. */
  forceProjectorsPlaced(): void {
    if (!this.started) return;
    this.state.interferenceResidueAnalyzed = true;
    this.state.cloakingMatrixCalibrated = true;
    this.state.cloakingProjectorsPlaced = [true, true, true];
    this.state.cloakingProjectorsCalibrated = [true, true, true];
    this.setStep('syncMatrix');
  }

  /** Debug: finish the synchronization and bring the field online. */
  forceSyncComplete(): void {
    if (!this.started) return;
    if (!this.state.cloakingProjectorsCalibrated.every(Boolean)) this.forceProjectorsPlaced();
    this.state.cloakingSyncProgress = mission06Tuning.syncSeconds;
    this.completeMission();
  }

  analyzeResidues(): boolean {
    if (this.step === 'analyzeResidue') {
      this.state.interferenceResidueAnalyzed = true;
      this.setStep('calibrateMatrix');
      return true;
    }
    return false;
  }

  calibrateMatrix(): boolean {
    if (this.step === 'calibrateMatrix') {
      this.state.cloakingMatrixCalibrated = true;
      this.setStep('deployNorth');
      return true;
    }
    return false;
  }

  deployProjector(index: number): boolean {
    if (this.state.cloakingProjectorsCalibrated[index]) return false;

    // Must follow sequence
    if (index === 0 && this.step !== 'deployNorth') return false;
    if (index === 1 && this.step !== 'deployEast') return false;
    if (index === 2 && this.step !== 'deploySouth') return false;

    this.state.cloakingProjectorsPlaced[index] = true;
    this.state.cloakingProjectorsCalibrated[index] = true;

    if (index === 0) this.setStep('deployEast');
    else if (index === 1) this.setStep('deploySouth');
    else if (index === 2) this.setStep('syncMatrix');

    return true;
  }

  updateSync(delta: number, isSyncing: boolean): boolean {
    if (this.step !== 'syncMatrix') return false;

    if (isSyncing) {
      this.state.cloakingSyncProgress += delta;
      if (this.state.cloakingSyncProgress >= mission06Tuning.syncSeconds) {
        this.completeMission();
        return true;
      }
    } else if (this.state.cloakingSyncProgress > 0) {
      this.state.cloakingSyncProgress = Math.max(0, this.state.cloakingSyncProgress - delta * 2);
    }
    return false;
  }

  private completeMission(): void {
    this.state.cloakingFieldOnline = true;
    this.state.nereidaSignatureReduced = true;
    this.state.mission06Completed = true;
    this.state.mission07Unlocked = true;
    this.setStep('completed');
  }

  restore(savedState: Partial<Mission06Snapshot>): void {
    if (!savedState) return;
    Object.assign(this.state, savedState);

    // Ensure array structure is preserved even if partially undefined in old saves
    if (!this.state.cloakingProjectorsPlaced || this.state.cloakingProjectorsPlaced.length < 3) {
      this.state.cloakingProjectorsPlaced = [false, false, false];
    }
    if (!this.state.cloakingProjectorsCalibrated || this.state.cloakingProjectorsCalibrated.length < 3) {
      this.state.cloakingProjectorsCalibrated = [false, false, false];
    }
    if (
      this.state.mission06Started &&
      this.state.interferenceResidueAnalyzed &&
      this.state.mission06Step !== 'calibrateMatrix' &&
      this.state.mission06Step !== 'analyzeResidue'
    ) {
      this.state.cloakingMatrixCalibrated = true;
    }
  }

  snapshot(): Partial<Mission06Snapshot> {
    return { ...this.state };
  }

  private setStep(step: Mission06StepId): void {
    this.state.mission06Step = step;
  }

  reset(): void {
    this.state.mission06Started = false;
    this.state.mission06Step = 'inactive';
    this.state.interferenceResidueAnalyzed = false;
    this.state.cloakingMatrixCalibrated = false;
    this.state.cloakingProjectorsPlaced = [false, false, false];
    this.state.cloakingProjectorsCalibrated = [false, false, false];
    this.state.cloakingSyncProgress = 0;
    this.state.cloakingFieldOnline = false;
    this.state.nereidaSignatureReduced = false;
    this.state.mission06Completed = false;
    this.state.mission07Unlocked = false;
  }
}
