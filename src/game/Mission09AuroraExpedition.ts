import {
  atlasRouteBeaconDefinitions,
  mission09Steps,
  type Mission09StepDefinition,
  type Mission09StepId
} from '../assets/mission09Definitions';
import type { Mission08Snapshot } from './Mission08SignalFracture';

export type Mission09Snapshot = {
  mission09Started: boolean;
  mission09Step: Mission09StepId;
  residualTraceAnalyzed: boolean;
  auroraRouteDecoded: boolean;
  auroraRouteBeaconsScanned: boolean[];
  currentAuroraSector: number;
  auroraSignalStrength: number;
  auroraHorizonScanned: boolean;
  auroraSectorDiscovered: boolean;
  auroraLongRangeTravelCompleted: boolean;
  mission09Completed: boolean;
  mission10Unlocked: boolean;
};

/**
 * Mission 09 "Expedición Aurora": the first long-range scale jump. Base
 * Nereida decodes the Coalition's residual trace into an incomplete Atlas
 * route toward a distant, more Earth-like sector. The pilot flies far south
 * along the route, scanning five Atlas beacons, then reaches the Umbral
 * Aurora and scans the horizon — revealing the Aurora sector. The mission
 * ends on discovery only; colonization is deferred. Completing it unlocks
 * Mission 10 without starting it.
 */
export class Mission09AuroraExpedition {
  readonly missionId = 'mission-09-aurora-expedition';
  readonly missionName = 'Misión 09: Expedición Aurora';

  readonly state: Mission09Snapshot = {
    mission09Started: false,
    mission09Step: 'inactive',
    residualTraceAnalyzed: false,
    auroraRouteDecoded: false,
    auroraRouteBeaconsScanned: atlasRouteBeaconDefinitions.map(() => false),
    currentAuroraSector: 0,
    auroraSignalStrength: 1,
    auroraHorizonScanned: false,
    auroraSectorDiscovered: false,
    auroraLongRangeTravelCompleted: false,
    mission09Completed: false,
    mission10Unlocked: false
  };

  get started(): boolean {
    return this.state.mission09Started;
  }

  get completed(): boolean {
    return this.state.mission09Completed;
  }

  get step(): Mission09StepId {
    return this.state.mission09Step;
  }

  get stepDefinition(): Mission09StepDefinition {
    return mission09Steps[this.step];
  }

  /** Index of the next beacon to scan while on the route, or -1. */
  get activeBeaconIndex(): number {
    if (this.step !== 'followRoute') return -1;
    return this.state.auroraRouteBeaconsScanned.findIndex((scanned) => !scanned);
  }

  get beaconsScannedCount(): number {
    return this.state.auroraRouteBeaconsScanned.filter(Boolean).length;
  }

  canStart(mission08: Partial<Mission08Snapshot>): boolean {
    return Boolean(
      !this.started &&
        !this.completed &&
        mission08.mission08Completed &&
        mission08.coalitionTraceResidual &&
        mission08.mission09Unlocked
    );
  }

  start(mission08: Partial<Mission08Snapshot>): boolean {
    if (!this.canStart(mission08)) return false;
    this.state.mission09Started = true;
    this.state.mission09Step = 'analyzeResidual';
    return true;
  }

  analyzeResidual(): boolean {
    if (this.step !== 'analyzeResidual') return false;
    this.state.residualTraceAnalyzed = true;
    this.state.auroraRouteDecoded = true;
    this.state.mission09Step = 'followRoute';
    return true;
  }

  scanBeacon(index: number): boolean {
    if (index !== this.activeBeaconIndex || this.state.auroraRouteBeaconsScanned[index]) return false;
    this.state.auroraRouteBeaconsScanned[index] = true;
    // Advance the confirmed sector so the map/HUD track progress.
    this.state.currentAuroraSector = Math.min(index + 1, atlasRouteBeaconDefinitions.length);
    if (this.state.auroraRouteBeaconsScanned.every(Boolean)) {
      this.state.mission09Step = 'reachThreshold';
    }
    return true;
  }

  scanHorizon(): boolean {
    if (this.step !== 'reachThreshold') return false;
    this.completeExpedition();
    return true;
  }

  /** Live base-signal strength, driven by distance from Base Nereida. */
  setSignalStrength(value: number): void {
    this.state.auroraSignalStrength = Math.min(1, Math.max(0, value));
  }

  /** Which sector the player currently occupies (0..N), driven by position. */
  setCurrentSector(index: number): void {
    this.state.currentAuroraSector = Math.max(this.state.currentAuroraSector, index);
  }

  private completeExpedition(): void {
    this.state.auroraHorizonScanned = true;
    this.state.auroraSectorDiscovered = true;
    this.state.auroraLongRangeTravelCompleted = true;
    this.state.mission09Completed = true;
    this.state.mission10Unlocked = true;
    this.state.mission09Step = 'completed';
  }

  forceRouteDecoded(): void {
    if (!this.started) return;
    this.state.residualTraceAnalyzed = true;
    this.state.auroraRouteDecoded = true;
    if (this.step === 'analyzeResidual') this.state.mission09Step = 'followRoute';
  }

  forceAllBeaconsScanned(): void {
    if (!this.started) return;
    this.forceRouteDecoded();
    this.state.auroraRouteBeaconsScanned = atlasRouteBeaconDefinitions.map(() => true);
    this.state.currentAuroraSector = atlasRouteBeaconDefinitions.length;
    this.state.mission09Step = 'reachThreshold';
  }

  forceComplete(): void {
    if (!this.started) return;
    if (!this.state.auroraRouteBeaconsScanned.every(Boolean)) this.forceAllBeaconsScanned();
    this.completeExpedition();
  }

  restore(savedState: Partial<Mission09Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission09Started) return;
    Object.assign(this.state, savedState);
    if (!mission09Steps[this.state.mission09Step]) this.state.mission09Step = 'analyzeResidual';
    if (!this.state.auroraRouteBeaconsScanned || this.state.auroraRouteBeaconsScanned.length < atlasRouteBeaconDefinitions.length) {
      this.state.auroraRouteBeaconsScanned = atlasRouteBeaconDefinitions.map(
        (_, index) => Boolean(this.state.auroraRouteBeaconsScanned?.[index])
      );
    }
    this.state.mission10Unlocked = this.state.mission10Unlocked || this.state.mission09Completed;
  }

  snapshot(): Mission09Snapshot {
    return { ...this.state, auroraRouteBeaconsScanned: [...this.state.auroraRouteBeaconsScanned] };
  }

  reset(): void {
    Object.assign(this.state, {
      mission09Started: false,
      mission09Step: 'inactive' as Mission09StepId,
      residualTraceAnalyzed: false,
      auroraRouteDecoded: false,
      auroraRouteBeaconsScanned: atlasRouteBeaconDefinitions.map(() => false),
      currentAuroraSector: 0,
      auroraSignalStrength: 1,
      auroraHorizonScanned: false,
      auroraSectorDiscovered: false,
      auroraLongRangeTravelCompleted: false,
      mission09Completed: false,
      mission10Unlocked: false
    });
  }
}
