import {
  MISSION22_FRONT_ORDER,
  MISSION22_NODE_ORDER,
  MISSION22_RESOURCE_ORDER,
  mission22Steps,
  mission22Tuning,
  type Mission22FrontChoice,
  type Mission22FrontId,
  type Mission22ResourceId,
  type Mission22StepDefinition,
  type Mission22StepId
} from '../assets/mission22Definitions';
import type { Mission21Snapshot } from './Mission21SilenceRupture';

export type Mission22Snapshot = {
  mission22Started: boolean;
  mission22Step: Mission22StepId;
  auroraIntegrity: number;
  nereidaIntegrity: number;
  orbitalIntegrity: number;
  mission22InitialEnergyFront: Mission22FrontChoice;
  mission22InitialDefenseFront: Mission22FrontChoice;
  mission22InitialCommsFront: Mission22FrontChoice;
  auroraFrontDefended: boolean;
  nereidaFrontDefended: boolean;
  auroraHostilesDestroyed: number;
  nereidaHostilesDestroyed: number;
  orbitalHostilesDestroyed: number;
  finalHostilesDestroyed: number;
  orbitalRelaysProtected: boolean[];
  crossFrontCrisisManaged: boolean;
  mission22SupportPriority: Mission22FrontChoice;
  jointNetworkRestored: boolean;
  coordinationNodesDetected: boolean[];
  finalPressureSurvived: boolean;
  mission22Completed: boolean;
  mission23Unlocked: boolean;
};

export type Mission22Readout = {
  auroraIntegrity: number;
  nereidaIntegrity: number;
  orbitalIntegrity: number;
  availableEnergy: number;
  supportAssigned: Mission22FrontChoice;
  communicationsQuality: number;
  currentFront: Mission22FrontChoice;
  jointLink: number;
  relaysProtected: number;
  nodesDetected: number;
  phaseProgress: number;
};

const STEP_ORDER: readonly Mission22StepId[] = [
  'inactive', 'simultaneousAlarm', 'accessCommandTerminal', 'assignInitialResources',
  'defendAuroraFront', 'defendNereidaFront', 'defendOrbitalFront',
  'manageCrossFrontCrisis', 'chooseSupportPriority', 'restoreJointNetwork',
  'detectCoordinationNodes', 'surviveFinalPressure', 'completed'
];

function stepIndex(step: Mission22StepId): number {
  const index = STEP_ORDER.indexOf(step);
  return index < 0 ? 0 : index;
}

function countEnabled(flags: readonly boolean[]): number {
  let count = 0;
  for (let index = 0; index < flags.length; index += 1) if (flags[index]) count += 1;
  return count;
}

function validFront(value: unknown): value is Mission22FrontId {
  return value === 'aurora' || value === 'nereida' || value === 'orbital';
}

export class Mission22BrokenFronts {
  readonly missionId = 'mission-22-broken-fronts';
  readonly missionName = 'Misión 22: Frentes rotos';

  readonly state: Mission22Snapshot = {
    mission22Started: false,
    mission22Step: 'inactive',
    auroraIntegrity: 84,
    nereidaIntegrity: 80,
    orbitalIntegrity: 76,
    mission22InitialEnergyFront: 'none',
    mission22InitialDefenseFront: 'none',
    mission22InitialCommsFront: 'none',
    auroraFrontDefended: false,
    nereidaFrontDefended: false,
    auroraHostilesDestroyed: 0,
    nereidaHostilesDestroyed: 0,
    orbitalHostilesDestroyed: 0,
    finalHostilesDestroyed: 0,
    orbitalRelaysProtected: [false, false, false],
    crossFrontCrisisManaged: false,
    mission22SupportPriority: 'none',
    jointNetworkRestored: false,
    coordinationNodesDetected: [false, false, false],
    finalPressureSurvived: false,
    mission22Completed: false,
    mission23Unlocked: false
  };

  private phaseTimer = 0;
  private pressureAccumulator = 0;

