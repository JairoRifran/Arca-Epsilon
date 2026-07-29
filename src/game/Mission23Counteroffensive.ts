import {
  mission23Steps,
  mission23Tuning,
  type Mission23PlatformMethod,
  type Mission23PrimaryTarget,
  type Mission23StepDefinition,
  type Mission23StepId,
  type Mission23TargetId
} from '../assets/mission23Definitions';
import type { Mission22Snapshot } from './Mission22BrokenFronts';

export type Mission23Snapshot = {
  mission23Started: boolean;
  mission23Step: Mission23StepId;
  mission23TargetOrder: Mission23TargetId[];
  jointForcesSynchronized: boolean;
  jammerTriangulationReadings: boolean[];
  jammerNodeDestroyed: boolean;
  platformDefensesDisabled: boolean;
  platformEnergyDisabled: boolean;
  mission23PlatformMethod: Mission23PlatformMethod;
  logisticsPlatformDestroyed: boolean;
  jumpBeaconAnchorsDisabled: boolean[];
  jumpBeaconDestroyed: boolean;
  escapeCompleted: boolean;
  enemyRouteRecovered: boolean;
  returnToArkConfirmed: boolean;
  mission23Completed: boolean;
  mission24Unlocked: boolean;
};

export type Mission23Readout = {
  jointEnergy: number;
  triangulationReadings: number;
  platformModulesRemaining: number;
  beaconAnchorsRemaining: number;
  escapeSecondsRemaining: number;
  phaseProgress: number;
  jammed: boolean;
};

function countFlags(flags: readonly boolean[]): number {
  let count = 0;
  for (let index = 0; index < flags.length; index += 1) if (flags[index]) count += 1;
  return count;
}

function validPrimary(value: unknown): value is Mission23PrimaryTarget {
  return value === 'jammer' || value === 'logistics';
}

function validMethod(value: unknown): value is Exclude<Mission23PlatformMethod, 'none'> {
  return value === 'controlledDestruction' || value === 'overload' || value === 'powerCut';
}

export class Mission23Counteroffensive {
  readonly missionId = 'mission-23-counteroffensive';
  readonly missionName = 'Misión 23: La contraofensiva';
  readonly state: Mission23Snapshot = {
    mission23Started: false,
    mission23Step: 'inactive',
    mission23TargetOrder: [],
    jointForcesSynchronized: false,
    jammerTriangulationReadings: [false, false, false],
    jammerNodeDestroyed: false,
    platformDefensesDisabled: false,
    platformEnergyDisabled: false,
    mission23PlatformMethod: 'none',
    logisticsPlatformDestroyed: false,
    jumpBeaconAnchorsDisabled: [false, false, false],
    jumpBeaconDestroyed: false,
    escapeCompleted: false,
    enemyRouteRecovered: false,
    returnToArkConfirmed: false,
    mission23Completed: false,
    mission24Unlocked: false
  };

  private phaseTimer = 0;
  private escapeElapsed = 0;
  private escapeRetries = 0;
  private escapeArmed = false;
  private readonly cachedReadout: Mission23Readout = {
    jointEnergy: 0,
    triangulationReadings: 0,
    platformModulesRemaining: 3,
    beaconAnchorsRemaining: 3,
    escapeSecondsRemaining: mission23Tuning.escapeWindowSeconds,
    phaseProgress: 0,
    jammed: false
  };

