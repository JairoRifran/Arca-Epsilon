import {
  mission10Steps,
  mission10Tuning,
  type Mission10StepDefinition,
  type Mission10StepId
} from '../assets/mission10Definitions';
import type { Mission09Snapshot } from './Mission09AuroraExpedition';

export type Mission10Snapshot = {
  mission10Started: boolean;
  mission10Step: Mission10StepId;
  auroraInitialSurveyComplete: boolean;
  auroraWaterAnalyzed: boolean;
  auroraSoilAnalyzed: boolean;
  auroraAtmosphereAnalyzed: boolean;
  auroraBioSafetyChecked: boolean;
  auroraSettlementSiteMarked: boolean;
  auroraModuleDeployed: boolean;
  auroraModuleOperational: boolean;
  auroraStabilizationProgress: number;
  mission10Completed: boolean;
  mission11Unlocked: boolean;
};

/**
 * Mission 10 "Primer Módulo Aurora": the valley found in M09 is measured
 * before it is used. A survey from the ship, then four on-foot readings —
 * water, soil, atmosphere, biosafety — then the pilot marks the clearing,
 * deploys a single small habitat module and stabilizes its life support.
 *
 * Deliberately not a colony: one module, minimum power, and a mission that
 * ends with a foothold rather than a settlement. Completing it unlocks
 * Mission 11 without starting it.
 */
export class Mission10AuroraFoothold {
  readonly missionId = 'mission-10-aurora-foothold';
  readonly missionName = 'Misión 10: Primer Módulo Aurora';

  readonly state: Mission10Snapshot = {
    mission10Started: false,
    mission10Step: 'inactive',
    auroraInitialSurveyComplete: false,
    auroraWaterAnalyzed: false,
    auroraSoilAnalyzed: false,
    auroraAtmosphereAnalyzed: false,
    auroraBioSafetyChecked: false,
    auroraSettlementSiteMarked: false,
    auroraModuleDeployed: false,
    auroraModuleOperational: false,
    auroraStabilizationProgress: 0,
    mission10Completed: false,
    mission11Unlocked: false
  };

  get started(): boolean {
    return this.state.mission10Started;
  }

  get completed(): boolean {
    return this.state.mission10Completed;
  }

  get step(): Mission10StepId {
    return this.state.mission10Step;
  }

  get stepDefinition(): Mission10StepDefinition {
    return mission10Steps[this.step];
  }

  get analyzedSampleCount(): number {
    return [
      this.state.auroraWaterAnalyzed,
      this.state.auroraSoilAnalyzed,
      this.state.auroraAtmosphereAnalyzed,
      this.state.auroraBioSafetyChecked
    ].filter(Boolean).length;
  }

  /** The sample the current step is waiting on, or undefined. */
  get activeSampleKind(): 'water' | 'soil' | 'atmosphere' | 'biosafety' | undefined {
    if (this.step === 'scanWater') return 'water';
    if (this.step === 'scanSoil') return 'soil';
    if (this.step === 'scanAtmosphere') return 'atmosphere';
    if (this.step === 'scanBiosafety') return 'biosafety';
    return undefined;
  }

  canStart(mission09: Partial<Mission09Snapshot>): boolean {
    return Boolean(
      !this.started &&
        !this.completed &&
        mission09.mission09Completed &&
        mission09.auroraSectorDiscovered &&
        mission09.mission10Unlocked
    );
  }

  start(mission09: Partial<Mission09Snapshot>): boolean {
    if (!this.canStart(mission09)) return false;
    this.state.mission10Started = true;
    this.state.mission10Step = 'initialSurvey';
    return true;
  }

  completeInitialSurvey(): boolean {
    if (this.step !== 'initialSurvey') return false;
    this.state.auroraInitialSurveyComplete = true;
    this.state.mission10Step = 'descendToClearing';
    return true;
  }

  /** Driven by the player leaving the ship inside the valley clearing. */
  confirmDescent(): boolean {
    if (this.step !== 'descendToClearing') return false;
    this.state.mission10Step = 'scanWater';
    return true;
  }