  get started(): boolean { return this.state.mission22Started; }
  get completed(): boolean { return this.state.mission22Completed; }
  get step(): Mission22StepId { return this.state.mission22Step; }
  get stepDefinition(): Mission22StepDefinition { return mission22Steps[this.step]; }
  get relaysProtected(): number { return countEnabled(this.state.orbitalRelaysProtected); }
  get nodesDetected(): number { return countEnabled(this.state.coordinationNodesDetected); }
  get currentWaveRequired(): number {
    if (this.step === 'defendAuroraFront') return mission22Tuning.auroraWaveCount;
    if (this.step === 'defendNereidaFront') return mission22Tuning.nereidaWaveCount;
    if (this.step === 'defendOrbitalFront') return mission22Tuning.orbitalWaveCount;
    if (this.step === 'surviveFinalPressure') return mission22Tuning.finalWaveCount;
    return 0;
  }
  get currentWaveDestroyed(): number {
    if (this.step === 'defendAuroraFront') return this.state.auroraHostilesDestroyed;
    if (this.step === 'defendNereidaFront') return this.state.nereidaHostilesDestroyed;
    if (this.step === 'defendOrbitalFront') return this.state.orbitalHostilesDestroyed;
    if (this.step === 'surviveFinalPressure') return this.state.finalHostilesDestroyed;
    return 0;
  }
  get currentWaveRemaining(): number {
    return Math.max(0, this.currentWaveRequired - this.currentWaveDestroyed);
  }
  get initialAssignmentsComplete(): boolean {
    return validFront(this.state.mission22InitialEnergyFront) &&
      validFront(this.state.mission22InitialDefenseFront) &&
      validFront(this.state.mission22InitialCommsFront);
  }
  get activeInitialResource(): Mission22ResourceId | undefined {
    if (!validFront(this.state.mission22InitialEnergyFront)) return 'energy';
    if (!validFront(this.state.mission22InitialDefenseFront)) return 'defense';
    if (!validFront(this.state.mission22InitialCommsFront)) return 'communications';
    return undefined;
  }
  get activeNodeIndex(): number {
    return this.step === 'detectCoordinationNodes'
      ? this.state.coordinationNodesDetected.findIndex((value) => !value)
      : -1;
  }
  get phaseProgress(): number {
    switch (this.step) {
      case 'simultaneousAlarm': return Math.min(100, this.phaseTimer / mission22Tuning.alarmSeconds * 100);
      case 'assignInitialResources': {
        let assigned = 0;
        if (validFront(this.state.mission22InitialEnergyFront)) assigned += 1;
        if (validFront(this.state.mission22InitialDefenseFront)) assigned += 1;
        if (validFront(this.state.mission22InitialCommsFront)) assigned += 1;
        return assigned / MISSION22_RESOURCE_ORDER.length * 100;
      }
      case 'manageCrossFrontCrisis': return Math.min(100, this.phaseTimer / mission22Tuning.crisisSeconds * 100);
      case 'restoreJointNetwork': return Math.min(100, this.phaseTimer / mission22Tuning.networkRestoreSeconds * 100);
      case 'detectCoordinationNodes': return Math.min(100, this.phaseTimer / mission22Tuning.nodeDetectionSeconds * 100);
      case 'surviveFinalPressure': return Math.min(100, this.phaseTimer / mission22Tuning.finalPressureSeconds * 100);
      case 'completed': return 100;
      default: return 0;
    }
  }
  get currentFront(): Mission22FrontChoice {
    if (this.step === 'defendAuroraFront') return 'aurora';
    if (this.step === 'defendNereidaFront') return 'nereida';
    if (this.step === 'defendOrbitalFront' || this.step === 'surviveFinalPressure') return 'orbital';
    return this.state.mission22SupportPriority;
  }
  get readout(): Mission22Readout {
    const communicationsBonus = this.state.mission22InitialCommsFront === 'none' ? 0 : 12;
    return {
      auroraIntegrity: Number(this.state.auroraIntegrity.toFixed(1)),
      nereidaIntegrity: Number(this.state.nereidaIntegrity.toFixed(1)),
      orbitalIntegrity: Number(this.state.orbitalIntegrity.toFixed(1)),
      availableEnergy: Math.max(18, 100 - stepIndex(this.step) * 4),
      supportAssigned: this.state.mission22SupportPriority,
      communicationsQuality: Math.min(100, (this.state.jointNetworkRestored ? 88 : 52) + communicationsBonus),
      currentFront: this.currentFront,
      jointLink: this.state.jointNetworkRestored ? 100 : Math.round(this.phaseProgress),
      relaysProtected: this.relaysProtected,
      nodesDetected: this.nodesDetected,
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  canStart(previous: Mission21Snapshot): boolean {
    return Boolean(!this.started && !this.completed && previous.mission21Completed &&
      previous.simultaneousAssaultDetected && previous.mission22Unlocked);
  }

  start(previous: Mission21Snapshot): boolean {
    if (!this.canStart(previous)) return false;
    this.state.mission22Started = true;
    this.state.mission22Step = 'simultaneousAlarm';
    this.phaseTimer = 0;
    return true;
  }

  advanceAlarm(delta: number): boolean {
    if (this.step !== 'simultaneousAlarm' || !this.wait(delta, mission22Tuning.alarmSeconds)) return false;
    return this.goToStep('accessCommandTerminal');
  }

  accessCommandTerminal(): boolean {
    if (this.step !== 'accessCommandTerminal') return false;
    return this.goToStep('assignInitialResources');
  }

  assignInitialResource(resource: Mission22ResourceId, front: Mission22FrontId): boolean {
    if (this.step !== 'assignInitialResources' || this.activeInitialResource !== resource) return false;
    if (resource === 'energy') this.state.mission22InitialEnergyFront = front;
    if (resource === 'defense') this.state.mission22InitialDefenseFront = front;
    if (resource === 'communications') this.state.mission22InitialCommsFront = front;
    this.repairFront(front, resource === 'energy' ? 5 : resource === 'defense' ? 4 : 3);
    if (this.initialAssignmentsComplete) this.goToStep('defendAuroraFront');
    return true;
  }

  updateStrategicPressure(delta: number): boolean {
    if (!this.started || this.completed) return false;
    this.pressureAccumulator += delta;
    let changed = false;
    while (this.pressureAccumulator >= mission22Tuning.pressureTickSeconds) {
      this.pressureAccumulator -= mission22Tuning.pressureTickSeconds;
      changed = this.applyPressureTick(mission22Tuning.pressureTickSeconds) || changed;
    }
    return changed;
  }

  recordCurrentHostileDestroyed(): boolean {
    const required = this.currentWaveRequired;
    if (required <= 0 || this.currentWaveDestroyed >= required) return false;
    if (this.step === 'defendAuroraFront') this.state.auroraHostilesDestroyed += 1;
    else if (this.step === 'defendNereidaFront') this.state.nereidaHostilesDestroyed += 1;
    else if (this.step === 'defendOrbitalFront') this.state.orbitalHostilesDestroyed += 1;
    else if (this.step === 'surviveFinalPressure') this.state.finalHostilesDestroyed += 1;
    else return false;
    return true;
  }

  completeAuroraFront(): boolean {
    if (this.step !== 'defendAuroraFront') return false;
    this.state.auroraHostilesDestroyed = mission22Tuning.auroraWaveCount;
    this.state.auroraFrontDefended = true;
    this.repairFront('aurora', 14);
    return this.goToStep('defendNereidaFront');
  }

  completeNereidaFront(): boolean {
    if (this.step !== 'defendNereidaFront') return false;
    this.state.nereidaHostilesDestroyed = mission22Tuning.nereidaWaveCount;
    this.state.nereidaFrontDefended = true;
    this.repairFront('nereida', 14);
    return this.goToStep('defendOrbitalFront');
  }

  protectOrbitalRelay(index: number): boolean {
    if (this.step !== 'defendOrbitalFront') return false;
    const safeIndex = Math.max(0, Math.min(this.state.orbitalRelaysProtected.length - 1, Math.floor(index)));
    this.state.orbitalRelaysProtected[safeIndex] = true;
    this.repairFront('orbital', 4);
    if (this.relaysProtected >= this.state.orbitalRelaysProtected.length) {
      this.state.orbitalHostilesDestroyed = mission22Tuning.orbitalWaveCount;
      this.goToStep('manageCrossFrontCrisis');
    }
    return true;
  }

  advanceCrossFrontCrisis(delta: number, commandLinked: boolean): boolean {
    if (this.step !== 'manageCrossFrontCrisis') return false;
    if (!commandLinked) { this.phaseTimer = Math.max(0, this.phaseTimer - delta * 0.35); return false; }
    this.phaseTimer += delta;
    this.repairFront(this.lowestFront(), delta * 2.2);
    if (this.phaseTimer < mission22Tuning.crisisSeconds) return false;
    this.state.crossFrontCrisisManaged = true;
    return this.goToStep('chooseSupportPriority');
  }

  chooseSupportPriority(front: Mission22FrontId): boolean {
    if (this.step !== 'chooseSupportPriority' || this.state.mission22SupportPriority !== 'none') return false;
    this.state.mission22SupportPriority = front;
    this.repairFront(front, 12);
    return this.goToStep('restoreJointNetwork');
  }

  advanceJointNetwork(delta: number, nearArk: boolean): boolean {
    if (this.step !== 'restoreJointNetwork' || !this.hold(delta, nearArk, mission22Tuning.networkRestoreSeconds)) return false;
    this.state.jointNetworkRestored = true;
    this.repairFront('aurora', 6);
    this.repairFront('nereida', 6);
    this.repairFront('orbital', 6);
    return this.goToStep('detectCoordinationNodes');
  }

  advanceCoordinationNode(delta: number, nearArk: boolean): number {
    if (this.step !== 'detectCoordinationNodes') return -1;
    const index = this.activeNodeIndex;
    if (index < 0 || !this.hold(delta, nearArk, mission22Tuning.nodeDetectionSeconds)) return -1;
    this.state.coordinationNodesDetected[index] = true;
    this.phaseTimer = 0;
    if (this.nodesDetected >= MISSION22_NODE_ORDER.length) this.goToStep('surviveFinalPressure');
    return index;
  }

  advanceFinalPressure(delta: number, orbitalClear: boolean): boolean {
    if (this.step !== 'surviveFinalPressure') return false;
    if (orbitalClear) this.phaseTimer += delta;
    else this.phaseTimer = Math.max(0, this.phaseTimer - delta * 0.1);
    if (this.phaseTimer < mission22Tuning.finalPressureSeconds) return false;
    this.state.finalHostilesDestroyed = mission22Tuning.finalWaveCount;
    this.state.finalPressureSurvived = true;
    this.completeMission();
    return true;
  }

  damageFront(front: Mission22FrontId, amount: number): void {
    const key = this.integrityKey(front);
    this.state[key] = Math.max(mission22Tuning.integrityFloor, this.state[key] - Math.max(0, amount));
  }

  repairFront(front: Mission22FrontId, amount: number): void {
    const key = this.integrityKey(front);
    this.state[key] = Math.min(100, this.state[key] + Math.max(0, amount));
  }

  forceAlarm(): void {
    if (!this.started) return;
    if (this.step === 'simultaneousAlarm') this.goToStep('accessCommandTerminal');
  }
  forceCommandTerminal(): void { this.forceAlarm(); if (this.step === 'accessCommandTerminal') this.accessCommandTerminal(); }
  forceInitialAssignments(front: Mission22FrontId = 'orbital'): void {
    this.forceCommandTerminal();
    for (const resource of MISSION22_RESOURCE_ORDER) {
      if (this.activeInitialResource === resource) this.assignInitialResource(resource, front);
    }
  }
  forceAuroraFront(): void { this.forceInitialAssignments(); if (this.step === 'defendAuroraFront') this.completeAuroraFront(); }
  forceNereidaFront(): void { this.forceAuroraFront(); if (this.step === 'defendNereidaFront') this.completeNereidaFront(); }
  forceOrbitalFront(): void {
    this.forceNereidaFront();
    if (this.step !== 'defendOrbitalFront') return;
    for (let index = 0; index < this.state.orbitalRelaysProtected.length; index += 1) this.protectOrbitalRelay(index);
  }
  forceCrisis(): void {
    this.forceOrbitalFront();
    if (this.step === 'manageCrossFrontCrisis') {
      this.state.crossFrontCrisisManaged = true;
      this.goToStep('chooseSupportPriority');
    }
  }
  forceSupport(front: Mission22FrontId): void { this.forceCrisis(); if (this.step === 'chooseSupportPriority') this.chooseSupportPriority(front); }
  forceJointNetwork(): void {
    this.forceSupport(this.state.mission22SupportPriority === 'none' ? 'orbital' : this.state.mission22SupportPriority);
    if (this.step === 'restoreJointNetwork') {
      this.state.jointNetworkRestored = true;
      this.goToStep('detectCoordinationNodes');
    }
  }
  forceCoordinationNodes(index = MISSION22_NODE_ORDER.length - 1): void {
    this.forceJointNetwork();
    if (this.step !== 'detectCoordinationNodes') return;
    const end = Math.max(-1, Math.min(MISSION22_NODE_ORDER.length - 1, Math.floor(index)));
    for (let node = 0; node <= end; node += 1) this.state.coordinationNodesDetected[node] = true;
    if (this.nodesDetected >= MISSION22_NODE_ORDER.length) this.goToStep('surviveFinalPressure');
  }
  forceComplete(): void {
    this.forceCoordinationNodes();
    if (!this.started) return;
    this.state.finalPressureSurvived = true;
    this.completeMission();
  }

  reset(): void {
    this.restore({
      mission22Started: false,
      mission22Step: 'inactive',
      auroraIntegrity: 84,
      nereidaIntegrity: 80,
      orbitalIntegrity: 76,
      mission22InitialEnergyFront: 'none',
      mission22InitialDefenseFront: 'none',
      mission22InitialCommsFront: 'none',
      auroraFrontDefended: false,
      nereidaFrontDefended: false,
      auroraHostilesDestroyed: 0,
      nereidaHostilesDestroyed: 0,
      orbitalHostilesDestroyed: 0,
      finalHostilesDestroyed: 0,
      orbitalRelaysProtected: [false, false, false],
      crossFrontCrisisManaged: false,
      mission22SupportPriority: 'none',
      jointNetworkRestored: false,
      coordinationNodesDetected: [false, false, false],
      finalPressureSurvived: false,
      mission22Completed: false,
      mission23Unlocked: false
    });
  }

  restore(snapshot: Mission22Snapshot): void {
    const step = STEP_ORDER.includes(snapshot.mission22Step) ? snapshot.mission22Step : 'inactive';
    const reached = (candidate: Mission22StepId) => stepIndex(step) >= stepIndex(candidate);
    this.state.mission22Started = Boolean(snapshot.mission22Started || reached('simultaneousAlarm'));
    this.state.mission22Step = step;
    this.state.auroraIntegrity = this.normalizeIntegrity(snapshot.auroraIntegrity, 84);
    this.state.nereidaIntegrity = this.normalizeIntegrity(snapshot.nereidaIntegrity, 80);
    this.state.orbitalIntegrity = this.normalizeIntegrity(snapshot.orbitalIntegrity, 76);
    this.state.mission22InitialEnergyFront = validFront(snapshot.mission22InitialEnergyFront) ? snapshot.mission22InitialEnergyFront : 'none';
    this.state.mission22InitialDefenseFront = validFront(snapshot.mission22InitialDefenseFront) ? snapshot.mission22InitialDefenseFront : 'none';
    this.state.mission22InitialCommsFront = validFront(snapshot.mission22InitialCommsFront) ? snapshot.mission22InitialCommsFront : 'none';
    this.state.auroraFrontDefended = Boolean(snapshot.auroraFrontDefended || reached('defendNereidaFront'));
    this.state.nereidaFrontDefended = Boolean(snapshot.nereidaFrontDefended || reached('defendOrbitalFront'));
    this.state.auroraHostilesDestroyed = this.normalizeCount(
      snapshot.auroraHostilesDestroyed,
      mission22Tuning.auroraWaveCount,
      this.state.auroraFrontDefended
    );
    this.state.nereidaHostilesDestroyed = this.normalizeCount(
      snapshot.nereidaHostilesDestroyed,
      mission22Tuning.nereidaWaveCount,
      this.state.nereidaFrontDefended
    );
    this.state.orbitalHostilesDestroyed = this.normalizeCount(
      snapshot.orbitalHostilesDestroyed,
      mission22Tuning.orbitalWaveCount,
      reached('manageCrossFrontCrisis')
    );
    this.state.finalHostilesDestroyed = this.normalizeCount(
      snapshot.finalHostilesDestroyed,
      mission22Tuning.finalWaveCount,
      reached('completed')
    );
    this.state.orbitalRelaysProtected = this.normalizeFlags(snapshot.orbitalRelaysProtected, 3, reached('manageCrossFrontCrisis'));
    this.state.crossFrontCrisisManaged = Boolean(snapshot.crossFrontCrisisManaged || reached('chooseSupportPriority'));
    this.state.mission22SupportPriority = validFront(snapshot.mission22SupportPriority) ? snapshot.mission22SupportPriority : 'none';
    this.state.jointNetworkRestored = Boolean(snapshot.jointNetworkRestored || reached('detectCoordinationNodes'));
    this.state.coordinationNodesDetected = this.normalizeFlags(snapshot.coordinationNodesDetected, 3, reached('surviveFinalPressure'));
    this.state.finalPressureSurvived = Boolean(snapshot.finalPressureSurvived || reached('completed'));
    this.state.mission22Completed = Boolean(snapshot.mission22Completed || reached('completed'));
    this.state.mission23Unlocked = Boolean(snapshot.mission23Unlocked || this.state.mission22Completed);
    if (reached('defendAuroraFront') && !this.initialAssignmentsComplete) {
      this.state.mission22InitialEnergyFront = 'orbital';
      this.state.mission22InitialDefenseFront = 'aurora';
      this.state.mission22InitialCommsFront = 'nereida';
    }
    if (reached('restoreJointNetwork') && this.state.mission22SupportPriority === 'none') {
      this.state.mission22SupportPriority = 'orbital';
    }
    this.phaseTimer = 0;
    this.pressureAccumulator = 0;
  }

  snapshot(): Mission22Snapshot {
    return {
      ...this.state,
      orbitalRelaysProtected: [...this.state.orbitalRelaysProtected],
      coordinationNodesDetected: [...this.state.coordinationNodesDetected]
    };
  }

  private applyPressureTick(seconds: number): boolean {
    let aurora = 0;
    let nereida = 0;
    let orbital = 0;
    if (this.step === 'defendAuroraFront') { aurora = 2.1; nereida = 0.22; orbital = 0.18; }
    else if (this.step === 'defendNereidaFront') { aurora = 0.18; nereida = 2.25; orbital = 0.2; }
    else if (this.step === 'defendOrbitalFront') { aurora = 0.2; nereida = 0.22; orbital = 2.35; }
    else if (this.step === 'manageCrossFrontCrisis') { aurora = 0.85; nereida = 1.05; orbital = 1.15; }
    else if (this.step === 'surviveFinalPressure') { aurora = 0.7; nereida = 0.78; orbital = 1.35; }
    else return false;
    this.damageFront('aurora', this.adjustedPressure('aurora', aurora) * seconds);
    this.damageFront('nereida', this.adjustedPressure('nereida', nereida) * seconds);
    this.damageFront('orbital', this.adjustedPressure('orbital', orbital) * seconds);
    return true;
  }

  private adjustedPressure(front: Mission22FrontId, base: number): number {
    let reduction = 0;
    if (this.state.mission22InitialEnergyFront === front) reduction += 0.18;
    if (this.state.mission22InitialDefenseFront === front) reduction += 0.28;
    if (this.state.mission22InitialCommsFront === front) reduction += 0.12;
    if (this.state.mission22SupportPriority === front) reduction += 0.32;
    if (this.state.jointNetworkRestored) reduction += 0.2;
    return base * Math.max(0.25, 1 - reduction);
  }

  private lowestFront(): Mission22FrontId {
    if (this.state.auroraIntegrity <= this.state.nereidaIntegrity && this.state.auroraIntegrity <= this.state.orbitalIntegrity) return 'aurora';
    return this.state.nereidaIntegrity <= this.state.orbitalIntegrity ? 'nereida' : 'orbital';
  }

  private integrityKey(front: Mission22FrontId): 'auroraIntegrity' | 'nereidaIntegrity' | 'orbitalIntegrity' {
    if (front === 'aurora') return 'auroraIntegrity';
    return front === 'nereida' ? 'nereidaIntegrity' : 'orbitalIntegrity';
  }

  private normalizeIntegrity(value: number, fallback: number): number {
    return Number.isFinite(value) ? Math.max(mission22Tuning.integrityFloor, Math.min(100, value)) : fallback;
  }

  private normalizeCount(value: number | undefined, required: number, completed: boolean): number {
    if (completed) return required;
    return Number.isFinite(value) ? Math.max(0, Math.min(required, Math.floor(value ?? 0))) : 0;
  }

  private normalizeFlags(value: boolean[] | undefined, length: number, completed: boolean): boolean[] {
    const result = Array.from({ length }, (_, index) => completed || Boolean(value?.[index]));
    return result;
  }

  private completeMission(): void {
    if (!this.started) return;
    this.state.mission22Completed = true;
    this.state.mission23Unlocked = true;
    this.state.mission22Step = 'completed';
    this.phaseTimer = 0;
  }

  private goToStep(step: Mission22StepId): boolean {
    if (stepIndex(step) <= stepIndex(this.step)) return false;
    this.state.mission22Step = step;
    this.phaseTimer = 0;
    return true;
  }

  private wait(delta: number, seconds: number): boolean {
    this.phaseTimer += delta;
    return this.phaseTimer >= seconds;
  }

  private hold(delta: number, active: boolean, seconds: number): boolean {
    this.phaseTimer = active
      ? Math.min(seconds, this.phaseTimer + delta)
      : Math.max(0, this.phaseTimer - delta * 0.45);
    return this.phaseTimer >= seconds;
  }
}