  get started(): boolean { return this.state.mission23Started; }
  get completed(): boolean { return this.state.mission23Completed; }
  get step(): Mission23StepId { return this.state.mission23Step; }
  get stepDefinition(): Mission23StepDefinition { return mission23Steps[this.step]; }
  get readingsComplete(): boolean { return countFlags(this.state.jammerTriangulationReadings) === 3; }
  get readingsCount(): number { return countFlags(this.state.jammerTriangulationReadings); }
  get anchorsDisabled(): number { return countFlags(this.state.jumpBeaconAnchorsDisabled); }
  get activeReadingIndex(): number {
    for (let index = 0; index < this.state.jammerTriangulationReadings.length; index += 1) {
      if (!this.state.jammerTriangulationReadings[index]) return index;
    }
    return -1;
  }
  get activeAnchorIndex(): number {
    for (let index = 0; index < this.state.jumpBeaconAnchorsDisabled.length; index += 1) {
      if (!this.state.jumpBeaconAnchorsDisabled[index]) return index;
    }
    return -1;
  }
  get jammed(): boolean {
    return this.started && !this.state.jammerNodeDestroyed &&
      (this.step === 'approachJammerNode' || this.step === 'destroyJammerNode');
  }
  get phaseProgress(): number {
    switch (this.step) {
      case 'counteroffensiveCouncil': return Math.min(100, this.phaseTimer / mission23Tuning.councilSeconds * 100);
      case 'synchronizeJointForces': return Math.min(100, this.phaseTimer / mission23Tuning.synchronizationSeconds * 100);
      case 'approachJammerNode': return this.readingsCount / 3 * 100;
      case 'disablePlatformDefenses': return (Number(this.state.platformDefensesDisabled) + Number(this.state.platformEnergyDisabled)) / 2 * 100;
      case 'disableBeaconAnchors': return this.anchorsDisabled / 3 * 100;
      case 'collapseJumpBeacon': return Math.min(100, this.phaseTimer / mission23Tuning.beaconCollapseSeconds * 100);
      case 'escapeDistortion': return Math.min(100, this.escapeElapsed / mission23Tuning.escapeWindowSeconds * 100);
      case 'recoverEnemyRoute': return Math.min(100, this.phaseTimer / mission23Tuning.routeRecoverySeconds * 100);
      case 'completed': return 100;
      default: return 0;
    }
  }
  get readout(): Mission23Readout {
    this.cachedReadout.jointEnergy = this.state.jointForcesSynchronized ? 100 : Math.round(this.phaseProgress);
    this.cachedReadout.triangulationReadings = this.readingsCount;
    this.cachedReadout.platformModulesRemaining = Number(!this.state.platformDefensesDisabled) + Number(!this.state.platformEnergyDisabled) + Number(!this.state.logisticsPlatformDestroyed);
    this.cachedReadout.beaconAnchorsRemaining = 3 - this.anchorsDisabled;
    this.cachedReadout.escapeSecondsRemaining = Math.max(0, Number((mission23Tuning.escapeWindowSeconds - this.escapeElapsed).toFixed(1)));
    this.cachedReadout.phaseProgress = Number(this.phaseProgress.toFixed(1));
    this.cachedReadout.jammed = this.jammed;
    return this.cachedReadout;
  }

