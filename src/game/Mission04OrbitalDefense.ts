import {
  defenseBeaconSites,
  mission04Steps,
  mission04Tuning,
  type Mission04StepDefinition,
  type Mission04StepId
} from '../assets/mission04Definitions';
import type { Mission03Snapshot } from './Mission03FirstContact';

export type DefenseNetworkState =
  | 'offline'
  | 'calibrating'
  | 'deploying'
  | 'synchronizing'
  | 'online'
  | 'signature-detected';

export type Mission04Snapshot = {
  mission04Started: boolean;
  mission04Step: Mission04StepId;
  defenseLinkCalibrated: boolean;
  defenseLinkCalibrationProgress: number;
  orbitalSensorActivated: boolean;
  defensiveBeaconsPlaced: boolean[];
  defenseNetworkSynchronized: boolean;
  defenseSyncProgress: number;
  defenseNetworkState: DefenseNetworkState;
  activeDefenseBeaconTarget: number;
  threatSignatureDetected: boolean;
  mission04Completed: boolean;
  mission05Unlocked: boolean;
};

export class Mission04OrbitalDefense {
  readonly missionId = 'mission-04-orbital-defense';

  readonly missionName = 'Mision 04: Protocolo de Defensa Orbital';

  readonly state: Mission04Snapshot = {
    mission04Started: false,
    mission04Step: 'inactive',
    defenseLinkCalibrated: false,
    defenseLinkCalibrationProgress: 0,
    orbitalSensorActivated: false,
    defensiveBeaconsPlaced: defenseBeaconSites.map(() => false),
    defenseNetworkSynchronized: false,
    defenseSyncProgress: 0,
    defenseNetworkState: 'offline',
    activeDefenseBeaconTarget: 0,
    threatSignatureDetected: false,
    mission04Completed: false,
    mission05Unlocked: false
  };

  get started(): boolean {
    return this.state.mission04Started;
  }

  get completed(): boolean {
    return this.state.mission04Completed;
  }

  get step(): Mission04StepId {
    return this.state.mission04Step;
  }

  get currentStep(): Mission04StepDefinition {
    return mission04Steps[this.state.mission04Step];
  }

  canStart(mission03: Mission03Snapshot): boolean {
    return (
      !this.started &&
      mission03.mission03Completed &&
      mission03.pleyadanContactEstablished &&
      mission03.galacticThreatKnown &&
      mission03.orbitalDefenseRequired
    );
  }

  start(mission03: Mission03Snapshot): boolean {
    if (!this.canStart(mission03)) return false;
    this.state.mission04Started = true;
    this.state.mission04Step = 'returnToBase';
    this.state.defenseNetworkState = 'offline';
    return true;
  }

  reviewProtocol(): boolean {
    if (this.step !== 'returnToBase') return false;
    this.state.mission04Step = 'calibrateDefenseLink';
    return true;
  }

  beginDefenseLinkCalibration(): boolean {
    if (this.step !== 'calibrateDefenseLink' || this.state.defenseLinkCalibrated) return false;
    this.state.defenseNetworkState = 'calibrating';
    return true;
  }

  updateDefenseLinkCalibration(delta: number, inRange: boolean): boolean {
    if (this.step !== 'calibrateDefenseLink' || this.state.defenseLinkCalibrated) return false;
    if (this.state.defenseNetworkState !== 'calibrating') return false;
    if (inRange) {
      this.state.defenseLinkCalibrationProgress = Math.min(
        100,
        this.state.defenseLinkCalibrationProgress +
          (Math.max(0, delta) / mission04Tuning.calibrationSeconds) * 100
      );
    }
    if (this.state.defenseLinkCalibrationProgress < 100) return false;
    this.state.defenseLinkCalibrated = true;
    this.state.defenseNetworkState = 'offline';
    this.state.mission04Step = 'activateOrbitalSensor';
    return true;
  }

  forceDefenseLinkCalibrated(): void {
    if (!this.started) return;
    this.state.defenseLinkCalibrationProgress = 100;
    this.state.defenseLinkCalibrated = true;
    this.state.defenseNetworkState = 'offline';
    this.state.mission04Step = 'activateOrbitalSensor';
  }

  activateOrbitalSensor(): boolean {
    if (this.step !== 'activateOrbitalSensor' || !this.state.defenseLinkCalibrated) return false;
    this.state.orbitalSensorActivated = true;
    this.state.defenseNetworkState = 'deploying';
    this.state.activeDefenseBeaconTarget = this.findNextBeaconIndex();
    this.state.mission04Step = 'travelToBeacon';
    return true;
  }

  reachActiveBeacon(): boolean {
    if (this.step !== 'travelToBeacon') return false;
    this.state.mission04Step = 'deployBeacon';
    return true;
  }

