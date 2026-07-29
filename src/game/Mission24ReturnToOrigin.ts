import {
  MISSION24_STEP_ORDER,
  mission24Steps,
  mission24Tuning,
  type Mission24StepDefinition,
  type Mission24StepId
} from '../assets/mission24Definitions';
import type { Mission23Snapshot } from './Mission23Counteroffensive';

export type Mission24Snapshot = {
  mission24Started: boolean;
  mission24Step: Mission24StepId;
  returnRouteDecoded: boolean;
  launchPrepared: boolean;
  shipBoardedForReturn: boolean;
  ignitionComplete: boolean;
  takeoffComplete: boolean;
  lowAtmosphereComplete: boolean;
  cloudLayerComplete: boolean;
  midAtmosphereComplete: boolean;
  upperAtmosphereComplete: boolean;
  vacuumTransitionComplete: boolean;
  orbitalInsertionComplete: boolean;
  orbitStabilized: boolean;
  mission24ArkReached: boolean;
  arkDamageAssessments: boolean[];
  arkDamageAssessed: boolean;
  enclaveLinksRestored: boolean[];
  allEnclaveLinksRestored: boolean;
  arkSystemsPrepared: boolean[];
  allArkSystemsPrepared: boolean;
  pleyadianNodesIntegrated: boolean[];
  pleyadianNetworkIntegrated: boolean;
  civilianSheltersPrepared: boolean;
  alliedForcesAssembled: boolean;
  startingSectorPointsVisited: boolean[];
  startingSectorRevisited: boolean;
  defenseRehearsalComplete: boolean;
  finalFleetDetected: boolean;
  finalFormationEntered: boolean;
  mission24Completed: boolean;
  mission25Unlocked: boolean;
};

const stepIndex = new Map(MISSION24_STEP_ORDER.map((id, index) => [id, index]));

function count(flags: readonly boolean[]): number {
  let result = 0;
  for (let index = 0; index < flags.length; index += 1) if (flags[index]) result += 1;
  return result;
}

export class Mission24ReturnToOrigin {
  readonly missionId = 'mission-24-return-to-origin';
  readonly missionName = 'Mision 24: Regreso al origen';
  readonly state: Mission24Snapshot = Mission24ReturnToOrigin.emptyState();

  private ignitionElapsed = 0;
  private insertionStableElapsed = 0;
  private orbitStableElapsed = 0;
  private rehearsalElapsed = 0;
  private ignitionArmed = false;

  get started(): boolean { return this.state.mission24Started; }
  get completed(): boolean { return this.state.mission24Completed; }
  get step(): Mission24StepId { return this.state.mission24Step; }
  get stepDefinition(): Mission24StepDefinition { return mission24Steps[this.step]; }
  get stepNumber(): number { return stepIndex.get(this.step) ?? 0; }
  get ignitionProgress(): number { return Math.min(100, this.ignitionElapsed / mission24Tuning.ignitionSeconds * 100); }
  get insertionProgress(): number { return Math.min(100, this.insertionStableElapsed / mission24Tuning.insertionHoldSeconds * 100); }
  get stabilizationProgress(): number { return Math.min(100, this.orbitStableElapsed / mission24Tuning.stabilizationSeconds * 100); }
  get rehearsalProgress(): number { return Math.min(100, this.rehearsalElapsed / mission24Tuning.rehearsalSeconds * 100); }
  get activeArkSystemIndex(): number { return this.firstPending(this.state.arkDamageAssessments); }
  get activeEnclaveLinkIndex(): number { return this.firstPending(this.state.enclaveLinksRestored); }
  get activeArkPreparationIndex(): number { return this.firstPending(this.state.arkSystemsPrepared); }
  get activePleyadianNodeIndex(): number { return this.firstPending(this.state.pleyadianNodesIntegrated); }
  get activeStartingSectorIndex(): number { return this.firstPending(this.state.startingSectorPointsVisited); }
  get arkSystemsAssessedCount(): number { return count(this.state.arkDamageAssessments); }
  get enclaveLinksRestoredCount(): number { return count(this.state.enclaveLinksRestored); }
  get arkSystemsPreparedCount(): number { return count(this.state.arkSystemsPrepared); }
  get pleyadianNodesIntegratedCount(): number { return count(this.state.pleyadianNodesIntegrated); }
  get startingSectorPointsVisitedCount(): number { return count(this.state.startingSectorPointsVisited); }
  get ascentActive(): boolean {
    return this.stepNumber >= (stepIndex.get('lowAtmosphereAscent') ?? 5) &&
      this.stepNumber <= (stepIndex.get('orbitalInsertion') ?? 10);
  }
  get atmosphericAscentActive(): boolean {
    return this.stepNumber >= (stepIndex.get('lowAtmosphereAscent') ?? 5) &&
      this.stepNumber <= (stepIndex.get('vacuumTransition') ?? 9);
  }
  get orbitalFlightActive(): boolean {
    return this.stepNumber >= (stepIndex.get('orbitalInsertion') ?? 10) && this.started;
  }