  analyzeSample(kind: 'water' | 'soil' | 'atmosphere' | 'biosafety'): boolean {
    if (this.activeSampleKind !== kind) return false;
    if (kind === 'water') {
      this.state.auroraWaterAnalyzed = true;
      this.state.mission10Step = 'scanSoil';
    } else if (kind === 'soil') {
      this.state.auroraSoilAnalyzed = true;
      this.state.mission10Step = 'scanAtmosphere';
    } else if (kind === 'atmosphere') {
      this.state.auroraAtmosphereAnalyzed = true;
      this.state.mission10Step = 'scanBiosafety';
    } else {
      this.state.auroraBioSafetyChecked = true;
      this.state.mission10Step = 'returnToClearing';
    }
    return true;
  }

  /** Driven by the player standing in the clearing after the four readings. */
  confirmReturnToClearing(): boolean {
    if (this.step !== 'returnToClearing') return false;
    this.state.mission10Step = 'markSite';
    return true;
  }

  markSettlementSite(): boolean {
    if (this.step !== 'markSite') return false;
    this.state.auroraSettlementSiteMarked = true;
    this.state.mission10Step = 'deployModule';
    return true;
  }

  deployModule(): boolean {
    if (this.step !== 'deployModule' || !this.state.auroraSettlementSiteMarked) return false;
    this.state.auroraModuleDeployed = true;
    this.state.mission10Step = 'stabilizeModule';
    return true;
  }

  /** Life-support stabilization; returns true on the frame it completes. */
  advanceStabilization(deltaSeconds: number): boolean {
    if (this.step !== 'stabilizeModule') return false;
    const gain = (deltaSeconds / mission10Tuning.stabilizationSeconds) * 100;
    this.state.auroraStabilizationProgress = Math.min(100, this.state.auroraStabilizationProgress + gain);
    if (this.state.auroraStabilizationProgress < 100) return false;
    this.completeFoothold();
    return true;
  }

  private completeFoothold(): void {
    this.state.auroraStabilizationProgress = 100;
    this.state.auroraModuleOperational = true;
    this.state.mission10Completed = true;
    this.state.mission11Unlocked = true;
    this.state.mission10Step = 'completed';
  }

  forceAllSamplesAnalyzed(): void {
    if (!this.started) return;
    this.state.auroraInitialSurveyComplete = true;
    this.state.auroraWaterAnalyzed = true;
    this.state.auroraSoilAnalyzed = true;
    this.state.auroraAtmosphereAnalyzed = true;
    this.state.auroraBioSafetyChecked = true;
    if (
      this.step === 'initialSurvey' ||
      this.step === 'descendToClearing' ||
      this.activeSampleKind !== undefined
    ) {
      this.state.mission10Step = 'returnToClearing';
    }
  }

  forceSiteMarked(): void {
    if (!this.started) return;
    this.forceAllSamplesAnalyzed();
    this.state.auroraSettlementSiteMarked = true;
    if (this.step === 'returnToClearing' || this.step === 'markSite') {
      this.state.mission10Step = 'deployModule';
    }
  }

  forceModuleDeployed(): void {
    if (!this.started) return;
    this.forceSiteMarked();
    this.state.auroraModuleDeployed = true;
    if (this.step === 'deployModule') this.state.mission10Step = 'stabilizeModule';
  }

  forceComplete(): void {
    if (!this.started) return;
    this.forceModuleDeployed();
    this.completeFoothold();
  }

  restore(savedState: Partial<Mission10Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission10Started) return;
    Object.assign(this.state, savedState);
    if (!mission10Steps[this.state.mission10Step]) this.state.mission10Step = 'initialSurvey';
    this.state.auroraStabilizationProgress = Math.min(
      100,
      Math.max(0, Number(this.state.auroraStabilizationProgress) || 0)
    );
    this.state.mission11Unlocked = this.state.mission11Unlocked || this.state.mission10Completed;
  }

  snapshot(): Mission10Snapshot {
    return { ...this.state };
  }

  reset(): void {
    Object.assign(this.state, {
      mission10Started: false,
      mission10Step: 'inactive' as Mission10StepId,
      auroraInitialSurveyComplete: false,
      auroraWaterAnalyzed: false,
      auroraSoilAnalyzed: false,
      auroraAtmosphereAnalyzed: false,
      auroraBioSafetyChecked: false,
      auroraSettlementSiteMarked: false,
      auroraModuleDeployed: false,
      auroraModuleOperational: false,
      auroraStabilizationProgress: 0,
      mission10Completed: false,
      mission11Unlocked: false
    });
  }
}