  placeDefenseBeacon(index: number): boolean {
    if (
      this.step !== 'deployBeacon' ||
      index !== this.state.activeDefenseBeaconTarget ||
      !defenseBeaconSites[index] ||
      this.state.defensiveBeaconsPlaced[index]
    ) {
      return false;
    }
    this.state.defensiveBeaconsPlaced[index] = true;
    const nextIndex = this.findNextBeaconIndex();
    if (nextIndex >= 0) {
      this.state.activeDefenseBeaconTarget = nextIndex;
      this.state.mission04Step = 'travelToBeacon';
    } else {
      this.state.activeDefenseBeaconTarget = index;
      this.state.defenseNetworkState = 'synchronizing';
      this.state.mission04Step = 'synchronizeNetwork';
    }
    return true;
  }

  updateDefenseSync(delta: number, inRange: boolean): boolean {
    if (this.step !== 'synchronizeNetwork' || this.state.defenseNetworkSynchronized) return false;
    const change = inRange
      ? (Math.max(0, delta) / mission04Tuning.synchronizationSeconds) * 100
      : -Math.max(0, delta) * 1.2;
    this.state.defenseSyncProgress = Math.min(100, Math.max(0, this.state.defenseSyncProgress + change));
    if (this.state.defenseSyncProgress < 100) return false;
    this.state.defenseNetworkSynchronized = true;
    this.state.defenseNetworkState = 'online';
    this.state.mission04Step = 'returnToShip';
    return true;
  }

  forceAllBeaconsPlaced(): void {
    if (!this.state.orbitalSensorActivated) this.activateOrbitalSensor();
    this.state.defensiveBeaconsPlaced = defenseBeaconSites.map(() => true);
    this.state.activeDefenseBeaconTarget = defenseBeaconSites.length - 1;
    this.state.defenseNetworkState = 'synchronizing';
    this.state.mission04Step = 'synchronizeNetwork';
  }

  forceDefenseSyncComplete(): void {
    if (!this.state.defensiveBeaconsPlaced.every(Boolean)) this.forceAllBeaconsPlaced();
    this.state.defenseSyncProgress = 100;
    this.state.defenseNetworkSynchronized = true;
    this.state.defenseNetworkState = 'online';
    this.state.mission04Step = 'returnToShip';
  }

  confirmReturnedToShip(): boolean {
    if (this.step !== 'returnToShip' || !this.state.defenseNetworkSynchronized) return false;
    this.state.mission04Step = 'orbitalScan';
    return true;
  }

  detectThreatSignature(): boolean {
    if (this.step !== 'orbitalScan' || !this.state.orbitalSensorActivated || !this.state.defenseNetworkSynchronized) {
      return false;
    }
    this.state.threatSignatureDetected = true;
    this.state.defenseNetworkState = 'signature-detected';
    this.state.mission04Step = 'threatSignature';
    return true;
  }

  complete(): boolean {
    if (this.step !== 'threatSignature' || !this.state.threatSignatureDetected) return false;
    this.state.mission04Completed = true;
    this.state.mission05Unlocked = true;
    this.state.mission04Step = 'completed';
    return true;
  }

  snapshot(): Mission04Snapshot {
    return {
      ...this.state,
      defensiveBeaconsPlaced: [...this.state.defensiveBeaconsPlaced]
    };
  }

  restore(snapshot: Partial<Mission04Snapshot> | undefined): void {
    this.reset();
    if (!snapshot?.mission04Started) return;
    Object.assign(this.state, snapshot);
    this.state.defensiveBeaconsPlaced = defenseBeaconSites.map(
      (_, index) => Boolean(snapshot.defensiveBeaconsPlaced?.[index])
    );
    if (!mission04Steps[this.state.mission04Step]) this.state.mission04Step = 'returnToBase';
    this.state.activeDefenseBeaconTarget = Math.min(
      defenseBeaconSites.length - 1,
      Math.max(0, this.state.activeDefenseBeaconTarget)
    );
  }

  reset(): void {
    Object.assign(this.state, {
      mission04Started: false,
      mission04Step: 'inactive',
      defenseLinkCalibrated: false,
      defenseLinkCalibrationProgress: 0,
      orbitalSensorActivated: false,
      defensiveBeaconsPlaced: defenseBeaconSites.map(() => false),
      defenseNetworkSynchronized: false,
      defenseSyncProgress: 0,
      defenseNetworkState: 'offline',
      activeDefenseBeaconTarget: 0,
      threatSignatureDetected: false,
      mission04Completed: false,
      mission05Unlocked: false
    });
  }

  private findNextBeaconIndex(): number {
    return this.state.defensiveBeaconsPlaced.findIndex((placed) => !placed);
  }
}
