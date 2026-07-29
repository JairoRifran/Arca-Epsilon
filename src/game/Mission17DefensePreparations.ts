import {
  mission17Steps,
  mission17Tuning,
  SENSOR_COUNT,
  EMITTER_COUNT,
  type Mission17StepDefinition,
  type Mission17StepId
} from '../assets/mission17Definitions';
import type { Mission16Snapshot } from './Mission16PleyadianProtocol';

const CIRCUIT_COUNT = 3;
const ALERT_CHANNEL_COUNT = 3;
const EVAC_MARKER_COUNT = 3;

export type Mission17Snapshot = {
  mission17Started: boolean;
  mission17Step: Mission17StepId;
  councilReviewed: boolean;
  /** Power circuits balanced so far, 0..3. */
  energyCircuitsBalanced: number;
  energyReserveOnline: boolean;
  /** Per perimeter sensor, ordered north / east / south-west. */
  sensorsDeployed: boolean[];
  sensorsCalibrated: boolean;
  /** Per shield emitter, ordered A / B / C. */
  shieldEmittersInstalled: boolean[];
  /** Alert channels verified so far, 0..3. */
  alertChannelsVerified: number;
  alertNetworkOnline: boolean;
  /** Evacuation markers set so far, 0..3. */
  evacMarkersSet: number;
  evacuationRoutesMarked: boolean;
  defenseDrillComplete: boolean;
  overloadStabilized: boolean;
  incomingSignaturesDetected: boolean;
  mission17Completed: boolean;
  mission18Unlocked: boolean;
};

/** Live defence readouts. Derived every frame, never persisted. */
export type DefensePreparationsReadout = {
  energyCircuits: number;
  sensorsDeployed: number;
  emittersInstalled: number;
  alertChannels: number;
  evacMarkers: number;
  /** Network overload during the drill, 0..100. */
  overload: number;
  /** Search readout for the active deploy target, 0..100. Zero otherwise. */
  deploySignal: number;
  /** Progress of whatever interaction the current step is running, 0..100. */
  phaseProgress: number;
};

/**
 * Mission 17 "Preparativos de Defensa": Aurora builds the incomplete Pleyadian
 * protocols into real infrastructure. Strictly sequential — no step is reached
 * out of order — and, like M15/M16, nothing is lost irreversibly: the overload
 * drill has a floor and can always be vented.
 */
export class Mission17DefensePreparations {
  readonly missionId = 'mission-17-defense-preparations';
  readonly missionName = 'Misión 17: Preparativos de Defensa';

  readonly state: Mission17Snapshot = {
    mission17Started: false,
    mission17Step: 'inactive',
    councilReviewed: false,
    energyCircuitsBalanced: 0,
    energyReserveOnline: false,
    sensorsDeployed: [false, false, false],
    sensorsCalibrated: false,
    shieldEmittersInstalled: [false, false, false],
    alertChannelsVerified: 0,
    alertNetworkOnline: false,
    evacMarkersSet: 0,
    evacuationRoutesMarked: false,
    defenseDrillComplete: false,
    overloadStabilized: false,
    incomingSignaturesDetected: false,
    mission17Completed: false,
    mission18Unlocked: false
  };

  // --- Volatile interaction state. None persisted: a reload drops to the start
  // of the current phase rather than into a half-finished interaction.
  private terminalProgress = 0;
  private overload = 0;
  private detectionTimer = 0;
  private deploySearchDistance = Number.POSITIVE_INFINITY;

  constructor() {
    this.resetVolatile();
  }

  get started(): boolean {
    return this.state.mission17Started;
  }
  get completed(): boolean {
    return this.state.mission17Completed;
  }
  get step(): Mission17StepId {
    return this.state.mission17Step;
  }
  get stepDefinition(): Mission17StepDefinition {
    return mission17Steps[this.step];
  }

  get sensorsDeployedCount(): number {
    return this.state.sensorsDeployed.filter(Boolean).length;
  }
  get emittersInstalledCount(): number {
    return this.state.shieldEmittersInstalled.filter(Boolean).length;
  }
  sensorDeployed(index: number): boolean {
    return Boolean(this.state.sensorsDeployed[index]);
  }
  emitterInstalled(index: number): boolean {
    return Boolean(this.state.shieldEmittersInstalled[index]);
  }

