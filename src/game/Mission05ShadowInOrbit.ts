import {
  mission05EchoPositions,
  mission05Steps,
  mission05Tuning,
  type Mission05StepDefinition,
  type Mission05StepId,
  type SilentProbeState
} from '../assets/mission05Definitions';
import type { Mission04Snapshot } from './Mission04OrbitalDefense';

export type Mission05Snapshot = {
  mission05Started: boolean;
  mission05Step: Mission05StepId;
  probeDetected: boolean;
  probeState: SilentProbeState;
  interferenceActive: boolean;
  activeEchoIndex: number;
  echoesResolved: number;
  counterSignalProgress: number;
  probeRetreated: boolean;
  firstHostileContactConfirmed: boolean;
  mission05Completed: boolean;
  mission06Unlocked: boolean;
};

export class Mission05ShadowInOrbit {
  readonly missionId = 'mission-05-shadow-in-orbit';

  readonly missionName = 'Mision 05: Sombra en la Orbita';

  readonly state: Mission05Snapshot = {
    mission05Started: false,
    mission05Step: 'inactive',
    probeDetected: false,
    probeState: 'hidden',
    interferenceActive: false,
    activeEchoIndex: -1,
    echoesResolved: 0,
    counterSignalProgress: 0,
    probeRetreated: false,
    firstHostileContactConfirmed: false,
    mission05Completed: false,
    mission06Unlocked: false
  };

  get started(): boolean {
    return this.state.mission05Started;
  }

  get completed(): boolean {
    return this.state.mission05Completed;
  }

  get step(): Mission05StepId {
    return this.state.mission05Step;
  }

  get currentStep(): Mission05StepDefinition {
    return mission05Steps[this.step];
  }

  get counterSignalActive(): boolean {
    return this.step === 'counterSignal' && this.state.counterSignalProgress > 0 && this.state.counterSignalProgress < 100;
  }

  canStart(mission04: Mission04Snapshot): boolean {
    return (
      !this.started &&
      mission04.mission04Completed &&
      mission04.defenseNetworkSynchronized &&
      mission04.threatSignatureDetected &&
      mission04.mission05Unlocked
    );
  }

  start(mission04: Mission04Snapshot): boolean {
    if (!this.canStart(mission04)) return false;
    this.state.mission05Started = true;
    this.state.mission05Step = 'boardShip';
    return true;
  }

  confirmAboard(): boolean {
    if (this.step !== 'boardShip') return false;
    this.state.mission05Step = 'gainScanAltitude';
    return true;
  }

  reachScanAltitude(): boolean {
    if (this.step !== 'gainScanAltitude') return false;
    this.state.mission05Step = 'orbitalScan';
    return true;
  }

  detectProbe(): boolean {
    if (this.step !== 'orbitalScan') return false;
    this.state.probeDetected = true;
    this.state.probeState = 'detected';
    this.state.mission05Step = 'approachProbe';
    return true;
  }

  triggerInterference(): boolean {
    if (this.step !== 'approachProbe' || !this.state.probeDetected) return false;
    this.state.probeState = 'jammed';
    this.state.interferenceActive = true;
    this.state.mission05Step = 'atlasRecalibration';
    return true;
  }

  recalibrateAtlasFrequency(): boolean {
    if (this.step !== 'atlasRecalibration' || !this.state.interferenceActive) return false;
    this.state.probeState = 'tracking';
    this.state.activeEchoIndex = 0;
    this.state.mission05Step = 'trackEcho';
    return true;
  }

  resolveEcho(index: number): boolean {
    if (this.step !== 'trackEcho' || index !== this.state.activeEchoIndex) return false;
    this.state.echoesResolved = Math.min(mission05EchoPositions.length, this.state.echoesResolved + 1);
    if (this.state.echoesResolved >= mission05EchoPositions.length) {
      this.state.activeEchoIndex = -1;
      this.state.mission05Step = 'counterSignal';
    } else {
      this.state.activeEchoIndex = this.state.echoesResolved;
    }
    return true;
  }

  beginCounterSignal(): boolean {
    if (this.step !== 'counterSignal' || this.state.probeRetreated) return false;
    this.state.counterSignalProgress = Math.max(0.01, this.state.counterSignalProgress);
    return true;
  }

  updateCounterSignal(delta: number, inRange: boolean): boolean {
    if (!this.counterSignalActive || !inRange) return false;
    this.state.counterSignalProgress = Math.min(
      100,
      this.state.counterSignalProgress + (Math.max(0, delta) / mission05Tuning.counterSignalSeconds) * 100
    );
    if (this.state.counterSignalProgress < 100) return false;
    this.finishCounterSignal();
    return true;
  }

  forceCounterSignalComplete(): void {
    if (this.step !== 'counterSignal') return;
    this.state.counterSignalProgress = 100;
    this.finishCounterSignal();
  }

  markProbeEscaped(): void {
    if (!this.state.probeRetreated) return;
    this.state.probeState = 'escaped';
  }

  completeAtBase(): boolean {
    if (this.step !== 'returnToBase' || !this.state.probeRetreated) return false;
    this.state.firstHostileContactConfirmed = true;
    this.state.mission05Completed = true;
    this.state.mission06Unlocked = true;
    this.state.mission05Step = 'completed';
    return true;
  }

  snapshot(): Mission05Snapshot {
    return { ...this.state };
  }

  restore(snapshot: Partial<Mission05Snapshot> | undefined): void {
    this.reset();
    if (!snapshot?.mission05Started) return;
    Object.assign(this.state, snapshot);
    if (!mission05Steps[this.state.mission05Step]) this.state.mission05Step = 'boardShip';
    this.state.echoesResolved = Math.min(
      mission05EchoPositions.length,
      Math.max(0, Math.floor(this.state.echoesResolved))
    );
    this.state.activeEchoIndex = this.state.mission05Step === 'trackEcho'
      ? Math.min(mission05EchoPositions.length - 1, Math.max(0, Math.floor(this.state.activeEchoIndex)))
      : -1;
    this.state.counterSignalProgress = Math.min(100, Math.max(0, this.state.counterSignalProgress));
  }

  reset(): void {
    Object.assign(this.state, {
      mission05Started: false,
      mission05Step: 'inactive',
      probeDetected: false,
      probeState: 'hidden',
      interferenceActive: false,
      activeEchoIndex: -1,
      echoesResolved: 0,
      counterSignalProgress: 0,
      probeRetreated: false,
      firstHostileContactConfirmed: false,
      mission05Completed: false,
      mission06Unlocked: false
    });
  }

  private finishCounterSignal(): void {
    this.state.counterSignalProgress = 100;
    this.state.probeState = 'retreating';
    this.state.interferenceActive = false;
    this.state.probeRetreated = true;
    this.state.mission05Step = 'returnToBase';
  }
}
