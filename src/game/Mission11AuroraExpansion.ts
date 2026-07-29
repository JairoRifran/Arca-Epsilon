import {
  mission11Steps,
  mission11Tuning,
  type Mission11StepDefinition,
  type Mission11StepId
} from '../assets/mission11Definitions';
import type { Mission10Snapshot } from './Mission10AuroraFoothold';

export type Mission11Snapshot = {
  mission11Started: boolean;
  mission11Step: Mission11StepId;
  auroraCoreDiagnosticComplete: boolean;
  auroraSecondModuleSiteMarked: boolean;
  auroraSecondModuleDeployed: boolean;
  auroraEnergyLinkOnline: boolean;
  auroraEnergyLinkProgress: number;
  auroraWaterFilterInstalled: boolean;
  auroraWaterFlowCalibrated: boolean;
  auroraWaterFlowProgress: number;
  auroraCultivationBedPrepared: boolean;
  auroraBioTrialStarted: boolean;
  auroraImpactAssessmentComplete: boolean;
  auroraImpactAssessmentProgress: number;
  auroraCoreOperational: boolean;
  mission11Completed: boolean;
  mission12Unlocked: boolean;
};

/**
 * Mission 11 "Expansión Aurora": Aurora-01 stops being a lone shelter.
 *
 * A diagnostic of the existing module, a second module sited and deployed
 * inside the clearing, an energy conduit between the two, a microfilter on
 * the shore with its flow calibrated, one experimental cultivation bed with
 * a bio-trial started, and finally an environmental impact assessment that
 * has to pass before the Aurora Core is declared operational.
 *
 * Still not a colony: two modules, one filter, one bed. The mission is about
 * settling carefully, and the impact assessment is the step that says so.
 * Completing it unlocks Mission 12 without starting it.
 */
export class Mission11AuroraExpansion {
  readonly missionId = 'mission-11-aurora-expansion';
  readonly missionName = 'Misión 11: Expansión Aurora';

  readonly state: Mission11Snapshot = {
    mission11Started: false,
    mission11Step: 'inactive',
    auroraCoreDiagnosticComplete: false,
    auroraSecondModuleSiteMarked: false,
    auroraSecondModuleDeployed: false,
    auroraEnergyLinkOnline: false,
    auroraEnergyLinkProgress: 0,
    auroraWaterFilterInstalled: false,
    auroraWaterFlowCalibrated: false,
    auroraWaterFlowProgress: 0,
    auroraCultivationBedPrepared: false,
    auroraBioTrialStarted: false,
    auroraImpactAssessmentComplete: false,
    auroraImpactAssessmentProgress: 0,
    auroraCoreOperational: false,
    mission11Completed: false,
    mission12Unlocked: false
  };

  get started(): boolean {
    return this.state.mission11Started;
  }

  get completed(): boolean {
    return this.state.mission11Completed;
  }

  get step(): Mission11StepId {
    return this.state.mission11Step;
  }

  get stepDefinition(): Mission11StepDefinition {
    return mission11Steps[this.step];
  }

  /** Milestones done, for the HUD progress readout. */
  get milestoneCount(): number {
    return [
      this.state.auroraCoreDiagnosticComplete,
      this.state.auroraSecondModuleDeployed,
      this.state.auroraEnergyLinkOnline,
      this.state.auroraWaterFilterInstalled,
      this.state.auroraWaterFlowCalibrated,
      this.state.auroraCultivationBedPrepared,
      this.state.auroraBioTrialStarted,
      this.state.auroraImpactAssessmentComplete
    ].filter(Boolean).length;
  }

  canStart(mission10: Partial<Mission10Snapshot>): boolean {
    return Boolean(
      !this.started &&
        !this.completed &&
        mission10.mission10Completed &&
        mission10.auroraModuleOperational &&
        mission10.mission11Unlocked
    );
  }

  start(mission10: Partial<Mission10Snapshot>): boolean {
    if (!this.canStart(mission10)) return false;
    this.state.mission11Started = true;
    this.state.mission11Step = 'diagnoseCore';
    return true;
  }