  canStart(previous: Mission23Snapshot): boolean {
    return !this.started && !this.completed && previous.mission23Completed && previous.mission24Unlocked;
  }

  start(previous: Mission23Snapshot): boolean {
    if (!this.canStart(previous)) return false;
    this.state.mission24Started = true;
    this.goTo('decodeReturnRoute');
    return true;
  }

  decodeReturnRoute(): boolean {
    if (this.step !== 'decodeReturnRoute') return false;
    this.state.returnRouteDecoded = true;
    return this.goTo('prepareLaunch');
  }

  prepareLaunch(): boolean {
    if (this.step !== 'prepareLaunch') return false;
    this.state.launchPrepared = true;
    return this.goTo('boardShip');
  }

  confirmBoarded(): boolean {
    if (this.step !== 'boardShip') return false;
    this.state.shipBoardedForReturn = true;
    return this.goTo('ignitionSequence');
  }

  armIgnition(): boolean {
    if (this.step !== 'ignitionSequence' || this.ignitionArmed) return false;
    this.ignitionArmed = true;
    this.ignitionElapsed = 0;
    return true;
  }

  updateIgnition(delta: number, aboard: boolean): 'idle' | 'cancelled' | 'running' | 'complete' {
    if (this.step !== 'ignitionSequence' || !this.ignitionArmed) return 'idle';
    if (!aboard) {
      this.ignitionArmed = false;
      this.ignitionElapsed = 0;
      return 'cancelled';
    }
    this.ignitionElapsed += Math.max(0, delta);
    if (this.ignitionElapsed < mission24Tuning.ignitionSeconds) return 'running';
    this.state.ignitionComplete = true;
    this.ignitionArmed = false;
    this.ignitionElapsed = mission24Tuning.ignitionSeconds;
    this.goTo('lowAtmosphereAscent');
    return 'complete';
  }

  completeAscentPhase(step: Mission24StepId): boolean {
    if (this.step !== step) return false;
    switch (step) {
      case 'lowAtmosphereAscent':
        this.state.takeoffComplete = true;
        this.state.lowAtmosphereComplete = true;
        return this.goTo('cloudLayerCrossing');
      case 'cloudLayerCrossing':
        this.state.cloudLayerComplete = true;
        return this.goTo('midAtmosphereAscent');
      case 'midAtmosphereAscent':
        this.state.midAtmosphereComplete = true;
        return this.goTo('upperAtmosphereAscent');
      case 'upperAtmosphereAscent':
        this.state.upperAtmosphereComplete = true;
        return this.goTo('vacuumTransition');
      case 'vacuumTransition':
        this.state.vacuumTransitionComplete = true;
        return this.goTo('orbitalInsertion');
      default:
        return false;
    }
  }