  canStart(previous: Mission22Snapshot): boolean {
    return !this.started && !this.completed && previous.mission22Completed && previous.mission23Unlocked;
  }
  start(previous: Mission22Snapshot): boolean {
    if (!this.canStart(previous)) return false;
    this.state.mission23Started = true;
    this.state.mission23Step = 'counteroffensiveCouncil';
    this.resetVolatile();
    return true;
  }
  advanceCouncil(delta: number): boolean {
    if (this.step !== 'counteroffensiveCouncil') return false;
    this.phaseTimer += delta;
    if (this.phaseTimer < mission23Tuning.councilSeconds) return false;
    return this.goTo('synchronizeJointForces');
  }
  advanceSynchronization(delta: number, linked: boolean): boolean {
    if (this.step !== 'synchronizeJointForces') return false;
    this.phaseTimer = linked ? this.phaseTimer + delta : Math.max(0, this.phaseTimer - delta * 0.4);
    if (this.phaseTimer < mission23Tuning.synchronizationSeconds) return false;
    this.state.jointForcesSynchronized = true;
    return this.goTo('chooseTargetOrder');
  }
  chooseTargetOrder(first: Mission23PrimaryTarget): boolean {
    if (this.step !== 'chooseTargetOrder' || this.state.mission23TargetOrder.length > 0) return false;
    const second: Mission23PrimaryTarget = first === 'jammer' ? 'logistics' : 'jammer';
    this.state.mission23TargetOrder = [first, second, 'jumpBeacon'];
    return this.goTo(first === 'jammer' ? 'approachJammerNode' : 'approachLogisticsPlatform');
  }
  recordJammerReading(index: number): boolean {
    if (this.step !== 'approachJammerNode') return false;
    const expected = this.activeReadingIndex;
    const safe = Math.max(0, Math.min(2, Math.floor(index)));
    if (safe !== expected) return false;
    this.state.jammerTriangulationReadings[safe] = true;
    this.phaseTimer = 0;
    if (this.readingsComplete) this.goTo('destroyJammerNode');
    return true;
  }
  destroyJammerNode(): boolean {
    if (this.step !== 'destroyJammerNode') return false;
    this.state.jammerNodeDestroyed = true;
    return this.goToNextPrimaryTarget();
  }
  reachLogisticsPlatform(): boolean {
    if (this.step !== 'approachLogisticsPlatform') return false;
    return this.goTo('disablePlatformDefenses');
  }
  disablePlatformModule(module: 'defense' | 'energy'): boolean {
    if (this.step !== 'disablePlatformDefenses') return false;
    if (module === 'defense') {
      if (this.state.platformDefensesDisabled) return false;
      this.state.platformDefensesDisabled = true;
      return true;
    }
    if (!this.state.platformDefensesDisabled || this.state.platformEnergyDisabled) return false;
    this.state.platformEnergyDisabled = true;
    this.goTo('destroyLogisticsCore');
    return true;
  }
  choosePlatformMethod(method: Exclude<Mission23PlatformMethod, 'none'>): boolean {
    if (this.step !== 'destroyLogisticsCore' || this.state.mission23PlatformMethod !== 'none' || !validMethod(method)) return false;
    this.state.mission23PlatformMethod = method;
    return true;
  }
  destroyLogisticsPlatform(): boolean {
    if (this.step !== 'destroyLogisticsCore' || !validMethod(this.state.mission23PlatformMethod)) return false;
    this.state.logisticsPlatformDestroyed = true;
    return this.goToNextPrimaryTarget();
  }
  reachJumpBeacon(): boolean {
    if (this.step !== 'approachJumpBeacon') return false;
    return this.goTo('disableBeaconAnchors');
  }
  disableBeaconAnchor(index: number): boolean {
    if (this.step !== 'disableBeaconAnchors') return false;
    const safe = Math.max(0, Math.min(2, Math.floor(index)));
    if (this.state.jumpBeaconAnchorsDisabled[safe]) return false;
    this.state.jumpBeaconAnchorsDisabled[safe] = true;
    if (this.anchorsDisabled === 3) this.goTo('collapseJumpBeacon');
    return true;
  }
  advanceBeaconCollapse(delta: number, synchronized: boolean, escortsClear: boolean): boolean {
    if (this.step !== 'collapseJumpBeacon') return false;
    this.phaseTimer = synchronized && escortsClear ? this.phaseTimer + delta : Math.max(0, this.phaseTimer - delta * 0.25);
    if (this.phaseTimer < mission23Tuning.beaconCollapseSeconds) return false;
    this.state.jumpBeaconDestroyed = true;
    this.escapeElapsed = 0;
    return this.goTo('escapeDistortion');
  }
  advanceEscape(delta: number, distance: number, playerInitiated = true): 'active' | 'retry' | 'complete' {
    if (this.step !== 'escapeDistortion') return 'active';
    // A restored checkpoint stays stable until the player deliberately moves.
    // This prevents terrain/flight-volume corrections from completing the
    // evacuation before the first post-load input.
    if (!this.escapeArmed) {
      if (!playerInitiated) return 'active';
      this.escapeArmed = true;
    }
    this.escapeElapsed += delta;
    if (distance >= mission23Tuning.escapeSafeDistance) {
      this.state.escapeCompleted = true;
      this.goTo('recoverEnemyRoute');
      return 'complete';
    }
    if (this.escapeElapsed < mission23Tuning.escapeWindowSeconds) return 'active';
    this.escapeElapsed = 0;
    this.escapeRetries += 1;
    this.escapeArmed = false;
    return 'retry';
  }
  recoverEnemyRoute(): boolean {
    if (this.step !== 'recoverEnemyRoute') return false;
    this.state.enemyRouteRecovered = true;
    return this.goTo('confirmReturnToArk');
  }
  confirmReturnToArk(): boolean {
    if (this.step !== 'confirmReturnToArk') return false;
    this.state.returnToArkConfirmed = true;
    this.state.mission23Completed = true;
    this.state.mission24Unlocked = true;
    this.state.mission23Step = 'completed';
    this.resetVolatile();
    return true;
  }