  runCoreDiagnostic(): boolean {
    if (this.step !== 'diagnoseCore') return false;
    this.state.auroraCoreDiagnosticComplete = true;
    this.state.mission11Step = 'markSecondSite';
    return true;
  }

  markSecondModuleSite(): boolean {
    if (this.step !== 'markSecondSite') return false;
    this.state.auroraSecondModuleSiteMarked = true;
    this.state.mission11Step = 'deploySecondModule';
    return true;
  }

  deploySecondModule(): boolean {
    if (this.step !== 'deploySecondModule' || !this.state.auroraSecondModuleSiteMarked) return false;
    this.state.auroraSecondModuleDeployed = true;
    this.state.mission11Step = 'connectEnergyLink';
    return true;
  }

  /** Energy handshake; returns true on the frame it completes. */
  advanceEnergyLink(deltaSeconds: number): boolean {
    if (this.step !== 'connectEnergyLink') return false;
    const gain = (deltaSeconds / mission11Tuning.energyLinkSeconds) * 100;
    this.state.auroraEnergyLinkProgress = Math.min(100, this.state.auroraEnergyLinkProgress + gain);
    if (this.state.auroraEnergyLinkProgress < 100) return false;
    this.state.auroraEnergyLinkOnline = true;
    this.state.mission11Step = 'installWaterFilter';
    return true;
  }

  installWaterFilter(): boolean {
    if (this.step !== 'installWaterFilter') return false;
    this.state.auroraWaterFilterInstalled = true;
    this.state.mission11Step = 'calibrateWaterFlow';
    return true;
  }

  /** Flow calibration; returns true on the frame it completes. */
  advanceWaterFlow(deltaSeconds: number): boolean {
    if (this.step !== 'calibrateWaterFlow') return false;
    const gain = (deltaSeconds / mission11Tuning.waterFlowSeconds) * 100;
    this.state.auroraWaterFlowProgress = Math.min(100, this.state.auroraWaterFlowProgress + gain);
    if (this.state.auroraWaterFlowProgress < 100) return false;
    this.state.auroraWaterFlowCalibrated = true;
    this.state.mission11Step = 'prepareCultivationBed';
    return true;
  }

  prepareCultivationBed(): boolean {
    if (this.step !== 'prepareCultivationBed') return false;
    this.state.auroraCultivationBedPrepared = true;
    this.state.mission11Step = 'startBioTrial';
    return true;
  }

  startBioTrial(): boolean {
    if (this.step !== 'startBioTrial' || !this.state.auroraCultivationBedPrepared) return false;
    this.state.auroraBioTrialStarted = true;
    this.state.mission11Step = 'assessImpact';
    return true;
  }

  /** Impact assessment; returns true on the frame it completes. */
  advanceImpactAssessment(deltaSeconds: number): boolean {
    if (this.step !== 'assessImpact') return false;
    const gain = (deltaSeconds / mission11Tuning.impactAssessmentSeconds) * 100;
    this.state.auroraImpactAssessmentProgress = Math.min(100, this.state.auroraImpactAssessmentProgress + gain);
    if (this.state.auroraImpactAssessmentProgress < 100) return false;
    this.state.auroraImpactAssessmentComplete = true;
    this.state.mission11Step = 'confirmCore';
    return true;
  }

  confirmCore(): boolean {
    if (this.step !== 'confirmCore' || !this.state.auroraImpactAssessmentComplete) return false;
    this.completeExpansion();
    return true;
  }

  private completeExpansion(): void {
    this.state.auroraEnergyLinkProgress = 100;
    this.state.auroraWaterFlowProgress = 100;
    this.state.auroraImpactAssessmentProgress = 100;
    this.state.auroraCoreDiagnosticComplete = true;
    this.state.auroraSecondModuleSiteMarked = true;
    this.state.auroraSecondModuleDeployed = true;
    this.state.auroraEnergyLinkOnline = true;
    this.state.auroraWaterFilterInstalled = true;
    this.state.auroraWaterFlowCalibrated = true;
    this.state.auroraCultivationBedPrepared = true;
    this.state.auroraBioTrialStarted = true;
    this.state.auroraImpactAssessmentComplete = true;
    this.state.auroraCoreOperational = true;
    this.state.mission11Completed = true;
    this.state.mission12Unlocked = true;
    this.state.mission11Step = 'completed';
  }