  updateOrbitalInsertion(delta: number, stable: boolean): boolean {
    if (this.step !== 'orbitalInsertion') return false;
    this.insertionStableElapsed = stable
      ? this.insertionStableElapsed + Math.max(0, delta)
      : Math.max(0, this.insertionStableElapsed - Math.max(0, delta) * 0.35);
    if (this.insertionStableElapsed < mission24Tuning.insertionHoldSeconds) return false;
    this.state.orbitalInsertionComplete = true;
    return this.goTo('stabilizeOrbit');
  }

  updateOrbitStabilization(delta: number, stable: boolean): boolean {
    if (this.step !== 'stabilizeOrbit') return false;
    this.orbitStableElapsed = stable
      ? this.orbitStableElapsed + Math.max(0, delta)
      : Math.max(0, this.orbitStableElapsed - Math.max(0, delta) * 0.2);
    if (this.orbitStableElapsed < mission24Tuning.stabilizationSeconds) return false;
    this.state.orbitStabilized = true;
    return this.goTo('approachArk');
  }

  reachArk(): boolean {
    if (this.step !== 'approachArk') return false;
    this.state.mission24ArkReached = true;
    return this.goTo('arriveAtOrigin');
  }

  confirmArrival(): boolean {
    if (this.step !== 'arriveAtOrigin') return false;
    return this.goTo('assessArkDamage');
  }

  assessArkSystem(index: number): boolean {
    if (this.step !== 'assessArkDamage') return false;
    if (!this.markNext(this.state.arkDamageAssessments, index)) return false;
    if (this.activeArkSystemIndex < 0) {
      this.state.arkDamageAssessed = true;
      this.goTo('restoreEnclaveLinks');
    }
    return true;
  }

  restoreEnclaveLink(index: number): boolean {
    if (this.step !== 'restoreEnclaveLinks') return false;
    if (!this.markNext(this.state.enclaveLinksRestored, index)) return false;
    if (this.activeEnclaveLinkIndex < 0) {
      this.state.allEnclaveLinksRestored = true;
      this.goTo('prepareArkSystems');
    }
    return true;
  }

  prepareArkSystem(index: number): boolean {
    if (this.step !== 'prepareArkSystems') return false;
    if (!this.markNext(this.state.arkSystemsPrepared, index)) return false;
    if (this.activeArkPreparationIndex < 0) {
      this.state.allArkSystemsPrepared = true;
      this.goTo('integratePleyadianNetwork');
    }
    return true;
  }

  integratePleyadianNode(index: number): boolean {
    if (this.step !== 'integratePleyadianNetwork') return false;
    if (!this.markNext(this.state.pleyadianNodesIntegrated, index)) return false;
    if (this.activePleyadianNodeIndex < 0) {
      this.state.pleyadianNetworkIntegrated = true;
      this.goTo('prepareCivilianShelters');
    }
    return true;
  }

  prepareCivilianShelters(): boolean {
    if (this.step !== 'prepareCivilianShelters') return false;
    this.state.civilianSheltersPrepared = true;
    return this.goTo('assembleAlliedForces');
  }

  assembleAlliedForces(): boolean {
    if (this.step !== 'assembleAlliedForces') return false;
    this.state.alliedForcesAssembled = true;
    return this.goTo('revisitStartingSector');
  }

  visitStartingSectorPoint(index: number): boolean {
    if (this.step !== 'revisitStartingSector') return false;
    if (!this.markNext(this.state.startingSectorPointsVisited, index)) return false;
    if (this.activeStartingSectorIndex < 0) {
      this.state.startingSectorRevisited = true;
      this.goTo('runDefenseRehearsal');
    }
    return true;
  }

  updateDefenseRehearsal(delta: number, active: boolean): boolean {
    if (this.step !== 'runDefenseRehearsal') return false;
    this.rehearsalElapsed = active
      ? this.rehearsalElapsed + Math.max(0, delta)
      : Math.max(0, this.rehearsalElapsed - Math.max(0, delta) * 0.2);
    if (this.rehearsalElapsed < mission24Tuning.rehearsalSeconds) return false;
    this.state.defenseRehearsalComplete = true;
    return this.goTo('detectFinalFleet');
  }