  forceCouncil(): void { if (this.step === 'counteroffensiveCouncil') this.goTo('synchronizeJointForces'); }
  forceSynchronization(): void { this.forceCouncil(); if (this.step === 'synchronizeJointForces') { this.state.jointForcesSynchronized = true; this.goTo('chooseTargetOrder'); } }
  forceOrder(first: Mission23PrimaryTarget = 'jammer'): void { this.forceSynchronization(); if (this.step === 'chooseTargetOrder') this.chooseTargetOrder(first); }
  forceJammerReadings(): void {
    this.forceOrder(this.state.mission23TargetOrder[0] === 'logistics' ? 'logistics' : 'jammer');
    if (this.step === 'approachLogisticsPlatform' && !this.state.logisticsPlatformDestroyed) this.forcePlatformDestroyed();
    if (this.step !== 'approachJammerNode') return;
    for (let index = 0; index < 3; index += 1) if (!this.state.jammerTriangulationReadings[index]) this.recordJammerReading(index);
  }
  forceJammerDestroyed(): void { this.forceJammerReadings(); if (this.step === 'destroyJammerNode') this.destroyJammerNode(); }
  forcePlatformReached(): void {
    this.forceOrder(this.state.mission23TargetOrder[0] === 'jammer' ? 'jammer' : 'logistics');
    if (this.step === 'approachJammerNode' && !this.state.jammerNodeDestroyed) this.forceJammerDestroyed();
    if (this.step === 'approachLogisticsPlatform') this.reachLogisticsPlatform();
  }
  forcePlatformModules(): void {
    if (!this.state.jammerNodeDestroyed && this.state.mission23TargetOrder[0] === 'jammer') this.forceJammerDestroyed();
    this.forcePlatformReached();
    if (this.step === 'disablePlatformDefenses') {
      this.disablePlatformModule('defense');
      this.disablePlatformModule('energy');
    }
  }
  forcePlatformDestroyed(method: Exclude<Mission23PlatformMethod, 'none'> = 'controlledDestruction'): void {
    this.forcePlatformModules();
    if (this.step === 'destroyLogisticsCore') { this.choosePlatformMethod(method); this.destroyLogisticsPlatform(); }
  }
  forcePrimaryTargets(): void {
    this.forceOrder(this.state.mission23TargetOrder[0] === 'logistics' ? 'logistics' : 'jammer');
    if (this.step === 'approachJammerNode' || this.step === 'destroyJammerNode') this.forceJammerDestroyed();
    if (this.step === 'approachLogisticsPlatform' || this.step === 'disablePlatformDefenses' || this.step === 'destroyLogisticsCore') this.forcePlatformDestroyed();
    if (this.step === 'approachJammerNode' || this.step === 'destroyJammerNode') this.forceJammerDestroyed();
  }
  forceBeaconAnchors(index = 2): void {
    this.forcePrimaryTargets();
    if (this.step === 'approachJumpBeacon') this.reachJumpBeacon();
    if (this.step !== 'disableBeaconAnchors') return;
    const end = Math.max(-1, Math.min(2, Math.floor(index)));
    for (let anchor = 0; anchor <= end; anchor += 1) this.disableBeaconAnchor(anchor);
  }
  forceBeaconCollapsed(): void {
    this.forceBeaconAnchors();
    if (this.step === 'collapseJumpBeacon') {
      this.state.jumpBeaconDestroyed = true;
      this.goTo('escapeDistortion');
    }
  }
  forceEscape(): void { this.forceBeaconCollapsed(); if (this.step === 'escapeDistortion') { this.state.escapeCompleted = true; this.goTo('recoverEnemyRoute'); } }
  forceRouteRecovered(): void { this.forceEscape(); if (this.step === 'recoverEnemyRoute') this.recoverEnemyRoute(); }
  forceComplete(): void { this.forceRouteRecovered(); if (this.step === 'confirmReturnToArk') this.confirmReturnToArk(); }