  /** Index of the sensor being deployed now, or -1. */
  get activeSensorIndex(): number {
    if (this.step !== 'deploySensors') return -1;
    return this.state.sensorsDeployed.findIndex((d) => !d);
  }
  /** Index of the emitter being installed now, or -1. */
  get activeEmitterIndex(): number {
    if (this.step !== 'installShieldEmitters') return -1;
    return this.state.shieldEmittersInstalled.findIndex((d) => !d);
  }

  get overloadPercent(): number {
    return Number(this.overload.toFixed(1));
  }
  get overloadCritical(): boolean {
    return this.step === 'stabilizeOverload' && this.overload >= mission17Tuning.overloadWarningLevel;
  }

  get milestoneCount(): number {
    return (
      [
        this.state.councilReviewed,
        this.state.energyReserveOnline,
        this.state.sensorsCalibrated,
        this.state.alertNetworkOnline,
        this.state.evacuationRoutesMarked,
        this.state.defenseDrillComplete,
        this.state.overloadStabilized,
        this.state.incomingSignaturesDetected
      ].filter(Boolean).length +
      this.sensorsDeployedCount +
      this.emittersInstalledCount
    );
  }

  setDeploySearchDistance(distance: number): void {
    this.deploySearchDistance = distance;
  }
  isDeployTargetRevealed(): boolean {
    return this.deploySearchDistance <= mission17Tuning.deployRange;
  }