  detectFinalFleet(): boolean {
    if (this.step !== 'detectFinalFleet') return false;
    this.state.finalFleetDetected = true;
    return this.goTo('enterFinalFormation');
  }

  enterFinalFormation(): boolean {
    if (this.step !== 'enterFinalFormation') return false;
    this.state.finalFormationEntered = true;
    this.state.mission24Completed = true;
    this.state.mission25Unlocked = true;
    return this.goTo('completed');
  }

  restore(snapshot: Mission24Snapshot): void {
    const requestedIndex = stepIndex.get(snapshot.mission24Step) ?? 0;
    Object.assign(this.state, Mission24ReturnToOrigin.emptyState(), snapshot);
    this.state.arkDamageAssessments = this.normalizedFlags(snapshot.arkDamageAssessments, 5);
    this.state.enclaveLinksRestored = this.normalizedFlags(snapshot.enclaveLinksRestored, 4);
    this.state.arkSystemsPrepared = this.normalizedFlags(snapshot.arkSystemsPrepared, 3);
    this.state.pleyadianNodesIntegrated = this.normalizedFlags(snapshot.pleyadianNodesIntegrated, 3);
    this.state.startingSectorPointsVisited = this.normalizedFlags(snapshot.startingSectorPointsVisited, 3);
    this.state.mission24Step = MISSION24_STEP_ORDER[Math.max(0, requestedIndex)];
    this.applyMilestonesThrough(requestedIndex);
    this.resetVolatile();
  }

  reset(): void {
    this.restore(Mission24ReturnToOrigin.emptyState());
  }

  snapshot(): Mission24Snapshot {
    return {
      ...this.state,
      arkDamageAssessments: [...this.state.arkDamageAssessments],
      enclaveLinksRestored: [...this.state.enclaveLinksRestored],
      arkSystemsPrepared: [...this.state.arkSystemsPrepared],
      pleyadianNodesIntegrated: [...this.state.pleyadianNodesIntegrated],
      startingSectorPointsVisited: [...this.state.startingSectorPointsVisited]
    };
  }

  forceTo(step: Mission24StepId): void {
    const targetIndex = stepIndex.get(step) ?? 0;
    if (targetIndex <= this.stepNumber) return;
    this.applyMilestonesThrough(targetIndex);
    this.state.mission24Step = step;
    this.resetVolatile();
  }

  private goTo(step: Mission24StepId): boolean {
    const target = stepIndex.get(step) ?? 0;
    if (target <= this.stepNumber) return false;
    this.state.mission24Step = step;
    this.resetVolatile();
    return true;
  }

  private markNext(flags: boolean[], index: number): boolean {
    const safe = Math.max(0, Math.min(flags.length - 1, Math.floor(index)));
    if (safe !== this.firstPending(flags) || flags[safe]) return false;
    flags[safe] = true;
    return true;
  }

  private firstPending(flags: readonly boolean[]): number {
    for (let index = 0; index < flags.length; index += 1) if (!flags[index]) return index;
    return -1;
  }

  private normalizedFlags(source: readonly boolean[] | undefined, length: number): boolean[] {
    const result = new Array<boolean>(length).fill(false);
    for (let index = 0; index < length; index += 1) result[index] = Boolean(source?.[index]);
    return result;
  }