  restore(snapshot: Mission23Snapshot): void {
    const orderValid = snapshot.mission23TargetOrder?.length === 3 && validPrimary(snapshot.mission23TargetOrder[0]) &&
      validPrimary(snapshot.mission23TargetOrder[1]) && snapshot.mission23TargetOrder[0] !== snapshot.mission23TargetOrder[1] &&
      snapshot.mission23TargetOrder[2] === 'jumpBeacon';
    this.state.mission23Started = Boolean(snapshot.mission23Started);
    this.state.mission23Step = mission23Steps[snapshot.mission23Step] ? snapshot.mission23Step : 'inactive';
    this.state.mission23TargetOrder = orderValid ? [...snapshot.mission23TargetOrder] : [];
    this.state.jointForcesSynchronized = Boolean(snapshot.jointForcesSynchronized);
    this.state.jammerTriangulationReadings = this.normalizeFlags(snapshot.jammerTriangulationReadings, 3, snapshot.jammerNodeDestroyed);
    this.state.jammerNodeDestroyed = Boolean(snapshot.jammerNodeDestroyed);
    this.state.platformDefensesDisabled = Boolean(snapshot.platformDefensesDisabled || snapshot.logisticsPlatformDestroyed);
    this.state.platformEnergyDisabled = Boolean(snapshot.platformEnergyDisabled || snapshot.logisticsPlatformDestroyed);
    this.state.mission23PlatformMethod = validMethod(snapshot.mission23PlatformMethod) ? snapshot.mission23PlatformMethod : 'none';
    this.state.logisticsPlatformDestroyed = Boolean(snapshot.logisticsPlatformDestroyed);
    this.state.jumpBeaconAnchorsDisabled = this.normalizeFlags(snapshot.jumpBeaconAnchorsDisabled, 3, snapshot.jumpBeaconDestroyed);
    this.state.jumpBeaconDestroyed = Boolean(snapshot.jumpBeaconDestroyed);
    this.state.escapeCompleted = Boolean(snapshot.escapeCompleted);
    this.state.enemyRouteRecovered = Boolean(snapshot.enemyRouteRecovered);
    this.state.returnToArkConfirmed = Boolean(snapshot.returnToArkConfirmed);
    this.state.mission23Completed = Boolean(snapshot.mission23Completed);
    this.state.mission24Unlocked = Boolean(snapshot.mission24Unlocked || snapshot.mission23Completed);
    if (this.state.mission23Completed) this.state.mission23Step = 'completed';
    this.resetVolatile();
  }
  reset(): void {
    this.restore({
      mission23Started: false, mission23Step: 'inactive', mission23TargetOrder: [], jointForcesSynchronized: false,
      jammerTriangulationReadings: [false, false, false], jammerNodeDestroyed: false,
      platformDefensesDisabled: false, platformEnergyDisabled: false, mission23PlatformMethod: 'none', logisticsPlatformDestroyed: false,
      jumpBeaconAnchorsDisabled: [false, false, false], jumpBeaconDestroyed: false, escapeCompleted: false,
      enemyRouteRecovered: false, returnToArkConfirmed: false, mission23Completed: false, mission24Unlocked: false
    });
  }
  snapshot(): Mission23Snapshot {
    return { ...this.state, mission23TargetOrder: [...this.state.mission23TargetOrder], jammerTriangulationReadings: [...this.state.jammerTriangulationReadings], jumpBeaconAnchorsDisabled: [...this.state.jumpBeaconAnchorsDisabled] };
  }

  private goToNextPrimaryTarget(): boolean {
    if (!this.state.jammerNodeDestroyed) return this.goTo('approachJammerNode');
    if (!this.state.logisticsPlatformDestroyed) return this.goTo('approachLogisticsPlatform');
    return this.goTo('approachJumpBeacon');
  }
  private goTo(step: Mission23StepId): boolean {
    if (this.step === 'completed' || this.step === step) return false;
    this.state.mission23Step = step;
    this.phaseTimer = 0;
    return true;
  }
  private normalizeFlags(flags: boolean[] | undefined, length: number, completed: boolean): boolean[] {
    return Array.from({ length }, (_, index) => completed || Boolean(flags?.[index]));
  }
  private resetVolatile(): void {
    this.phaseTimer = 0;
    this.escapeElapsed = 0;
    this.escapeRetries = 0;
    this.escapeArmed = false;
  }
}
