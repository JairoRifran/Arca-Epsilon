import {
  mission03Steps,
  resonadorAtlasDefinition,
  type Mission03StepDefinition,
  type Mission03StepId
} from '../assets/mission03Definitions';
import type { ColonyState } from './ColonyManager';

export type Mission03SignalState = 'inactive' | 'calibrating' | 'unstable' | 'synchronized' | 'transmitted';

export type Mission03Snapshot = {
  mission03Started: boolean;
  mission03Step: Mission03StepId;
  communicationCalibrated: boolean;
  communicationCalibrationProgress: number;
  relayBeaconPlaced: boolean;
  relaySynchronized: boolean;
  signalStability: number;
  mission03SignalState: Mission03SignalState;
  pleyadanContactEstablished: boolean;
  atlasTranslationMatrixUnlocked: boolean;
  galacticThreatKnown: boolean;
  orbitalDefenseRequired: boolean;
  mission04Unlocked: boolean;
  mission03Completed: boolean;
};

export class Mission03FirstContact {
  readonly missionId = 'mission-03-first-contact';

  readonly missionName = 'Mision 03: Primer Contacto';

  readonly subtitle = 'Los Pleyadanos';

  readonly state: Mission03Snapshot = {
    mission03Started: false,
    mission03Step: 'inactive',
    communicationCalibrated: false,
    communicationCalibrationProgress: 0,
    relayBeaconPlaced: false,
    relaySynchronized: false,
    signalStability: 0,
    mission03SignalState: 'inactive',
    pleyadanContactEstablished: false,
    atlasTranslationMatrixUnlocked: false,
    galacticThreatKnown: false,
    orbitalDefenseRequired: false,
    mission04Unlocked: false,
    mission03Completed: false
  };

  get started(): boolean {
    return this.state.mission03Started;
  }

  get completed(): boolean {
    return this.state.mission03Completed;
  }

  get step(): Mission03StepId {
    return this.state.mission03Step;
  }

  get currentStep(): Mission03StepDefinition {
    return mission03Steps[this.state.mission03Step];
  }

  canStart(colony: ColonyState): boolean {
    return (
      !this.state.mission03Started &&
      colony.baseNereidaOperational &&
      colony.operational &&
      colony.waterStatus === 'analyzed' &&
      colony.mineralStatus === 'analyzed' &&
      colony.energyStatus === 'analyzed'
    );
  }

  start(colony: ColonyState): boolean {
    if (!this.canStart(colony)) return false;
    this.state.mission03Started = true;
    this.state.mission03Step = 'deepSignal';
    this.state.mission03SignalState = 'inactive';
    return true;
  }

  reviewSignal(): boolean {
    if (this.step !== 'deepSignal') return false;
    this.state.mission03Step = 'calibrateCommunications';
    return true;
  }

  beginCalibration(): boolean {
    if (this.step !== 'calibrateCommunications' || this.state.communicationCalibrated) return false;
    this.state.mission03SignalState = 'calibrating';
    return true;
  }

  updateCalibration(delta: number, inRange: boolean): boolean {
    if (this.state.mission03SignalState !== 'calibrating' || this.state.communicationCalibrated) return false;
    if (inRange) {
      this.state.communicationCalibrationProgress = Math.min(
        100,
        this.state.communicationCalibrationProgress +
          (Math.max(0, delta) / resonadorAtlasDefinition.calibrationSeconds) * 100
      );
    }
    if (this.state.communicationCalibrationProgress < 100) return false;
    this.state.communicationCalibrated = true;
    this.state.mission03SignalState = 'inactive';
    this.state.mission03Step = 'resonancePoint';
    return true;
  }

  forceCalibrationComplete(): void {
    if (!this.started) return;
    this.state.communicationCalibrationProgress = 100;
    this.state.communicationCalibrated = true;
    this.state.mission03SignalState = 'inactive';
    this.state.mission03Step = 'resonancePoint';
  }

  reachResonator(): boolean {
    if (this.step !== 'resonancePoint') return false;
    this.state.mission03Step = 'relayBeacon';
    return true;
  }

  placeRelay(): boolean {
    if (this.step !== 'relayBeacon' || this.state.relayBeaconPlaced) return false;
    this.state.relayBeaconPlaced = true;
    this.state.mission03SignalState = 'unstable';
    this.state.mission03Step = 'synchronization';
    return true;
  }

  updateSignal(delta: number, playerInRange: boolean): boolean {
    if (this.step !== 'synchronization' || this.state.relaySynchronized) return false;
    const change = playerInRange
      ? (Math.max(0, delta) / resonadorAtlasDefinition.synchronizationSeconds) * 100
      : -Math.max(0, delta) * 1.4;
    this.state.signalStability = Math.min(100, Math.max(0, this.state.signalStability + change));
    if (this.state.signalStability < 100) return false;
    this.state.relaySynchronized = true;
    this.state.mission03SignalState = 'synchronized';
    this.state.mission03Step = 'returnToBase';
    return true;
  }

  forceSignalSynchronized(): void {
    if (!this.state.relayBeaconPlaced) this.state.relayBeaconPlaced = true;
    this.state.signalStability = 100;
    this.state.relaySynchronized = true;
    this.state.mission03SignalState = 'synchronized';
    this.state.mission03Step = 'returnToBase';
  }

  beginTranslation(): boolean {
    if (this.step !== 'returnToBase' || !this.state.relaySynchronized) return false;
    this.state.mission03SignalState = 'transmitted';
    this.state.mission03Step = 'atlasTranslation';
    return true;
  }

  markTranslationStable(): boolean {
    if (this.step !== 'atlasTranslation') return false;
    this.state.atlasTranslationMatrixUnlocked = true;
    this.state.mission03Step = 'firstContact';
    return true;
  }

  establishContact(): boolean {
    if (this.step !== 'firstContact') return false;
    this.state.pleyadanContactEstablished = true;
    this.state.mission03Step = 'warning';
    return true;
  }

  deliverWarning(): boolean {
    if (this.step !== 'warning') return false;
    this.state.galacticThreatKnown = true;
    this.state.orbitalDefenseRequired = true;
    this.state.mission03Step = 'prepare';
    return true;
  }

  complete(): boolean {
    if (this.step !== 'prepare') return false;
    this.state.mission03Completed = true;
    this.state.mission03Step = 'completed';
    this.state.pleyadanContactEstablished = true;
    this.state.atlasTranslationMatrixUnlocked = true;
    this.state.galacticThreatKnown = true;
    this.state.orbitalDefenseRequired = true;
    this.state.mission04Unlocked = true;
    return true;
  }

  snapshot(): Mission03Snapshot {
    return { ...this.state };
  }

  restore(snapshot: Partial<Mission03Snapshot> | undefined): void {
    this.reset();
    if (!snapshot?.mission03Started) return;
    Object.assign(this.state, snapshot);
    if (!mission03Steps[this.state.mission03Step]) this.state.mission03Step = 'deepSignal';
  }

  reset(): void {
    Object.assign(this.state, {
      mission03Started: false,
      mission03Step: 'inactive',
      communicationCalibrated: false,
      communicationCalibrationProgress: 0,
      relayBeaconPlaced: false,
      relaySynchronized: false,
      signalStability: 0,
      mission03SignalState: 'inactive',
      pleyadanContactEstablished: false,
      atlasTranslationMatrixUnlocked: false,
      galacticThreatKnown: false,
      orbitalDefenseRequired: false,
      mission04Unlocked: false,
      mission03Completed: false
    });
  }
}