  get readout(): DefensePreparationsReadout {
    const searching = this.step === 'deploySensors' || this.step === 'installShieldEmitters';
    return {
      energyCircuits: this.state.energyCircuitsBalanced,
      sensorsDeployed: this.sensorsDeployedCount,
      emittersInstalled: this.emittersInstalledCount,
      alertChannels: this.state.alertChannelsVerified,
      evacMarkers: this.state.evacMarkersSet,
      overload: Number(this.overload.toFixed(1)),
      deploySignal: searching
        ? Math.round(Math.max(0, 1 - Math.min(1, this.deploySearchDistance / mission17Tuning.deploySearchRange)) * 100)
        : 0,
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  get phaseProgress(): number {
    const t = mission17Tuning;
    const per = (n: number) => 100 / n;
    switch (this.step) {
      case 'emergencyCouncil':
        return Math.min(100, (this.terminalProgress / t.councilSeconds) * 100);
      case 'installEnergyReserve':
        return Math.min(100, this.state.energyCircuitsBalanced * per(CIRCUIT_COUNT) + (this.terminalProgress / t.circuitSeconds) * per(CIRCUIT_COUNT));
      case 'deploySensors':
        return Math.min(100, this.sensorsDeployedCount * per(SENSOR_COUNT) + (this.terminalProgress / t.sensorSeconds) * per(SENSOR_COUNT));
      case 'calibrateDetection':
        return Math.min(100, (this.terminalProgress / t.calibrationSeconds) * 100);
      case 'installShieldEmitters':
        return Math.min(100, this.emittersInstalledCount * per(EMITTER_COUNT) + (this.terminalProgress / t.emitterSeconds) * per(EMITTER_COUNT));
      case 'establishAlertNetwork':
        return Math.min(100, this.state.alertChannelsVerified * per(ALERT_CHANNEL_COUNT) + (this.terminalProgress / t.alertChannelSeconds) * per(ALERT_CHANNEL_COUNT));
      case 'markEvacuationRoutes':
        return Math.min(100, this.state.evacMarkersSet * per(EVAC_MARKER_COUNT) + (this.terminalProgress / t.evacMarkerSeconds) * per(EVAC_MARKER_COUNT));
      case 'runDefenseDrill':
        return Math.min(100, (this.terminalProgress / t.drillSeconds) * 100);
      case 'stabilizeOverload':
        return Math.max(0, 100 - this.overload);
      case 'detectIncomingSignatures':
        return Math.min(100, (this.detectionTimer / t.detectionSeconds) * 100);
      case 'completed':
        return 100;
      default:
        return 0;
    }
  }

  canStart(mission16: Partial<Mission16Snapshot>): boolean {
    return Boolean(
      !this.started && !this.completed && mission16.mission16Completed && mission16.mission17Unlocked
    );
  }

  start(mission16: Partial<Mission16Snapshot>): boolean {
    if (!this.canStart(mission16)) return false;
    this.state.mission17Started = true;
    this.state.mission17Step = 'emergencyCouncil';
    this.resetVolatile();
    return true;
  }

  // -------------------------------------------------------------------------

  advanceCouncil(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'emergencyCouncil') return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission17Tuning.councilSeconds)) return false;
    this.state.councilReviewed = true;
    this.state.mission17Step = 'installEnergyReserve';
    this.terminalProgress = 0;
    return true;
  }

  /** Balance the three power circuits. Returns true on the frame the last binds. */
  advanceEnergyReserve(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'installEnergyReserve') return false;
    if (!this.tickCounter(deltaSeconds, inRange, mission17Tuning.circuitSeconds)) return false;
    this.state.energyCircuitsBalanced = Math.min(CIRCUIT_COUNT, this.state.energyCircuitsBalanced + 1);
    if (this.state.energyCircuitsBalanced < CIRCUIT_COUNT) return false;
    this.state.energyReserveOnline = true;
    this.state.mission17Step = 'deploySensors';
    return true;
  }

  /** Deploy the perimeter sensors. Returns true on the frame the last deploys. */
  advanceSensor(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'deploySensors') return false;
    const index = this.activeSensorIndex;
    if (index < 0) return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission17Tuning.sensorSeconds)) return false;
    this.state.sensorsDeployed[index] = true;
    this.terminalProgress = 0;
    this.deploySearchDistance = Number.POSITIVE_INFINITY;
    if (this.sensorsDeployedCount < SENSOR_COUNT) return false;
    this.state.mission17Step = 'calibrateDetection';
    return true;
  }

  advanceCalibration(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'calibrateDetection') return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission17Tuning.calibrationSeconds)) return false;
    this.state.sensorsCalibrated = true;
    this.state.mission17Step = 'installShieldEmitters';
    this.terminalProgress = 0;
    return true;
  }

  /** Install and load-test the shield emitters. Returns true on the last. */
  advanceEmitter(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'installShieldEmitters') return false;
    const index = this.activeEmitterIndex;
    if (index < 0) return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission17Tuning.emitterSeconds)) return false;
    this.state.shieldEmittersInstalled[index] = true;
    this.terminalProgress = 0;
    this.deploySearchDistance = Number.POSITIVE_INFINITY;
    if (this.emittersInstalledCount < EMITTER_COUNT) return false;
    this.state.mission17Step = 'establishAlertNetwork';
    return true;
  }

  advanceAlertNetwork(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'establishAlertNetwork') return false;
    if (!this.tickCounter(deltaSeconds, inRange, mission17Tuning.alertChannelSeconds)) return false;
    this.state.alertChannelsVerified = Math.min(ALERT_CHANNEL_COUNT, this.state.alertChannelsVerified + 1);
    if (this.state.alertChannelsVerified < ALERT_CHANNEL_COUNT) return false;
    this.state.alertNetworkOnline = true;
    this.state.mission17Step = 'markEvacuationRoutes';
    return true;
  }

  advanceEvacuation(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'markEvacuationRoutes') return false;
    if (!this.tickCounter(deltaSeconds, inRange, mission17Tuning.evacMarkerSeconds)) return false;
    this.state.evacMarkersSet = Math.min(EVAC_MARKER_COUNT, this.state.evacMarkersSet + 1);
    if (this.state.evacMarkersSet < EVAC_MARKER_COUNT) return false;
    this.state.evacuationRoutesMarked = true;
    this.state.mission17Step = 'runDefenseDrill';
    return true;
  }

  advanceDrill(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'runDefenseDrill') return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission17Tuning.drillSeconds)) return false;
    this.state.defenseDrillComplete = true;
    this.state.mission17Step = 'stabilizeOverload';
    this.overload = mission17Tuning.overloadStart;
    return true;
  }

  /**
   * The overload climbs on its own and is vented by working the core. It never
   * passes the floor, so the drill can never be lost. Returns true when it is
   * brought down to nothing.
   */
  advanceStabilize(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'stabilizeOverload') return false;
    const t = mission17Tuning;
    if (inRange) {
      this.overload = Math.max(0, this.overload - deltaSeconds * t.overloadVentPerSecond);
    } else {
      this.overload = Math.min(100, this.overload + deltaSeconds * t.overloadClimbPerSecond);
    }
    if (this.overload > 0) return false;
    this.state.overloadStabilized = true;
    this.state.mission17Step = 'detectIncomingSignatures';
    this.detectionTimer = 0;
    return true;
  }

  advanceDetection(deltaSeconds: number): boolean {
    if (this.step !== 'detectIncomingSignatures') return false;
    this.detectionTimer += deltaSeconds;
    if (this.detectionTimer < mission17Tuning.detectionSeconds) return false;
    this.completePreparations();
    return true;
  }

  private completePreparations(): void {
    this.state.councilReviewed = true;
    this.state.energyCircuitsBalanced = CIRCUIT_COUNT;
    this.state.energyReserveOnline = true;
    this.state.sensorsDeployed = [true, true, true];
    this.state.sensorsCalibrated = true;
    this.state.shieldEmittersInstalled = [true, true, true];
    this.state.alertChannelsVerified = ALERT_CHANNEL_COUNT;
    this.state.alertNetworkOnline = true;
    this.state.evacMarkersSet = EVAC_MARKER_COUNT;
    this.state.evacuationRoutesMarked = true;
    this.state.defenseDrillComplete = true;
    this.state.overloadStabilized = true;
    this.state.incomingSignaturesDetected = true;
    this.state.mission17Completed = true;
    this.state.mission18Unlocked = true;
    this.state.mission17Step = 'completed';
    this.overload = 0;
  }

  // -------------------------------------------------------------------------

  /** Shared hold accumulator: banks seconds in range, bleeds them out of range. */
  private holdTerminal(deltaSeconds: number, inRange: boolean, seconds: number): boolean {
    if (!inRange) {
      this.terminalProgress = Math.max(0, this.terminalProgress - deltaSeconds * 1.5);
      return false;
    }
    this.terminalProgress += deltaSeconds;
    if (this.terminalProgress < seconds) return false;
    this.terminalProgress = seconds;
    return true;
  }

  /** Hold accumulator that resets after each completed unit (circuits/channels). */
  private tickCounter(deltaSeconds: number, inRange: boolean, seconds: number): boolean {
    if (!inRange) {
      this.terminalProgress = Math.max(0, this.terminalProgress - deltaSeconds * 1.5);
      return false;
    }
    this.terminalProgress += deltaSeconds;
    if (this.terminalProgress < seconds) return false;
    this.terminalProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Debug fast-forwards. Each pulls every earlier phase forward with it.
  // -------------------------------------------------------------------------

  forceCouncil(): void {
    if (!this.started) return;
    this.state.councilReviewed = true;
    if (this.step === 'emergencyCouncil') {
      this.state.mission17Step = 'installEnergyReserve';
      this.terminalProgress = 0;
    }
  }
  forceEnergyReserve(): void {
    if (!this.started) return;
    this.forceCouncil();
    this.state.energyCircuitsBalanced = CIRCUIT_COUNT;
    this.state.energyReserveOnline = true;
    if (this.step === 'installEnergyReserve') this.state.mission17Step = 'deploySensors';
  }
  /** Deploy sensors up to and including `index`, pulling earlier phases with it. */
  forceSensorsDeployed(index: number): void {
    if (!this.started || index < 0 || index >= SENSOR_COUNT) return;
    this.forceEnergyReserve();
    for (let i = 0; i <= index; i += 1) this.state.sensorsDeployed[i] = true;
    if (this.sensorsDeployedCount < SENSOR_COUNT) {
      this.state.mission17Step = 'deploySensors';
      this.terminalProgress = 0;
    } else {
      this.state.mission17Step = 'calibrateDetection';
      this.terminalProgress = 0;
    }
  }
  forceCalibration(): void {
    if (!this.started) return;
    this.forceSensorsDeployed(SENSOR_COUNT - 1);
    this.state.sensorsCalibrated = true;
    if (this.step === 'calibrateDetection') this.state.mission17Step = 'installShieldEmitters';
  }
  /** Install emitters up to and including `index`. */
  forceEmittersInstalled(index: number): void {
    if (!this.started || index < 0 || index >= EMITTER_COUNT) return;
    this.forceCalibration();
    for (let i = 0; i <= index; i += 1) this.state.shieldEmittersInstalled[i] = true;
    if (this.emittersInstalledCount < EMITTER_COUNT) {
      this.state.mission17Step = 'installShieldEmitters';
      this.terminalProgress = 0;
    } else {
      this.state.mission17Step = 'establishAlertNetwork';
      this.terminalProgress = 0;
    }
  }
  forceAlertNetwork(): void {
    if (!this.started) return;
    this.forceEmittersInstalled(EMITTER_COUNT - 1);
    this.state.alertChannelsVerified = ALERT_CHANNEL_COUNT;
    this.state.alertNetworkOnline = true;
    if (this.step === 'establishAlertNetwork') this.state.mission17Step = 'markEvacuationRoutes';
  }
  forceEvacuation(): void {
    if (!this.started) return;
    this.forceAlertNetwork();
    this.state.evacMarkersSet = EVAC_MARKER_COUNT;
    this.state.evacuationRoutesMarked = true;
    if (this.step === 'markEvacuationRoutes') this.state.mission17Step = 'runDefenseDrill';
  }
  forceDrill(): void {
    if (!this.started) return;
    this.forceEvacuation();
    this.state.defenseDrillComplete = true;
    if (this.step === 'runDefenseDrill') {
      this.state.mission17Step = 'stabilizeOverload';
      this.overload = mission17Tuning.overloadStart;
    }
  }
  forceOverloadStabilized(): void {
    if (!this.started) return;
    this.forceDrill();
    this.state.overloadStabilized = true;
    this.overload = 0;
    if (this.step === 'stabilizeOverload') {
      this.state.mission17Step = 'detectIncomingSignatures';
      this.detectionTimer = 0;
    }
  }
  forceComplete(): void {
    if (!this.started) return;
    this.completePreparations();
  }

  // -------------------------------------------------------------------------

  restore(savedState: Partial<Mission17Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission17Started) return;
    Object.assign(this.state, savedState);
    if (!mission17Steps[this.state.mission17Step]) this.state.mission17Step = 'emergencyCouncil';
    const sensors = this.state.sensorsDeployed;
    this.state.sensorsDeployed = Array.from({ length: SENSOR_COUNT }, (_, i) => (Array.isArray(sensors) ? Boolean(sensors[i]) : false));
    const emitters = this.state.shieldEmittersInstalled;
    this.state.shieldEmittersInstalled = Array.from({ length: EMITTER_COUNT }, (_, i) => (Array.isArray(emitters) ? Boolean(emitters[i]) : false));
    this.state.energyCircuitsBalanced = Math.max(0, Math.min(CIRCUIT_COUNT, Math.floor(this.state.energyCircuitsBalanced || 0)));
    this.state.alertChannelsVerified = Math.max(0, Math.min(ALERT_CHANNEL_COUNT, Math.floor(this.state.alertChannelsVerified || 0)));
    this.state.evacMarkersSet = Math.max(0, Math.min(EVAC_MARKER_COUNT, Math.floor(this.state.evacMarkersSet || 0)));
    this.state.mission18Unlocked = this.state.mission18Unlocked || this.state.mission17Completed;

    // Reloading always lands on the last stable step with its interaction freshly
    // armed: no banked seconds, no half-vented overload. No defence is duplicated
    // or lost. Overload is derived from the restored step, never persisted.
    this.resetVolatile();
    if (this.state.mission17Step === 'stabilizeOverload') this.overload = mission17Tuning.overloadStart;
  }

  snapshot(): Mission17Snapshot {
    return {
      ...this.state,
      sensorsDeployed: [...this.state.sensorsDeployed],
      shieldEmittersInstalled: [...this.state.shieldEmittersInstalled]
    };
  }

  reset(): void {
    Object.assign(this.state, {
      mission17Started: false,
      mission17Step: 'inactive' as Mission17StepId,
      councilReviewed: false,
      energyCircuitsBalanced: 0,
      energyReserveOnline: false,
      sensorsDeployed: [false, false, false],
      sensorsCalibrated: false,
      shieldEmittersInstalled: [false, false, false],
      alertChannelsVerified: 0,
      alertNetworkOnline: false,
      evacMarkersSet: 0,
      evacuationRoutesMarked: false,
      defenseDrillComplete: false,
      overloadStabilized: false,
      incomingSignaturesDetected: false,
      mission17Completed: false,
      mission18Unlocked: false
    });
    this.resetVolatile();
  }

  private resetVolatile(): void {
    this.terminalProgress = 0;
    this.overload = 0;
    this.detectionTimer = 0;
    this.deploySearchDistance = Number.POSITIVE_INFINITY;
  }
}