  private applyMilestonesThrough(index: number): void {
    const atLeast = (id: Mission24StepId): boolean => index >= (stepIndex.get(id) ?? Number.POSITIVE_INFINITY);
    this.state.mission24Started ||= atLeast('decodeReturnRoute');
    this.state.returnRouteDecoded ||= atLeast('prepareLaunch');
    this.state.launchPrepared ||= atLeast('boardShip');
    this.state.shipBoardedForReturn ||= atLeast('ignitionSequence');
    this.state.ignitionComplete ||= atLeast('lowAtmosphereAscent');
    this.state.takeoffComplete ||= atLeast('cloudLayerCrossing');
    this.state.lowAtmosphereComplete ||= atLeast('cloudLayerCrossing');
    this.state.cloudLayerComplete ||= atLeast('midAtmosphereAscent');
    this.state.midAtmosphereComplete ||= atLeast('upperAtmosphereAscent');
    this.state.upperAtmosphereComplete ||= atLeast('vacuumTransition');
    this.state.vacuumTransitionComplete ||= atLeast('orbitalInsertion');
    this.state.orbitalInsertionComplete ||= atLeast('stabilizeOrbit');
    this.state.orbitStabilized ||= atLeast('approachArk');
    this.state.mission24ArkReached ||= atLeast('arriveAtOrigin');
    if (atLeast('restoreEnclaveLinks')) this.state.arkDamageAssessments.fill(true);
    this.state.arkDamageAssessed ||= atLeast('restoreEnclaveLinks');
    if (atLeast('prepareArkSystems')) this.state.enclaveLinksRestored.fill(true);
    this.state.allEnclaveLinksRestored ||= atLeast('prepareArkSystems');
    if (atLeast('integratePleyadianNetwork')) this.state.arkSystemsPrepared.fill(true);
    this.state.allArkSystemsPrepared ||= atLeast('integratePleyadianNetwork');
    if (atLeast('prepareCivilianShelters')) this.state.pleyadianNodesIntegrated.fill(true);
    this.state.pleyadianNetworkIntegrated ||= atLeast('prepareCivilianShelters');
    this.state.civilianSheltersPrepared ||= atLeast('assembleAlliedForces');
    this.state.alliedForcesAssembled ||= atLeast('revisitStartingSector');
    if (atLeast('runDefenseRehearsal')) this.state.startingSectorPointsVisited.fill(true);
    this.state.startingSectorRevisited ||= atLeast('runDefenseRehearsal');
    this.state.defenseRehearsalComplete ||= atLeast('detectFinalFleet');
    this.state.finalFleetDetected ||= atLeast('enterFinalFormation');
    this.state.finalFormationEntered ||= atLeast('completed');
    this.state.mission24Completed ||= atLeast('completed');
    this.state.mission25Unlocked ||= atLeast('completed');
  }

  private resetVolatile(): void {
    this.ignitionElapsed = 0;
    this.insertionStableElapsed = 0;
    this.orbitStableElapsed = 0;
    this.rehearsalElapsed = 0;
    this.ignitionArmed = false;
  }

  private static emptyState(): Mission24Snapshot {
    return {
      mission24Started: false,
      mission24Step: 'inactive',
      returnRouteDecoded: false,
      launchPrepared: false,
      shipBoardedForReturn: false,
      ignitionComplete: false,
      takeoffComplete: false,
      lowAtmosphereComplete: false,
      cloudLayerComplete: false,
      midAtmosphereComplete: false,
      upperAtmosphereComplete: false,
      vacuumTransitionComplete: false,
      orbitalInsertionComplete: false,
      orbitStabilized: false,
      mission24ArkReached: false,
      arkDamageAssessments: [false, false, false, false, false],
      arkDamageAssessed: false,
      enclaveLinksRestored: [false, false, false, false],
      allEnclaveLinksRestored: false,
      arkSystemsPrepared: [false, false, false],
      allArkSystemsPrepared: false,
      pleyadianNodesIntegrated: [false, false, false],
      pleyadianNetworkIntegrated: false,
      civilianSheltersPrepared: false,
      alliedForcesAssembled: false,
      startingSectorPointsVisited: [false, false, false],
      startingSectorRevisited: false,
      defenseRehearsalComplete: false,
      finalFleetDetected: false,
      finalFormationEntered: false,
      mission24Completed: false,
      mission25Unlocked: false
    };
  }
}