  forceSecondModuleDeployed(): void {
    if (!this.started) return;
    this.state.auroraCoreDiagnosticComplete = true;
    this.state.auroraSecondModuleSiteMarked = true;
    this.state.auroraSecondModuleDeployed = true;
    if (
      this.step === 'diagnoseCore' ||
      this.step === 'markSecondSite' ||
      this.step === 'deploySecondModule'
    ) {
      this.state.mission11Step = 'connectEnergyLink';
    }
  }

  forceEnergyLinkOnline(): void {
    if (!this.started) return;
    this.forceSecondModuleDeployed();
    this.state.auroraEnergyLinkProgress = 100;
    this.state.auroraEnergyLinkOnline = true;
    if (this.step === 'connectEnergyLink') this.state.mission11Step = 'installWaterFilter';
  }

  forceWaterFilterInstalled(): void {
    if (!this.started) return;
    this.forceEnergyLinkOnline();
    this.state.auroraWaterFilterInstalled = true;
    if (this.step === 'installWaterFilter') this.state.mission11Step = 'calibrateWaterFlow';
  }

  forceWaterFlowCalibrated(): void {
    if (!this.started) return;
    this.forceWaterFilterInstalled();
    this.state.auroraWaterFlowProgress = 100;
    this.state.auroraWaterFlowCalibrated = true;
    if (this.step === 'calibrateWaterFlow') this.state.mission11Step = 'prepareCultivationBed';
  }

  forceCultivationBedPrepared(): void {
    if (!this.started) return;
    this.forceWaterFlowCalibrated();
    this.state.auroraCultivationBedPrepared = true;
    if (this.step === 'prepareCultivationBed') this.state.mission11Step = 'startBioTrial';
  }

  forceBioTrialStarted(): void {
    if (!this.started) return;
    this.forceCultivationBedPrepared();
    this.state.auroraBioTrialStarted = true;
    if (this.step === 'startBioTrial') this.state.mission11Step = 'assessImpact';
  }

  forceImpactAssessed(): void {
    if (!this.started) return;
    this.forceBioTrialStarted();
    this.state.auroraImpactAssessmentProgress = 100;
    this.state.auroraImpactAssessmentComplete = true;
    if (this.step === 'assessImpact') this.state.mission11Step = 'confirmCore';
  }

  forceComplete(): void {
    if (!this.started) return;
    this.completeExpansion();
  }

  restore(savedState: Partial<Mission11Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission11Started) return;
    Object.assign(this.state, savedState);
    if (!mission11Steps[this.state.mission11Step]) this.state.mission11Step = 'diagnoseCore';
    this.state.auroraEnergyLinkProgress = clampPercent(this.state.auroraEnergyLinkProgress);
    this.state.auroraWaterFlowProgress = clampPercent(this.state.auroraWaterFlowProgress);
    this.state.auroraImpactAssessmentProgress = clampPercent(this.state.auroraImpactAssessmentProgress);
    this.state.mission12Unlocked = this.state.mission12Unlocked || this.state.mission11Completed;
  }

  snapshot(): Mission11Snapshot {
    return { ...this.state };
  }

  reset(): void {
    Object.assign(this.state, {
      mission11Started: false,
      mission11Step: 'inactive' as Mission11StepId,
      auroraCoreDiagnosticComplete: false,
      auroraSecondModuleSiteMarked: false,
      auroraSecondModuleDeployed: false,
      auroraEnergyLinkOnline: false,
      auroraEnergyLinkProgress: 0,
      auroraWaterFilterInstalled: false,
      auroraWaterFlowCalibrated: false,
      auroraWaterFlowProgress: 0,
      auroraCultivationBedPrepared: false,
      auroraBioTrialStarted: false,
      auroraImpactAssessmentComplete: false,
      auroraImpactAssessmentProgress: 0,
      auroraCoreOperational: false,
      mission11Completed: false,
      mission12Unlocked: false
    });
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number(value) || 0));
}
